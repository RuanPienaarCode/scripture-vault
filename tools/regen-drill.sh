#!/bin/sh
# Regeneration-safety drill (issue I4): run any generator command, then prove
# that (a) no enrichment file changed and (b) the enrichment validator is clean.
# Usage: tools/regen-drill.sh <generator command...>
#   e.g. tools/regen-drill.sh node "Bible/build-bible-search.js" . "Bible/bible-search-template.html" "Bible Search.html"
# Exit codes: 0 = safe, 1 = generator touched enrichment or broke links, 2 = usage/setup error.
set -u

VAULT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$VAULT" || exit 2

if [ $# -eq 0 ]; then
  echo "Usage: tools/regen-drill.sh <generator command...>" >&2
  exit 2
fi

ENRICH_DIRS="Bible/Cross Reference:Bible/Study Hubs:Bible/Word Studies:Bible/Places:Bible/Catena:Bible/Commentary:Bible/Book Intros:Bible/Reference"

# Enrichment must be committed before the drill — otherwise "unchanged" is meaningless.
IFS=:
for d in $ENRICH_DIRS; do
  if [ -n "$(git status --porcelain -- "$d" 2>/dev/null)" ]; then
    echo "DRILL SETUP ERROR: uncommitted changes in \"$d\" — commit enrichment first." >&2
    exit 2
  fi
done
unset IFS

echo "drill: running generator: $*"
"$@"
GEN_STATUS=$?
if [ $GEN_STATUS -ne 0 ]; then
  echo "DRILL FAIL: generator exited $GEN_STATUS" >&2
  exit 1
fi

FAIL=0
IFS=:
for d in $ENRICH_DIRS; do
  CHANGED="$(git status --porcelain -- "$d" 2>/dev/null)"
  if [ -n "$CHANGED" ]; then
    echo "DRILL FAIL: generator modified enrichment path \"$d\":" >&2
    echo "$CHANGED" >&2
    FAIL=1
  fi
done
unset IFS

if ! node tools/validate-enrichment.js "$VAULT" > /dev/null 2>&1; then
  echo "DRILL FAIL: validator reports broken links after generator run" >&2
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo "DRILL OK: enrichment byte-identical and validator clean after generator run"
fi
exit $FAIL
