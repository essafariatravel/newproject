/** Exact, additive Production release allowlist: pre-existing 35 + ONLY these 2 push migrations. */
import assert from "node:assert/strict";
export const APPROVED_STAFF_PUSH_MIGRATIONS = Object.freeze([
  "0034_staff_web_push.sql",
  "0035_staff_push_access_hardening.sql",
]);

export function exactWebPushLedger(baseline, scope, batchB) {
  const old = [...baseline, ...scope, ...batchB];
  assert.equal(old.length, 35, "Protected base must contain exactly 35 qualified migrations.");
  assert.equal(new Set(old).size, 35, "Protected base contains duplicate migrations.");
  const expected = [...old, ...APPROVED_STAFF_PUSH_MIGRATIONS].sort();
  assert.equal(expected.length, 37);
  assert.equal(new Set(expected).size, 37, "Unexpected existing migration name collision.");
  return expected;
}

export function assertExactWebPushLedger(actual, expected) {
  assert.deepEqual(actual, expected, "Production ledger deviates from exactly 37 approved migrations.");
}
