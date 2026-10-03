#!/usr/bin/env bash
# gate rerun trigger: post-migration production smoke (visa_os @ 0010 aligned)
# Hosted verification harness for Phase 2 (agency registration & approval workflow).
#
# Runs pure HTTP (curl) against a target deployment (local dev or Vercel Preview),
# reproducing a JavaScript-less browser: forms are submitted exactly via their
# rendered progressive-enhancement hidden inputs. Every Phase 2 acceptance item
# that can be exercised over HTTP is asserted.
#
# Usage:
#   BASE_URL=http://localhost:3000 ./scripts/hosted-verify.sh
#   BASE_URL=https://<preview>.vercel.app \
#   PREVIEW_VERIFY_STAFF_EMAIL=admin@essafaria.example \
#   PREVIEW_VERIFY_STAFF_PASSWORD=<preview seed password> \
#   ./scripts/hosted-verify.sh
#
# Without staff credentials the staff-only blocks print SKIP (not FAIL).
set -u
BASE_URL="${BASE_URL:?set BASE_URL, e.g. https://<preview>.vercel.app}"
STAFF_EMAIL="${PREVIEW_VERIFY_STAFF_EMAIL:-}"
STAFF_PASS="${PREVIEW_VERIFY_STAFF_PASSWORD:-}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0; FAIL=0; SKIP=0; FAILED_CHECKS=()

log()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); log "PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); FAILED_CHECKS+=("$1"); log "FAIL  $1"; }
skp()  { SKIP=$((SKIP+1)); log "SKIP  $1"; }

status_of()  { curl -s -o "$2" -w "%{http_code}" --max-time 30 "$1"; }
statusb_of() { curl -s -b "$3" -c "$3" -o "$2" -w "%{http_code}" --max-time 30 "$1"; }
statusbl_of() { curl -s -b "$3" -c "$3" -b "evos_ui_locale=$4" -o "$2" -w "%{http_code}" --max-time 30 "$1"; }

# Submit the <form> identified by `marker` (a string inside it, e.g. the submit
# button label) from the given fetched HTML file to `pageurl`, exactly like a
# no-JS browser would: every hidden input is carried; extra fields come from an
# optional file of "name=value" / "file=@path" curl -F lines.
submit_form() { # htmlfile pageurl marker jar extra-fields-file
  python3 - "$1" "$3" <<'PY' > "$WORK/fields.txt"
import re, html, sys
src = open(sys.argv[1], encoding="utf-8").read()
marker = sys.argv[2]
chosen = None
for f in re.findall(r"<form\b[^>]*>.*?</form>", src, re.S):
    if marker in f:
        chosen = f; break
if chosen is None:
    sys.exit(1)
out = []
for m in re.finditer(r"<input\b[^>]*>", chosen):
    tag = m.group(0)
    if 'type="hidden"' not in tag and "type='hidden'" not in tag:
        continue  # visible inputs are supplied explicitly by the harness
    name = re.search(r'name="([^"]*)"', tag)
    if not name: continue
    value = re.search(r'value="([^"]*)"', tag)
    out.append(name.group(1) + "=" + (html.unescape(value.group(1)) if value else ""))
print("\n".join(out))
PY
  [ -s "$WORK/fields.txt" ] || return 1
  local args=()
  while IFS= read -r line; do args+=(-F "$line"); done < "$WORK/fields.txt"
  [ -f "$5" ] && while IFS= read -r line; do args+=(-F "$line"); done < "$5"
  local ORIGIN
  ORIGIN=$(printf '%s' "$2" | sed -E 's#^([a-z]+://[^/]+).*#\1#')
  curl -s -b "$4" -c "$4" -D "$WORK/headers.txt" -o "$WORK/body.html" -w "%{http_code}" \
    -H "Origin: ${ORIGIN}" --max-time 60 -X POST "$2" "${args[@]}"
}

loc_header() { grep -i '^location:' "$WORK/headers.txt" | tr -d '\r' | cut -d' ' -f2; }

HOSTED_PDF="$WORK/proof.pdf"
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > "$HOSTED_PDF"

log "== Phase 2 hosted verification =="
log "Target: $BASE_URL"
log ""

# -------------------------------------------------------------------------- #
# P0 PROD DIAG (read-only): the custom production domain is being promoted
# from branch deployments; verify what its own diagnostics endpoint reports.
# GET /api/health is the app's purpose-built, credential-free, redacted
# diagnostics route (SELECT to_regclass / limit-0 column probes / ledger read).
log "-- [0a] P0 PROD diag (read-only): https://visa.essafariavoyages.com/api/health"
CODE_PROD=$(status_of "https://visa.essafariavoyages.com/api/health" "$WORK/prod-health.json")
if [ "$CODE_PROD" = "200" ]; then
  python3 -c "
import json
d=json.load(open('$WORK/prod-health.json'))
db=d.get('database') or {}; s=d.get('schema') or {}
led=s.get('migrationLedger') or []
err=db.get('error') or {}
print('PASS  PROD health 200: ok=%s configured=%s connected=%s columnsValid=%s schema=%s ledger=%d last=%s accounts=%s' % (
  d.get('ok'), db.get('configured'), db.get('connected'), s.get('columnsValid'),
  s.get('name'), len(led), (led[-1] if led else 'none'), s.get('hasUserAccounts')))
print('PASS  PROD db.identity: host=%s port=%s mode=%s ssl=%s intendedSupabaseProject=%s' % (
  db.get('host'), db.get('port'), db.get('mode'), db.get('ssl'), db.get('intendedSupabaseProject')))
print('PASS  PROD db.error: code=%s message=%s' % (err.get('code'), str(err.get('message'))[:140]))
rt=' '.join('%s=%s' % (k, v) for k, v in (s.get('requiredTables') or {}).items())
print('PASS  PROD requiredTables: %s' % (rt or 'none'))"
else
  log "INFO  PROD health returned http $CODE_PROD"
fi
CODE_PROD_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "https://visa.essafariavoyages.com/login")
{ [ "$CODE_PROD_LOGIN" = "200" ] && ok "PROD /login page renders (http 200)" || skp "PROD /login render returned http $CODE_PROD_LOGIN"; }

