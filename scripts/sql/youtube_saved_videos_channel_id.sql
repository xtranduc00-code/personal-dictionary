-- Add channel_id to youtube_saved_videos so the videos UI can show a
-- "Follow this channel" button on saved video cards and inside the player.
-- Nullable because pre-existing rows don't have it; new saves will populate it.

alter table public.youtube_saved_videos
  add column if not exists channel_id text;
