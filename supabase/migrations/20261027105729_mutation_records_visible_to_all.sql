-- МУТАЦІЯ (тимчасово, draft PR, не зливати): політика читання leave_records без умови «свої / посади менеджера /
-- адміністратор» — кожен, хто увійшов, бачить усі записи. Очікувано червоний AC-LEAVE-14 (RLS hides other employees').
drop policy leave_records_select_own_managed_or_admin on public.leave_records;

create policy leave_records_select_own_managed_or_admin
  on public.leave_records for select to authenticated
  using ((select auth.uid()) is not null);
