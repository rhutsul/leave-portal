-- Керування працівниками, посадами, розкладами, менеджерами й заступниками (вимога PM
-- requirements/07-staff-management.md, AC-STAFF-01…19; план openspec/changes/impl-staff-management/design.md, D1–D12;
-- рішення docs/decisions/0013-staff-accounts-in-database.md).
--
-- РИЗИК: міграція пише в схему auth (auth.users, auth.identities, auth.sessions) з функцій бази і ставить тригер на
-- auth.users. Секретного ключа в застосунку немає (AGENTS.md, «Секрети»), тож Admin API Auth недоступний — облікові
-- записи створюють, змінюють і блокують лише функції нижче (ADR 0013). Сумісність із GoTrue доводить
-- tests/e2e/staff-auth.spec.ts на справжньому Supabase у job e2e, потім db-deploy-staging — до проду.
--
-- Правила безпеки цієї міграції:
--   * кожна функція, що пише в auth.*, — security definer у схемі private з `set search_path = ''`;
--   * право — лише адміністратор за public.profiles.role (private.current_app_role()), першим кроком;
--   * гість (anon) може виконати лише private.use_one_time_link через обгортку public.use_one_time_link (D2);
--   * внутрішні хелпери закриті від public, anon і authenticated.
--
-- Порядок викатки (D14): лише expand. Нові колонки nullable, нові таблиці й функції, нові тіла наявних функцій з тими
-- самими сигнатурами; наявний код міграції не помічає (блоки розкладу без дат, заступників і деактивованих немає).
--
-- Заступники (D9): права дає один хелпер private.acting_manager_ids усередині manages_position і manages_employee, тож
-- заступник у дні періоду має права відсутнього менеджера в кожному шляху — RLS записів, черга й рішення, прохання про
-- скасування (private.check_cancellation_actor, тіло не змінюється), реєстр і залишки.

create extension if not exists pgcrypto with schema extensions;

-- ── Профілі: деактивація й унікальний email (D3, D6; Assumptions PM: email унікальні серед усіх працівників) ──
alter table public.profiles add column deactivated_at timestamptz;

comment on column public.profiles.deactivated_at is
  'Коли адміністратор деактивував працівника; not null — не входить (AC-STAFF-08), записи й залишки лишаються.';

create unique index profiles_email_lower_key on public.profiles (lower(email));

-- Роль — лише активного профілю: деактивований з чинним токеном одразу втрачає права менеджера й адміністратора (D6).
-- Для деактивованого — порожній рядок, а не null: частина наявних перевірок (decide_leave_record) пише
-- `not (v_role = 'admin' or …)`, і null там пропустив би IF, а '' дає відмову.
create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.deactivated_at is null then p.role else '' end
  from public.profiles as p
  where p.id = (select auth.uid());
$$;

-- ── Спільне ─────────────────────────────────────────────────────────────────
-- Перший крок кожної функції адміністратора (D4): AC-STAFF-13, AC-STAFF-14 — той самий текст і в обхід сторінок.
create function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_app_role() is distinct from 'admin' then
    raise exception 'Only an administrator can manage employees' using errcode = '42501';
  end if;
end;
$$;

-- Lock працівника — той самий ключ, що в рішеннях і поданні (hashtextextended(uid::text, 0)).
create function private.lock_employee(p_employee_id uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
$$;

-- Lock кількох людей одразу — у порядку зростання uuid, щоб дві функції не чекали одна на одну (взаємне блокування).
-- Тримає зміну ролі, призначення менеджером і заступником однієї людини в черзі (рев'ю: працівник не стане
-- відповідальним менеджером, поки йому одночасно знімають роль manager).
create function private.lock_people(p_people uuid[])
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select distinct x.id from unnest(p_people) as x (id) where x.id is not null order by x.id loop
    perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  end loop;
end;
$$;

-- Деактивований із ще чинним access-токеном (до 1 год) не змінює свої записи (D6): перевірка в публічних обгортках
-- подання, зміни годин, повторного подання, скасування й прохання про скасування нижче. Права ролі закриває
-- current_app_role(), а це — дії, які RLS і функції дозволяють за самим auth.uid().
create function private.require_active()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles as p where p.id = (select auth.uid()) and p.deactivated_at is not null
  ) then
    raise exception 'Your account is deactivated. Contact the administrator' using errcode = '42501';
  end if;
end;
$$;

-- Lock змін адміністраторів (D4): одночасні зняття ролі й деактивації не залишать порталу без адміністратора.
create function private.lock_admins()
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('staff:admins', 0));
$$;

