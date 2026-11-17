#!/usr/bin/env bash
# Walks through health, accounts, sessions and saved puzzles with real HTTP requests.
# Usage: bash smoke/core.sh            (talks to http://localhost:3001)
BASE=${BASE:-http://localhost:3001}
OUT=$(mktemp); HDR=$(mktemp); JAR=$(mktemp); JAR2=$(mktemp)
trap 'rm -f "$OUT" "$HDR" "$JAR" "$JAR2"' EXIT
U1="test$RANDOM$RANDOM"; U2="test$RANDOM$RANDOM"
J='Content-Type: application/json'
PASS=0; FAIL=0
PHOTO='{"id":"p1","imageUrl":"https://example.com/a.jpg"}'

check() {
  local label=$1 expected=$2; shift 2
  local status
  status=$(curl -s -D "$HDR" -o "$OUT" -w '%{http_code}' "$@")
  if [ "$status" = "$expected" ]; then PASS=$((PASS+1)); printf 'PASS  %-50s %s\n' "$label" "$status"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-50s got %s, expected %s: %s\n' "$label" "$status" "$expected" "$(head -c 200 "$OUT")"; fi
}
has() {
  if grep -qF -- "$2" "$OUT"; then PASS=$((PASS+1)); printf 'PASS  %-50s\n' "$1"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-50s response was: %s\n' "$1" "$(head -c 300 "$OUT")"; fi
}
header_has() {
  if grep -qiF -- "$2" "$HDR"; then PASS=$((PASS+1)); printf 'PASS  %-50s\n' "$1"
  else FAIL=$((FAIL+1)); printf 'FAIL  %-50s headers were: %s\n' "$1" "$(head -c 400 "$HDR" | tr '\r\n' '  ')"; fi
}
puzzle_id() { grep -o '"id":"[^"]*"' "$OUT" | head -1 | cut -d'"' -f4; }

echo "== basics"
check "health"                              200 $BASE/api/health
check "database health"                     200 $BASE/api/health/db

echo "== a guest"
check "me as a guest"                       200 $BASE/api/me
has   "  user is null"                      '"user":null'
check "puzzle needs sign-in"                401 $BASE/api/puzzle
check "new puzzle needs sign-in"            401 -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":1,"photo":'"$PHOTO"'}'
check "saving a piece needs sign-in"        401 -X PUT $BASE/api/puzzles/00000000-0000-0000-0000-000000000000/pieces/0 -H "$J" -d '{"x":0.1,"y":0.1}'

echo "== registering"
check "username too short"                  400 -X POST $BASE/api/register -H "$J" -d '{"username":"ab","password":"correct horse"}'
check "username with a space"               400 -X POST $BASE/api/register -H "$J" -d '{"username":"bad name","password":"correct horse"}'
check "password too short"                  400 -X POST $BASE/api/register -H "$J" -d '{"username":"'$U1'","password":"short"}'
check "no body at all"                      400 -X POST $BASE/api/register -H "$J"
check "register user 1"                     201 -c $JAR -X POST $BASE/api/register -H "$J" -d '{"username":"'$U1'","password":"correct horse"}'
has   "  username returned"                 '"username":"'$U1'"'
header_has "  cookie is HttpOnly"            'HttpOnly'
header_has "  cookie is SameSite=Lax"        'SameSite=Lax'
check "same name again"                     409 -X POST $BASE/api/register -H "$J" -d '{"username":"'$U1'","password":"correct horse"}'
check "same name in capitals"               409 -X POST $BASE/api/register -H "$J" -d '{"username":"'$(echo $U1 | tr a-z A-Z)'","password":"correct horse"}'
check "register user 2"                     201 -c $JAR2 -X POST $BASE/api/register -H "$J" -d '{"username":"'$U2'","password":"correct horse"}'

echo "== sessions"
check "me with the cookie"                  200 -b $JAR $BASE/api/me
has   "  signed in as user 1"               '"username":"'$U1'"'
check "me with a forged cookie"             200 -H 'Cookie: session=not-a-real-token' $BASE/api/me
has   "  treated as a guest"                '"user":null'
check "log out"                             204 -b $JAR -c $JAR -X POST $BASE/api/logout
check "me after logging out"                200 -b $JAR $BASE/api/me
has   "  guest again"                       '"user":null'
check "login with a wrong password"         401 -X POST $BASE/api/login -H "$J" -d '{"username":"'$U1'","password":"wrong password"}'
has   "  generic message"                   'Wrong username or password'
check "login with an unknown user"          401 -X POST $BASE/api/login -H "$J" -d '{"username":"nobody_here_1","password":"correct horse"}'
has   "  the same generic message"          'Wrong username or password'
check "login with the right password"       200 -c $JAR -X POST $BASE/api/login -H "$J" -d '{"username":"'$U1'","password":"correct horse"}'
check "login ignores the name's case"       200 -X POST $BASE/api/login -H "$J" -d '{"username":"'$(echo $U1 | tr a-z A-Z)'","password":"correct horse"}'

echo "== puzzles"
check "no puzzle yet"                       200 -b $JAR $BASE/api/puzzle
has   "  puzzle is null"                    '"puzzle":null'
check "rows must be 1 to 30"                400 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":31,"cols":6,"seed":1,"photo":'"$PHOTO"'}'
check "rows must be a whole number"         400 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4.5,"cols":6,"seed":1,"photo":'"$PHOTO"'}'
check "seed must fit the database"          400 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":99999999999,"photo":'"$PHOTO"'}'
check "photo needs an id"                   400 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":1,"photo":{"x":1}}'
check "create a puzzle"                     201 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":4,"cols":6,"seed":7,"photo":'"$PHOTO"'}'
P1=$(puzzle_id)
check "load it back"                        200 -b $JAR $BASE/api/puzzle
has   "  same seed"                         '"seed":7'
has   "  same photo"                        '"id":"p1"'
has   "  empty board"                       '"positions":[]'

