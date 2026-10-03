#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3011}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; exit 1; }

fetch_locale() {
  local path="$1" locale="$2" out="$3"
  curl -fsS --max-time 30 -H "Cookie: evos_ui_locale=$locale" "$BASE_URL$path" -o "$out"
}

html_text_contains() {
  local file="$1" expected="$2"
  python3 - "$file" "$expected" <<'PY'
import html, re, sys
src = open(sys.argv[1], encoding="utf-8").read()
text = html.unescape(re.sub(r"<[^>]+>", " ", src))
text = " ".join(text.split())
raise SystemExit(0 if sys.argv[2] in text else 1)
PY
}

echo "== Legal/privacy runtime smoke =="
echo "Target: $BASE_URL"

# ---------------------------------------------------------------------------
# 1. No approved legal content => public legal pages do not invent text and
#    registration stays closed.
fetch_locale "/privacy" en "$WORK/privacy-empty.html"
grep -q "awaiting publication" "$WORK/privacy-empty.html"   && pass "privacy page shows unpublished state"   || fail "privacy page did not show unpublished state"
grep -qi 'name="robots"[^>]*noindex' "$WORK/privacy-empty.html"   && pass "unpublished privacy page is noindex"   || fail "unpublished privacy page is not noindex"

fetch_locale "/terms" en "$WORK/terms-empty.html"
grep -q "awaiting publication" "$WORK/terms-empty.html"   && pass "terms page shows unpublished state"   || fail "terms page did not show unpublished state"
grep -qi 'name="robots"[^>]*noindex' "$WORK/terms-empty.html"   && pass "unpublished terms page is noindex"   || fail "unpublished terms page is not noindex"

fetch_locale "/agency/register?lang=en" en "$WORK/register-empty.html"
grep -q "awaiting publication" "$WORK/register-empty.html"   && pass "registration is closed while legal versions are missing"   || fail "registration did not show legal publication blocker"
if grep -q 'name="termsVersionId"' "$WORK/register-empty.html"; then
  fail "registration form rendered while legal content was missing"
else
  pass "registration form is absent while legal content is missing"
fi

# ---------------------------------------------------------------------------
# 2. Insert SYNTHETIC LOCAL-ONLY legal fixtures. They exist only in this
#    disposable embedded database and are never shipped as legal content.
export DATABASE_URL
node <<'NODE'
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const author = (await client.query(
    "select id from users where role='SUPER_ADMIN' order by created_at limit 1"
  )).rows[0];
  if (!author) throw new Error("local runtime smoke requires seeded SUPER_ADMIN");

  const fixtures = [
    ["11111111-1111-4111-8111-111111111111","terms","en","SYNTHETIC TERMS EN"],
    ["22222222-2222-4222-8222-222222222222","privacy","en","SYNTHETIC PRIVACY EN"],
    ["33333333-3333-4333-8333-333333333333","terms","fr","SYNTHETIC TERMS FR"],
    ["44444444-4444-4444-8444-444444444444","privacy","fr","SYNTHETIC PRIVACY FR"],
    ["55555555-5555-4555-8555-555555555555","terms","ar","SYNTHETIC TERMS AR"],
    ["66666666-6666-4666-8666-666666666666","privacy","ar","SYNTHETIC PRIVACY AR"],
  ];
  for (const [id,kind,locale,body] of fixtures) {
    await client.query(
      `insert into legal_versions
         (id,kind,locale,version,body,effective_at,published_at,author_id)
       values ($1,$2,$3,1,$4,'2026-10-01T00:00:00Z',now(),$5)`,
      [id,kind,locale,body,author.id]
    );
  }
  await client.end();
})().catch((err) => { console.error(err); process.exit(1); });
NODE
pass "synthetic local-only legal versions inserted"

# ---------------------------------------------------------------------------
# 3. Public legal rendering after publication.
fetch_locale "/privacy" en "$WORK/privacy-live.html"
html_text_contains "$WORK/privacy-live.html" "SYNTHETIC PRIVACY EN" \
  && html_text_contains "$WORK/privacy-live.html" "Version 1" \
  && pass "privacy page renders approved version + version number" \
  || fail "privacy page did not render the active legal version"