-- Ім'я й email (розробник): ім'я 1–200 знаків; email — у нижньому регістрі, проста форма a@b.c, до 254 знаків.
create function private.clean_full_name(p_full_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
begin
  if v_name = '' or char_length(v_name) > 200 then
    raise exception 'Enter a name of up to 200 characters';
  end if;
  return v_name;
end;
$$;

create function private.clean_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email';
  end if;
  return v_email;
end;
$$;

-- Email вільний серед усіх профілів (і деактивованих) та користувачів Auth, крім самої людини.
create function private.check_email_free(p_email text, p_except uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles as p where lower(p.email) = p_email and p.id is distinct from p_except)
     or exists (select 1 from auth.users as u where lower(u.email) = p_email and u.id is distinct from p_except) then
    raise exception 'An employee with this email already exists';
  end if;
end;
$$;

-- ── D3. Статус працівника ───────────────────────────────────────────────────
create function private.employee_status(p_employee_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.deactivated_at is not null then 'deactivated'
    when coalesce(u.encrypted_password, '') = '' then 'invited'
    else 'active'
  end
  from public.profiles as p
  left join auth.users as u on u.id = p.id
  where p.id = p_employee_id;
$$;

-- Список для /staff (AC-STAFF-01, AC-STAFF-02, AC-STAFF-08): лише адміністратору.
create function private.staff_employees()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  status text,
  main_position text,
  deactivated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.full_name, p.email, p.role, private.employee_status(p.id),
           d.name || ' / ' || mp.title, p.deactivated_at
    from public.profiles as p
    left join public.positions as mp on mp.employee_id = p.id and mp.kind = 'main'
    left join public.divisions as d on d.id = mp.division_id
    order by p.deactivated_at is not null, p.full_name, p.email;
end;
$$;

-- ── D2. Одноразове посилання ────────────────────────────────────────────────
create table private.one_time_links (
  id          bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  -- SHA-256 токена; сам токен ніде не зберігаємо.
  token_hash  bytea not null unique,
  -- Останній дійсний день (за Києвом): день створення + 7, включно (Assumptions PM, AC-STAFF-01).
  valid_until date not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  revoked_at  timestamptz
);

comment on table private.one_time_links is
  'Одноразові посилання для першого входу (AC-STAFF-01…03): хеш токена, строк, використання, відкликання новим.';

create index one_time_links_employee_id_idx on private.one_time_links (employee_id);

alter table private.one_time_links enable row level security;
revoke all on table private.one_time_links from public, anon, authenticated;

-- Нове посилання: відкликає невикористані посилання людини (D2, «A new link makes the previous one invalid») під lock
-- працівника, вставляє хеш і повертає відкритий токен один раз. Внутрішня: її кличуть create_employee і
-- issue_one_time_link після перевірки адміністратора.
create function private.new_one_time_link(p_employee_id uuid)
returns table (token text, valid_until date)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_until date := private.kyiv_day(now()) + 7;
begin
  perform private.lock_employee(p_employee_id);
  update private.one_time_links as l
     set revoked_at = now()
   where l.employee_id = p_employee_id and l.used_at is null and l.revoked_at is null;
  insert into private.one_time_links (employee_id, token_hash, valid_until, created_by)
  values (p_employee_id, extensions.digest(v_token, 'sha256'), v_until, (select auth.uid()));
  return query select v_token, v_until;
end;
$$;

-- ── D1. Створення працівника (AC-STAFF-01) ──────────────────────────────────
-- Рядок auth.users так, як його читає GoTrue: email у нижньому регістрі, без пароля (статус «Invited»), email
-- підтверджено, порожні рядки (не null) у текстових колонках токенів. Профіль створює on_auth_user_created; тестові
-- посади з private.test_* новому працівнику не призначаються (D11, app.skip_test_assignments).
create function private.create_employee(p_full_name text, p_email text, p_role text default 'employee')
returns table (employee_id uuid, token text, valid_until date)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name  text;
  v_email text;
  v_id    uuid := gen_random_uuid();
begin
  perform private.require_admin();
  v_name := private.clean_full_name(p_full_name);
  v_email := private.clean_email(p_email);
  if p_role is null or p_role not in ('employee', 'manager', 'admin') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  perform private.check_email_free(v_email, null);

  perform set_config('app.skip_test_assignments', 'on', true);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, '', now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', v_name), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now()
  );

  update public.profiles as p set role = p_role, full_name = v_name, email = v_email where p.id = v_id;

  return query select v_id, l.token, l.valid_until from private.new_one_time_link(v_id) as l;
exception
  when unique_violation then
    -- Той самий email, створений одночасно іншим адміністратором (profiles_email_lower_key чи індекс auth.users).
    raise exception 'An employee with this email already exists';
end;
$$;

-- Нове посилання для наявного працівника (замість простроченого чи «forgot password», Out of scope PM).
create function private.issue_one_time_link(p_employee_id uuid)
returns table (token text, valid_until date)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deactivated timestamptz;
begin
  perform private.require_admin();
  -- Під тим самим lock, що й деактивація: посилання не видається людині, яку саме деактивують.
  perform private.lock_employee(p_employee_id);
  select p.deactivated_at into v_deactivated from public.profiles as p where p.id = p_employee_id;
  if not found then
    -- Неіснуючий профіль — та сама відповідь, що й без права (D4).
    raise exception 'Only an administrator can manage employees' using errcode = '42501';
  end if;
  if v_deactivated is not null then
    raise exception 'Reactivate this employee first';
  end if;
  return query select l.token, l.valid_until from private.new_one_time_link(p_employee_id) as l;
end;
$$;

-- ── Гість за посиланням (AC-STAFF-02, AC-STAFF-03) ──────────────────────────
-- Без пароля — лише стан; з паролем — задає пароль (bcrypt, як у GoTrue), позначає посилання використаним, закриває
-- сесії людини й повертає email для входу. Стани: valid (і email), expired, invalid (немає такого, використане,
-- замінене новим, людину деактивовано). Правила пароля — як src/lib/account/password.ts (≥ 8 знаків, ≤ 72 байти).
create function private.use_one_time_link(p_token text, p_password text default null)
returns table (state text, email text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link        private.one_time_links;
  v_employee    uuid;
  v_email       text;
  v_deactivated timestamptz;
begin
  if p_token is null or char_length(p_token) <> 43 then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  -- Порядок блокувань той самий, що в issue_one_time_link, update_employee і deactivate_employee: спершу lock
  -- працівника, потім рядок посилання (for update) — і вже після обох перевіряємо стан.
  select l.employee_id into v_employee
    from private.one_time_links as l
   where l.token_hash = extensions.digest(p_token, 'sha256');
  if not found then
    return query select 'invalid'::text, null::text;
    return;
  end if;
  perform private.lock_employee(v_employee);

  select l.* into v_link
    from private.one_time_links as l
   where l.token_hash = extensions.digest(p_token, 'sha256')
   for update;
  if not found or v_link.used_at is not null or v_link.revoked_at is not null then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select p.email, p.deactivated_at into v_email, v_deactivated from public.profiles as p where p.id = v_link.employee_id;
  if v_deactivated is not null then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  if private.kyiv_day(now()) > v_link.valid_until then
    return query select 'expired'::text, null::text;
    return;
  end if;

  if p_password is null then
    return query select 'valid'::text, v_email;
    return;
  end if;

  if char_length(p_password) < 8 then
    raise exception 'Use at least 8 characters.';
  end if;
  if octet_length(p_password) > 72 then
    raise exception 'This password is too long. Use at most 72 bytes. Letters A–Z and a–z, digits 0–9, and symbols such as ! and @ use 1 byte each. Other characters may use more.';
  end if;

  -- Email для входу — з того самого оновленого рядка Auth, а не прочитаний раніше.
  update auth.users as u
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(u.email_confirmed_at, now()),
         updated_at = now()
   where u.id = v_link.employee_id
  returning u.email into v_email;
  update private.one_time_links as l set used_at = now() where l.id = v_link.id;
  delete from auth.sessions as s where s.user_id = v_link.employee_id;

  return query select 'valid'::text, v_email;
end;
$$;

-- ── D1, D4. Ім'я й email (AC-STAFF-11) ──────────────────────────────────────
-- Три місця разом: профіль, auth.users, identity email. Пароль не чіпаємо — «the same password». Записи не змінюються:
-- вони показують поточні ім'я й email з profiles (Assumptions PM).
create function private.update_employee(p_employee_id uuid, p_full_name text, p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name  text;
  v_email text;
begin
  perform private.require_admin();
  v_name := private.clean_full_name(p_full_name);
  v_email := private.clean_email(p_email);
  perform private.lock_employee(p_employee_id);
  if not exists (select 1 from public.profiles as p where p.id = p_employee_id) then
    raise exception 'Employee not found';
  end if;
  perform private.check_email_free(v_email, p_employee_id);

  update public.profiles as p set full_name = v_name, email = v_email where p.id = p_employee_id;
  update auth.users as u
     set email = v_email,
         raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name),
         updated_at = now()
   where u.id = p_employee_id;
  update auth.identities as i
     set identity_data = i.identity_data || jsonb_build_object('email', v_email),
         updated_at = now()
   where i.user_id = p_employee_id and i.provider = 'email';
exception
  when unique_violation then
    -- Той самий email, який одночасно отримав інший працівник.
    raise exception 'An employee with this email already exists';
end;
$$;

-- ── D5. Email не змінити в обхід (AC-STAFF-12) ──────────────────────────────
-- GoTrue працює роллю supabase_auth_admin: зміну email (updateUser, Admin API, підтвердження email_change) відкидаємо.
-- Наші функції — security definer власника postgres, тож current_user у тригері — postgres, і їх тригер пропускає.
-- Не security definer: current_user має бути тим, хто справді змінює рядок.
create function private.guard_auth_email_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'supabase_auth_admin'
     and (new.email is distinct from old.email
          or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change)) then
    raise exception 'Only an administrator can change names and emails' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_auth_email_change
  before update of email, email_change on auth.users
  for each row execute function private.guard_auth_email_change();

-- ── D4. Роль (AC-STAFF-18) ──────────────────────────────────────────────────
-- Набір ролей не змінюється (profiles_role_check той самий), тож порядок check → дані → default тут не потрібен.
-- Lock адміністраторів і повторна перевірка після нього: два адміністратори не знімуть роль один з одного одночасно.
create function private.set_employee_role(p_employee_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  perform private.require_admin();
  perform private.lock_admins();
  perform private.require_admin();
  if p_role is null or p_role not in ('employee', 'manager', 'admin') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if p_employee_id = (select auth.uid()) then
    raise exception 'You cannot change your own role';
  end if;
  -- Lock людини: призначення її менеджером посади чи заступником (create_position, set_position_managers,
  -- assign_deputy) чекає, поки зміна ролі завершиться, і навпаки.
  perform private.lock_people(array[p_employee_id]);
  select p.role into v_role from public.profiles as p where p.id = p_employee_id;
  if not found then
    raise exception 'Employee not found';
  end if;
  if v_role = p_role then
    return;
  end if;
  -- Розробник: працівник без ролі менеджера не може лишитись відповідальним менеджером чи заступником.
  if p_role = 'employee' and (
    exists (select 1 from public.position_managers as pm where pm.manager_id = p_employee_id)
    or exists (
      select 1 from public.deputy_assignments as d
      where d.deputy_id = p_employee_id and d.end_date >= private.kyiv_day(now())
    )
  ) then
    raise exception 'Remove this person from the managers of positions and deputies first';
  end if;
  -- Про всяк випадок: із lock адміністраторів, повторною перевіркою того, хто кличе, і забороною змінювати собі роль
  -- ця умова недосяжна (той, хто кличе, — сам активний адміністратор). Справжній захист — lock і повторна перевірка.
  if v_role = 'admin' and not exists (
    select 1 from public.profiles as p
    where p.role = 'admin' and p.deactivated_at is null and p.id <> p_employee_id
  ) then
    raise exception 'At least one active administrator must remain';
  end if;
  update public.profiles as p set role = p_role where p.id = p_employee_id;
end;
$$;

-- ── D1, D6. Деактивація й реактивація (AC-STAFF-08) ─────────────────────────
-- Записи, залишки, посади й події не змінюються (Assumptions PM). Бан — на 100 років, а не infinity: GoTrue не читає
-- infinity. Сесії видаляємо (refresh-токени — каскадом), невикористані посилання відкликаємо.
create function private.deactivate_employee(p_employee_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  perform private.require_admin();
  perform private.lock_admins();
  perform private.require_admin();
  if p_employee_id = (select auth.uid()) then
    raise exception 'You cannot deactivate yourself';
  end if;
  -- Той самий lock працівника, що в issue_one_time_link, use_one_time_link і update_employee.
  perform private.lock_employee(p_employee_id);
  select p.* into v_profile from public.profiles as p where p.id = p_employee_id;
  if not found then
    raise exception 'Employee not found';
  end if;
  if v_profile.deactivated_at is not null then
    return;
  end if;
  -- Про всяк випадок, як у set_employee_role: недосяжно, справжній захист — lock адміністраторів і повторна перевірка.
  if v_profile.role = 'admin' and not exists (
    select 1 from public.profiles as p
    where p.role = 'admin' and p.deactivated_at is null and p.id <> p_employee_id
  ) then
    raise exception 'At least one active administrator must remain';
  end if;

  update public.profiles as p set deactivated_at = now() where p.id = p_employee_id;
  update auth.users as u set banned_until = now() + interval '100 years', updated_at = now() where u.id = p_employee_id;
  delete from auth.sessions as s where s.user_id = p_employee_id;
  update private.one_time_links as l
     set revoked_at = now()
   where l.employee_id = p_employee_id and l.used_at is null and l.revoked_at is null;
end;
$$;

-- Зворотна дія (Out of scope PM дозволяє, кроки — розробника): той самий пароль знову працює.
create function private.reactivate_employee(p_employee_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform private.lock_employee(p_employee_id);
  if not exists (select 1 from public.profiles as p where p.id = p_employee_id) then
    raise exception 'Employee not found';
  end if;
  update public.profiles as p set deactivated_at = null where p.id = p_employee_id;
  update auth.users as u set banned_until = null, updated_at = now() where u.id = p_employee_id;
end;
$$;

-- ── D11. Тестові посади — лише для users:demo ───────────────────────────────
-- Нове тіло (20261020190045_leave_requests_schema.sql): create_employee ставить app.skip_test_assignments до кінця
-- своєї транзакції, тож створений адміністратором teacher3@ не отримує посад із private.test_* (AC-STAFF-04, -05).
create or replace function private.on_profile_created_apply_test_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.skip_test_assignments', true) is distinct from 'on' then
    perform private.apply_test_assignments();
  end if;
  return null;
end;
$$;

-- ── D7. Розклад «з дати» (AC-STAFF-04, AC-STAFF-06, AC-STAFF-07) ───────────
-- Версія розкладу посади — блоки з однаковим valid_from; null — «від початку» (так читаються всі наявні блоки), valid_to
-- не включно, null — без кінця. Записи зберігають свої години: новий розклад їх не змінює (AC-STAFF-07).
alter table public.schedule_blocks
  add column valid_from date,
  add column valid_to date,
  add constraint schedule_blocks_valid_dates_check check (valid_from is null or valid_to is null or valid_from < valid_to);

-- «Schedules of one employee's positions never overlap at any date» (Assumptions PM, AC-STAFF-06): те саме обмеження,
-- що й раніше, але лише для версій, що діють одночасно. Знімаємо й ставимо одним оператором — без проміжку, коли
-- обмеження немає. Обережно щодо дня тижня: якщо дві версії перетинаються лише в дні без цього дня тижня, обмеження
-- (і put_position_schedule) все одно відмовлять — суворіше, ніж треба, але ніколи не пропускає справжнього перетину.
alter table public.schedule_blocks
  drop constraint schedule_blocks_no_overlap,
  add constraint schedule_blocks_no_overlap exclude using gist (
    employee_id with =, weekday with =, int4range(start_min, end_min) with &&,
    daterange(valid_from, valid_to, '[)') with &&
  );

-- Блоки працівника, що діють на дату (день тижня дати). Єдине місце правила дати дії; TS — blocksOnDate.
create function private.blocks_in_effect(p_employee_id uuid, p_date date)
returns setof public.schedule_blocks
language sql
stable
set search_path = ''
as $$
  select b.*
  from public.schedule_blocks as b
  where b.employee_id = p_employee_id
    and b.weekday = extract(isodow from p_date)
    and (b.valid_from is null or b.valid_from <= p_date)
    and (b.valid_to is null or p_date < b.valid_to);
$$;

-- Нові тіла без зміни сигнатур (20261108143021_school_calendar.sql, 20261113145925_school_calendar_clarifications.sql):
-- блоки — лише через blocks_in_effect.
create or replace function private.blocks_on_date(p_position_id bigint, p_date date)
returns table (start_min integer, end_min integer)
language sql
stable
set search_path = ''
as $$
  select b.start_min, case when c.closes_at is null then b.end_min else least(b.end_min, c.closes_at) end
  from public.positions as p
  cross join lateral private.blocks_in_effect(p.employee_id, p_date) as b
  left join public.school_closures as c on p_date between c.start_date and c.end_date
  where p.id = p_position_id
    and b.position_id = p_position_id
    and (c.id is null or (c.closes_at is not null and b.start_min < c.closes_at))
  order by b.start_min;
$$;

create or replace function private.working_minutes(p_employee_id uuid, p_date date)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(
    case when c.closes_at is null then b.end_min else least(b.end_min, c.closes_at) end - b.start_min
  ), 0)::integer
  from private.blocks_in_effect(p_employee_id, p_date) as b
  left join public.school_closures as c on p_date between c.start_date and c.end_date
  where c.id is null or (c.closes_at is not null and b.start_min < c.closes_at);
$$;

create or replace function private.closed_day_name(p_employee_id uuid, p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select c.name
  from public.school_closures as c
  where p_date between c.start_date and c.end_date
    and (
      c.closes_at is null
      or (
        exists (select 1 from private.blocks_in_effect(p_employee_id, p_date))
        and not exists (
          select 1 from private.blocks_in_effect(p_employee_id, p_date) as b where b.start_min < c.closes_at
        )
      )
    );
$$;

-- Реєстр (20261124081552_approved_register.sql): межі робочого дня — за розкладом дати запису.
create or replace function private.approved_register(p_division_id bigint, p_month date)
returns table (
  record_id bigint,
  employee_id uuid,
  employee_name text,
  employee_email text,
  position_title text,
  position_kind text,
  date date,
  start_min integer,
  end_min integer,
  minutes integer,
  whole_day boolean,
  leave_type text,
  paid_days numeric,
  unpaid_days numeric,
  approved_at timestamptz,
  approved_by_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.employee_id, e.full_name, e.email,
    p.title, p.kind,
    r.date, r.start_min, r.end_min, r.minutes,
    coalesce(r.start_min = day.first_min and r.end_min = day.last_min, false),
    r.leave_type,
    case
      when r.leave_type = 'unpaid' then 0
      when r.leave_type in ('sick', 'personal') then coalesce(r.paid_days, r.day_share, 0)
      else coalesce(r.day_share, 0)
    end,
    case
      when r.leave_type = 'unpaid' then coalesce(r.day_share, 0)
      when r.leave_type in ('sick', 'personal') and r.paid_days is not null then coalesce(r.unpaid_days, 0)
      else 0
    end,
    ev.created_at, a.full_name
  from public.leave_records as r
  join public.positions as p on p.id = r.position_id
  join public.profiles as e on e.id = r.employee_id
  left join lateral (
    select min(b.start_min) as first_min, max(b.end_min) as last_min
    from private.blocks_in_effect(r.employee_id, r.date) as b
    where b.position_id = r.position_id
  ) as day on true
  left join lateral (
    select x.created_at, x.actor_id
    from public.leave_record_events as x
    where x.record_id = r.id and x.action = 'approved'
    order by x.created_at desc, x.id desc
    limit 1
  ) as ev on true
  left join public.profiles as a on a.id = ev.actor_id
  where (select auth.uid()) is not null
    and p.division_id = p_division_id
    and r.date >= date_trunc('month', p_month)::date
    and r.date < (date_trunc('month', p_month) + interval '1 month')::date
    -- Лише «Approved» (ADR 0012), як і раніше.
    and r.status = 'approved'
    and (
      private.current_app_role() = 'admin'
      or (private.current_app_role() = 'manager' and private.manages_position(r.position_id))
    )
  order by e.full_name, e.email, r.date, r.start_min, r.id;
$$;

-- Блоки з форми: [{"weekday": 1, "start_min": 510, "end_min": 930}, …]. Перевірки й тексти — розробника (D7).
create function private.parse_schedule(p_blocks jsonb)
returns table (weekday smallint, start_min integer, end_min integer)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then
    raise exception 'Add at least one working period';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_blocks) as x (item)
    where jsonb_typeof(x.item) <> 'object'
       or jsonb_typeof(x.item -> 'weekday') is distinct from 'number'
       or jsonb_typeof(x.item -> 'start_min') is distinct from 'number'
       or jsonb_typeof(x.item -> 'end_min') is distinct from 'number'
  ) then
    raise exception 'Each working period needs a day, a start and an end';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_blocks) as x (weekday numeric, start_min numeric, end_min numeric)
    where x.weekday not in (1, 2, 3, 4, 5, 6, 7)
       or x.start_min <> trunc(x.start_min) or x.end_min <> trunc(x.end_min)
       or x.start_min < 0 or x.end_min > 1440 or x.start_min >= x.end_min
       or x.start_min % 5 <> 0 or x.end_min % 5 <> 0
  ) then
    raise exception 'Each working period needs a start before its end, in 5-minute steps';
  end if;
  if exists (
    select 1
    from rows from (jsonb_to_recordset(p_blocks) as (weekday numeric, start_min numeric, end_min numeric))
         with ordinality as a (weekday, start_min, end_min, n)
    join rows from (jsonb_to_recordset(p_blocks) as (weekday numeric, start_min numeric, end_min numeric))
         with ordinality as b (weekday, start_min, end_min, n)
      on a.n < b.n and a.weekday = b.weekday
     and int4range(a.start_min::integer, a.end_min::integer) && int4range(b.start_min::integer, b.end_min::integer)
  ) then
    raise exception 'Working periods of one day must not overlap';
  end if;
  return query
    select x.weekday::smallint, x.start_min::integer, x.end_min::integer
    from jsonb_to_recordset(p_blocks) as x (weekday numeric, start_min numeric, end_min numeric)
    order by 1, 2;
end;
$$;

-- Нова версія розкладу посади з p_valid_from (D7): заміна версії того самого дня, обрізання попередньої, кінець — початок
-- наступної версії. Перетин з іншою посадою працівника на будь-яку спільну дату — текст AC-STAFF-06 з днем і годинами
-- конфліктного блоку іншої посади. Внутрішня: її кличуть create_position і set_position_schedule під lock працівника.
create function private.put_position_schedule(p_position_id bigint, p_valid_from date, p_blocks jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
  v_next     date;
  v_conflict record;
begin
  if p_valid_from is null then
    raise exception 'Choose the date the schedule applies from';
  end if;
  select p.employee_id into v_employee from public.positions as p where p.id = p_position_id;
  if not found then
    raise exception 'Position not found';
  end if;
  perform private.lock_employee(v_employee);
  -- Спершу перевірка форми блоків (тексти parse_schedule), потім перетин.
  perform private.parse_schedule(p_blocks);

  select min(b.valid_from) into v_next
    from public.schedule_blocks as b
   where b.position_id = p_position_id and b.valid_from > p_valid_from;

  select d.name as division_name, p.title, b.weekday, b.start_min, b.end_min
    into v_conflict
    from public.schedule_blocks as b
    join public.positions as p on p.id = b.position_id
    join public.divisions as d on d.id = p.division_id
    join private.parse_schedule(p_blocks) as n
      on n.weekday = b.weekday and int4range(n.start_min, n.end_min) && int4range(b.start_min, b.end_min)
   where b.employee_id = v_employee
     and b.position_id <> p_position_id
     and daterange(b.valid_from, b.valid_to, '[)') && daterange(p_valid_from, v_next, '[)')
   order by b.weekday, b.start_min, b.end_min
   limit 1;
  if found then
    raise exception 'This schedule overlaps the position % / %: % %–%',
      v_conflict.division_name, v_conflict.title,
      (array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])[v_conflict.weekday],
      private.format_minutes(v_conflict.start_min), private.format_minutes(v_conflict.end_min);
  end if;

  delete from public.schedule_blocks as b where b.position_id = p_position_id and b.valid_from = p_valid_from;
  update public.schedule_blocks as b
     set valid_to = p_valid_from
   where b.position_id = p_position_id
     and (b.valid_from is null or b.valid_from < p_valid_from)
     and (b.valid_to is null or b.valid_to > p_valid_from);

  begin
    insert into public.schedule_blocks (position_id, employee_id, weekday, start_min, end_min, valid_from, valid_to)
    select p_position_id, v_employee, n.weekday, n.start_min, n.end_min, p_valid_from, v_next
    from private.parse_schedule(p_blocks) as n;
  exception
    when exclusion_violation then
      -- Гонка з іншою зміною розкладу цього працівника: той самий зміст, що й у перевірці вище.
      raise exception 'This schedule overlaps another position of this employee';
  end;
end;
$$;

-- Відповідальні менеджери (D8): активні, з роллю manager чи admin.
create function private.check_position_managers(p_manager_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(coalesce(p_manager_ids, '{}')) as m (id)
    where not exists (
      select 1 from public.profiles as p
      where p.id = m.id and p.role in ('manager', 'admin') and p.deactivated_at is null
    )
  ) then
    raise exception 'A responsible manager must be an active manager or administrator';
  end if;
end;
$$;

-- ── D8. Посада (AC-STAFF-04, AC-STAFF-05, AC-STAFF-06) ──────────────────────
create function private.create_position(
  p_employee_id uuid,
  p_kind        text,
  p_division_id bigint,
  p_title       text,
  p_valid_from  date,
  p_blocks      jsonb,
  p_manager_ids uuid[]
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_title       text := btrim(coalesce(p_title, ''));
  v_deactivated timestamptz;
  v_position    bigint;
begin
  perform private.require_admin();
  select p.deactivated_at into v_deactivated from public.profiles as p where p.id = p_employee_id;
  if not found then
    raise exception 'Employee not found';
  end if;
  if v_deactivated is not null then
    raise exception 'Reactivate this employee first';
  end if;
  if p_kind is null or p_kind not in ('main', 'additional') then
    raise exception 'Unknown position type' using errcode = '22023';
  end if;
  if not exists (select 1 from public.divisions as d where d.id = p_division_id) then
    raise exception 'Unknown division' using errcode = '22023';
  end if;
  if v_title = '' or char_length(v_title) > 120 then
    raise exception 'Enter a job title of up to 120 characters';
  end if;
  -- Lock працівника й кожного менеджера (за зростанням uuid) до перевірки менеджерів: зміна ролі менеджера не
  -- проскочить між перевіркою й вставкою в position_managers.
  perform private.lock_people(array[p_employee_id] || coalesce(p_manager_ids, '{}'));
  perform private.check_position_managers(p_manager_ids);

  if p_kind = 'main' and exists (
    select 1 from public.positions as p where p.employee_id = p_employee_id and p.kind = 'main'
  ) then
    raise exception 'An employee has exactly one main position';
  end if;
  if exists (
    select 1 from public.positions as p
    where p.employee_id = p_employee_id and p.division_id = p_division_id and p.title = v_title
  ) then
    raise exception 'This employee already has this position';
  end if;

  insert into public.positions (employee_id, division_id, title, kind)
  values (p_employee_id, p_division_id, v_title, p_kind)
  returning id into v_position;

  perform private.put_position_schedule(v_position, p_valid_from, p_blocks);

  insert into public.position_managers (position_id, manager_id)
  select v_position, m.id from (select distinct unnest(coalesce(p_manager_ids, '{}')) as id) as m;

  return v_position;
exception
  when unique_violation then
    -- Одночасна друга основна посада (positions_one_main_per_employee) чи та сама назва.
    if sqlerrm like '%positions_one_main_per_employee%' then
      raise exception 'An employee has exactly one main position';
    end if;
    raise exception 'This employee already has this position';
end;
$$;

create function private.set_position_schedule(p_position_id bigint, p_valid_from date, p_blocks jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform private.put_position_schedule(p_position_id, p_valid_from, p_blocks);
end;
$$;

create function private.set_position_managers(p_position_id bigint, p_manager_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.positions as p where p.id = p_position_id) then
    raise exception 'Position not found';
  end if;
  perform private.lock_people(p_manager_ids);
  perform private.check_position_managers(p_manager_ids);
  -- Рядок посади — окремим оператором до delete: одночасна заміна чекає тут і далі бачить свіжий набір менеджерів.
  perform 1 from public.positions as p where p.id = p_position_id for update;
  delete from public.position_managers as pm where pm.position_id = p_position_id;
  insert into public.position_managers (position_id, manager_id)
  select p_position_id, m.id from (select distinct unnest(coalesce(p_manager_ids, '{}')) as id) as m;
end;
$$;

-- ── D9. Заступники (AC-STAFF-09, AC-STAFF-10, AC-STAFF-14, AC-STAFF-19) ─────
create table public.deputy_assignments (
  id         bigint generated always as identity primary key,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  deputy_id  uuid not null references public.profiles (id) on delete cascade,
  -- Обидві дати включно (Assumptions PM).
  start_date date not null,
  end_date   date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint deputy_assignments_dates_check check (end_date >= start_date),
  constraint deputy_assignments_not_self_check check (deputy_id <> manager_id),
  constraint deputy_assignments_no_overlap exclude using gist (
    manager_id with =, deputy_id with =, daterange(start_date, end_date, '[]') with &&
  )
);

comment on table public.deputy_assignments is
  'Заступник відсутнього менеджера на період: права менеджера на всі його посади, поки сьогодні (Київ) у періоді.';

create index deputy_assignments_deputy_idx on public.deputy_assignments (deputy_id, start_date, end_date);

alter table public.deputy_assignments enable row level security;
revoke all on table public.deputy_assignments from anon, authenticated;
-- authenticated — лише читання під політикою адміністратора; запис — лише функціями нижче (AC-STAFF-14).
grant select on table public.deputy_assignments to authenticated;
grant select, insert, update, delete on table public.deputy_assignments to service_role;

create policy deputy_assignments_select_admin
  on public.deputy_assignments for select to authenticated
  using ((select auth.uid()) is not null and (select private.current_app_role()) = 'admin');

-- Від чийого імені користувач діє як менеджер у день p_day: сам (якщо не деактивований) і відсутні менеджери, чиїм
-- заступником він є цього дня (обидві дати включно), поки він активний менеджер. Без ланцюжків (розробник).
create function private.acting_manager_ids(p_day date)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles as p
  where p.id = (select auth.uid()) and p.deactivated_at is null
  union
  select d.manager_id
  from public.deputy_assignments as d
  join public.profiles as dp on dp.id = d.deputy_id
  where d.deputy_id = (select auth.uid())
    and p_day between d.start_date and d.end_date
    and dp.role = 'manager'
    and dp.deactivated_at is null;
$$;

-- Нові тіла без зміни сигнатур (20261020190045_leave_requests_schema.sql): «сьогодні» — за Києвом.
create or replace function private.manages_position(p_position_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.position_managers as pm
    where pm.position_id = p_position_id
      and pm.manager_id in (select private.acting_manager_ids(private.kyiv_day(now())))
  );
$$;

create or replace function private.manages_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.positions as p
    join public.position_managers as pm on pm.position_id = p.id
    where p.employee_id = p_employee_id
      and pm.manager_id in (select private.acting_manager_ids(private.kyiv_day(now())))
  );
$$;

-- Реєстр (20261124081552_approved_register.sql): підрозділи — за тим самим хелпером, тож і заступнику.
create or replace function private.register_divisions()
returns table (id bigint, code text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.code, d.name
  from public.divisions as d
  where (select auth.uid()) is not null
    and (
      private.current_app_role() = 'admin'
      or (
        private.current_app_role() = 'manager'
        and exists (
          select 1 from public.positions as p
          where p.division_id = d.id and private.manages_position(p.id)
        )
      )
    )
  order by d.name, d.id;
$$;

create function private.assign_deputy(p_manager_id uuid, p_deputy_id uuid, p_start date, p_end date)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.require_admin();
  -- Lock обох людей: зміна ролі заступника не проскочить між перевіркою й вставкою.
  perform private.lock_people(array[p_manager_id, p_deputy_id]);
  if p_start is null or p_end is null then
    raise exception 'Choose the dates of the deputy assignment';
  end if;
  if p_end < p_start then
    raise exception 'The end date must be on or after the start date';
  end if;
  if p_manager_id is not distinct from p_deputy_id then
    raise exception 'A manager can''t be their own deputy';
  end if;
  if not exists (select 1 from public.position_managers as pm where pm.manager_id = p_manager_id) then
    raise exception 'Choose a manager of at least one position';
  end if;
  if not exists (
    select 1 from public.profiles as p where p.id = p_deputy_id and p.role = 'manager' and p.deactivated_at is null
  ) then
    raise exception 'A deputy must be a manager';
  end if;
  insert into public.deputy_assignments (manager_id, deputy_id, start_date, end_date, created_by)
  values (p_manager_id, p_deputy_id, p_start, p_end, (select auth.uid()))
  returning id into v_id;
  return v_id;
exception
  when exclusion_violation then
    raise exception 'This deputy is already assigned to this manager for these dates';
end;
$$;

-- Ухвалені заступником рішення лишаються (події історії не залежать від призначення).
create function private.remove_deputy(p_assignment_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.deputy_assignments as d where d.id = p_assignment_id;
  if not found then
    raise exception 'Deputy assignment not found';
  end if;
end;
$$;

-- ── Права на функції ────────────────────────────────────────────────────────
-- Внутрішні хелпери — нікому, крім власника й інших функцій.
revoke execute on function private.require_admin() from public, anon, authenticated;
revoke execute on function private.lock_employee(uuid) from public, anon, authenticated;
revoke execute on function private.lock_admins() from public, anon, authenticated;
revoke execute on function private.lock_people(uuid[]) from public, anon, authenticated;
revoke execute on function private.clean_full_name(text) from public, anon, authenticated;
revoke execute on function private.clean_email(text) from public, anon, authenticated;
revoke execute on function private.check_email_free(text, uuid) from public, anon, authenticated;
revoke execute on function private.employee_status(uuid) from public, anon, authenticated;
revoke execute on function private.new_one_time_link(uuid) from public, anon, authenticated;
revoke execute on function private.guard_auth_email_change() from public, anon, authenticated;
revoke execute on function private.blocks_in_effect(uuid, date) from public, anon, authenticated;
revoke execute on function private.parse_schedule(jsonb) from public, anon, authenticated;
revoke execute on function private.put_position_schedule(bigint, date, jsonb) from public, anon, authenticated;
revoke execute on function private.check_position_managers(uuid[]) from public, anon, authenticated;

-- Хелпер прав менеджера — як manages_position: authenticated (видно лише власні id).
revoke execute on function private.acting_manager_ids(date) from public, anon;
grant execute on function private.acting_manager_ids(date) to authenticated;

-- Функції адміністратора: authenticated, право перевіряє перший крок (require_admin).
revoke execute on function private.staff_employees() from public, anon;
revoke execute on function private.create_employee(text, text, text) from public, anon;
revoke execute on function private.issue_one_time_link(uuid) from public, anon;
revoke execute on function private.update_employee(uuid, text, text) from public, anon;
revoke execute on function private.set_employee_role(uuid, text) from public, anon;
revoke execute on function private.deactivate_employee(uuid) from public, anon;
revoke execute on function private.reactivate_employee(uuid) from public, anon;
revoke execute on function private.create_position(uuid, text, bigint, text, date, jsonb, uuid[]) from public, anon;
revoke execute on function private.set_position_schedule(bigint, date, jsonb) from public, anon;
revoke execute on function private.set_position_managers(bigint, uuid[]) from public, anon;
revoke execute on function private.assign_deputy(uuid, uuid, date, date) from public, anon;
revoke execute on function private.remove_deputy(bigint) from public, anon;
grant execute on function private.staff_employees() to authenticated;
grant execute on function private.create_employee(text, text, text) to authenticated;
grant execute on function private.issue_one_time_link(uuid) to authenticated;
grant execute on function private.update_employee(uuid, text, text) to authenticated;
grant execute on function private.set_employee_role(uuid, text) to authenticated;
grant execute on function private.deactivate_employee(uuid) to authenticated;
grant execute on function private.reactivate_employee(uuid) to authenticated;
grant execute on function private.create_position(uuid, text, bigint, text, date, jsonb, uuid[]) to authenticated;
grant execute on function private.set_position_schedule(bigint, date, jsonb) to authenticated;
grant execute on function private.set_position_managers(bigint, uuid[]) to authenticated;
grant execute on function private.assign_deputy(uuid, uuid, date, date) to authenticated;
grant execute on function private.remove_deputy(bigint) to authenticated;

-- Гість за посиланням (D2): єдиний виняток для anon після public.schema_version() (ADR 0013).
revoke execute on function private.use_one_time_link(text, text) from public;
grant usage on schema private to anon;
grant execute on function private.use_one_time_link(text, text) to anon, authenticated;

-- ── Обгортки для supabase.rpc (security invoker, лише передають параметри) ──
create function public.staff_employees()
returns table (
  id uuid, full_name text, email text, role text, status text, main_position text, deactivated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.staff_employees();
$$;

create function public.create_employee(p_full_name text, p_email text, p_role text default 'employee')
returns table (employee_id uuid, token text, valid_until date)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_employee(p_full_name, p_email, p_role);
$$;

create function public.issue_one_time_link(p_employee_id uuid)
returns table (token text, valid_until date)
language sql
security invoker
set search_path = ''
as $$
  select * from private.issue_one_time_link(p_employee_id);
$$;

create function public.use_one_time_link(p_token text, p_password text default null)
returns table (state text, email text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.use_one_time_link(p_token, p_password);
$$;

create function public.update_employee(p_employee_id uuid, p_full_name text, p_email text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_employee(p_employee_id, p_full_name, p_email);
$$;

create function public.set_employee_role(p_employee_id uuid, p_role text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_employee_role(p_employee_id, p_role);
$$;

create function public.deactivate_employee(p_employee_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.deactivate_employee(p_employee_id);
$$;

create function public.reactivate_employee(p_employee_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.reactivate_employee(p_employee_id);
$$;

create function public.create_position(
  p_employee_id uuid,
  p_kind        text,
  p_division_id bigint,
  p_title       text,
  p_valid_from  date,
  p_blocks      jsonb,
  p_manager_ids uuid[]
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.create_position(p_employee_id, p_kind, p_division_id, p_title, p_valid_from, p_blocks, p_manager_ids);
$$;

create function public.set_position_schedule(p_position_id bigint, p_valid_from date, p_blocks jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_position_schedule(p_position_id, p_valid_from, p_blocks);
$$;

create function public.set_position_managers(p_position_id bigint, p_manager_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_position_managers(p_position_id, p_manager_ids);
$$;

create function public.assign_deputy(p_manager_id uuid, p_deputy_id uuid, p_start date, p_end date)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.assign_deputy(p_manager_id, p_deputy_id, p_start, p_end);
$$;

create function public.remove_deputy(p_assignment_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.remove_deputy(p_assignment_id);
$$;

revoke execute on function public.staff_employees() from public, anon;
revoke execute on function public.create_employee(text, text, text) from public, anon;
revoke execute on function public.issue_one_time_link(uuid) from public, anon;
revoke execute on function public.update_employee(uuid, text, text) from public, anon;
revoke execute on function public.set_employee_role(uuid, text) from public, anon;
revoke execute on function public.deactivate_employee(uuid) from public, anon;
revoke execute on function public.reactivate_employee(uuid) from public, anon;
revoke execute on function public.create_position(uuid, text, bigint, text, date, jsonb, uuid[]) from public, anon;
revoke execute on function public.set_position_schedule(bigint, date, jsonb) from public, anon;
revoke execute on function public.set_position_managers(bigint, uuid[]) from public, anon;
revoke execute on function public.assign_deputy(uuid, uuid, date, date) from public, anon;
revoke execute on function public.remove_deputy(bigint) from public, anon;
revoke execute on function public.use_one_time_link(text, text) from public;
grant execute on function public.staff_employees() to authenticated;
grant execute on function public.create_employee(text, text, text) to authenticated;
grant execute on function public.issue_one_time_link(uuid) to authenticated;
grant execute on function public.update_employee(uuid, text, text) to authenticated;
grant execute on function public.set_employee_role(uuid, text) to authenticated;
grant execute on function public.deactivate_employee(uuid) to authenticated;
grant execute on function public.reactivate_employee(uuid) to authenticated;
grant execute on function public.create_position(uuid, text, bigint, text, date, jsonb, uuid[]) to authenticated;
grant execute on function public.set_position_schedule(bigint, date, jsonb) to authenticated;
grant execute on function public.set_position_managers(bigint, uuid[]) to authenticated;
grant execute on function public.assign_deputy(uuid, uuid, date, date) to authenticated;
grant execute on function public.remove_deputy(bigint) to authenticated;
grant execute on function public.use_one_time_link(text, text) to anon, authenticated;

-- ── D6. Деактивований із чинним токеном не змінює своїх записів (AC-STAFF-08) ──
-- Нові тіла публічних обгорток (сигнатури ті самі; тіла private-функцій не змінюються — їх змінюють інші зрізи).
-- Схема private не відкрита Data API, тож для authenticated це єдині входи до цих дій.
revoke execute on function private.require_active() from public, anon;
grant execute on function private.require_active() to authenticated;

create or replace function public.submit_leave_request(
  p_leave_type   text,
  p_records      jsonb,
  p_relationship text default null,
  p_comment      text default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.require_active();
  select private.submit_leave_request(p_leave_type, p_records, p_relationship, p_comment);
$$;

create or replace function public.update_leave_record_hours(p_record_id bigint, p_start_min integer, p_end_min integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.require_active();
  select private.update_leave_record_hours(p_record_id, p_start_min, p_end_min);
$$;

create or replace function public.resubmit_leave_record(p_record_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.require_active();
  select private.resubmit_leave_record(p_record_id);
$$;

create or replace function public.cancel_leave_record(p_record_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.require_active();
  select private.cancel_leave_record(p_record_id);
$$;

create or replace function public.request_record_cancellation(p_record_id bigint, p_reason text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.require_active();
  select private.request_record_cancellation(p_record_id, p_reason);
$$;