echo "== pieces"
check "place piece 3"                       204 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/3 -H "$J" -d '{"x":0.25,"y":0.5}'
check "move piece 3"                        204 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/3 -H "$J" -d '{"x":0.6,"y":0.4}'
check "place piece 5"                       204 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/5 -H "$J" -d '{"x":0.1,"y":0.1}'
check "board has both, piece 3 at its new spot" 200 -b $JAR $BASE/api/puzzle
has   "  piece 3 moved"                     '"pieceId":3,"x":0.6,"y":0.4'
has   "  piece 5 placed"                    '"pieceId":5'
check "x far off the board"                 400 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/3 -H "$J" -d '{"x":9,"y":0.4}'
check "x is not a number"                   400 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/3 -H "$J" -d '{"x":"left","y":0.4}'
check "piece past the end (24 pieces)"      404 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/24 -H "$J" -d '{"x":0.1,"y":0.1}'
check "piece id is not a number"            404 -b $JAR -X PUT $BASE/api/puzzles/$P1/pieces/abc -H "$J" -d '{"x":0.1,"y":0.1}'
check "puzzle id is not a uuid"             404 -b $JAR -X PUT $BASE/api/puzzles/not-a-uuid/pieces/1 -H "$J" -d '{"x":0.1,"y":0.1}'
check "send piece 3 back to the tray"       204 -b $JAR -X DELETE $BASE/api/puzzles/$P1/pieces/3
check "load: only piece 5 is left"          200 -b $JAR $BASE/api/puzzle
has   "  piece 5 still there"               '"pieceId":5'
if grep -q '"pieceId":3' "$OUT"; then FAIL=$((FAIL+1)); echo "FAIL  piece 3 is still on the board"; else PASS=$((PASS+1)); echo "PASS  piece 3 is gone from the board"; fi
check "a second puzzle becomes the current one" 201 -b $JAR -X POST $BASE/api/puzzles -H "$J" -d '{"rows":8,"cols":12,"seed":9,"photo":'"$PHOTO"'}'
check "load: the new puzzle"                200 -b $JAR $BASE/api/puzzle
has   "  8 rows"                            '"rows":8'
has   "  its board is empty"                '"positions":[]'

echo "== other players cannot touch your puzzle"
check "user 2 starts with no puzzle"        200 -b $JAR2 $BASE/api/puzzle
has   "  puzzle is null"                    '"puzzle":null'
check "user 2 cannot move user 1's piece"   404 -b $JAR2 -X PUT $BASE/api/puzzles/$P1/pieces/5 -H "$J" -d '{"x":0.9,"y":0.9}'
check "user 2 cannot remove it either"      404 -b $JAR2 -X DELETE $BASE/api/puzzles/$P1/pieces/5

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]