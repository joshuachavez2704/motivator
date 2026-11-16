-- How many of the pieces you have earned were already used up before this puzzle started.
-- A puzzle's available pieces = pieces earned in total - earned_base.
ALTER TABLE puzzles ADD COLUMN earned_base integer NOT NULL DEFAULT 0 CHECK (earned_base >= 0);