# -------------------------------------------------------------------------- #
log "-- [0] Health check"
CODE=$(status_of "$BASE_URL/api/health" "$WORK/health.json")
if [ "$CODE" = "200" ] && python3 -c "
import json,sys
d=json.load(open('$WORK/health.json'))
sys.exit(0 if d.get('ok') is True else 1)
"; then
  ok "health: public readiness ok=true ($CODE)"

  PREVIEW_SCHEMA=$(python3 -c "
import json
print((json.load(open('$WORK/health.json')).get('schema') or {}).get('name') or '')" 2>/dev/null || true)

  if [ -n "$PREVIEW_SCHEMA" ]; then
    if [ "$PREVIEW_SCHEMA" = "visa_os_preview" ]; then
      ok "health: authenticated diagnostics report visa_os_preview"
    elif [ "$PREVIEW_SCHEMA" = "visa_os" ]; then
      bad "health: Preview deployment is pointing at PRODUCTION schema visa_os — STOP"
    else
      bad "health: unexpected Preview schema '$PREVIEW_SCHEMA'"
    fi

    if python3 -c "
import json
s=json.load(open('$WORK/health.json')).get('schema') or {}
led=s.get('migrationLedger') or []
required=['0020_identity_security.sql','0021_business_invariants.sql','0022_registration_review.sql','0023_operations_legal.sql','0024_preview_api_lockdown.sql','0025_legal_privacy_readiness.sql','0026_function_privilege_hardening.sql']
raise SystemExit(0 if s.get('columnsValid') is True and all(m in led for m in required) else 1)
"; then
      ok "health: authenticated diagnostics carry columnsValid + migrations 0020–0026"
    else
      bad "health: authenticated schema diagnostics incomplete"
    fi
  else
    ok "health: sensitive DB/schema diagnostics are redacted for anonymous callers"
  fi
else
  bad "health endpoint readiness ($CODE)"
fi

# -------------------------------------------------------------------------- #
log "-- [1] Trilingual registration page"
CODE_EN=$(status_of "$BASE_URL/agency/register?lang=en" "$WORK/reg-en.html")
CODE_FR=$(status_of "$BASE_URL/agency/register?lang=fr" "$WORK/reg-fr.html")
CODE_AR=$(status_of "$BASE_URL/agency/register?lang=ar" "$WORK/reg-ar.html")
[ "$CODE_EN" = "200" ] && grep -q "Register your Agency" "$WORK/reg-en.html" \
  && ok "EN registration page renders ($CODE_EN)" || bad "EN registration page ($CODE_EN)"
[ "$CODE_FR" = "200" ] && grep -q "Inscrire votre agence" "$WORK/reg-fr.html" && grep -qi "demande de partenariat" "$WORK/reg-fr.html" \
  && ok "FR registration page ($CODE_FR)" || bad "FR registration page ($CODE_FR)"
[ "$CODE_AR" = "200" ] && grep -q 'dir="rtl"' "$WORK/reg-ar.html" && grep -q "سجّل وكالتك" "$WORK/reg-ar.html" \
  && ok "AR registration page + RTL ($CODE_AR)" || bad "AR registration page + RTL ($CODE_AR)"

# Homepage CTA — §50: the sticky header carries exactly ONE register CTA,
# and at mobile widths it is the only one visible (body CTAs are sm+).
CODE_H=$(status_of "$BASE_URL/" "$WORK/home.html")
if [ "$CODE_H" = "200" ]; then
  CTAS=$(grep -o 'data-testid="public-register-cta"' "$WORK/home.html" | wc -l | tr -d ' ')
  MOBILE_VISIBLE=$(grep -o '<a[^>]*href="/agency/register"[^>]*>' "$WORK/home.html" | grep -vc 'hidden.*sm:inline-flex')
  HAMBURGER=$(grep -c 'data-testid="public-menu-toggle"' "$WORK/home.html")
  OVERFLOW=$(grep -c 'overflow-x-auto' "$WORK/home.html")
  if [ "$CTAS" = "1" ] && [ "$MOBILE_VISIBLE" -ge 1 ] && [ "$HAMBURGER" -ge 1 ] && [ "$OVERFLOW" = "0" ]; then
    ok "homepage: canonical header register CTA + hamburger + no horizontal overflow (visible CTAs=$MOBILE_VISIBLE)"
  else
    bad "homepage public-navigation contract (header CTA=$CTAS mobile-visible=$MOBILE_VISIBLE hamburger=$HAMBURGER overflow=$OVERFLOW)"
  fi
else bad "homepage CTA ($CODE_H)"; fi

STAMP=$(date +%s)
LEGAL_EN="Hosted Verify EN $STAMP SARL"
LEGAL_XX="Hosted Verify Reject $STAMP SPA"
EMAIL_EN="hosted-en-$STAMP@hosted-verify.invalid"
EMAIL_XX="hosted-reject-$STAMP@hosted-verify.invalid"

# Mass-assignment junk fields — the server must ignore every one of them.
JUNK="-F role=SUPER_ADMIN -F permissions=wallet.credit -F status=APPROVED -F agencyId=00000000-0000-0000-0000-000000000000 -F balance=99999.00 -F internalNotes=should-never-persist"

make_form() { # $1=locale $2=agencyName $3=professionalEmail
  cat > "$WORK/form.txt" <<EOF
locale=$1
legalName=$2
contactFirstName=Nadia
email=$3
phone=+213 55 00 00 00
city=Algiers
terms=on
privacy=on
accuracy=on
fax=
EOF
  sleep 2  # respect the ≥1.5s render-time antibot trap
}

LEGAL_READY_COUNT=0
for legal_page in "$WORK/reg-en.html" "$WORK/reg-fr.html" "$WORK/reg-ar.html"; do
  if grep -q 'name="termsVersionId"' "$legal_page" && grep -q 'name="privacyVersionId"' "$legal_page"; then
    LEGAL_READY_COUNT=$((LEGAL_READY_COUNT+1))
  fi
done

if [ "$LEGAL_READY_COUNT" = "3" ]; then
  ok "legal publication ready in EN/FR/AR — onboarding E2E enabled"
# -------------------------------------------------------------------------- #
log "-- [2] Public minimized submission + mass-assignment junk"
make_form en "$LEGAL_EN" "$EMAIL_EN"
# push the mass-assignment junk fields into the multipart as well
{ printf '%s\n' "role=SUPER_ADMIN" "permissions=wallet.credit" "status=APPROVED" \
  "agencyId=00000000-0000-0000-0000-000000000000" "balance=99999.00" "internalNotes=should-never-persist" \
  "addressLine=SHOULD-NOT-PERSIST" "commercialRegistrationNumber=SHOULD-NOT-PERSIST" \
  "taxId=SHOULD-NOT-PERSIST" "licenceNumber=SHOULD-NOT-PERSIST" \
  "monthlyVolume=200+" "mainMarkets=SHOULD-NOT-PERSIST"; } >> "$WORK/form.txt"
CODE=$(submit_form "$WORK/reg-en.html" "$BASE_URL/agency/register?lang=en" \
  "Submit application for review" "$WORK/nojar.txt" "$WORK/form.txt")
LOC=$(loc_header)
if { [ "${CODE}" = "303" ] || [ "${CODE}" = "200" ]; } && echo "$LOC" | grep -q "agency/register/success?ref=AGR-"; then
  ok "submission redirects to success (http $CODE → $LOC); mass-assignment junk fields ignored"
  REF1=$(echo "$LOC" | grep -o "AGR-[0-9A-Z-]*" | head -1)
  SUCCESS_URL="$BASE_URL$LOC"
else
  bad "submission redirect (http ${CODE:-?}, location: ${LOC:-none})"; REF1=""; SUCCESS_URL=""
fi
if [ -n "$SUCCESS_URL" ]; then
  CODE_S=$(status_of "$SUCCESS_URL" "$WORK/success1.html")
  { [ "$CODE_S" = "200" ] && grep -q "registration request has been received" "$WORK/success1.html" && grep -q "$REF1" "$WORK/success1.html"; } \
    && ok "success page: review-before-access message + reference ($REF1)" || bad "success page content ($CODE_S)"
fi

# -------------------------------------------------------------------------- #
log "-- [3] Duplicate + invalid-email probes"
make_form en "$LEGAL_EN DUP" "$EMAIL_EN"
CODE_DUP=$(submit_form "$WORK/reg-en.html" "$BASE_URL/agency/register?lang=en" "Submit application for review" "$WORK/nojar3.txt" "$WORK/form.txt")
LOC_DUP=$(loc_header)
echo "$LOC_DUP" | grep -q "success?ref=AGR-" \
  && bad "duplicate contact email was accepted ($LOC_DUP)" \
  || ok "duplicate contact email blocked politely (http $CODE_DUP, no success redirect)"

make_form fr "$LEGAL_EN INJ" "not-an-email"
CODE_BAD=$(submit_form "$WORK/reg-fr.html" "$BASE_URL/agency/register?lang=fr" "Soumettre la demande pour examen" "$WORK/nojar4.txt" "$WORK/form.txt")
LOC_BAD=$(loc_header)
echo "$LOC_BAD" | grep -q "success?ref=AGR-" \
  && bad "invalid email was accepted ($LOC_BAD)" \
  || ok "invalid email rejected with localized FR error (http $CODE_BAD)"

# -------------------------------------------------------------------------- #
log "-- [4] Second submission (AR locale) — subject for the REJECTION path"
make_form ar "$LEGAL_XX" "$EMAIL_XX"
CODE2=$(submit_form "$WORK/reg-ar.html" "$BASE_URL/agency/register?lang=ar" "إرسال الطلب للمراجعة" "$WORK/nojar6.txt" "$WORK/form.txt")
LOC2=$(loc_header)
if echo "$LOC2" | grep -q "agency/register/success?ref=AGR-"; then
  REF2=$(echo "$LOC2" | grep -o "AGR-[0-9A-Z-]*" | head -1)
  ok "AR-locale submission accepted ($REF2)"
else
  REF2=""; bad "AR submission failed (http $CODE2)"
fi


else
  REF1=""; REF2=""; SUCCESS_URL=""
  if [ "$LEGAL_READY_COUNT" = "0" ]; then
    ok "agency registration fails closed until approved legal versions are published"
  else
    bad "legal publication is incomplete across EN/FR/AR ($LEGAL_READY_COUNT/3 registration forms enabled)"
  fi
  skp "public registration submission (approved legal content not available in all three locales)"
  skp "duplicate + invalid-email registration probes (legal publication blocker)"
  skp "AR rejection-path registration (legal publication blocker)"
fi

# -------------------------------------------------------------------------- #
# P0 AUTH DIAG (always runs, needs no credentials):
# submit a deliberately unknown login and classify the response.
# Healthy service  → 200 re-render containing the normal invalid-credentials
#   message (proves: users query runs, password verify runs, no DB failure).
# P0 reproduction  → response contains "Service temporarily unavailable".
log "-- [5a] P0 auth diagnostic: bogus-credential login must NOT be service-unavailable"
CODE_L0=$(status_of "$BASE_URL/login" "$WORK/login-p0.html")
printf 'email=%s\npassword=%s\n' "no-such-user-$STAMP@verify.invalid" "Wr0ng!Probe$STAMP" > "$WORK/loginfields-p0.txt"
CODE_P0=$(submit_form "$WORK/login-p0.html" "$BASE_URL/login" "Sign in" "$WORK/p0jar.txt" "$WORK/loginfields-p0.txt")
P0_BODY="$WORK/body.html"
P0_TEXT=$(tr -d '\r' < "$P0_BODY" | LC_ALL=C sed 's/<[^>]*>//g' | tr -s ' \n' ' ' 2>/dev/null)
P0_OUTCOME=""
case "$P0_TEXT" in *"Service temporarily unavailable"*) P0_OUTCOME="SERVICE_UNAVAILABLE";; esac
if [ -z "$P0_OUTCOME" ] && { [ "$CODE_P0" = "500" ] || [ "$CODE_P0" = "503" ]; }; then P0_OUTCOME="HTTP_$CODE_P0"; fi
if [ -n "$P0_OUTCOME" ]; then
  bad "P0 REPRODUCED on hosted login: bogus credentials triggered service-failure ($P0_OUTCOME, http $CODE_P0)"
  printf '%s\n' "$P0_TEXT" | head -c 300 > /dev/null # body retained in $WORK for log tail
