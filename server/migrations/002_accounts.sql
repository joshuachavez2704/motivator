-- Anonymous players become real user accounts.
-- Any rows created so far are throwaway test data from anonymous players
-- (no username or password), so we clear them before adding required columns.
DELETE FROM players;

ALTER TABLE players RENAME TO users;
ALTER TABLE users RENAME CONSTRAINT players_pkey TO users_pkey;

ALTER TABLE puzzles RENAME COLUMN player_id TO user_id;
ALTER TABLE puzzles RENAME CONSTRAINT puzzles_player_id_fkey TO puzzles_user_id_fkey;
ALTER INDEX puzzles_player_id_idx RENAME TO puzzles_user_id_idx;

ALTER TABLE users
  ADD COLUMN username       text NOT NULL,
  ADD COLUMN password_hash  text NOT NULL,
  ADD CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,32}$');

-- "Josh" and "josh" are the same name
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));

-- One row per signed-in browser. We store a hash of the cookie token,
-- never the token itself, so a leaked database cannot be used to sign in.
CREATE TABLE sessions (
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);