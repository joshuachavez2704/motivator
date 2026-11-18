#!/usr/bin/env bash
# Checks "roll over yesterday's unfinished tasks": what is offered, accepting, dismissing,
# and that nobody can touch anything that is not theirs or not from yesterday.
# Two-day-old tasks are written straight into the database (smoke/seed.mjs), because the API
# only accepts today and a day either side. Needs DATABASE_URL, like the server does.
# Usage: bash smoke/rollover.sh          (talks to http://localhost:3001)
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
  if [ "$status" = "$expected" ]; then PASS=$((PASS+1)); printf 'PASS  %-56s %s\n' "$label" "$status"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-56s got %s, expected %s: %s\n' "$label" "$status" "$expected" "$(head -c 200 "$OUT")"; fi
}
has() {
  if grep -qF -- "$2" "$OUT"; then PASS=$((PASS+1)); printf 'PASS  %-56s\n' "$1"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-56s response was: %s\n' "$1" "$(head -c 400 "$OUT")"; fi
}
lacks() {
  if grep -qF -- "$2" "$OUT"; then FAIL=$((FAIL+1)); printf 'FAIL  %-56s response was: %s\n' "$1" "$(head -c 400 "$OUT")"
  else PASS=$((PASS+1)); printf 'PASS  %-56s\n' "$1"; fi
}
id_of() { grep -o '"id":[0-9]*' "$OUT" | head -1 | cut -d: -f2; }
# the part of the last tracking answer that holds the offered tasks
carryover() { sed -e 's/.*"carryover":\[//' -e 's/\].*//' "$OUT"; }

if [ -z "$DATABASE_URL" ]; then echo "DATABASE_URL is not set: this script seeds a past day directly"; exit 2; fi

check "register user 1" 201 -c $JAR  -X POST $BASE/api/register -H "$J" -d '{"username":"'$U1'","password":"correct horse"}'
check "register user 2" 201 -c $JAR2 -X POST $BASE/api/register -H "$J" -d '{"username":"'$U2'","password":"correct horse"}'

todo() { # day text -> id of the new to-do in $OUT
  curl -s -o "$OUT" -b $JAR -X POST $BASE/api/todos -H "$J" -d "{\"day\":\"$1\",\"text\":\"$2\"}"; id_of
}

echo "== nothing to offer yet"
check "tracking with no old tasks"        200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  carryover is empty"              '"carryover":[]'

echo "== yesterday's tasks"
A=$(todo $YESTERDAY "Write report")
B=$(todo $YESTERDAY "Call plumber")
C=$(todo $YESTERDAY "Already finished")
D=$(todo $YESTERDAY "Starred one")
E=$(todo $YESTERDAY "Skip this one")
check "finish one of them"                200 -b $JAR -X PATCH $BASE/api/todos/$C -H "$J" -d '{"done":true}'
check "star one as the one thing"         200 -b $JAR -X PATCH $BASE/api/todos/$D -H "$J" -d '{"focus":true}'
node "$HERE/seed.mjs" todo $U1 "2:Two days old" || { FAIL=$((FAIL+1)); echo "FAIL  seeding a two-day-old to-do"; }

check "tracking shows what is offered"    200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  Write report is offered"         '"text":"Write report"'
has   "  the starred one is offered"      '"text":"Starred one"'
carryover > /tmp/rollover.$$; CO=$(cat /tmp/rollover.$$); rm -f /tmp/rollover.$$
case "$CO" in *"Already finished"*) FAIL=$((FAIL+1)); echo "FAIL  a finished task is offered";; *) PASS=$((PASS+1)); echo "PASS  a finished task is not offered";; esac
case "$CO" in *"Two days old"*) FAIL=$((FAIL+1)); echo "FAIL  a two-day-old task is offered";; *) PASS=$((PASS+1)); echo "PASS  a two-day-old task is not offered";; esac
FIRST=$(printf '%s' "$CO" | grep -o '"text":"[^"]*"' | head -1)
if [ "$FIRST" = '"text":"Starred one"' ]; then PASS=$((PASS+1)); echo "PASS  the starred task is listed first"; else FAIL=$((FAIL+1)); echo "FAIL  first offered task was $FIRST"; fi
check "today's own list starts empty"     200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  no to-dos today yet"             '"todos":[]'
check "looking from yesterday offers the day before" 200 -b $JAR "$BASE/api/tracking?day=$YESTERDAY"
has   "  two-day-old task is offered then" '"text":"Two days old"'