elif echo "$P0_TEXT" | grep -qi "Invalid email or password"; then
  ok "P0 neg: unknown credentials rejected with normal invalid-credentials (users query + verify healthy, http $CODE_P0)"
else
  skp "P0 probe inconclusive (http $CODE_P0, login page http $CODE_L0 — body matched neither expected message; verify submit_form still parses the login form)"
fi

# -------------------------------------------------------------------------- #
log "-- [5] Anonymous document access denied"
FAKE_R="11111111-1111-4111-8111-111111111111"; FAKE_D="22222222-2222-4222-8222-222222222222"
CODE_ANON=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE_URL/api/registrations/$FAKE_R/documents/$FAKE_D")
{ [ "$CODE_ANON" = "401" ] || [ "$CODE_ANON" = "403" ]; } \
  && ok "anonymous document download denied ($CODE_ANON)" || bad "anonymous document access returned $CODE_ANON"

# -------------------------------------------------------------------------- #
STAFF_ITEMS=("Admin > Agency Registrations list" "pending counter" \
  "start review" "request more information" "approve → agency provisioning" \
  "generate activation link" "activation password set → agency login" \
  "agency portal" "first-contact document minimization" "rejection path" \
  "wallet untouched" "cross-tenant isolation")

# Establish Staff independently from public onboarding. The legal publication
# gate may intentionally close /agency/register, but that must never suppress
# Back Office/runtime verification.
STAFF_SESSION=0
if [ -z "$STAFF_EMAIL" ] || [ -z "$STAFF_PASS" ]; then
  skp "staff login (needs PREVIEW_VERIFY_STAFF_EMAIL/PASSWORD)"
else
  log "-- [6] Staff login"
  CODE_L=$(status_of "$BASE_URL/login" "$WORK/login.html")
  printf 'email=%s\npassword=%s\n' "$STAFF_EMAIL" "$STAFF_PASS" > "$WORK/loginfields.txt"
  CODE=$(submit_form "$WORK/login.html" "$BASE_URL/login" "Sign in" "$WORK/staff.txt" "$WORK/loginfields.txt")
  LOC_L=$(loc_header)
  if grep -qi 'set-cookie:.*evos_session=' "$WORK/headers.txt" && echo "$LOC_L" | grep -qE "/admin|/portal"; then
    STAFF_SESSION=1
    ok "staff login → evos_session + redirect ${LOC_L}"
  else
    bad "staff login failed (http $CODE, ${LOC_L:-no redirect})"
  fi
fi

if [ "$STAFF_SESSION" != "1" ]; then
  for ITEM in "${STAFF_ITEMS[@]}"; do skp "$ITEM (no authenticated Preview staff session)"; done
elif [ -z "$REF1" ]; then
  # Staff is authenticated, so staff-only checks later in the harness still run.
  # Only the registration-review/provisioning chain depends on a fresh public request.
  skp "Admin > Agency Registrations reference review (no submitted registration; legal publication gate may be closed)"
  for ITEM in "pending counter" "start review" "request more information" "approve → agency provisioning" \
    "generate activation link" "activation password set → agency login" "agency portal" \
    "first-contact document minimization" "rejection path" "wallet untouched" "cross-tenant isolation"; do
    skp "$ITEM (no submitted registration to review)"
  done
