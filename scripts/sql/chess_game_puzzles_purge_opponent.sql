-- One-off cleanup: drop puzzles extracted from the *opponent's* mistakes.
--
-- The extract endpoint used to keep both sides' mistakes/blunders. The
-- intended behaviour is "From my games" = the user's own mistakes only —
-- opponent blunders are free wins, not lessons. The endpoint is now
-- filtered at extract time; this script cleans up rows already persisted
-- before that fix.
--
-- We delete a row only when the user is clearly identifiable in the
-- player names (case-insensitive match against either header). For
-- 3rd-party game analyses where neither header matches the user, we keep
-- everything so the tool stays useful as a generic analysis aid.
--
-- Run via:
--   SUPABASE_DB_URL=... tsx scripts/_apply-sql.ts \
--     scripts/sql/chess_game_puzzles_purge_opponent.sql
-- The chess.com username is unrelated to the app account username (the
-- app stores `duykfc` while chess.com data uses `kentran0209`). One-off
-- cleanup hard-codes the chess.com handle: for any row where the handle
-- appears as a player, drop the puzzle if it's the OTHER side's bad move.
WITH me AS (
  SELECT 'kentran0209'::text AS handle
)
DELETE FROM public.chess_game_puzzles gp
USING me
WHERE (
  -- Chess.com handle plays White → drop black-side (opponent) puzzles
  (LOWER(TRIM(COALESCE(gp.white_name, ''))) = LOWER(me.handle)
     AND gp.side = 'b')
  OR
  -- Chess.com handle plays Black → drop white-side (opponent) puzzles
  (LOWER(TRIM(COALESCE(gp.black_name, ''))) = LOWER(me.handle)
     AND gp.side = 'w')
);
