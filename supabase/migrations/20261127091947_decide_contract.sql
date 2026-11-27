-- Contract (крок 3 D9 impl-on-behalf, AGENTS.md «expand → contract»): прибрати стару 6-параметрову сигнатуру рішення.
-- Expand — 20261125200521_on_behalf_and_edit.sql (#136): нова 9-параметрова decide_leave_record звіряє дату, тип і
-- заміну, які бачив менеджер, а стара лишилась тонкою обгорткою, що звіряє лише години. Код перемкнено на нову в #140
-- (e47badc), і він на проді: /api/health показує sha = main (62de93c), новішого за #140. Тож стару сигнатуру вже ніхто не
-- кличе, а лишити її — означало б залишити обхід звірки D9: рішення за старим поглядом на запис після чужої правки.
-- Це передумова кроку 4 (грант на edit_leave_record): правка відкривається лише тоді, коли кожне рішення її бачить.
--
-- Без зміни даних. Права на нові сигнатури не змінюються.

drop function public.decide_leave_record(bigint, text, integer, integer, text, boolean);
drop function private.decide_leave_record(bigint, text, text, boolean, integer, integer);
