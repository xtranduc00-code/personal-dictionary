-- Fix Supabase Security Advisor: RLS disabled in public (Mar 2026).
-- Run once in Supabase SQL Editor (Production).
--
-- App uses supabaseForUserData() → service role when SUPABASE_SERVICE_ROLE_KEY is set;
-- service_role BYPASSES RLS, so API/cron keep working.
-- These policies protect against direct browser access with the anon key.
--
-- Tables: note_folders, study_schedule_shared, push_subscriptions,
--         calendar_reminder_sent, study_schedule_reminder_sent, user_nav_label_overrides
--
-- Then run: enable_rls_security_advisor_2026_03_part2.sql (notes, study kit, meets, auth tokens).

-- ---------------------------------------------------------------------------
-- note_folders
-- ---------------------------------------------------------------------------
alter table public.note_folders enable row level security;

drop policy if exists "note_folders_select_own" on public.note_folders;
drop policy if exists "note_folders_insert_own" on public.note_folders;
drop policy if exists "note_folders_update_own" on public.note_folders;
drop policy if exists "note_folders_delete_own" on public.note_folders;

create policy "note_folders_select_own" on public.note_folders
  for select to authenticated
  using (user_id = auth.uid());

create policy "note_folders_insert_own" on public.note_folders
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "note_folders_update_own" on public.note_folders
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "note_folders_delete_own" on public.note_folders
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- calendar_reminder_sent
-- ---------------------------------------------------------------------------
alter table public.calendar_reminder_sent enable row level security;

drop policy if exists "calendar_reminder_sent_select_own" on public.calendar_reminder_sent;
drop policy if exists "calendar_reminder_sent_insert_own" on public.calendar_reminder_sent;
drop policy if exists "calendar_reminder_sent_update_own" on public.calendar_reminder_sent;
drop policy if exists "calendar_reminder_sent_delete_own" on public.calendar_reminder_sent;

create policy "calendar_reminder_sent_select_own" on public.calendar_reminder_sent
  for select to authenticated
  using (user_id = auth.uid());

create policy "calendar_reminder_sent_insert_own" on public.calendar_reminder_sent
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "calendar_reminder_sent_update_own" on public.calendar_reminder_sent
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "calendar_reminder_sent_delete_own" on public.calendar_reminder_sent
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- study_schedule_reminder_sent
-- ---------------------------------------------------------------------------
alter table public.study_schedule_reminder_sent enable row level security;

drop policy if exists "study_schedule_reminder_sent_select_own" on public.study_schedule_reminder_sent;
drop policy if exists "study_schedule_reminder_sent_insert_own" on public.study_schedule_reminder_sent;
drop policy if exists "study_schedule_reminder_sent_update_own" on public.study_schedule_reminder_sent;
drop policy if exists "study_schedule_reminder_sent_delete_own" on public.study_schedule_reminder_sent;

create policy "study_schedule_reminder_sent_select_own" on public.study_schedule_reminder_sent
  for select to authenticated
  using (user_id = auth.uid());

create policy "study_schedule_reminder_sent_insert_own" on public.study_schedule_reminder_sent
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "study_schedule_reminder_sent_update_own" on public.study_schedule_reminder_sent
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "study_schedule_reminder_sent_delete_own" on public.study_schedule_reminder_sent
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_nav_label_overrides
-- ---------------------------------------------------------------------------
alter table public.user_nav_label_overrides enable row level security;

drop policy if exists "user_nav_label_overrides_select_own" on public.user_nav_label_overrides;
drop policy if exists "user_nav_label_overrides_insert_own" on public.user_nav_label_overrides;
drop policy if exists "user_nav_label_overrides_update_own" on public.user_nav_label_overrides;
drop policy if exists "user_nav_label_overrides_delete_own" on public.user_nav_label_overrides;

create policy "user_nav_label_overrides_select_own" on public.user_nav_label_overrides
  for select to authenticated
  using (user_id = auth.uid());

create policy "user_nav_label_overrides_insert_own" on public.user_nav_label_overrides
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_nav_label_overrides_update_own" on public.user_nav_label_overrides
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_nav_label_overrides_delete_own" on public.user_nav_label_overrides
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- study_schedule_shared — một dòng global, mọi user đăng nhập đọc/ghi (theo app)
-- ---------------------------------------------------------------------------
alter table public.study_schedule_shared enable row level security;

drop policy if exists "study_schedule_shared_select_auth" on public.study_schedule_shared;
drop policy if exists "study_schedule_shared_update_auth" on public.study_schedule_shared;

create policy "study_schedule_shared_select_auth" on public.study_schedule_shared
  for select to authenticated
  using (id = 'global');

create policy "study_schedule_shared_update_auth" on public.study_schedule_shared
  for update to authenticated
  using (id = 'global')
  with check (id = 'global');

-- Không cho INSERT/DELETE từ client (chỉ 1 dòng cố định); service_role vẫn full quyền.
