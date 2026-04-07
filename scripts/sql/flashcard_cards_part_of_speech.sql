-- Add part_of_speech column to flashcard_cards if not exists.
-- Run in Supabase SQL editor.

alter table public.flashcard_cards
  add column if not exists part_of_speech text default 'other';

comment on column public.flashcard_cards.part_of_speech is 'Part of speech: noun, verb, adjective, adverb, phrase, other. Used in push notification titles.';
