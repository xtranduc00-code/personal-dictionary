-- Supabase linter: RLS on remaining public tables (batch from Security Advisor JSON).
-- Run in SQL Editor AFTER `enable_rls_security_advisor_2026_03.sql` (or merge runs).
--
-- App auth = custom `auth_sessions` + Bearer token; Supabase client on server uses
-- SUPABASE_SERVICE_ROLE_KEY → bypasses RLS. Policies here block direct PostgREST with anon key.
-- `TO authenticated` = only when caller uses Supabase Auth JWT (auth.uid() set); anon has no access.

-- ---------------------------------------------------------------------------
-- note_labels (per-user)
-- ---------------------------------------------------------------------------
alter table public.note_labels enable row level security;

drop policy if exists "note_labels_select_own" on public.note_labels;
drop policy if exists "note_labels_insert_own" on public.note_labels;
drop policy if exists "note_labels_update_own" on public.note_labels;
drop policy if exists "note_labels_delete_own" on public.note_labels;

create policy "note_labels_select_own" on public.note_labels
  for select to authenticated using (user_id = auth.uid());

create policy "note_labels_insert_own" on public.note_labels
  for insert to authenticated with check (user_id = auth.uid());

create policy "note_labels_update_own" on public.note_labels
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "note_labels_delete_own" on public.note_labels
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- note_note_labels (junction: note + label)
-- ---------------------------------------------------------------------------
alter table public.note_note_labels enable row level security;

drop policy if exists "note_note_labels_select" on public.note_note_labels;
drop policy if exists "note_note_labels_insert" on public.note_note_labels;
drop policy if exists "note_note_labels_delete" on public.note_note_labels;

create policy "note_note_labels_select" on public.note_note_labels
  for select to authenticated
  using (
    exists (select 1 from public.notes n where n.id = note_note_labels.note_id and n.user_id = auth.uid())
    or exists (
      select 1 from public.note_shares s
      where s.note_id = note_note_labels.note_id and s.shared_with_user_id = auth.uid()
    )
  );

create policy "note_note_labels_insert" on public.note_note_labels
  for insert to authenticated
  with check (
    exists (select 1 from public.notes n where n.id = note_note_labels.note_id and n.user_id = auth.uid())
    or exists (
      select 1 from public.note_shares s
      where s.note_id = note_note_labels.note_id and s.shared_with_user_id = auth.uid() and s.role = 'editor'
    )
  );

create policy "note_note_labels_delete" on public.note_note_labels
  for delete to authenticated
  using (
    exists (select 1 from public.notes n where n.id = note_note_labels.note_id and n.user_id = auth.uid())
    or exists (
      select 1 from public.note_shares s
      where s.note_id = note_note_labels.note_id and s.shared_with_user_id = auth.uid() and s.role = 'editor'
    )
  );

-- ---------------------------------------------------------------------------
-- notes (owner + shared read; owner full update/delete; editor can update body/title per app)
-- ---------------------------------------------------------------------------
alter table public.notes enable row level security;

drop policy if exists "notes_select_access" on public.notes;
drop policy if exists "notes_insert_own" on public.notes;
drop policy if exists "notes_update_owner" on public.notes;
drop policy if exists "notes_update_editor" on public.notes;
drop policy if exists "notes_delete_owner" on public.notes;
-- Editor updates đi qua API + service role (bypass RLS). Không thêm policy UPDATE phụ trên notes
-- (tránh subquery vào chính bảng notes trong WITH CHECK → rủi ro đệ quy RLS).

create policy "notes_select_access" on public.notes
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.note_shares s
      where s.note_id = notes.id and s.shared_with_user_id = auth.uid()
    )
  );

create policy "notes_insert_own" on public.notes
  for insert to authenticated with check (user_id = auth.uid());

create policy "notes_update_owner" on public.notes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notes_delete_owner" on public.notes
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- note_shares
-- ---------------------------------------------------------------------------
alter table public.note_shares enable row level security;

drop policy if exists "note_shares_select" on public.note_shares;
drop policy if exists "note_shares_insert" on public.note_shares;
drop policy if exists "note_shares_update" on public.note_shares;
drop policy if exists "note_shares_delete" on public.note_shares;

create policy "note_shares_select" on public.note_shares
  for select to authenticated
  using (
    shared_with_user_id = auth.uid()
    or exists (select 1 from public.notes n where n.id = note_shares.note_id and n.user_id = auth.uid())
  );

create policy "note_shares_insert" on public.note_shares
  for insert to authenticated
  with check (
    shared_by_user_id = auth.uid()
    and exists (select 1 from public.notes n where n.id = note_shares.note_id and n.user_id = auth.uid())
  );

create policy "note_shares_update" on public.note_shares
  for update to authenticated
  using (exists (select 1 from public.notes n where n.id = note_shares.note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from public.notes n where n.id = note_shares.note_id and n.user_id = auth.uid()));

