-- Ім'я та email змінює лише адміністратор (рішення PM mkozlovskyi-ops/course-staff-management-spec#12, матриця прав
-- у requirements/product.md). Шаблонний grant update (full_name) з 20261012000000_profiles_and_roles.sql дозволяв
-- будь-кому, хто ввійшов, перейменувати себе через Data API, а це ім'я бачать інші: «History» на /decisions
-- (decided_by_name) і /balances. Інтерфейсу зміни профілю в застосунку немає; адміністратор змінює профілі
-- серверними скриптами (service_role, scripts/create-demo-users.mjs) — його права тут не змінюються.
revoke update (full_name) on table public.profiles from authenticated;
drop policy profiles_update_own on public.profiles;
