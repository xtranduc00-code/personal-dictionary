-- One-off: trim already-stored game-puzzle PVs to MAX_SOLUTION_PLIES (6).
--
-- The extract endpoint now caps engine PVs at 6 plies (≈ 3 user moves)
-- because longer chains drift past the original tactic and overload
-- working memory. Existing rows were stored with the full 14+ ply PV
-- and won't be re-written by re-analysis (the synthetic id is the same
-- and the upsert is INSERT … ON CONFLICT DO NOTHING). Truncate them
-- in-place instead.
UPDATE public.chess_game_puzzles
   SET solution_moves = array_to_string(
         (string_to_array(solution_moves, ' '))[1:6],
         ' '
       )
 WHERE array_length(string_to_array(solution_moves, ' '), 1) > 6;
