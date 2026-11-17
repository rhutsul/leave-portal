-- Версія схеми для /api/health і smoke (рев'ю WS9, 16.11, пункт 3).
--
-- Після злиття #82 Vercel віддав новий код приблизно на хвилину раніше, ніж db-deploy застосував міграцію: новий код
-- кликав add_school_closure з новою сигнатурою, а в базі ще була стара. /api/health і smoke цього не бачили — вони
-- перевіряли лише коміт збірки й те, що база відповідає. Тепер health повертає ще й версію останньої застосованої
-- міграції (поле schema), а smoke порівнює її з найновішим файлом supabase/migrations на коміті, що розгорнуто.
--
-- Версію записує Supabase CLI (supabase db push / db start) у supabase_migrations.schema_migrations — та сама таблиця,
-- якою db-deploy вирішує, що ще застосувати. Схема supabase_migrations не відкрита для anon і authenticated, тож
-- читаємо її через security definer.
--
-- Свідомий виняток із правила «security definer — лише в схемі private і закритий від anon»: health викликає функцію
-- публічним ключем без входу (як і решта /api/health), тож вона в public і execute має anon. Ризик малий і обмежений:
-- без параметрів, search_path порожній, повертає лише одне значення — номер останньої міграції (мітку часу з імені
-- файлу, який і так лежить у публічному репо); ні назв, ні тексту міграцій, ні даних користувачів.

create function public.schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select max(m.version) from supabase_migrations.schema_migrations as m;
$$;

comment on function public.schema_version() is
  'Version (timestamp) of the latest applied migration, for /api/health and smoke. Public on purpose: returns only this one value.';

revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;
