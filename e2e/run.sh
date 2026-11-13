#!/bin/bash
# Browser-Durchläufe (Playwright, Chromium ohne Grafikkarte).
#   e2e/run.sh                 alle Durchläufe
#   e2e/run.sh motoren markt   nur die genannten
#   JOBS=2 e2e/run.sh          Anzahl gleichzeitiger Durchläufe (Standard 3)
#   TEST_DPR=0.5 e2e/run.sh    höhere Auflösung, falls Bildschirmfotos der Tests gebraucht werden
#   SKIP_BUILD=1 e2e/run.sh    vorhandenes dist/ verwenden
# Die Seite läuft im Testmodus (?test): ein Viertel der Auflösung, keine Schatten – deutlich schneller, gleiche Logik.
cd "$(dirname "$0")/.."
# Die längsten zuerst, damit die Gesamtzeit nicht an einem späten langen Lauf hängt.
ALL="werkstatt diagnose motoren mechanik karriere markt bremse"
TESTS="${*:-$ALL}"
JOBS="${JOBS:-3}"
PORT="${PORT:-4173}"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
export GK_URL="http://localhost:$PORT/?test${TEST_DPR:+=$TEST_DPR}"
export GK_OUT="$PWD/e2e/out"
mkdir -p "$GK_OUT"
[ -n "$SKIP_BUILD" ] || npm run build > "$GK_OUT/build.log" 2>&1 || { echo "Build fehlgeschlagen – siehe e2e/out/build.log"; exit 1; }
pkill -f "vite preview --port $PORT" 2>/dev/null
npx vite preview --port "$PORT" > /dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.5; done
START=$(date +%s)
echo "$TESTS" | tr ' ' '\n' | xargs -P "$JOBS" -I{} sh -c 't0=$(date +%s); timeout 1500 node e2e/{}.cjs > "$GK_OUT/{}.txt" 2>&1; echo "{}: $(grep -c "^ok" "$GK_OUT/{}.txt") ok, $(grep -c "^FAIL" "$GK_OUT/{}.txt") Abweichungen, $(( $(date +%s) - t0 )) s – $(tail -1 "$GK_OUT/{}.txt" | cut -c1-60)"'
echo "Gesamt: $(( $(date +%s) - START )) s"
grep -h "^FAIL\|PAGEERR\|Error:" "$GK_OUT"/*.txt | cut -c1-300
! grep -q "^FAIL\|FEHLER\|Error:" $(for t in $TESTS; do echo "$GK_OUT/$t.txt"; done)
