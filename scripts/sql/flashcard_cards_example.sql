-- Add example column to flashcard_cards
ALTER TABLE flashcard_cards ADD COLUMN IF NOT EXISTS example text DEFAULT '';