if grep -qi 'name="robots"[^>]*noindex' "$WORK/privacy-live.html"; then
  fail "published privacy page remained noindex"
else
  pass "published privacy page is indexable by page metadata"
fi

fetch_locale "/terms" en "$WORK/terms-live.html"
html_text_contains "$WORK/terms-live.html" "SYNTHETIC TERMS EN" \
  && html_text_contains "$WORK/terms-live.html" "Version 1" \
  && pass "terms page renders approved version + version number" \
  || fail "terms page did not render the active legal version"

# EN/FR/AR stay independently published.
fetch_locale "/privacy" fr "$WORK/privacy-fr.html"
fetch_locale "/privacy" ar "$WORK/privacy-ar.html"
grep -q "SYNTHETIC PRIVACY FR" "$WORK/privacy-fr.html"   && pass "FR privacy version resolves independently"   || fail "FR privacy version did not resolve"
grep -q "SYNTHETIC PRIVACY AR" "$WORK/privacy-ar.html"   && grep -q 'dir="rtl"' "$WORK/privacy-ar.html"   && pass "AR privacy version resolves independently with RTL"   || fail "AR privacy version/RTL did not resolve"

# ---------------------------------------------------------------------------
# 4. Registration form is open only with exact legal IDs and contains no
#    first-contact KYC/document/address field.
fetch_locale "/agency/register?lang=en" en "$WORK/register-live.html"
for expected in   'name="termsVersionId"'   'value="11111111-1111-4111-8111-111111111111"'   'name="privacyVersionId"'   'value="22222222-2222-4222-8222-222222222222"'
do
  grep -q "$expected" "$WORK/register-live.html" || fail "registration missing exact legal evidence: $expected"
done
pass "registration carries exact legal version UUIDs"

python3 - "$WORK/register-live.html" <<'PY'
import re, sys
src = open(sys.argv[1], encoding="utf-8").read()
forms = re.findall(r"<form\\b[^>]*>.*?</form>", src, re.S)
chosen = next((form for form in forms if 'name="termsVersionId"' in form), None)
if not chosen:
    raise SystemExit("registration form not found")

controls = re.findall(r"<(?:input|select|textarea)\\b[^>]*>", chosen, re.I)
names = set()
has_file = False
for tag in controls:
    name = re.search(r'name="([^"]+)"', tag, re.I)
    if name:
        names.add(name.group(1))
    if re.search(r'type="file"', tag, re.I):
        has_file = True

forbidden = {
    "addressLine",
    "commercialRegistrationNumber",
    "taxId",
    "licenceNumber",
    "monthlyVolume",
    "mainMarkets",
}
present = sorted(forbidden & names)
if present:
    raise SystemExit("forbidden first-contact controls rendered: " + ", ".join(present))
if has_file:
    raise SystemExit("file upload control rendered in first-contact form")
PY
pass "first-contact registration remains KYC/document/address minimized"

# ---------------------------------------------------------------------------
# 5. Submit the real Next.js server-action form over HTTP. Hidden action fields
#    are extracted from the rendered form, while visible fields are supplied
#    explicitly. Inject legacy KYC + privileged mass-assignment junk; the
#    server action must ignore it.
python3 - "$WORK/register-live.html" <<'PY' > "$WORK/hidden.txt"
import html, re, sys
src = open(sys.argv[1], encoding="utf-8").read()
forms = re.findall(r"<form\b[^>]*>.*?</form>", src, re.S)
chosen = next((f for f in forms if 'name="termsVersionId"' in f), None)
if not chosen:
    raise SystemExit("registration form not found")
for tag in re.findall(r"<input\b[^>]*>", chosen):
    if 'type="hidden"' not in tag:
        continue
    n = re.search(r'name="([^"]+)"', tag)
    if not n:
        continue
    v = re.search(r'value="([^"]*)"', tag)
    print(n.group(1) + "=" + (html.unescape(v.group(1)) if v else ""))
PY