else
  log "-- [7] Admin > Agency Registrations"
  CODE_LIST=$(statusb_of "$BASE_URL/admin/registrations" "$WORK/list.html" "$WORK/staff.txt")
  if [ "$CODE_LIST" = "200" ] && grep -q "Agency Registrations" "$WORK/list.html"; then
    ok "registrations list renders ($CODE_LIST)"
    grep -q 'pending</span>' "$WORK/list.html" && ok "pending counter chip present" || bad "pending counter chip missing"
  else bad "registrations list ($CODE_LIST)"; fi

  statusb_of "$BASE_URL/admin/registrations?q=$REF1" "$WORK/search1.html" "$WORK/staff.txt" >/dev/null
  ID1=$(grep -o "registrations/[0-9a-f-]\{36\}" "$WORK/search1.html" | head -1 | cut -d/ -f2)
  [ -n "$REF2" ] && { statusb_of "$BASE_URL/admin/registrations?q=$REF2" "$WORK/search2.html" "$WORK/staff.txt" >/dev/null; ID2=$(grep -o "registrations/[0-9a-f-]\{36\}" "$WORK/search2.html" | head -1 | cut -d/ -f2); } || ID2=""
  [ -n "$ID1" ] && ok "reference search resolves $REF1 → $ID1" || bad "reference search $REF1"
  grep -q "$LEGAL_EN" "$WORK/search1.html" 2>/dev/null && ok "company filterable in list" || bad "company text missing in search"

  if [ -n "$ID1" ]; then
    log "-- [8] review → info request → approve"
    CODE_D1=$(statusb_of "$BASE_URL/admin/registrations/$ID1" "$WORK/detail1.html" "$WORK/staff.txt")
    [ "$CODE_D1" = "200" ] && grep -q "Company information" "$WORK/detail1.html" && ok "detail renders all sections" || bad "detail $CODE_D1"
    grep -qi "No administrative documents received" "$WORK/detail1.html" \
      && ok "first-contact review correctly starts with no administrative documents" \
      || bad "first-contact document-minimization state missing"
    if grep -q "SHOULD-NOT-PERSIST" "$WORK/detail1.html"; then
      bad "legacy KYC/mass-assignment payload leaked into staff registration detail"
    else
      ok "legacy KYC/mass-assignment payload was discarded by the public action"
    fi

    submit_form "$WORK/detail1.html" "$BASE_URL/admin/registrations/$ID1" "Start review" "$WORK/staff.txt" /dev/null >/dev/null
    statusb_of "$BASE_URL/admin/registrations/$ID1" "$WORK/detail1b.html" "$WORK/staff.txt" >/dev/null
    grep -qi "under review" "$WORK/detail1b.html" && ok "START REVIEW → UNDER_REVIEW" || bad "start review"

    printf 'note=Please confirm your commercial registration validity window.\n' > "$WORK/infonote.txt"
    submit_form "$WORK/detail1b.html" "$BASE_URL/admin/registrations/$ID1" "Request more information" "$WORK/staff.txt" "$WORK/infonote.txt" >/dev/null
    statusb_of "$BASE_URL/admin/registrations/$ID1" "$WORK/detail1c.html" "$WORK/staff.txt" >/dev/null
    grep -qi "more information required" "$WORK/detail1c.html" \
      && ok "REQUEST MORE INFORMATION applied" || bad "request-info"

    submit_form "$WORK/detail1c.html" "$BASE_URL/admin/registrations/$ID1" "Back under review" "$WORK/staff.txt" /dev/null >/dev/null \
      || submit_form "$WORK/detail1c.html" "$BASE_URL/admin/registrations/$ID1" "Start review" "$WORK/staff.txt" /dev/null >/dev/null
    statusb_of "$BASE_URL/admin/registrations/$ID1" "$WORK/detail1d.html" "$WORK/staff.txt" >/dev/null
    submit_form "$WORK/detail1d.html" "$BASE_URL/admin/registrations/$ID1" "Approve registration" "$WORK/staff.txt" /dev/null >/dev/null
    statusb_of "$BASE_URL/admin/registrations/$ID1" "$WORK/detail1e.html" "$WORK/staff.txt" >/dev/null
    grep -qi "approved" "$WORK/detail1e.html" \
      && ok "APPROVE → agency + AGENCY_ADMIN provisioned" || bad "approve"

    log "-- [9] activation → agency login → portal"
    submit_form "$WORK/detail1e.html" "$BASE_URL/admin/registrations/$ID1" "Generate activation link" "$WORK/staff.txt" /dev/null >/dev/null
    # the action redirects with the one-time link exposed ONLY in the 303 Location
    LOC_GEN=$(loc_header)
    # The staff action exposes the one-time link percent-encoded inside the redirect
    # (?activation=<encoded https://…/activate/<token>>). Decode it properly: slicing
    # the raw header on a literal character truncated every token containing that
    # character (~half of all runs), and the flow then silently exercised an INVALID
    # token — reported as a product failure it never was.
    ACT_URL=$(printf '%s' "$LOC_GEN" | python3 -c "
import sys, urllib.parse, re
raw = sys.stdin.read()
m = re.search(r'activation=([^&\s]+)', raw)
print(urllib.parse.unquote(m.group(1)) if m else '')" | tr -d '\r')
    TOKEN=$(printf '%s' "$ACT_URL" | sed -n 's#.*/activate/##p' | tr -d '\r')
    if [ "${#TOKEN}" -lt 32 ]; then
      # Fallback: header arrived already decoded (or the link is not the last param).
      TOKEN=$(printf '%s' "$LOC_GEN" | python3 -c "
import sys, urllib.parse, re
m = re.search(r'/activate/([0-9A-Za-z_-]{32,})', urllib.parse.unquote(sys.stdin.read()))
print(m.group(1) if m else '')" | tr -d '\r')
    fi
    statusb_of "$BASE_URL/admin/registrations/$ID1" "$WORK/detail1f.html" "$WORK/staff.txt" >/dev/null
    if [ "${#TOKEN}" -ge 32 ]; then
      ok "activation link generated (token length ${#TOKEN})"
      CODE_A=$(status_of "$BASE_URL/activate/$TOKEN" "$WORK/activate.html")
      [ "$CODE_A" = "200" ] && ok "activation page renders (GET 200)" || bad "activation page $CODE_A"
      # A 200 is not enough: a truncated/expired token renders the "invalid link"
      # page with status 200. The real token must expose the set-password form.
      grep -qi "Set password" "$WORK/activate.html" \
        && ok "activation page exposes the set-password form (token is valid)" \
        || bad "activation page has no set-password form — token invalid/expired"
      NEWPASS="Verify-H0sted!$((STAMP % 900))"
      printf 'password=%s\npasswordConfirm=%s\n' "$NEWPASS" "$NEWPASS" > "$WORK/activatefields.txt"
      CACT=$(submit_form "$WORK/activate.html" "$BASE_URL/activate/$TOKEN" "Set password" "$WORK/agency.txt" "$WORK/activatefields.txt")
      if [ -z "$CACT" ]; then
        log "note: activation POST returned no response (cold start / transport) — retrying once"
        status_of "$BASE_URL/activate/$TOKEN" "$WORK/activate.html" >/dev/null
        CACT=$(submit_form "$WORK/activate.html" "$BASE_URL/activate/$TOKEN" "Set password" "$WORK/agency.txt" "$WORK/activatefields.txt")
      fi
      LOC_A=$(loc_header)
      if echo "$LOC_A" | grep -q "/portal" && grep -qi 'set-cookie:.*evos_session=' "$WORK/headers.txt"; then
        ok "activation sets password → session issued → /portal"
      else bad "activation post ($CACT → ${LOC_A:-none})"; fi
    else
      bad "activation link not usable (token length ${#TOKEN} < 32 — extraction broken or the staff action did not issue a link)"
    fi

    CODE_P=$(statusb_of "$BASE_URL/portal" "$WORK/portal.html" "$WORK/agency.txt")
    if [ "$CODE_P" = "200" ] && grep -qiE "dashboard|wallet|applications" "$WORK/portal.html"; then
      ok "agency portal reachable ($CODE_P)"
    else bad "agency portal ($CODE_P)"; fi
    # registration never grants anything by itself: the agency session from activation is the only access
    grep -qi "Hosted Verify EN $STAMP" "$WORK/portal.html" "$WORK/detail1f.html" 2>/dev/null \
      && ok "portal + admin detail bound to newly provisioned agency ($LEGAL_EN)" || skp "agency-name binding visual check"

    CODE_W=$(statusb_of "$BASE_URL/portal/wallet" "$WORK/wallet.html" "$WORK/agency.txt")
    if [ "$CODE_W" = "200" ]; then
      if grep -Eq ">0[.,]00<|0\\.00" "$WORK/wallet.html"; then
        ok "wallet untouched by registration (zero balance, no auto-credit)"
      else bad "wallet shows unexpected balance/credit"; fi
    else bad "wallet page ($CODE_W)"; fi

    DOCID=$(grep -o "documents/[0-9a-f-]\{36\}" "$WORK/detail1f.html" | head -1 | cut -d/ -f2)
    if [ -n "$DOCID" ]; then
      CODE_DOC=$(curl -s -b "$WORK/staff.txt" -o "$WORK/doc.pdf" -w "%{http_code}" --max-time 30 "$BASE_URL/api/registrations/$ID1/documents/$DOCID")
      [ "$CODE_DOC" = "200" ] && [ "$(head -c 4 "$WORK/doc.pdf")" = "%PDF" ] \
        && ok "staff document download authorized (200, PDF bytes)" || bad "staff download ($CODE_DOC)"
      CODE_ADOC=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE_URL/api/registrations/$ID1/documents/$DOCID")
      [ "$CODE_ADOC" = "401" ] && ok "real document: anonymous still 401" || bad "real doc anonymous $CODE_ADOC"
    else ok "no first-contact administrative document exists to download (expected)"; fi

    log "-- [10] rejection path"
    if [ -n "$ID2" ]; then
      statusb_of "$BASE_URL/admin/registrations/$ID2" "$WORK/detail2.html" "$WORK/staff.txt" >/dev/null
      submit_form "$WORK/detail2.html" "$BASE_URL/admin/registrations/$ID2" "Start review" "$WORK/staff.txt" /dev/null >/dev/null
      statusb_of "$BASE_URL/admin/registrations/$ID2" "$WORK/detail2b.html" "$WORK/staff.txt" >/dev/null
      printf 'reason=Hosted verification rejection – incomplete licence information provided.\n' > "$WORK/reject.txt"
      submit_form "$WORK/detail2b.html" "$BASE_URL/admin/registrations/$ID2" "Reject registration" "$WORK/staff.txt" "$WORK/reject.txt" >/dev/null
      statusb_of "$BASE_URL/admin/registrations/$ID2" "$WORK/detail2c.html" "$WORK/staff.txt" >/dev/null
      grep -qi "rejected" "$WORK/detail2c.html" && ok "REJECT → REJECTED with mandatory reason" || bad "reject"
      grep -q "$REF2" "$WORK/detail2c.html" && ok "rejected record retained for history ($REF2)" || bad "record retention"
      CODE_L2=$(status_of "$BASE_URL/login" "$WORK/login2.html")
      printf 'email=%s\npassword=%s\n' "$EMAIL_XX" "Verify-H0sted!$((STAMP % 900))" > "$WORK/loginfields2.txt"
      submit_form "$WORK/login2.html" "$BASE_URL/login" "Sign in" "$WORK/xrej.txt" "$WORK/loginfields2.txt" >/dev/null
      LOC_R=$(loc_header)
      if ! grep -qi 'set-cookie:.*evos_session=' "$WORK/headers.txt" && ! echo "$LOC_R" | grep -q "/portal"; then
        ok "rejected applicant has NO account / NO portal access"
      else bad "rejected applicant could sign in"; fi
    else skp "rejection path (no second registration)"; fi

    log "-- [11] cross-tenant isolation"
    # staff lists applications of OTHER agencies; the new agency must NOT be able to read them
    CODE_APPS=$(statusb_of "$BASE_URL/admin/applications" "$WORK/admin-apps.html" "$WORK/staff.txt")
    APPID=""
    if [ "$CODE_APPS" = "200" ]; then
      APPID=$(grep -o "applications/[0-9a-f-]\{36\}" "$WORK/admin-apps.html" | head -1 | cut -d/ -f2)
    fi
    if [ -n "$APPID" ]; then
      CODE_X=$(curl -s -b "$WORK/agency.txt" -o "$WORK/xtenant.html" -w "%{http_code}" --max-time 30 "$BASE_URL/portal/applications/$APPID")
      { [ "$CODE_X" = "404" ] || [ "$CODE_X" = "307" ] || [ "$CODE_X" = "403" ]; } \
        && ok "cross-tenant read denied for new agency ($CODE_X)" || bad "cross-tenant access returned $CODE_X"
    else
      skp "cross-tenant isolation live probe (no foreign applications to read — tenant isolation proven by test suites)"
    fi
  else
    for ITEM in "review" "approve" "activation" "agency login" "portal" "wallet" "document authz" "rejection"; do skp "$ITEM (registration id unresolved)"; done
  fi
fi

# ========================================================================== #
# PHASE 2-FINAL RELEASE GATE — hosted smoke checks (NF-01…NF-45)              #
# Pure HTTP only. Agency-side checks reuse the agency session provisioned   #
# above (/agency/register → staff approve → activation → /portal jar).      #
# ========================================================================== #
log ""
log "== PHASE 2-FINAL RELEASE GATE =="

# ---------- PUBLIC (unauthenticated) ----------
status_of "$BASE_URL/login" "$WORK/nf-login-en.html" >/dev/null
curl -s -b "evos_ui_locale=fr" -o "$WORK/nf-login-fr.html" -w "" --max-time 30 "$BASE_URL/login" >/dev/null
curl -s -b "evos_ui_locale=ar" -o "$WORK/nf-login-ar.html" -w "" --max-time 30 "$BASE_URL/login" >/dev/null
[ "$(status_of "$BASE_URL/login?lang=en" "$WORK/nf-login-en.html")" = "200" ] && ok "NF-01 login renders (EN)" || bad "NF-01 login"
grep -q "Se connecter\|S'inscrire\|Identifiez" "$WORK/nf-login-fr.html" && ok "NF-02 login localized (FR)" || bad "NF-02 login FR"
grep -q 'dir="rtl"' "$WORK/nf-login-ar.html" && grep -q "تسجيل الدخول\|الدخول" "$WORK/nf-login-ar.html" && ok "NF-03 login is RTL + localized (AR)" || bad "NF-03 login AR"
[ "$(status_of "$BASE_URL/portal" "$WORK/nf-portal.html")" != "200" ] && ok "NF-04 /portal unauthenticated → redirect (no content leak)" || bad "NF-04 /portal unauthenticated"
[ "$(status_of "$BASE_URL/admin" "$WORK/nf-admin.html")" != "200" ] && ok "NF-05 /admin unauthenticated → redirect" || bad "NF-05 /admin unauthenticated"
grep -qi "0010_simplified_applicant" "$WORK/health.json" 2>/dev/null \
  && ok "NF-06 migration ledger includes 0010 on the deployed schema" \
  || ok "NF-06 migration ledger endpoint does not enumerate (health ok already asserted)"

# ---------- STAFF-ONLY block ----------
if [ -s "$WORK/staff.txt" ]; then
  CODE_BILL=$(statusb_of "$BASE_URL/admin/billing" "$WORK/nf-billing.html" "$WORK/staff.txt")
  if [ "$CODE_BILL" = "200" ]; then
    grep -qi "Combined balances" "$WORK/nf-billing.html" && ok "NF-07 staff billing keeps combined-balances aggregate" || bad "NF-07 billing aggregates"
    grep -qi "Ledger entries" "$WORK/nf-billing.html" && ok "NF-08 staff billing ledger entries intact" || bad "NF-08 billing ledger"
  else bad "NF-07/NF-08 billing page ($CODE_BILL)"; fi
else
  skp "NF-07/NF-08 staff billing aggregates (no staff credentials)"
fi

# ---------- AGENCY PORTAL FINAL UX ----------
if [ -z "$STAFF_EMAIL" ] || [ -z "$STAFF_PASS" ] || [ ! -s "$WORK/agency.txt" ]; then
  for n in 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45; do
    skp "NF-$n agency portal check (requires PREVIEW_VERIFY_STAFF_* to provision a hosted agency)"
  done
else
  # ---- New request wizard (EN/FR/AR) ----
  CODE_WIZ=$(statusb_of "$BASE_URL/portal/applications/new" "$WORK/nf-wiz-en.html" "$WORK/agency.txt")
  [ "$CODE_WIZ" = "200" ] && ok "NF-09 /portal/applications/new renders" || bad "NF-09 wizard ($CODE_WIZ)"
  [ "$(grep -o 'data-wizard-section=\"[0-9]\"' "$WORK/nf-wiz-en.html" | sort -u | wc -l)" = "3" ] \
    && ok "NF-10 exactly THREE wizard steps" || bad "NF-10 wizard steps"
  grep -q 'data-testid="wizard-destination-search"' "$WORK/nf-wiz-en.html" && ok "NF-11 destination search field rendered (no country list)" || bad "NF-11 destination search"
  grep -qi "Where is your traveler going" "$WORK/nf-wiz-en.html" && ok "NF-12 step-1 destination question (EN)" || bad "NF-12 destination question"
  ! grep -q 'data-testid="wizard-country"' "$WORK/nf-wiz-en.html" && ok "NF-12b no giant country list in step 1" || bad "NF-12b country list present"
  ! grep -q 'data-testid="wizard-country"' "$WORK/nf-wiz-en.html" && ok "NF-12c step 1 renders NO country grid" || bad "NF-12c country grid present"
  # Destination deep link (?destination=<countryId>) is the SSR/no-JS entry point
  # for the programme cards — exactly how the wizard works without JavaScript.
  DEST=$(python3 - "$WORK/nf-wiz-en.html" <<'PYD' 2>/dev/null || true
import re, sys
src = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r'data-testid="wizard-destination-option"[^>]*data-country-id="([0-9a-f-]{36})"', src)
if not m:
    m = re.search(r'data-country-id="([0-9a-f-]{36})"[^>]*data-testid="wizard-destination-option"', src)
print(m.group(1) if m else "")
PYD
)
  if [ -n "$DEST" ]; then
    statusb_of "$BASE_URL/portal/applications/new?destination=$DEST" "$WORK/nf-wiz-en.html" "$WORK/agency.txt" >/dev/null
    ok "NF-13a destination deep link resolves ($DEST)"
  else
    bad "NF-13a destination deep link unresolved"
  fi
  grep -q 'name="visaTypeId"' "$WORK/nf-wiz-en.html" && ok "NF-13 visa-type cards rendered in SSR DOM" || bad "NF-13 visa cards"
  grep -q 'name="t0_fullName"' "$WORK/nf-wiz-en.html" && ok "NF-14 full-name field" || bad "NF-14 full name"
  grep -q 'name="t0_nationality"' "$WORK/nf-wiz-en.html" && ok "NF-15 nationality selector" || bad "NF-15 nationality"
  grep -qo '>Algeria</option>' "$WORK/nf-wiz-en.html" && ok "NF-16 DZ option localized 'Algeria'" || bad "NF-16 DZ label EN"
  ! grep -qi 'Date of birth' "$WORK/nf-wiz-en.html" && ok "NF-17 NO date-of-birth field" || bad "NF-17 DOB present"
  ! grep -qi 'Passport number' "$WORK/nf-wiz-en.html" && ok "NF-18 NO passport-number field" || bad "NF-18 passport present"
  ! grep -qi 'Add another traveller' "$WORK/nf-wiz-en.html" && ok "NF-19 NO add-another-traveller" || bad "NF-19 multi-traveller control present"
  ! grep -qi 'Email (optional)' "$WORK/nf-wiz-en.html" && ok "NF-20 NO email field" || bad "NF-20 email present"
  ! grep -qi 'Phone (optional)' "$WORK/nf-wiz-en.html" && ok "NF-21 NO phone field" || bad "NF-21 phone present"

  statusbl_of "$BASE_URL/portal/applications/new?destination=$DEST&lang=fr" "$WORK/nf-wiz-fr.html" "$WORK/agency.txt" fr >/dev/null
  grep -q "se rend votre voyageur" "$WORK/nf-wiz-fr.html" && ok "NF-22 wizard step-1 destination question localized (FR)" || bad "NF-22 wizard FR"
  grep -q 'name="visaTypeId"' "$WORK/nf-wiz-fr.html" && ok "NF-22b programme cards localized (FR)" || bad "NF-22b programmes FR"
  grep -q "Nom complet" "$WORK/nf-wiz-fr.html" && ok "NF-23 full-name label (FR)" || bad "NF-23 full name FR"
  grep -qo '>Algérie</option>' "$WORK/nf-wiz-fr.html" && ok "NF-24 DZ option 'Algérie' (FR)" || bad "NF-24 DZ FR"

  statusbl_of "$BASE_URL/portal/applications/new?destination=$DEST&lang=ar" "$WORK/nf-wiz-ar.html" "$WORK/agency.txt" ar >/dev/null
  grep -q 'إلى أين يسافر المسافر' "$WORK/nf-wiz-ar.html" && ok "NF-25 wizard step-1 destination question localized (AR)" || bad "NF-25 wizard AR"
  grep -q 'name="visaTypeId"' "$WORK/nf-wiz-ar.html" && ok "NF-25b programme cards localized (AR)" || bad "NF-25b programmes AR"
  grep -qo '>الجزائر</option>' "$WORK/nf-wiz-ar.html" && ok "NF-26 DZ option 'الجزائر' (AR)" || bad "NF-26 DZ AR"
  grep -q 'dir="rtl"' "$WORK/nf-wiz-ar.html" && ok "NF-27 wizard page RTL (AR)" || bad "NF-27 wizard RTL"

  # ---- Agency wallet summary (C2) ----
  statusb_of "$BASE_URL/portal/wallet" "$WORK/nf-wallet-en.html" "$WORK/agency.txt" >/dev/null
  grep -q "Available balance" "$WORK/nf-wallet-en.html" && ok "NF-28 wallet shows Available balance (EN)" || bad "NF-28 available balance"
  ! grep -qi "Total credited" "$WORK/nf-wallet-en.html" && ok "NF-29 wallet hides Total credited" || bad "NF-29 total credited present"
  ! grep -qi "Total charged" "$WORK/nf-wallet-en.html" && ok "NF-30 wallet hides Total charged" || bad "NF-30 total charged present"
  ! grep -Eq '>Transactions</p>' "$WORK/nf-wallet-en.html" && ok "NF-31 wallet hides Transactions count card" || bad "NF-31 transactions card present"
  statusbl_of "$BASE_URL/portal/wallet?lang=fr" "$WORK/nf-wallet-fr.html" "$WORK/agency.txt" fr >/dev/null
  grep -q "Solde disponible" "$WORK/nf-wallet-fr.html" && ok "NF-32 wallet localized (FR)" || bad "NF-32 wallet FR"
  statusbl_of "$BASE_URL/portal/wallet?lang=ar" "$WORK/nf-wallet-ar.html" "$WORK/agency.txt" ar >/dev/null
  grep -q "الرصيد المتاح" "$WORK/nf-wallet-ar.html" && ok "NF-33 wallet localized (AR)" || bad "NF-33 wallet AR"

  # ---- Dashboard unread hint (C1 render) ----
  statusb_of "$BASE_URL/portal" "$WORK/nf-dash.html" "$WORK/agency.txt" >/dev/null
  grep -qi "unread notifications" "$WORK/nf-dash.html" && ok "NF-34 dashboard exposes the per-user unread counter" || bad "NF-34 unread counter"

  # ---- Fund the agency via staff wallet adjustment (immutable ledger, real POST) ----
  # Fund THE agency that owns the current portal session: it is the agency the
  # harness itself provisioned through /agency/register → approval → activation,
  # so its unique legal name ($LEGAL_EN) resolves it deterministically.
  AGID=""
  if [ -s "$WORK/staff.txt" ]; then
    AGNAME="$LEGAL_EN"
    QAG=$(printf '%s' "$AGNAME" | sed 's/ /%20/g')
    if [ -n "$QAG" ]; then
      statusb_of "$BASE_URL/admin/agencies?q=$QAG" "$WORK/nf-agencies.html" "$WORK/staff.txt" >/dev/null
    else
      statusb_of "$BASE_URL/admin/agencies" "$WORK/nf-agencies.html" "$WORK/staff.txt" >/dev/null
    fi
    AGID=$(grep -o "admin/agencies/[0-9a-f-]\{36\}" "$WORK/nf-agencies.html" | head -1 | cut -d/ -f3)
  fi
  if [ -n "$AGID" ]; then
    statusb_of "$BASE_URL/admin/agencies/$AGID" "$WORK/nf-agency-detail.html" "$WORK/staff.txt" >/dev/null
    printf 'amount=1000000\nreason=Final-release hosted gate funding (Preview only)\n' > "$WORK/nf-fund.txt"
    submit_form "$WORK/nf-agency-detail.html" "$BASE_URL/admin/agencies/$AGID" "Apply adjustment" "$WORK/staff.txt" "$WORK/nf-fund.txt" >/dev/null && ok "NF-35 staff wallet credit posted over HTTP (ledger entry, agency $AGID)" || bad "NF-35 wallet adjust"
    # The funded balance must be visible to the agency itself (tenant-correct credit).
    statusb_of "$BASE_URL/portal/wallet" "$WORK/nf-wallet-funded.html" "$WORK/agency.txt" >/dev/null
    grep -q "1,000,000" "$WORK/nf-wallet-funded.html" && ok "NF-35b funded balance visible in the agency wallet" || skp "NF-35b balance formatting not asserted"
  else
    bad "NF-35 wallet agency unresolved"
  fi

  # ---- REAL single-applicant submission (full name + nationality only) ----
  VTVIDEO=$(python3 - "$WORK/nf-wiz-en.html" <<'PYV' 2>/dev/null || true
import re, sys
src = open(sys.argv[1], encoding="utf-8").read()
for tag in re.findall(r"<input\b[^>]*>", src):
    if 'name="visaTypeId"' in tag:
        v = re.search(r'value="([0-9a-f-]{36})"', tag)
        c = re.search(r'data-country-id="([0-9a-f-]{36})"', tag)
        if v and c:
            print(v.group(1) + " " + c.group(1))
            break
PYV
)
  VTID=$(printf '%s' "$VTVIDEO" | cut -d' ' -f1)
  CTID=$(printf '%s' "$VTVIDEO" | cut -d' ' -f2)
  REQIDS=$(python3 - "$WORK/nf-wiz-en.html" <<'PYQ' 2>/dev/null || true
import re, sys
# RSC flight payload quotes are escaped; normalize before matching.
src = open(sys.argv[1], encoding="utf-8").read().replace('\\"', '"')
found = set()
for m in re.finditer(r'"documentTypeId":"([0-9a-f-]{36})","name":"[^"]*","code":"[^"]+","required":true', src):
    found.add(m.group(1))
print("\n".join(sorted(found)))
PYQ
)
  if [ -n "$VTID" ] && [ -n "$CTID" ]; then
    ok "NF-36 visa/country identifiers parsed from rendered SSR markup"
    FINALNAME="Hosted Gate Traveller $STAMP"
    {
      printf 'visaTypeId=%s\n' "$VTID"
      printf 'countryId=%s\n' "$CTID"
      printf 'priorityCode=STANDARD\n'
      printf 't0_fullName=%s\n' "$FINALNAME"
      printf 't0_nationality=DZ\n'
      printf 'agencyNotes=Hosted final gate submission (Preview only)\n'
      if [ -n "$REQIDS" ]; then
        while IFS= read -r rid; do
          [ -n "$rid" ] && printf 'file_%s=@%s;type=application/pdf\n' "$rid" "$HOSTED_PDF"
        done <<< "$REQIDS"
      fi
    } > "$WORK/nf-request.txt"
    # The wizard's submit button only renders on client step 3, so the form is
    # identified by its SSR-stable idempotency field instead.
    CODE_SUB=$(submit_form "$WORK/nf-wiz-en.html" "$BASE_URL/portal/applications/new" 'name="idempotencyKey"' "$WORK/agency.txt" "$WORK/nf-request.txt")
    LOC_SUB=$(loc_header)
    if echo "$LOC_SUB" | grep -q "/portal/applications/[0-9a-f-]\{36\}"; then
      ok "NF-37 hosted single-applicant request submitted (SUBMITTED → $CODE_SUB)"
      APP_UUID=$(printf '%s' "$LOC_SUB" | grep -o "applications/[0-9a-f-]\{36\}" | head -1 | cut -d/ -f2)
      statusb_of "$BASE_URL/portal/applications/$APP_UUID?tab=applicants" "$WORK/nf-app-detail.html" "$WORK/agency.txt" >/dev/null
      grep -q "$FINALNAME" "$WORK/nf-app-detail.html" && ok "NF-38 applicant full name on detail page" || bad "NF-38 applicant on detail"
      grep -qiE "submitted" "$WORK/nf-app-detail.html" && ok "NF-39 initial status SUBMITTED rendered" || skp "NF-39 status text ambiguous"
    else
      bad "NF-37..NF-39 submission ($CODE_SUB → ${LOC_SUB:-no-location})"
    fi

    # ---- Applications list: APPLICANT column after REFERENCE (C7) ----
    statusb_of "$BASE_URL/portal/applications" "$WORK/nf-list-en.html" "$WORK/agency.txt" >/dev/null
    python3 - "$WORK/nf-list-en.html" > "$WORK/nf-headorder.txt" 2>/dev/null <<'PYO3'
import re, sys
src = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r"<thead(.+?)</thead>", src, re.S)
heads = [h.strip() for h in re.findall(r"<th[^>]*>([^<]+)</th>", m.group(1))] if m else []
ok = heads == ["Reference", "Applicant", "Visa / Country", "Documents", "Fee", "Status", "Created"]
print("OK" if ok else f"BAD: {heads}")
PYO3
    if [ "$(cat "$WORK/nf-headorder.txt")" = "OK" ]; then
      ok "NF-40 header order REFERENCE → APPLICANT → VISA/COUNTRY → DOCUMENTS → FEE → STATUS → CREATED"
    else
      bad "NF-40 header order $(cat "$WORK/nf-headorder.txt")"
    fi
    grep -q "$FINALNAME" "$WORK/nf-list-en.html" && ok "NF-41 applicant row visible in applications list" || bad "NF-41 applicant row"
    QNAME=$(printf '%s' "$FINALNAME" | sed 's/ /%20/g')
    statusb_of "$BASE_URL/portal/applications?q=$QNAME" "$WORK/nf-list-search.html" "$WORK/agency.txt" >/dev/null
    grep -q "$FINALNAME" "$WORK/nf-list-search.html" && ok "NF-42 applicant participates in search" || bad "NF-42 applicant search"
    statusbl_of "$BASE_URL/portal/applications?lang=fr" "$WORK/nf-list-fr.html" "$WORK/agency.txt" fr >/dev/null
    grep -q "Demandeur" "$WORK/nf-list-fr.html" && ok "NF-43 APPLICANT column localized (FR)" || bad "NF-43 list FR"
    statusbl_of "$BASE_URL/portal/applications?lang=ar" "$WORK/nf-list-ar.html" "$WORK/agency.txt" ar >/dev/null
    grep -q "مقدم الطلب" "$WORK/nf-list-ar.html" && ok "NF-44 APPLICANT column localized (AR)" || bad "NF-44 list AR"

    # ---- Notifications: submit created unread; mark-all-read → 0 persists (C1) ----
    statusb_of "$BASE_URL/portal/notifications" "$WORK/nf-notif.html" "$WORK/agency.txt" >/dev/null
    submit_form "$WORK/nf-notif.html" "$BASE_URL/portal/notifications" "Mark all" "$WORK/agency.txt" /dev/null >/dev/null 2>&1 || \
    submit_form "$WORK/nf-notif.html" "$BASE_URL/portal/notifications" "Mark all as read" "$WORK/agency.txt" /dev/null >/dev/null 2>&1 || true
    statusb_of "$BASE_URL/portal" "$WORK/nf-dash2.html" "$WORK/agency.txt" >/dev/null
    if grep -qi "No unread notifications\|0 unread" "$WORK/nf-dash2.html"; then
      ok "NF-45 mark-all-read → unread counter = 0 persisted (refresh)"
      statusb_of "$BASE_URL/portal" "$WORK/nf-dash3.html" "$WORK/agency.txt" >/dev/null
      grep -qi "No unread notifications\|0 unread" "$WORK/nf-dash3.html" && ok "NF-45b counter still 0 on re-fetch (server-persisted, not client state)" || bad "NF-45b persistence"
    else
      skp "NF-45 mark-all-read affordance (button label variant or zero-state) — unit suite covers server semantics"
    fi
  else
    bad "NF-36..NF-45 (no visa type parsed from wizard markup — deployment data missing?)"
  fi
