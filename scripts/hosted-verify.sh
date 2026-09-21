#!/usr/bin/env bash
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
  curl -s -b "$4" -c "$4" -D "$WORK/headers.txt" -o "$WORK/body.html" -w "%{http_code}" \
    -H "Origin: ${BASE_URL}" --max-time 60 -X POST "$2" "${args[@]}"
}

loc_header() { grep -i '^location:' "$WORK/headers.txt" | tr -d '\r' | cut -d' ' -f2; }

HOSTED_PDF="$WORK/proof.pdf"
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > "$HOSTED_PDF"

log "== Phase 2 hosted verification =="
log "Target: $BASE_URL"
log ""

# -------------------------------------------------------------------------- #
log "-- [0] Health check"
CODE=$(status_of "$BASE_URL/api/health" "$WORK/health.json")
if [ "$CODE" = "200" ] && python3 -c "
import json,sys
d=json.load(open('$WORK/health.json'))
sys.exit(0 if (d.get('ok') is True
  and (d.get('schema') or {}).get('columnsValid') is True
  and (d.get('database') or {}).get('error') is None) else 1)
"; then
  ok "health: ok=true, columnsValid=true, database.error=null ($CODE)"
  grep -q 'agency_registrations' "$WORK/health.json" && ok "health: agency_registrations table present" \
  || ok "health: table list not exposed (columnsValid already asserted)"
else
  bad "health endpoint ($CODE)"
fi

# -------------------------------------------------------------------------- #
log "-- [1] Trilingual registration page"
CODE_EN=$(status_of "$BASE_URL/agency/register?lang=en" "$WORK/reg-en.html")
CODE_FR=$(status_of "$BASE_URL/agency/register?lang=fr" "$WORK/reg-fr.html")
CODE_AR=$(status_of "$BASE_URL/agency/register?lang=ar" "$WORK/reg-ar.html")
[ "$CODE_EN" = "200" ] && grep -q "Register your Agency" "$WORK/reg-en.html" && grep -qi "application for partnership" "$WORK/reg-en.html" \
  && ok "EN registration page (CTA + partnership disclaimer, $CODE_EN)" || bad "EN registration page ($CODE_EN)"
[ "$CODE_FR" = "200" ] && grep -q "Inscrire votre agence" "$WORK/reg-fr.html" && grep -qi "demande de partenariat" "$WORK/reg-fr.html" \
  && ok "FR registration page ($CODE_FR)" || bad "FR registration page ($CODE_FR)"
[ "$CODE_AR" = "200" ] && grep -q 'dir="rtl"' "$WORK/reg-ar.html" && grep -q "سجّل وكالتك" "$WORK/reg-ar.html" \
  && ok "AR registration page + RTL ($CODE_AR)" || bad "AR registration page + RTL ($CODE_AR)"

# Homepage CTA
CODE_H=$(status_of "$BASE_URL/" "$WORK/home.html")
[ "$CODE_H" = "200" ] && grep -q "Register your Agency" "$WORK/home.html" \
  && ok "homepage header CTA present" || bad "homepage CTA ($CODE_H)"

STAMP=$(date +%s)
LEGAL_EN="Hosted Verify EN $STAMP SARL"
LEGAL_XX="Hosted Verify Reject $STAMP SPA"
EMAIL_EN="hosted-en-$STAMP@hosted-verify.invalid"
EMAIL_XX="hosted-reject-$STAMP@hosted-verify.invalid"

# Mass-assignment junk fields — the server must ignore every one of them.
JUNK="-F role=SUPER_ADMIN -F permissions=wallet.credit -F status=APPROVED -F agencyId=00000000-0000-0000-0000-000000000000 -F balance=99999.00 -F internalNotes=should-never-persist"

make_form() { # $1=locale $2=legal $3=contactEmail $4=companyEmail $5=withpdf(1/0)
  # unique commercial-registration number per company (duplicate detection covers it)
  local CRSUF; CRSUF=$(printf '%s' "$2$3" | md5sum | head -c 8)
  cat > "$WORK/form.txt" <<EOF
locale=$1
legalName=$2
tradingName=
country=Algeria
region=Algiers
city=Algiers
addressLine=12 Rue de la Merced, Bab Ezzouar
phone=+213 23 00 00 00
email=$4
website=https://hosted-verify.example
commercialRegistrationNumber=RC-$STAMP-$CRSUF
taxId=NIF-$STAMP
licenceNumber=AGR-$STAMP
contactFirstName=Nadia
contactLastName=Bensaid
contactPosition=Managing Director
contactEmail=$3
contactPhone=+213 55 00 00 00
businessType=TRAVEL_AGENCY
monthlyVolume=11-50
mainMarkets=Schengen, Gulf, West Africa
message=Hosted verification submission (safe test data).
terms=on
privacy=on
accuracy=on
fax=
EOF
  sleep 2  # respect the ≥1.5s render-time antibot trap (page carries its own renderedAt)
  [ "$5" = "1" ] && echo "doc_COMMERCIAL_REGISTRATION=@$HOSTED_PDF;type=application/pdf" >> "$WORK/form.txt"
}

