-- Ролі продукту замість ролей шаблону: employee / manager / admin (requirements/product.md, «Users and roles»;
-- D1 openspec/changes/impl-leave-ws6/design.md). Одна роль на людину: manager і admin теж є працівниками
-- й подають власні заявки; за яку посаду відповідає менеджер, визначає не роль, а public.position_managers.
--
-- Порядок — із заголовка 20261012000000_profiles_and_roles.sql:
--   старий check знімаємо першим (він не пропустить update на нову роль, 23514) → дані → default → новий check.
-- Без нового default тригер on_auth_user_created вставив би 'member', і кожен createUser у users:demo впав би.

alter table public.profiles drop constraint profiles_role_check;

update public.profiles set role = 'employee' where role = 'member';

alter table public.profiles alter column role set default 'employee';

alter table public.profiles add constraint profiles_role_check
  check (role in ('employee', 'manager', 'admin'));
