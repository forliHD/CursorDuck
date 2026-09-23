-- Wishing pond: ideas and breadcrumb votes (Cloudflare D1 / SQLite).
-- No personal data: "voter" is the random id half of a server-signed token.
CREATE TABLE IF NOT EXISTS ideas (
  id      TEXT PRIMARY KEY,
  title   TEXT NOT NULL,
  body    TEXT NOT NULL DEFAULT '',
  lang    TEXT NOT NULL DEFAULT 'en',
  status  TEXT NOT NULL DEFAULT 'pending',   -- pending | open | planned | built | declined
  votes   INTEGER NOT NULL DEFAULT 0,
  version TEXT,                              -- set when status = built
  created INTEGER NOT NULL,                  -- unix milliseconds
  voter   TEXT
);
CREATE INDEX IF NOT EXISTS ideas_status_votes ON ideas (status, votes DESC);
CREATE INDEX IF NOT EXISTS ideas_voter_created ON ideas (voter, created);

CREATE TABLE IF NOT EXISTS votes (
  idea    TEXT NOT NULL,
  voter   TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (idea, voter)
);
CREATE INDEX IF NOT EXISTS votes_voter_created ON votes (voter, created);
