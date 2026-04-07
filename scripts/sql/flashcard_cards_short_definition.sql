-- Add short_definition column to flashcard_cards if not exists.
-- Run in Supabase SQL editor.

alter table public.flashcard_cards
  add column if not exists short_definition text;

comment on column public.flashcard_cards.short_definition is 'Brief 3-5 word definition for push notification titles. e.g. "personal free time" instead of "time when you can do what you want to do".';
