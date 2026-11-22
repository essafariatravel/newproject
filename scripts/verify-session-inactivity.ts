import assert from "node:assert/strict";
import { SESSION_POLICIES, SESSION_WARNING_MS, sessionPolicy } from "../src/lib/identity-policy";
import { SESSION_WARNING_COPY, sessionWarningCopy } from "../src/lib/session-warning-copy";

assert.deepEqual(SESSION_POLICIES.agency, { idleMs: 120 * 60_000, absoluteMs: 24 * 60 * 60_000 });
assert.deepEqual(SESSION_POLICIES.staff, { idleMs: 60 * 60_000, absoluteMs: 12 * 60 * 60_000 });
assert.equal(SESSION_WARNING_MS, 5 * 60_000);
assert.equal(sessionPolicy(null), SESSION_POLICIES.staff);
assert.equal(sessionPolicy("00000000-0000-0000-0000-000000000001"), SESSION_POLICIES.agency);

assert.deepEqual(Object.keys(SESSION_WARNING_COPY).sort(), ["ar", "en", "fr"]);
const fields = Object.keys(SESSION_WARNING_COPY.en).sort();
for (const locale of ["en", "fr", "ar"] as const) {
  const copy = sessionWarningCopy(locale);
  assert.deepEqual(Object.keys(copy).sort(), fields);
  for (const value of Object.values(copy)) assert.ok(value.trim().length > 3);
  assert.notEqual(copy.idleTitle, copy.absoluteTitle);
  assert.notEqual(copy.stay, copy.signOut);
  assert.notEqual(copy.signInAgain, copy.stay);
}
assert.match(sessionWarningCopy("ar").idleTitle, /[\u0600-\u06ff]/);
assert.match(sessionWarningCopy("fr").stay, /Rester connecté/);
assert.match(sessionWarningCopy("en").stay, /Stay signed in/);
console.log("SESSION_IDLE_120M_AGENCY_60M_STAFF_ABSOLUTE_UNCHANGED_PASS");
console.log("SESSION_WARNING_5M_EN_FR_AR_PASS");