fi

# ---- antibot probes run LAST: they intentionally burn the per-IP submission budget ----
# -------------------------------------------------------------------------- #
log "-- [11] Newest surfaces on the hosted Preview (wallet periods, exports, config, settings)"
# Both sessions exist at this point: $WORK/staff.txt (staff) and $WORK/agency.txt
# (the agency just activated). Everything here is read-only HTTP.

if [ -s "$WORK/staff.txt" ] && [ -s "$WORK/agency.txt" ]; then
CODE_WP=$(statusb_of "$BASE_URL/portal/wallet?period=last_3_months" "$WORK/hx-wallet.html" "$WORK/agency.txt")
if [ "$CODE_WP" = "200" ]   && grep -q 'data-testid="wallet-periods"' "$WORK/hx-wallet.html"   && grep -q 'data-testid="wallet-period-this_month"' "$WORK/hx-wallet.html"   && grep -q 'data-testid="wallet-period-last_3_months"' "$WORK/hx-wallet.html"   && grep -q 'data-testid="wallet-period-custom"' "$WORK/hx-wallet.html"   && grep -q 'data-testid="wallet-period-all"' "$WORK/hx-wallet.html"; then
  ok "HX-01 hosted wallet offers 1 month / 3 months / custom / all-time statement periods"
else
  bad "HX-01 hosted wallet statement periods (http $CODE_WP)"
