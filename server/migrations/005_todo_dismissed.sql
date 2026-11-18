-- "Roll over yesterday's unfinished tasks?": saying no keeps the task in yesterday's list
-- but stops it being offered again. This records that no.
ALTER TABLE todos ADD COLUMN dismissed_at timestamptz;
