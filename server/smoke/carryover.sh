#!/usr/bin/env bash
# Checks which earned pieces carry over when a new puzzle is started.
# Usage: bash smoke-carryover.sh            (talks to http://localhost:3001)
BASE=${BASE:-http://localhost:3001}
OUT=$(mktemp); JAR=$(mktemp); JAR2=$(mktemp)
trap 'rm -f "$OUT" "$JAR" "$JAR2"' EXIT
U1="test$RANDOM$RANDOM"; U2="test$RANDOM$RANDOM"
J='Content-Type: application/json'
PASS=0; FAIL=0
TODAY=$(date -u +%F)
PHOTO='{"id":"p1","imageUrl":"https://example.com/a.jpg"}'

check() {
  local label=$1 expected=$2; shift 2
  local status
  status=$(curl -s -o "$OUT" -w '%{http_code}' "$@")
  if [ "$status" = "$expected" ]; then PASS=$((PASS+1)); printf 'PASS  %-52s %s\n' "$label" "$status"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-52s got %s, expected %s: %s\n' "$label" "$status" "$expected" "$(head -c 200 "$OUT")"; fi
}
has() {
  if grep -qF -- "$2" "$OUT"; then PASS=$((PASS+1)); printf 'PASS  %-52s\n' "$1"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-52s response was: %s\n' "$1" "$(head -c 300 "$OUT")"; fi
}
id_of() { grep -o '"id":[0-9]*' "$OUT" | head -1 | cut -d: -f2; }
puzzle_id() { grep -o '"id":"[^"]*"' "$OUT" | head -1 | cut -d'"' -f4; }
# tick N habits (each worth 1 piece with the default settings)
earn() { # jar count
  for i in $(seq 1 "$2"); do
    curl -s -o "$OUT" -b "$1" -X POST $BASE/api/habits -H "$J" -d '{"name":"h'$i'"}'
    local h; h=$(id_of)
    curl -s -o /dev/null -b "$1" -X PUT $BASE/api/habits/$h/days/$TODAY -H "$J" -d '{"done":true}'
  done
}

check "register user 1" 201 -c $JAR  -X POST $BASE/api/register -H "$J" -d '{"username":"'$U1'","password":"correct horse"}'
check "register user 2" 201 -c $JAR2 -X POST $BASE/api/register -H "$J" -d '{"username":"'$U2'","password":"correct horse"}'

echo "== the first puzzle starts with nothing spent"
check "first puzzle (4 x 6)"            201 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":1,"photo":'"$PHOTO"'}'
has   "  earnedBase is 0"               '"earnedBase":0'
P1=$(puzzle_id)

echo "== earn 5, place 2, start a new puzzle"
earn $JAR 5
check "tracking says 5 earned"          200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  5 in total"                    '"earnedTotal":5'
check "place piece 0"                   204 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/0 -H "$J" -d '{"x":0.1,"y":0.1}'
check "place piece 1"                   204 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/1 -H "$J" -d '{"x":0.3,"y":0.1}'
check "new puzzle (8 x 12)"             201 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":8,"cols":12,"seed":2,"photo":'"$PHOTO"'}'
has   "  2 spent, 3 carry over"         '"earnedBase":2'
P2=$(puzzle_id)
check "GET puzzle is the new one"       200 -b $JAR $BASE/api/puzzle
has   "  rows 8"                        '"rows":8'
has   "  earnedBase 2"                  '"earnedBase":2'
has   "  board is empty"                '"positions":[]'

echo "== a puzzle with nothing placed spends nothing"
check "another new puzzle (4 x 6)"      201 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":3,"photo":'"$PHOTO"'}'
has   "  still 2 spent"                 '"earnedBase":2'
P3=$(puzzle_id)

echo "== earning more, then placing everything available"
earn $JAR 4
check "total is now 9"                  200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  9 in total"                    '"earnedTotal":9'
for n in 0 1 2 3 4 5 6; do curl -s -o /dev/null -b $JAR -X PUT $BASE/api/puzzles/$P3/pieces/$n -H "$J" -d '{"x":0.1,"y":0.1}'; done
check "new puzzle after placing all 7"  201 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":4,"photo":'"$PHOTO"'}'
has   "  all 9 - 2 - 7 used: base 9"    '"earnedBase":9'

echo "== placing more than were earned never gives a negative carry"
for n in 0 1 2 3 4 5 6 7 8 9; do curl -s -o /dev/null -b $JAR -X PUT $BASE/api/puzzles/$(curl -s -b $JAR $BASE/api/puzzle | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)/pieces/$n -H "$J" -d '{"x":0.1,"y":0.1}'; done
check "new puzzle again"                201 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":5,"photo":'"$PHOTO"'}'
has   "  base never above total"        '"earnedBase":9'

echo "== another player is unaffected"
check "user 2 first puzzle"             201 -b $JAR2 -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":1,"photo":'"$PHOTO"'}'
has   "  user 2 starts at 0"            '"earnedBase":0'
check "user 2 second puzzle"            201 -b $JAR2 -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":2,"photo":'"$PHOTO"'}'
has   "  still 0 (nothing earned)"      '"earnedBase":0'

echo
echo "$PASS passed, $FAIL failed"
echo "cleanup: DELETE FROM users WHERE username LIKE 'test%';"
[ "$FAIL" = "0" ]