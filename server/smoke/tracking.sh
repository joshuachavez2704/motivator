#!/usr/bin/env bash
# Walks through habits, to-dos, settings and earned pieces with real HTTP requests.
# Usage: bash smoke-tracking.sh            (talks to http://localhost:3001)
BASE=${BASE:-http://localhost:3001}
OUT=$(mktemp); JAR=$(mktemp); JAR2=$(mktemp)
trap 'rm -f "$OUT" "$JAR" "$JAR2"' EXIT
U1="test$RANDOM$RANDOM"; U2="test$RANDOM$RANDOM"
J='Content-Type: application/json'
PASS=0; FAIL=0
TODAY=$(date -u +%F)
YESTERDAY=$(date -u -d 'yesterday' +%F)

check() {
  local label=$1 expected=$2; shift 2
  local status
  status=$(curl -s -o "$OUT" -w '%{http_code}' "$@")
  if [ "$status" = "$expected" ]; then
    PASS=$((PASS+1)); printf 'PASS  %-46s %s\n' "$label" "$status"
  else
    FAIL=$((FAIL+1)); printf 'FAIL  %-46s got %s, expected %s: %s\n' "$label" "$status" "$expected" "$(head -c 200 "$OUT")"
  fi
}
has() {
  if grep -qF -- "$2" "$OUT"; then
    PASS=$((PASS+1)); printf 'PASS  %-46s\n' "$1"
  else
    FAIL=$((FAIL+1)); printf 'FAIL  %-46s response was: %s\n' "$1" "$(head -c 300 "$OUT")"
  fi
}
# first "id" number in the last response
id_of() { grep -o '"id":[0-9]*' "$OUT" | head -1 | cut -d: -f2; }

echo "== signed-out requests are refused (and public routes still work)"
check "health still public"            200 $BASE/api/health
check "tracking needs sign-in"         401 "$BASE/api/tracking?day=$TODAY"
check "settings needs sign-in"         401 -X PUT $BASE/api/settings -H "$J" -d '{}'
check "new habit needs sign-in"        401 -X POST $BASE/api/habits -H "$J" -d '{"name":"x"}'
check "new to-do needs sign-in"        401 -X POST $BASE/api/todos -H "$J" -d '{"day":"'$TODAY'","text":"x"}'

echo "== two players"
check "register user 1"                201 -c $JAR  -X POST $BASE/api/register -H "$J" -d '{"username":"'$U1'","password":"correct horse"}'
check "register user 2"                201 -c $JAR2 -X POST $BASE/api/register -H "$J" -d '{"username":"'$U2'","password":"correct horse"}'

echo "== a fresh account"
check "tracking for today"             200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  default habit value 1"        '"habitPieces":1'
has   "  default to-do value 2"        '"todoPieces":2'
has   "  default one-thing value 3"    '"focusPieces":3'
has   "  default daily limit 20"       '"dailyCap":20'
has   "  nothing earned yet"           '"earnedTotal":0'
check "bad day: not a date"            400 -b $JAR "$BASE/api/tracking?day=banana"
check "bad day: month 13"              400 -b $JAR "$BASE/api/tracking?day=2026-13-45"
check "bad day: far in the past"       400 -b $JAR "$BASE/api/tracking?day=2020-01-01"
check "missing day"                    400 -b $JAR "$BASE/api/tracking"

echo "== habits"
check "habit needs a name"             400 -b $JAR -X POST $BASE/api/habits -H "$J" -d '{"name":"   "}'
check "habit name too long"            400 -b $JAR -X POST $BASE/api/habits -H "$J" -d '{"name":"'$(printf 'x%.0s' $(seq 1 101))'"}'
check "create habit Read"              201 -b $JAR -X POST $BASE/api/habits -H "$J" -d '{"name":"Read"}'
H1=$(id_of)
check "create habit Gym"               201 -b $JAR -X POST $BASE/api/habits -H "$J" -d '{"name":"Gym"}'
H2=$(id_of)
check "tick Read for today"            200 -b $JAR -X PUT $BASE/api/habits/$H1/days/$TODAY -H "$J" -d '{"done":true}'
has   "  1 piece earned today"         '"earnedOnDay":1'
check "tick Read again (no double)"    200 -b $JAR -X PUT $BASE/api/habits/$H1/days/$TODAY -H "$J" -d '{"done":true}'
has   "  still 1 piece"                '"earnedOnDay":1'
check "tick Gym"                       200 -b $JAR -X PUT $BASE/api/habits/$H2/days/$TODAY -H "$J" -d '{"done":true}'
has   "  2 pieces earned today"        '"earnedOnDay":2'
check "untick Gym"                     200 -b $JAR -X PUT $BASE/api/habits/$H2/days/$TODAY -H "$J" -d '{"done":false}'
has   "  back to 1 piece"              '"earnedOnDay":1'
check "done must be true or false"     400 -b $JAR -X PUT $BASE/api/habits/$H1/days/$TODAY -H "$J" -d '{"done":"yes"}'
check "habit day far in the past"      400 -b $JAR -X PUT $BASE/api/habits/$H1/days/2020-01-01 -H "$J" -d '{"done":true}'
check "tracking shows Read as done"    200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  Read is done"                 '"name":"Read","done":true'
has   "  Gym is not done"              '"name":"Gym","done":false'
check "yesterday's tick adds to total" 200 -b $JAR -X PUT $BASE/api/habits/$H1/days/$YESTERDAY -H "$J" -d '{"done":true}'
has   "  yesterday earned 1, total 2"   '"earnedOnDay":1,"earnedTotal":2'
check "tracking: total spans days"     200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  total is 2"                  '"earnedTotal":2'
has   "  today is 1"                  '"earnedOnDay":1'

echo "== to-dos and your one thing"
check "to-do needs text"               400 -b $JAR -X POST $BASE/api/todos -H "$J" -d '{"day":"'$TODAY'","text":""}'
check "to-do needs a valid day"        400 -b $JAR -X POST $BASE/api/todos -H "$J" -d '{"day":"nope","text":"x"}'
check "create to-do A"                 201 -b $JAR -X POST $BASE/api/todos -H "$J" -d '{"day":"'$TODAY'","text":"Email landlord"}'
T1=$(id_of)
check "create to-do B"                 201 -b $JAR -X POST $BASE/api/todos -H "$J" -d '{"day":"'$TODAY'","text":"Call mom"}'
T2=$(id_of)
check "finish to-do A (worth 2)"       200 -b $JAR -X PATCH $BASE/api/todos/$T1 -H "$J" -d '{"done":true}'
has   "  habit 1 + to-do 2 = 3"        '"earnedOnDay":3'
check "make A your one thing"          200 -b $JAR -X PATCH $BASE/api/todos/$T1 -H "$J" -d '{"focus":true}'
has   "  A is now worth 3: total 4"    '"earnedOnDay":4'
check "make B your one thing"          200 -b $JAR -X PATCH $BASE/api/todos/$T2 -H "$J" -d '{"focus":true}'
has   "  B has the title"              '"focus":true'
has   "  A lost it: back to 3"         '"earnedOnDay":3'
check "tracking: exactly one focus"    200 -b $JAR "$BASE/api/tracking?day=$TODAY"
COUNT=$(grep -o '"focus":true' "$OUT" | wc -l)
if [ "$COUNT" = "1" ]; then PASS=$((PASS+1)); echo "PASS  only one to-do has the title"; else FAIL=$((FAIL+1)); echo "FAIL  expected one focus, found $COUNT"; fi
check "rename to-do B"                 200 -b $JAR -X PATCH $BASE/api/todos/$T2 -H "$J" -d '{"text":"Call mum"}'
has   "  renamed"                      '"text":"Call mum"'
check "empty update is refused"        400 -b $JAR -X PATCH $BASE/api/todos/$T2 -H "$J" -d '{}'
check "finish B (one thing, worth 3)"  200 -b $JAR -X PATCH $BASE/api/todos/$T2 -H "$J" -d '{"done":true}'
has   "  1 + 2 + 3 = 6"                '"earnedOnDay":6'
check "delete to-do A"                 200 -b $JAR -X DELETE $BASE/api/todos/$T1
has   "  4 now (A's 2 pieces gone)"    '"earnedOnDay":4'

echo "== piece values and the daily limit"
check "values must be 0 to 20"         400 -b $JAR -X PUT $BASE/api/settings -H "$J" -d '{"habitPieces":21,"todoPieces":2,"focusPieces":3,"dailyCap":20}'
check "values must be whole numbers"   400 -b $JAR -X PUT $BASE/api/settings -H "$J" -d '{"habitPieces":1.5,"todoPieces":2,"focusPieces":3,"dailyCap":20}'
check "change values"                  200 -b $JAR -X PUT $BASE/api/settings -H "$J" -d '{"habitPieces":5,"todoPieces":2,"focusPieces":3,"dailyCap":6}'
check "tracking keeps today's total"   200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  history is not rewritten"     '"earnedOnDay":4'
has   "  new habit value saved"        '"habitPieces":5'
check "tick Gym at the new value"      200 -b $JAR -X PUT $BASE/api/habits/$H2/days/$TODAY -H "$J" -d '{"done":true}'
has   "  limited to 6 a day"           '"earnedOnDay":6'

echo "== habits are archived, not erased"
check "delete habit Gym"               204 -b $JAR -X DELETE $BASE/api/habits/$H2
check "delete it again"                404 -b $JAR -X DELETE $BASE/api/habits/$H2
check "tracking no longer lists Gym"   200 -b $JAR "$BASE/api/tracking?day=$TODAY"
if grep -q '"name":"Gym"' "$OUT"; then FAIL=$((FAIL+1)); echo "FAIL  Gym is still listed"; else PASS=$((PASS+1)); echo "PASS  Gym is gone from the list"; fi

echo "== other players' things are off limits"
check "user 2 starts empty"            200 -b $JAR2 "$BASE/api/tracking?day=$TODAY"
has   "  user 2 earned nothing"        '"earnedTotal":0'
check "user 2 can't tick user 1's habit" 404 -b $JAR2 -X PUT $BASE/api/habits/$H1/days/$TODAY -H "$J" -d '{"done":true}'
check "user 2 can't delete the habit"  404 -b $JAR2 -X DELETE $BASE/api/habits/$H1
check "user 2 can't edit the to-do"    404 -b $JAR2 -X PATCH $BASE/api/todos/$T2 -H "$J" -d '{"done":false}'
check "user 2 can't delete the to-do"  404 -b $JAR2 -X DELETE $BASE/api/todos/$T2
check "ids that aren't numbers"        404 -b $JAR -X DELETE $BASE/api/todos/abc
check "huge ids don't crash"           404 -b $JAR -X DELETE $BASE/api/todos/99999999999999999999
check "user 1 still has their to-do"   200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  Call mum is still there"      '"text":"Call mum"'

echo
echo "$PASS passed, $FAIL failed"
echo "cleanup: DELETE FROM users WHERE username LIKE 'test%';"
[ "$FAIL" = "0" ]