import {test} from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_STAFF_PUSH_MIGRATIONS, exactWebPushLedger, assertExactWebPushLedger,
} from "../scripts/lib/staff-web-push-production-ledger.mjs";

const old = Array.from({length:35},(_,i)=>`migration_${String(i).padStart(2,"0")}.sql`);
const expected=exactWebPushLedger(old.slice(0,19),old.slice(19,33),old.slice(33));

test("exactly two previously approved additive migrations",()=>{
  assert.deepEqual(APPROVED_STAFF_PUSH_MIGRATIONS,[
    "0034_staff_web_push.sql",
    "0035_staff_push_access_hardening.sql",
  ]);
  assert.equal(expected.length,37);
  assert.doesNotThrow(()=>assertExactWebPushLedger([...expected],expected));
});

test("fails closed for missing, duplicate, unexpected or reordered migrations",()=>{
  for(const actual of [
    expected.slice(0,36),
    [...expected,"0036_unapproved.sql"],
    [...expected.slice(0,-1),expected[0]],
    [...expected].reverse(),
    [...old].sort(),
  ]) assert.throws(()=>assertExactWebPushLedger(actual,expected));
});

test("rejects baseline drift instead of silently accepting a different ledger",()=>{
  assert.throws(()=>exactWebPushLedger([...old,"unexpected.sql"],[],[]));
  assert.throws(()=>exactWebPushLedger([...old.slice(0,34),old[0]],[],[]));
});
