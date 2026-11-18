-- Денний ліміт запитів до моделі на одного користувача (рев'ю WS10, 18.11, пункт 1).
--
-- «Suggest closures» (requestSuggestions) кличе модель OpenRouter. Роль і довжину тексту дія перевіряє до виклику, але
-- скільки запитів зробив один користувач, досі не рахувало ніщо на сервері: «не можна попросити знову» (AC-ASSIST-08)
-- тримала лише вимкнена кнопка в браузері, а єдиною межею був безкоштовний ліміт акаунта OpenRouter (50 запитів на
-- добу), спільний для eval, UAT і приймання PM. Серія запитів з однієї сесії вичерпала б його для всіх.
--
-- Лічильник — у базі, а не в пам'яті процесу: кожен виклик Server Action може потрапити на інший екземпляр сервера.
-- 20 запитів на добу на користувача; доба — за Києвом, як kyivDate у src/lib/leave/time.ts. Понад ліміт функція
-- повертає false, а дія показує повідомлення AC-ASSIST-09 і модель не кличе. Лічильник не росте понад ліміт.
--
-- Таблиця — у схемі private без жодних прав для anon і authenticated: читати й змінювати її може лише
-- private.take_ai_quota() (security definer, set search_path = ''), яка бере користувача з auth.uid(), а не з
-- параметра. Обгортка public.take_ai_quota() — security invoker, як public.add_school_closure.

create table private.ai_quota (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  used    integer not null check (used between 1 and 20),
  primary key (user_id, day)
);

comment on table private.ai_quota is
  'Запити до моделі помічника календаря за добу (Київ) на користувача; змінює лише private.take_ai_quota().';

alter table private.ai_quota enable row level security;
revoke all on table private.ai_quota from public, anon, authenticated;

-- Доба запиту — дата за Києвом (як kyivDate): 22:30 UTC 17 листопада — це вже 18 листопада. Окремою функцією, щоб
-- правило перевіряв тест на конкретному моменті, а не на «зараз».
create function private.kyiv_day(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'Europe/Kyiv')::date;
$$;

revoke execute on function private.kyiv_day(timestamptz) from public, anon, authenticated;

-- Одним insert … on conflict do update: два паралельні запити не прочитають той самий лічильник. Коли вже 20, умова
-- where не дає оновити рядок, returning нічого не повертає — і функція відповідає false. Ліміт 20 записано двічі —
-- тут і в check таблиці; змінюється лише разом, новою міграцією.
-- Роль тут не перевіряємо: модель кличе лише requestSuggestions, а вона перевіряє роль раніше (AC-ASSIST-11). Прямий
-- виклик через REST витрачає лише власний лічильник того, хто кличе. Обидві функції — private і обгортка public —
-- доступні authenticated, як пара add_school_closure. Глобальний ліміт акаунта OpenRouter (50 на добу на всіх) —
-- поза цією міграцією.
create function private.take_ai_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_used integer;
begin
  if v_user is null then
    return false;
  end if;

  insert into private.ai_quota as q (user_id, day, used)
  values (v_user, private.kyiv_day(now()), 1)
  on conflict (user_id, day) do update set used = q.used + 1
    where q.used < 20
  returning q.used into v_used;

  return v_used is not null;
end;
$$;

revoke execute on function private.take_ai_quota() from public, anon;
grant execute on function private.take_ai_quota() to authenticated;

-- Точка входу для supabase.rpc: security invoker, лише передає виклик.
create function public.take_ai_quota()
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.take_ai_quota();
$$;

revoke execute on function public.take_ai_quota() from public, anon;
grant execute on function public.take_ai_quota() to authenticated;