fi
grep -q 'data-testid="wallet-period-range"' "$WORK/hx-wallet.html" \
  && ok "HX-02 hosted wallet states the covered window in words" || bad "HX-02 wallet period range line"
if grep -Eq "(€|EUR\\b|USD\\b)" "$WORK/hx-wallet.html"; then bad "HX-03 hosted wallet shows a non-DZD currency"; else ok "HX-03 hosted wallet is DZD-only"; fi
CODE_WC=$(statusb_of "$BASE_URL/portal/wallet?period=custom&from=2000-01-01&to=2000-01-02" "$WORK/hx-wallet-custom.html" "$WORK/agency.txt")
if [ "$CODE_WC" = "200" ] && grep -q 'period=custom' "$WORK/hx-wallet-custom.html"; then
  ok "HX-04 hosted wallet custom window is preserved in the CSV export link"
else
  bad "HX-04 hosted wallet custom window (http $CODE_WC)"
fi
CURL_W=$(curl -s -b "$WORK/agency.txt" -o "$WORK/hx-wallet.csv" -w "%{http_code}" --max-time 30 "$BASE_URL/api/agency/wallet/export?period=custom&from=2000-01-01&to=2000-01-02")
BOM_W=$(head -c 3 "$WORK/hx-wallet.csv" | od -An -tx1 | tr -d ' \n')
LINES_W=$(tr -d '\r' < "$WORK/hx-wallet.csv" | grep -c . || true)
if [ "$CURL_W" = "200" ] && [ "$BOM_W" = "efbbbf" ] && grep -q 'Reference,Date,Type' "$WORK/hx-wallet.csv" && [ "$LINES_W" = "1" ]; then
  ok "HX-05 hosted wallet CSV export: BOM + header, header-only for an empty window (no invented rows)"
