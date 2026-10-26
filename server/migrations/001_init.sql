CREATE TABLE players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE puzzles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rows        integer NOT NULL CHECK (rows > 0),
  cols        integer NOT NULL CHECK (cols > 0),
  seed        integer NOT NULL,
  photo       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX puzzles_player_id_idx ON puzzles (player_id);

CREATE TABLE piece_positions (
  puzzle_id   uuid NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  piece_id    integer NOT NULL CHECK (piece_id >= 0),
  x           double precision NOT NULL,
  y           double precision NOT NULL,
  PRIMARY KEY (puzzle_id, piece_id)
);