STAMP="$(date +%s)"
LEGAL_NAME="Runtime Privacy Verify $STAMP SARL"
EMAIL="runtime-privacy-$STAMP@example.invalid"
cat > "$WORK/visible.txt" <<EOF
legalName=$LEGAL_NAME
contactFirstName=Nadia
email=$EMAIL
phone=+213550123456
city=Algiers
terms=true
privacy=true
accuracy=true
fax=
addressLine=SHOULD-NOT-PERSIST
commercialRegistrationNumber=SHOULD-NOT-PERSIST
taxId=SHOULD-NOT-PERSIST
licenceNumber=SHOULD-NOT-PERSIST
monthlyVolume=200+
mainMarkets=SHOULD-NOT-PERSIST
role=SUPER_ADMIN
status=APPROVED
balance=999999
internalNotes=SHOULD-NOT-PERSIST
EOF

# respect the server-side render-time anti-automation trap
sleep 2

ARGS=()
while IFS= read -r line; do ARGS+=(-F "$line"); done < "$WORK/hidden.txt"
while IFS= read -r line; do ARGS+=(-F "$line"); done < "$WORK/visible.txt"

CODE=$(curl -sS -b "evos_ui_locale=en" -D "$WORK/post.headers" -o "$WORK/post.body"   -w "%{http_code}" -H "Origin: $BASE_URL" --max-time 60   -X POST "$BASE_URL/agency/register?lang=en" "${ARGS[@]}")
LOCATION=$(grep -i '^location:' "$WORK/post.headers" | tr -d '\r' | cut -d' ' -f2- || true)

if { [ "$CODE" = "303" ] || [ "$CODE" = "307" ]; } && echo "$LOCATION" | grep -q '/agency/register/success?ref=AGR-'; then
  pass "real HTTP registration server action accepted minimized submission"
else
  echo "HTTP=$CODE location=${LOCATION:-none}" >&2
  head -c 1000 "$WORK/post.body" >&2 || true
  fail "real HTTP registration did not reach success redirect"
fi

export RUNTIME_LEGAL_NAME="$LEGAL_NAME"
node <<'NODE'
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(
    `select id, status, address_line, commercial_registration_number, tax_id,
            licence_number, monthly_volume, main_markets, internal_notes,
            legal_consent_versions
       from agency_registrations
      where legal_name=$1
      order by created_at desc limit 1`,
    [process.env.RUNTIME_LEGAL_NAME]
  );
  if (r.rows.length !== 1) throw new Error("runtime registration row not found");
  const row = r.rows[0];
  for (const key of [
    "address_line","commercial_registration_number","tax_id","licence_number",
    "monthly_volume","main_markets","internal_notes"
  ]) {
    if (row[key] !== null) throw new Error(`${key} unexpectedly persisted: ${row[key]}`);
  }
  if (row.status !== "PENDING") throw new Error(`unexpected status ${row.status}`);
  const ev = row.legal_consent_versions;
  if (ev?.terms?.id !== "11111111-1111-4111-8111-111111111111") throw new Error("wrong Terms version evidence");
  if (ev?.privacy?.id !== "22222222-2222-4222-8222-222222222222") throw new Error("wrong Privacy version evidence");
  if (ev?.locale !== "en") throw new Error("wrong consent locale");

  const audit = await c.query(
    "select action, metadata from audit_logs where entity='agency_registration' and entity_id=$1 order by created_at",
    [row.id]
  );
  const actions = audit.rows.map(x => x.action);
  if (!actions.includes("TERMS_ACCEPTED")) throw new Error("TERMS_ACCEPTED audit missing");
  if (!actions.includes("PRIVACY_NOTICE_ACKNOWLEDGED")) throw new Error("PRIVACY_NOTICE_ACKNOWLEDGED audit missing");

  const termsAudit = audit.rows.find(x => x.action === "TERMS_ACCEPTED");
  const privacyAudit = audit.rows.find(x => x.action === "PRIVACY_NOTICE_ACKNOWLEDGED");
  if (termsAudit?.metadata?.legalVersionId !== "11111111-1111-4111-8111-111111111111") {
    throw new Error("Terms audit version ID mismatch");
  }
  if (privacyAudit?.metadata?.legalVersionId !== "22222222-2222-4222-8222-222222222222") {
    throw new Error("Privacy audit version ID mismatch");
  }
  await c.end();
})().catch((err) => { console.error(err); process.exit(1); });
NODE
pass "persisted registration is minimized and audit evidence is exact"

echo "== Legal/privacy runtime smoke: PASS =="
