-- Optional starter ideas for the wishing pond, so the board isn't empty on day one.
-- Apply once: npx wrangler d1 execute cursorduck-pond --remote --file tools/pond-seed.sql
INSERT OR IGNORE INTO ideas (id, title, body, lang, status, votes, created, voter) VALUES
  ('seed000001', 'Hide her with Esc', 'Press Esc while she is close and she dives out of sight for a while. Press it again and she pops back up.', 'en', 'open', 0, 1790150400000, NULL),
  ('seed000002', 'Drifting leaves', 'Now and then a leaf lands on the water and drifts past. She could nudge it, or nap under it.', 'en', 'open', 0, 1790150400000, NULL),
  ('seed000003', 'Bird migration in autumn', 'A little V of birds crossing the top of the page in October. She looks up and quacks after them.', 'en', 'open', 0, 1790150400000, NULL),
  ('seed000004', 'A daily gift', 'On your first visit of the day she brings a tiny present: a pebble, a shell, a snail. The popup collects them.', 'en', 'open', 0, 1790150400000, NULL),
  ('seed000005', 'Dragging her around', 'Hold the mouse button on her and drag: she squawks, flaps and paddles back to where she was.', 'en', 'open', 0, 1790150400000, NULL),
  ('seed000006', 'Ducklings that grow up', 'Ducklings slowly grow with the days you spend together. One day they are full ducks and a new fluffy one hatches.', 'en', 'open', 0, 1790150400000, NULL),
  ('seed000007', 'Gentler on slow computers', 'When the page struggles she could quietly lower her frame rate and effects instead of stuttering.', 'en', 'open', 0, 1790150400000, NULL);