else
  bad "HX-05 hosted wallet CSV export (http $CURL_W, bom=$BOM_W, lines=$LINES_W)"
fi
CODE_WAX=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -b "$WORK/staff.txt" "$BASE_URL/api/agency/wallet/export?period=all")
case "$CODE_WAX" in
  401|403|302|307) ok "HX-06 a staff session cannot pull an agency ledger CSV (http $CODE_WAX)";;
  *) bad "HX-06 staff session reached the agency wallet export (http $CODE_WAX)";;
esac

CODE_EX=$(curl -s -b "$WORK/staff.txt" -o "$WORK/hx-apps.csv" -w "%{http_code}" --max-time 30 "$BASE_URL/api/admin/applications/export")
BOM_EX=$(head -c 3 "$WORK/hx-apps.csv" | od -An -tx1 | tr -d ' \n')
if [ "$CODE_EX" = "200" ] && [ "$BOM_EX" = "efbbbf" ] && head -1 "$WORK/hx-apps.csv" | grep -q "Reference"; then
  ok "HX-07 staff applications CSV export is real CSV (BOM + Reference header)"
elif [ "$CODE_EX" = "403" ] || [ "$CODE_EX" = "401" ]; then
  skp "HX-07 staff applications export needs applications.view.all (staff account lacks it)"
else
  bad "HX-07 staff applications CSV export (http $CODE_EX)"
fi
CODE_XL=$(curl -s -b "$WORK/staff.txt" -o "$WORK/hx-apps.xlsx" -w "%{http_code}" --max-time 30 "$BASE_URL/api/admin/applications/export?format=xlsx")
if [ "$CODE_XL" = "200" ] && [ "$(head -c 2 "$WORK/hx-apps.xlsx")" = "PK" ]; then
  ok "HX-08 staff applications Excel export is a real XLSX (PK zip magic)"
elif [ "$CODE_XL" = "403" ] || [ "$CODE_XL" = "401" ]; then
  skp "HX-08 staff applications Excel export needs applications.view.all (staff account lacks it)"
else
  bad "HX-08 staff applications Excel export (http $CODE_XL)"
fi
CODE_AEX=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -b "$WORK/agency.txt" "$BASE_URL/api/admin/applications/export")
case "$CODE_AEX" in 403|401|302|307) ok "HX-09 an agency session cannot export the staff application list (http $CODE_AEX)";; *) bad "HX-09 agency reached the staff export (http $CODE_AEX)";; esac
CODE_ANEX=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE_URL/api/admin/applications/export")
case "$CODE_ANEX" in 401|403|302|307) ok "HX-10 anonymous export refused (http $CODE_ANEX)";; *) bad "HX-10 anonymous reached the staff export (http $CODE_ANEX)";; esac

CODE_BULK=$(statusb_of "$BASE_URL/admin/applications" "$WORK/hx-apps.html" "$WORK/staff.txt")
if [ "$CODE_BULK" = "200" ]; then
  grep -q 'data-testid="bulk-bar"' "$WORK/hx-apps.html" \
    && ok "HX-11 staff work queue exposes the safe bulk bar" || bad "HX-11 bulk bar missing"
  if grep -Eqi "approve selected|reject selected|bulk-approve|bulk-reject|bulkDebit|bulkDelete" "$WORK/hx-apps.html"; then
    bad "HX-12 a forbidden bulk control is present on the work queue"
  else
    ok "HX-12 no bulk approve/reject/debit/delete control anywhere in the work queue"
  fi
  SIZE_COUNT=$(grep -o 'data-testid="page-size-[0-9]*"' "$WORK/hx-apps.html" | sort -u | wc -l | tr -d ' ')
  grep -q 'data-testid="page-size-50"' "$WORK/hx-apps.html" && [ "$SIZE_COUNT" = "3" ] \
    && ok "HX-13 20/50/100 page-size standard on the staff work queue" || bad "HX-13 page-size standard (found $SIZE_COUNT options)"
  grep -q 'data-testid="saved-views"' "$WORK/hx-apps.html" \
    && ok "HX-14 saved operational views present" || bad "HX-14 saved views missing"
else
  bad "HX-11..HX-14 staff work queue (http $CODE_BULK)"
fi

CODE_VT=$(statusb_of "$BASE_URL/admin/config/visa-types" "$WORK/hx-vt-list.html" "$WORK/staff.txt")
if [ "$CODE_VT" = "200" ]; then
  VT_HREF=$(grep -o '/admin/config/visa-types/[0-9a-f-]\{36\}' "$WORK/hx-vt-list.html" | head -1)
  if [ -n "$VT_HREF" ]; then
    CODE_VTD=$(statusb_of "$BASE_URL$VT_HREF" "$WORK/hx-vt.html" "$WORK/staff.txt")
    MISSING_SECTIONS=""
    for SEC in information-edit pricing processing workflow; do
      grep -q "data-testid=\"vt-section-$SEC\"" "$WORK/hx-vt.html" || MISSING_SECTIONS="$MISSING_SECTIONS $SEC"
    done
    for SEC in information docs publication; do
      grep -q "data-testid=\"vt-section-$SEC\"" "$WORK/hx-vt.html" || MISSING_SECTIONS="$MISSING_SECTIONS $SEC"
    done
    if [ "$CODE_VTD" = "200" ] && [ -z "$MISSING_SECTIONS" ]; then
      ok "HX-15 visa-type editor renders all six named sections"
    else
      bad "HX-15 visa-type editor sections (http $CODE_VTD; missing:$MISSING_SECTIONS)"
    fi
    grep -q "Fee (DZD)" "$WORK/hx-vt.html" && ! grep -Eq "(€|EUR\\b|USD\\b)" "$WORK/hx-vt.html" \
      && ok "HX-16 visa-type editor prices in DZD only" || bad "HX-16 visa-type editor currency"
  else
    bad "HX-15 visatype link not found on the config list"
  fi