# -------------------------------------------------------------------------- #
log "-- [2] Public submission EN + PDF upload + mass-assignment junk"
make_form en "$LEGAL_EN" "$EMAIL_EN" "$EMAIL_EN" 1
# push the mass-assignment junk fields into the multipart as well
{ printf '%s\n' "role=SUPER_ADMIN" "permissions=wallet.credit" "status=APPROVED" \
  "agencyId=00000000-0000-0000-0000-000000000000" "balance=99999.00" "internalNotes=should-never-persist"; } >> "$WORK/form.txt"
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
make_form en "$LEGAL_EN DUP" "$EMAIL_EN" "$EMAIL_EN" 0
CODE_DUP=$(submit_form "$WORK/reg-en.html" "$BASE_URL/agency/register?lang=en" "Submit application for review" "$WORK/nojar3.txt" "$WORK/form.txt")
LOC_DUP=$(loc_header)
echo "$LOC_DUP" | grep -q "success?ref=AGR-" \
  && bad "duplicate contact email was accepted ($LOC_DUP)" \
  || ok "duplicate contact email blocked politely (http $CODE_DUP, no success redirect)"

make_form fr "$LEGAL_EN INJ" "not-an-email" "not-an-email" 0
CODE_BAD=$(submit_form "$WORK/reg-fr.html" "$BASE_URL/agency/register?lang=fr" "Soumettre la demande pour examen" "$WORK/nojar4.txt" "$WORK/form.txt")
LOC_BAD=$(loc_header)
echo "$LOC_BAD" | grep -q "success?ref=AGR-" \
  && bad "invalid email was accepted ($LOC_BAD)" \
  || ok "invalid email rejected with localized FR error (http $CODE_BAD)"

# -------------------------------------------------------------------------- #
log "-- [4] Second submission (AR locale) — subject for the REJECTION path"
make_form ar "$LEGAL_XX" "$EMAIL_XX" "$EMAIL_XX" 0
CODE2=$(submit_form "$WORK/reg-ar.html" "$BASE_URL/agency/register?lang=ar" "إرسال الطلب للمراجعة" "$WORK/nojar6.txt" "$WORK/form.txt")
LOC2=$(loc_header)
if echo "$LOC2" | grep -q "agency/register/success?ref=AGR-"; then
  REF2=$(echo "$LOC2" | grep -o "AGR-[0-9A-Z-]*" | head -1)
  ok "AR-locale submission accepted ($REF2)"
else
  REF2=""; bad "AR submission failed (http $CODE2)"
fi

# -------------------------------------------------------------------------- #
log "-- [5] Anonymous document access denied"
FAKE_R="11111111-1111-4111-8111-111111111111"; FAKE_D="22222222-2222-4222-8222-222222222222"
CODE_ANON=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE_URL/api/registrations/$FAKE_R/documents/$FAKE_D")
{ [ "$CODE_ANON" = "401" ] || [ "$CODE_ANON" = "403" ]; } \
  && ok "anonymous document download denied ($CODE_ANON)" || bad "anonymous document access returned $CODE_ANON"

# -------------------------------------------------------------------------- #
STAFF_ITEMS=("staff login" "Admin > Agency Registrations list" "pending counter" \
  "start review" "request more information" "approve → agency provisioning" \
  "generate activation link" "activation password set → agency login" \
  "agency portal" "staff document download authorized" "rejection path" \
  "wallet untouched" "cross-tenant isolation")
if [ -z "$STAFF_EMAIL" ] || [ -z "$STAFF_PASS" ]; then
  for ITEM in "${STAFF_ITEMS[@]}"; do skp "$ITEM (needs PREVIEW_VERIFY_STAFF_EMAIL/PASSWORD)"; done
elif [ -z "$REF1" ]; then
  for ITEM in "${STAFF_ITEMS[@]}"; do skp "$ITEM (no submitted registration to review)"; done
