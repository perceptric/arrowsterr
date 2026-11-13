#!/bin/sh
# Runs inside the one-off writer-baseline container on the VPS. The key comes from the web app's .env and stays here.
# Results come back through the logs: each file as gzip + base64 in RESULT lines, printed last.
set -e
cd /work
echo "STEP install"
npm i --no-save --no-audit --no-fund --silent @anthropic-ai/sdk@0.131.0 jsonrepair@3.15.0 >/dev/null 2>&1
if [ -n "$ANTHROPIC_API_KEY" ]; then echo "STEP key present"; else echo "STEP no key"; exit 2; fi
echo "STEP model ${WRITER_MODEL:-${CLAUDE_MODEL:-default}}"
node --no-warnings scripts/writer-baseline.mjs ${BASELINE_TOPICS:-} 2>&1 | sed -u 's/^/LOG /' || true
echo "STEP printing results"
for f in tests/fixtures/writer/baseline/*.json; do
  name=$(basename "$f" .json)
  gzip -9c "$f" | base64 -w 12000 | awk -v n="$name" '{ print "RESULT " n " " NR " " $0 }'
done
echo "STEP done"
