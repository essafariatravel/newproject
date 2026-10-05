#!/usr/bin/env bash
set -euo pipefail
BASE="1698562a05f8bd5c36027651d987a06bb60510f9"
APPROVED="a774203ec525f543e75a076cf867024a2a1af506"

git merge-base --is-ancestor 8b4b44d0bbaf312d96cadbd438ec4193e58d278b HEAD

mapfile -t paths < <(
  git diff --name-only "$APPROVED" HEAD --     ':(glob)src/app/**/*.tsx'     ':(glob)src/components/**/*.tsx' |
  grep -Ev '^(src/components/app-shell\.tsx|src/components/ui\.tsx|src/app/admin/page\.tsx|src/app/admin/applications/page\.tsx|src/app/admin/applications/\[id\]/page\.tsx|src/app/portal/applications/\[id\]/page\.tsx)$'
)

test "${#paths[@]}" -gt 0
git diff --binary --full-index "$BASE" "$APPROVED" -- "${paths[@]}" > /tmp/remaining.patch
test -s /tmp/remaining.patch

git apply --3way --index --whitespace=nowarn /tmp/remaining.patch || true
mapfile -t conflicts < <(git diff --name-only --diff-filter=U)
if [ "${#conflicts[@]}" -gt 0 ]; then
  python3 scripts/restore-approved-ui-conflicts.py "${conflicts[@]}"
  git add "${conflicts[@]}"
fi

changed="$(git diff --cached --name-only)"
printf '%s\n' "$changed"
test -n "$changed"
bad="$(printf '%s\n' "$changed" | grep -Ev '^(src/app/.*\.tsx|src/components/.*\.tsx)$' || true)"
test -z "$bad" || { echo "Restoration escaped visual page/component scope"; printf '%s\n' "$bad"; exit 1; }
if printf '%s\n' "$changed" | grep -Eq '^(src/app/api/|src/app/actions/|src/db/|migrations/|src/lib/)'; then
  echo "Protected backend/security path touched"; exit 1
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "Restore approved visual hunks while preserving RC logic"
git push origin HEAD:restore/original-approved-ux-ui