echo "== other players"
check "user 2 is offered nothing"         200 -b $JAR2 "$BASE/api/tracking?day=$TODAY"
has   "  carryover is empty"              '"carryover":[]'
check "user 2 cannot accept user 1's task" 200 -b $JAR2 -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":['$A']}'
has   "  nothing was moved"               '"ids":[]'
check "user 2 cannot dismiss it either"   200 -b $JAR2 -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"dismiss","ids":['$A']}'
has   "  nothing was dismissed"           '"ids":[]'
check "still offered to user 1"           200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  Write report is still offered"   '"text":"Write report"'

echo "== accepting"
# today already has a starred task: the rolled-over starred one must not clash with it
F=$(todo $TODAY "Today's star")
check "star today's task"                 200 -b $JAR -X PATCH $BASE/api/todos/$F -H "$J" -d '{"focus":true}'
check "accept one task"                   200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":['$A']}'
has   "  it was moved"                    '"ids":['$A']'
has   "  and comes back as a to-do"       '"text":"Write report","done":false,"focus":false'
check "accept the starred one"            200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":['$D']}'
has   "  it arrives without the star"     '"text":"Starred one","done":false,"focus":false'
check "tracking after accepting"          200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  Write report is on today's list" '"text":"Write report"'
has   "  today's star is still its own"   '"text":"Today'"'"'s star","done":false,"focus":true'
carryover > /tmp/rollover.$$; CO=$(cat /tmp/rollover.$$); rm -f /tmp/rollover.$$
case "$CO" in *"Write report"*|*"Starred one"*) FAIL=$((FAIL+1)); echo "FAIL  accepted tasks are still offered";; *) PASS=$((PASS+1)); echo "PASS  accepted tasks are no longer offered";; esac
check "yesterday no longer lists them"    200 -b $JAR "$BASE/api/tracking?day=$YESTERDAY"
lacks "  Write report left yesterday"     '"text":"Write report"'
check "accepting again is harmless"       200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":['$A']}'
has   "  nothing moved the second time"   '"ids":[]'
check "a finished task cannot be rolled over" 200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":['$C']}'
has   "  nothing was moved"               '"ids":[]'

echo "== dismissing"
check "dismiss one task"                  200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"dismiss","ids":['$B']}'
has   "  it was dismissed"                '"ids":['$B']'
check "tracking after dismissing"         200 -b $JAR "$BASE/api/tracking?day=$TODAY"
lacks "  Call plumber is not offered again" '"text":"Call plumber"'
lacks "  and did not move to today"       '"text":"Call plumber","done"'
check "yesterday still has it"            200 -b $JAR "$BASE/api/tracking?day=$YESTERDAY"
has   "  Call plumber stays in yesterday" '"text":"Call plumber"'
check "a dismissed task cannot be accepted later" 200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":['$B']}'
has   "  nothing was moved"               '"ids":[]'
check "reject all that is left"           200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"dismiss","ids":['$E']}'
check "nothing left to offer"             200 -b $JAR "$BASE/api/tracking?day=$TODAY"
has   "  carryover is empty"              '"carryover":[]'

echo "== a day with several at once"
G=$(todo $YESTERDAY "Bulk one"); H=$(todo $YESTERDAY "Bulk two"); I=$(todo $YESTERDAY "Bulk three")
check "accept all three in one go"        200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":['$G','$H','$I']}'
has   "  Bulk one moved"                  '"text":"Bulk one"'
has   "  Bulk two moved"                  '"text":"Bulk two"'
has   "  Bulk three moved"                '"text":"Bulk three"'

echo "== bad input"
check "needs sign-in"                     401 -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":[1]}'
check "unknown action"                    400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"delete","ids":[1]}'
check "no action"                         400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","ids":[1]}'
check "empty ids"                         400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":[]}'
check "ids is not a list"                 400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":"1"}'
check "ids with text in them"             400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":["1; DROP TABLE todos"]}'
check "id too big for the database"       400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":[99999999999]}'
check "negative id"                       400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":[-1]}'
check "fractional id"                     400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":[1.5]}'
check "far too many ids"                  400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":['$(seq -s, 1 201)']}'
check "no day"                            400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"action":"accept","ids":[1]}'
check "day in the far past"               400 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"2020-01-01","action":"accept","ids":[1]}'
check "ids that do not exist are skipped" 200 -b $JAR -X POST $BASE/api/todos/rollover -H "$J" -d '{"day":"'$TODAY'","action":"accept","ids":[2000000000]}'
has   "  nothing changed"                 '"ids":[]'

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