create policy "note_shares_delete" on public.note_shares
  for delete to authenticated
  using (exists (select 1 from public.notes n where n.id = note_shares.note_id and n.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- study_kit_sessions
-- ---------------------------------------------------------------------------
alter table public.study_kit_sessions enable row level security;

drop policy if exists "study_kit_sessions_select_own" on public.study_kit_sessions;
drop policy if exists "study_kit_sessions_insert_own" on public.study_kit_sessions;
drop policy if exists "study_kit_sessions_update_own" on public.study_kit_sessions;
drop policy if exists "study_kit_sessions_delete_own" on public.study_kit_sessions;

create policy "study_kit_sessions_select_own" on public.study_kit_sessions
  for select to authenticated using (user_id = auth.uid());

create policy "study_kit_sessions_insert_own" on public.study_kit_sessions
  for insert to authenticated with check (user_id = auth.uid());

create policy "study_kit_sessions_update_own" on public.study_kit_sessions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "study_kit_sessions_delete_own" on public.study_kit_sessions
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- study_kit_saved_topics
-- ---------------------------------------------------------------------------
alter table public.study_kit_saved_topics enable row level security;

drop policy if exists "study_kit_saved_topics_select_own" on public.study_kit_saved_topics;
drop policy if exists "study_kit_saved_topics_insert_own" on public.study_kit_saved_topics;
drop policy if exists "study_kit_saved_topics_update_own" on public.study_kit_saved_topics;
drop policy if exists "study_kit_saved_topics_delete_own" on public.study_kit_saved_topics;

create policy "study_kit_saved_topics_select_own" on public.study_kit_saved_topics
  for select to authenticated using (user_id = auth.uid());

create policy "study_kit_saved_topics_insert_own" on public.study_kit_saved_topics
  for insert to authenticated with check (user_id = auth.uid());

create policy "study_kit_saved_topics_update_own" on public.study_kit_saved_topics
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "study_kit_saved_topics_delete_own" on public.study_kit_saved_topics
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- study_kit_saved_sheets
-- ---------------------------------------------------------------------------
alter table public.study_kit_saved_sheets enable row level security;

drop policy if exists "study_kit_saved_sheets_select_own" on public.study_kit_saved_sheets;
drop policy if exists "study_kit_saved_sheets_insert_own" on public.study_kit_saved_sheets;
drop policy if exists "study_kit_saved_sheets_update_own" on public.study_kit_saved_sheets;
drop policy if exists "study_kit_saved_sheets_delete_own" on public.study_kit_saved_sheets;

create policy "study_kit_saved_sheets_select_own" on public.study_kit_saved_sheets
  for select to authenticated using (user_id = auth.uid());

create policy "study_kit_saved_sheets_insert_own" on public.study_kit_saved_sheets
  for insert to authenticated with check (user_id = auth.uid());

create policy "study_kit_saved_sheets_update_own" on public.study_kit_saved_sheets
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "study_kit_saved_sheets_delete_own" on public.study_kit_saved_sheets
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- study_kit_summarize_jobs
-- ---------------------------------------------------------------------------
alter table public.study_kit_summarize_jobs enable row level security;

drop policy if exists "study_kit_summarize_jobs_select_own" on public.study_kit_summarize_jobs;
drop policy if exists "study_kit_summarize_jobs_insert_own" on public.study_kit_summarize_jobs;
drop policy if exists "study_kit_summarize_jobs_update_own" on public.study_kit_summarize_jobs;
drop policy if exists "study_kit_summarize_jobs_delete_own" on public.study_kit_summarize_jobs;

create policy "study_kit_summarize_jobs_select_own" on public.study_kit_summarize_jobs
  for select to authenticated using (user_id = auth.uid());

create policy "study_kit_summarize_jobs_insert_own" on public.study_kit_summarize_jobs
  for insert to authenticated with check (user_id = auth.uid());

create policy "study_kit_summarize_jobs_update_own" on public.study_kit_summarize_jobs
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "study_kit_summarize_jobs_delete_own" on public.study_kit_summarize_jobs
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- meets_chat_messages — API chỉ dùng service role (meetsDb); không policy → anon/auth denied
-- ---------------------------------------------------------------------------
alter table public.meets_chat_messages enable row level security;

-- ---------------------------------------------------------------------------
-- meets_room_recordings — chỉ server/service role (không có ref trong repo); RLS, không policy
-- ---------------------------------------------------------------------------
alter table public.meets_room_recordings enable row level security;

-- ---------------------------------------------------------------------------
-- auth_password_reset_tokens — chỉ server; RLS + không policy → bắt buộc service role
-- ---------------------------------------------------------------------------
alter table public.auth_password_reset_tokens enable row level security;
