-- Drop the orphaned v1 library-progress table.
--
-- `user_puzzle_progress` was an early sketch of per-user solve tracking. It
-- never got wired into any route (the live code path goes through the local
-- SQLite `progress.attempts` table). After the chess library migration its
-- role is filled by `public.chess_attempts`, so the orphan can go.
--
-- Run AFTER `chess_library_migration.sql` and AFTER the import script has
-- finished — there is nothing to migrate (the orphan was unused), but keep
-- the order anyway so a partially-completed run can't leave the codebase
-- without either table.

drop table if exists public.user_puzzle_progress;