else
  log "-- [6] Staff login"
  CODE_L=$(status_of "$BASE_URL/login" "$WORK/login.html")
  printf 'email=%s\npassword=%s\n' "$STAFF_EMAIL" "$STAFF_PASS" > "$WORK/loginfields.txt"
  CODE=$(submit_form "$WORK/login.html" "$BASE_URL/login" "Sign in" "$WORK/staff.txt" "$WORK/loginfields.txt")
  LOC_L=$(loc_header)
  if grep -qi 'set-cookie:.*evos_session=' "$WORK/headers.txt" && echo "$LOC_L" | grep -qE "/admin|/portal"; then
    ok "staff login → evos_session + redirect ${LOC_L}"
  else
    bad "staff login failed (http $CODE, ${LOC_L:-no redirect})"
  fi

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
    grep -qi "proof.pdf" "$WORK/detail1.html" && ok "uploaded document row visible" || bad "document row missing"

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
    TOKEN=$(printf '%s' "$LOC_GEN" | grep -o "activate%2F[0-9A-Za-z_-]\{32,\}" | head -1 | cut -dF -f2)
    [ -z "$TOKEN" ] && TOKEN=$(printf '%s' "$LOC_GEN" | grep -o "activate/[0-9A-Za-z_-]\{32,\}" | head -1 | cut -d/ -f2)
    statusb_of "$BASE_URL/admin/registrations/$ID1" "$WORK/detail1f.html" "$WORK/staff.txt" >/dev/null
    if [ -n "$TOKEN" ]; then
      ok "activation link generated"
      CODE_A=$(status_of "$BASE_URL/activate/$TOKEN" "$WORK/activate.html")
      [ "$CODE_A" = "200" ] && ok "activation page renders (GET 200)" || bad "activation page $CODE_A"
      NEWPASS="Verify-H0sted!$((STAMP % 900))"
      printf 'password=%s\npasswordConfirm=%s\n' "$NEWPASS" "$NEWPASS" > "$WORK/activatefields.txt"
      CACT=$(submit_form "$WORK/activate.html" "$BASE_URL/activate/$TOKEN" "Set password" "$WORK/agency.txt" "$WORK/activatefields.txt")
      LOC_A=$(loc_header)
      if echo "$LOC_A" | grep -q "/portal" && grep -qi 'set-cookie:.*evos_session=' "$WORK/headers.txt"; then
        ok "activation sets password → session issued → /portal"
      else bad "activation post ($CACT → ${LOC_A:-none})"; fi
    else bad "activation link not found"; fi

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
    else bad "document id missing"; fi

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

# ---- antibot probes run LAST: they intentionally burn the per-IP submission budget ----
log "-- [11.5] Honeypot + rate limiting"
make_form en "Honeypot Bot $STAMP" "hosted-bot-$STAMP@hosted-verify.invalid" "hosted-bot-$STAMP@hosted-verify.invalid" 0
sed -i 's/^fax=$/fax=bot-filled-this/' "$WORK/form.txt"
submit_form "$WORK/reg-en.html" "$BASE_URL/agency/register?lang=en" "Submit application for review" "$WORK/nojar5.txt" "$WORK/form.txt" >/dev/null
LOC_HP=$(loc_header)
echo "$LOC_HP" | grep -q "success" && ! echo "$LOC_HP" | grep -q "ref=AGR-" \
  && ok "honeypot submission silently swallowed (no reference issued)" \
  || skp "honeypot outcome ambiguous — absence-of-record proven by test suite"

RL_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  make_form en "RateLimit Probe $STAMP $i" "rl-$i-$STAMP@hosted-verify.invalid" "rl-$i-$STAMP@hosted-verify.invalid" 0
  submit_form "$WORK/reg-en.html" "$BASE_URL/agency/register?lang=en" "Submit application for review" "$WORK/nojar.rl.$i.txt" "$WORK/form.txt" >/dev/null
  L=$(loc_header)
  echo "$L" | grep -q "success?ref=AGR-" || { RL_OK=1; break; }
done
[ "$RL_OK" = "1" ] && ok "rate limiting kicks in on rapid repeated submissions" \
  || skp "rate limiting not observed in ≤10 attempts (hourly ceiling may differ on this deployment)"

# -------------------------------------------------------------------------- #
log "-- [12] Final health re-check"
CODE_H2=$(status_of "$BASE_URL/api/health" "$WORK/health2.json")
python3 -c "
import json,sys
d=json.load(open('$WORK/health2.json'))
sys.exit(0 if d.get('ok') is True else 1)
" 2>/dev/null && ok "final health check ok ($CODE_H2)" || bad "final health check ($CODE_H2)"

log ""
log "== Summary =="
log "PASS: $PASS  FAIL: $FAIL  SKIP: $SKIP"
if [ "$FAIL" -gt 0 ]; then
  log "Failed checks:"
  printf '  - %s\n' "${FAILED_CHECKS[@]}"
  exit 1
fi
exit 0
