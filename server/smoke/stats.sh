#!/usr/bin/env bash
# Checks the streaks and daily history that feed the charts on the habits screen.
# It writes past days straight into the database (smoke/seed.mjs), because the API only
# lets you change today. Needs DATABASE_URL, like the server does.
# Usage: bash smoke/stats.sh            (talks to http://localhost:3001)
BASE=${BASE:-http://localhost:3001}
OUT=$(mktemp); JAR=$(mktemp); JAR2=$(mktemp)
trap 'rm -f "$OUT" "$JAR" "$JAR2"' EXIT
HERE=$(cd "$(dirname "$0")" && pwd)
U1="test$RANDOM$RANDOM"; U2="test$RANDOM$RANDOM"
J='Content-Type: application/json'
PASS=0; FAIL=0
TODAY=$(date -u +%F)
YESTERDAY=$(date -u -d 'yesterday' +%F)

check() {
  local label=$1 expected=$2; shift 2
  local status
  status=$(curl -s -o "$OUT" -w '%{http_code}' "$@")
  if [ "$status" = "$expected" ]; then PASS=$((PASS+1)); printf 'PASS  %-52s %s\n' "$label" "$status"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-52s got %s, expected %s: %s\n' "$label" "$status" "$expected" "$(head -c 200 "$OUT")"; fi
}
has() {
  if grep -qF -- "$2" "$OUT"; then PASS=$((PASS+1)); printf 'PASS  %-52s\n' "$1"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-52s response was: %s\n' "$1" "$(head -c 400 "$OUT")"; fi
}
id_of() { grep -o '"id":[0-9]*' "$OUT" | head -1 | cut -d: -f2; }
seed() { node "$HERE/seed.mjs" "$@" || { FAIL=$((FAIL+1)); echo "FAIL  seeding history ($*)"; }; }

if [ -z "$DATABASE_URL" ]; then echo "DATABASE_URL is not set: this script seeds history directly"; exit 2; fi

check "register user 1" 201 -c $JAR  -X POST $BASE/api/register -H "$J" -d '{"username":"'$U1'","password":"correct horse"}'
check "register user 2" 201 -c $JAR2 -X POST $BASE/api/register -H "$J" -d '{"username":"'$U2'","password":"correct horse"}'

echo "== signed out and bad input"
check "stats need sign-in"               401 "$BASE/api/stats?day=$TODAY"
check "missing day"                      400 -b $JAR "$BASE/api/stats"
check "day is not a date"                400 -b $JAR "$BASE/api/stats?day=banana"
check "day far in the past"              400 -b $JAR "$BASE/api/stats?day=2020-01-01"
check "days below 7"                     400 -b $JAR "$BASE/api/stats?day=$TODAY&days=6"
check "days above 90"                    400 -b $JAR "$BASE/api/stats?day=$TODAY&days=91"
check "days is not a number"             400 -b $JAR "$BASE/api/stats?day=$TODAY&days=lots"

echo "== a brand-new account"
check "stats with no habits"             200 -b $JAR "$BASE/api/stats?day=$TODAY"
has   "  no streaks"                     '"streaks":[]'
has   "  30 quiet days, ending today"    '{"day":"'$TODAY'","pieces":0,"habitsDone":0}]'
DAYS=$(grep -o '"day":"' "$OUT" | wc -l)
if [ "$DAYS" = "30" ]; then PASS=$((PASS+1)); echo "PASS  exactly 30 days are returned"; else FAIL=$((FAIL+1)); echo "FAIL  expected 30 days, got $DAYS"; fi
check "a shorter window"                 200 -b $JAR "$BASE/api/stats?day=$TODAY&days=7"
DAYS=$(grep -o '"day":"' "$OUT" | wc -l)
if [ "$DAYS" = "7" ]; then PASS=$((PASS+1)); echo "PASS  days=7 returns 7 days"; else FAIL=$((FAIL+1)); echo "FAIL  expected 7 days, got $DAYS"; fi

echo "== streaks"
for name in Run Read Swim Idle; do
  curl -s -o "$OUT" -b $JAR -X POST $BASE/api/habits -H "$J" -d '{"name":"'$name'"}'
  eval "H_$name=$(id_of)"
done
# Run: a 6-day run long ago, and 4 days in a row up to today
seed ticks $H_Run 0,1,2,3,10,11,12,13,14,15
# Read: only yesterday and the day before (still alive: today is not over yet)
seed ticks $H_Read 1,2
# Swim: one tick, long ago
seed ticks $H_Swim 5
check "streaks"                          200 -b $JAR "$BASE/api/stats?day=$TODAY"
has   "  Run: best 6, now 4"             '"name":"Run","best":6,"now":4'
has   "  Read: best 2, now 2 (yesterday still counts)" '"name":"Read","best":2,"now":2'
has   "  Swim: best 1, now 0"            '"name":"Swim","best":1,"now":0'
has   "  Idle: best 0, now 0"            '"name":"Idle","best":0,"now":0'
ORDER=$(grep -o '"name":"[A-Za-z]*"' "$OUT" | cut -d'"' -f4 | tr '\n' ' ')
if [ "$ORDER" = "Run Read Swim Idle " ]; then PASS=$((PASS+1)); echo "PASS  ranked by best streak: $ORDER"; else FAIL=$((FAIL+1)); echo "FAIL  order was: $ORDER"; fi
seed ticks $H_Read 4
check "a gap of one day breaks a run"    200 -b $JAR "$BASE/api/stats?day=$TODAY"
has   "  Read: best still 2 (ticks on 1,2 and 4)" '"name":"Read","best":2,"now":2'
seed ticks $H_Read 3
check "closing the gap joins the runs"   200 -b $JAR "$BASE/api/stats?day=$TODAY"
has   "  Read: now 4 days in a row"      '"name":"Read","best":4,"now":4'
check "tick Swim today through the API"  200 -b $JAR -X PUT $BASE/api/habits/$H_Swim/days/$TODAY -H "$J" -d '{"done":true}'
check "streaks after ticking today"      200 -b $JAR "$BASE/api/stats?day=$TODAY"
has   "  Swim: best 1, now 1"            '"name":"Swim","best":1,"now":1'
check "removed habits leave the list"    204 -b $JAR -X DELETE $BASE/api/habits/$H_Idle
check "streaks without it"               200 -b $JAR "$BASE/api/stats?day=$TODAY"
if grep -q '"name":"Idle"' "$OUT"; then FAIL=$((FAIL+1)); echo "FAIL  Idle is still listed"; else PASS=$((PASS+1)); echo "PASS  Idle is gone from the streaks"; fi

echo "== daily history"
seed earned $U1 0:5,1:3,3:7,20:9
check "history"                          200 -b $JAR "$BASE/api/stats?day=$TODAY"
has   "  today: 5 pieces, 2 habits done (Run, Swim)" '{"day":"'$TODAY'","pieces":5,"habitsDone":2}'
has   "  yesterday: 3 pieces, 2 habits (Run, Read)" '{"day":"'$YESTERDAY'","pieces":3,"habitsDone":2}'
check "7-day window leaves out older days" 200 -b $JAR "$BASE/api/stats?day=$TODAY&days=7"
if grep -q '"pieces":9' "$OUT"; then FAIL=$((FAIL+1)); echo "FAIL  the 20-day-old day is in a 7-day window"; else PASS=$((PASS+1)); echo "PASS  a 7-day window leaves out day 20"; fi
check "30-day window includes it"        200 -b $JAR "$BASE/api/stats?day=$TODAY&days=30"
has   "  20 days ago: 9 pieces"          '"pieces":9'

echo "== other players"
check "user 2 sees none of it"           200 -b $JAR2 "$BASE/api/stats?day=$TODAY"
has   "  no streaks"                     '"streaks":[]'
if grep -q '"pieces":[1-9]' "$OUT"; then FAIL=$((FAIL+1)); echo "FAIL  user 2 sees user 1's pieces"; else PASS=$((PASS+1)); echo "PASS  user 2 has no pieces in the history"; fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]