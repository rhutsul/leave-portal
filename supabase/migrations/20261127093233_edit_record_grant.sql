-- Крок 4 D9 impl-on-behalf: відкрити правку запису до рішення (AC-BEHALF-06…10) для authenticated.
-- edit_leave_record (20261125200521_on_behalf_and_edit.sql) лишалась закритою для всіх, поки існувала стара
-- 6-параметрова decide_leave_record, яка не бачить чужої правки. Її прибрав contract (20261127091947_decide_contract.sql),
-- тож кожне рішення тепер звіряє дату, тип і заміну, які бачив менеджер, — правку можна відкривати.
--
-- Хто може змінити запис, вирішує сама функція (D7): менеджер посади запису (чи його заступник), адміністратор — будь-
-- який; власний запис менеджера — лише адміністратор; лише «Awaiting decision». update на leave_records authenticated
-- і далі не має: змінити запис в обхід функції не можна (AC-BEHALF-13).
--
-- public.edit_leave_record — security invoker над private.edit_leave_record (security definer, search_path = ''), тому
-- execute потрібен на обидві, як у решти пар public/private цього зрізу. anon і public — без змін (revoke у 20261125200521).

grant execute on function private.edit_leave_record(bigint, date, integer, integer, text, text, uuid) to authenticated;
grant execute on function public.edit_leave_record(bigint, date, integer, integer, text, text, uuid) to authenticated;