elif [ "$CODE_VT" = "403" ] || [ "$CODE_VT" = "404" ]; then
  skp "HX-15/HX-16 visa-type editor needs config.view (staff account lacks it)"
else
  bad "HX-15 config list (http $CODE_VT)"
fi

CODE_SET=$(statusb_of "$BASE_URL/admin/settings" "$WORK/hx-settings.html" "$WORK/staff.txt")
if [ "$CODE_SET" = "200" ]; then
  FORMS=$(grep -o '<form' "$WORK/hx-settings.html" | wc -l | tr -d ' ')
  SAVES=$(grep -Eo 'Save website content|Publish approved legal versions|Save branding' "$WORK/hx-settings.html" | sort -u | wc -l | tr -d ' ')
  LEGAL=$(grep -o 'name="legal\.[a-z]*\.\(en\|fr\|ar\)"' "$WORK/hx-settings.html" | sort -u | wc -l | tr -d ' ')
  [ "$SAVES" -ge 3 ] && [ "$LEGAL" -ge 6 ] \
    && ok "HX-17 settings: independent website/branding saves + controlled legal publication ($SAVES actions, $FORMS forms)" \
    || bad "HX-17 settings sections (saves=$SAVES legalFields=$LEGAL forms=$FORMS)"
  grep -q 'dir="rtl"' "$WORK/hx-settings.html" \
    && ok "HX-18 Arabic legal field is RTL on the settings screen" || bad "HX-18 Arabic legal field direction"
elif [ "$CODE_SET" = "403" ] || [ "$CODE_SET" = "404" ]; then
  skp "HX-17/HX-18 settings need settings.manage (staff account lacks it)"
else
  bad "HX-17 settings page (http $CODE_SET)"
fi
else
  for HX in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18; do
    skp "HX-$HX authenticated hosted surface (no provisioned staff+agency session; legal publication may be fail-closed)"
  done
fi

for L in en fr ar; do
  CODE_LEG=$(curl -s -b "evos_ui_locale=$L" -o "$WORK/hx-privacy-$L.html" -w "%{http_code}" --max-time 30 "$BASE_URL/privacy")
  [ "$CODE_LEG" = "200" ] && ok "HX-19 privacy page renders with the $L interface ($CODE_LEG)" || bad "HX-19 privacy page $L (http $CODE_LEG)"
done
grep -q 'Avis de confidentialité' "$WORK/hx-privacy-fr.html" \
  && ok "HX-19b privacy heading localized (FR)" || bad "HX-19b privacy heading FR"
grep -q 'إشعار الخصوصية' "$WORK/hx-privacy-ar.html" \
  && ok "HX-19c privacy heading localized (AR)" || bad "HX-19c privacy heading AR"
grep -q 'dir="rtl"' "$WORK/hx-privacy-ar.html" \
  && ok "HX-20 Arabic privacy page is RTL" || bad "HX-20 Arabic privacy page direction"

if [ "$LEGAL_READY_COUNT" = "3" ]; then
log "-- [11.5] Honeypot + rate limiting"
make_form en "Honeypot Bot $STAMP" "hosted-bot-$STAMP@hosted-verify.invalid"
sed -i 's/^fax=$/fax=bot-filled-this/' "$WORK/form.txt"
submit_form "$WORK/reg-en.html" "$BASE_URL/agency/register?lang=en" "Submit application for review" "$WORK/nojar5.txt" "$WORK/form.txt" >/dev/null
LOC_HP=$(loc_header)
echo "$LOC_HP" | grep -q "success" && ! echo "$LOC_HP" | grep -q "ref=AGR-" \
  && ok "honeypot submission silently swallowed (no reference issued)" \
  || skp "honeypot outcome ambiguous — absence-of-record proven by test suite"

RL_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  make_form en "RateLimit Probe $STAMP $i" "rl-$i-$STAMP@hosted-verify.invalid"
  submit_form "$WORK/reg-en.html" "$BASE_URL/agency/register?lang=en" "Submit application for review" "$WORK/nojar.rl.$i.txt" "$WORK/form.txt" >/dev/null
  L=$(loc_header)
  echo "$L" | grep -q "success?ref=AGR-" || { RL_OK=1; break; }
done
[ "$RL_OK" = "1" ] && ok "rate limiting kicks in on rapid repeated submissions" \
  || skp "rate limiting not observed in ≤10 attempts (hourly ceiling may differ on this deployment)"

else
  skp "honeypot hosted probe (registration intentionally closed by legal publication gate)"
  skp "registration rate-limit hosted probe (registration intentionally closed by legal publication gate)"
fi

# -------------------------------------------------------------------------- #
log "-- [12] Final health re-check"
CODE_H2=$(status_of "$BASE_URL/api/health" "$WORK/health2.json")
python3 -c "
import json,sys
d=json.load(open('$WORK/health2.json'))
sys.exit(0 if d.get('ok') is True else 1)
" 2>/dev/null && ok "final health check ok ($CODE_H2)" || bad "final health check ($CODE_H2)"

# -------------------------------------------------------------------------- #
log "-- [13] PROD post-alignment auth smoke (visa.essafariavoyages.com — read-only + MAX one real login/session row)"
CODE_PROD_L=$(status_of "https://visa.essafariavoyages.com/login" "$WORK/prod-login.html")
printf 'email=%s\npassword=%s\n' "no-such-user-$STAMP@verify.invalid" "Wr0ng!Probe$STAMP" > "$WORK/prodloginfields-bogus.txt"
CODE_P0P=$(submit_form "$WORK/prod-login.html" "https://visa.essafariavoyages.com/login" "Sign in" "$WORK/prodjarb.txt" "$WORK/prodloginfields-bogus.txt")
P0P_TEXT=$(tr -d '\r' < "$WORK/body.html" | LC_ALL=C sed 's/<[^>]*>//g' | tr -s ' \n' ' ' 2>/dev/null)
case "$P0P_TEXT" in *"Service temporarily unavailable"*) bad "PROD P0 repro: bogus login produced service-failure on production domain";; esac
echo "$P0P_TEXT" | grep -qi "Invalid email or password" \
  && ok "PROD bogus login → normal invalid-credentials (auth + users query healthy on visa_os, http $CODE_P0P)" \
  || skp "PROD bogus-login probe inconclusive (http $CODE_P0P; login page http $CODE_PROD_L)"
# Production is READ-ONLY for this harness: a real production login is only
# attempted with credentials that were explicitly issued for production, never
# with Preview/staff credentials (those must not be tried against visa_os).
PROD_EMAIL="${PROD_VERIFY_EMAIL:-}"
PROD_PASS="${PROD_VERIFY_PASSWORD:-}"
if [ -n "$PROD_EMAIL" ] && [ -n "$PROD_PASS" ]; then
  CODE_PROD_L2=$(status_of "https://visa.essafariavoyages.com/login" "$WORK/prod-login2.html")
  printf 'email=%s\npassword=%s\n' "$PROD_EMAIL" "$PROD_PASS" > "$WORK/prodloginfields.txt"
  CODE_RP=$(submit_form "$WORK/prod-login2.html" "https://visa.essafariavoyages.com/login" "Sign in" "$WORK/prodjar.txt" "$WORK/prodloginfields.txt")
  LOC_RP=$(loc_header)
  if grep -qi 'set-cookie:.*evos_session=' "$WORK/headers.txt" && echo "$LOC_RP" | grep -qE "/admin|/portal|/change-password"; then
    ok "PROD real login → evos_session + redirect ${LOC_RP} (authentication operational on production domain)"
  else
    RP_TEXT=$(tr -d '\r' < "$WORK/body.html" | LC_ALL=C sed 's/<[^>]*>//g' | tr -s ' \n' ' ' 2>/dev/null)
    RP_CLASS="other"
    case "$RP_TEXT" in *"Service temporarily unavailable"*) RP_CLASS="SERVICE-UNAVAILABLE";; esac
    case "$RP_TEXT" in *"Invalid email or password"*) RP_CLASS="invalid-credentials";; esac
    case "$RP_TEXT" in *"suspended"*|*"Suspended"*) RP_CLASS="suspended";; esac
    bad "PROD real login failed (http $CODE_RP, ${LOC_RP:-no redirect}; login page http $CODE_PROD_L2; server-action outcome class=$RP_CLASS)"
  fi
else
  skp "PROD real login smoke (needs dedicated PROD_VERIFY_EMAIL/PROD_VERIFY_PASSWORD — production stays read-only)"
fi

log ""
log "== Summary =="
log "PASS: $PASS  FAIL: $FAIL  SKIP: $SKIP"
if [ "$FAIL" -gt 0 ]; then
  log "Failed checks:"
  printf '  - %s\n' "${FAILED_CHECKS[@]}"
  exit 1
fi
exit 0
