-- Habits, daily to-dos, piece values, and a daily record of pieces earned.

-- How many pieces each kind of completed item is worth, and the daily limit.
CREATE TABLE user_settings (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  habit_pieces  integer NOT NULL DEFAULT 1 CHECK (habit_pieces BETWEEN 0 AND 20),
  todo_pieces   integer NOT NULL DEFAULT 2 CHECK (todo_pieces BETWEEN 0 AND 20),
  focus_pieces  integer NOT NULL DEFAULT 3 CHECK (focus_pieces BETWEEN 0 AND 20),
  daily_cap     integer NOT NULL DEFAULT 20 CHECK (daily_cap BETWEEN 0 AND 500)
);

-- A habit stays on your list until you archive it (archiving keeps its history).
CREATE TABLE habits (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);
CREATE INDEX habits_user_id_idx ON habits (user_id);

-- One row means "this habit was done on this day".
CREATE TABLE habit_checks (
  habit_id  integer NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day       date NOT NULL,
  PRIMARY KEY (habit_id, day)
);

-- One-off to-dos for a single day. is_focus marks "your one thing" for that day.
CREATE TABLE todos (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  text        text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  done        boolean NOT NULL DEFAULT false,
  is_focus    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX todos_user_day_idx ON todos (user_id, day);
-- at most one "one thing" per person per day
CREATE UNIQUE INDEX todos_one_focus_per_day ON todos (user_id, day) WHERE is_focus;

-- Pieces earned on each day. Past days keep the value they had when they were earned,
-- so changing your piece values later never rewrites history.
CREATE TABLE daily_earnings (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      date NOT NULL,
  pieces   integer NOT NULL CHECK (pieces >= 0),
  PRIMARY KEY (user_id, day)
);
