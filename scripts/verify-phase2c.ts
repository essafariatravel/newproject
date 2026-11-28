/** Preview qualification: retained document checks only; no database or external calls. */
import assert from "node:assert/strict";
import {passportValidity,photoRatioDifference,duplicateGroups,imageSignals} from "../src/lib/document-intelligence";
assert.equal(passportValidity("2032-04-15","2032-04-01"),14);
assert.equal(passportValidity("2032-04-01","2032-04-01"),0);
assert.equal(passportValidity("2032-03-31","2032-04-01"),-1);
assert.equal(passportValidity("2032-02-30","2032-04-01"),null);
assert.equal(photoRatioDifference(350,450,35,45),0);
assert.equal(photoRatioDifference(350,450,0,45),null);
assert.ok(photoRatioDifference(500,500,35,45)!>20);
assert.deepEqual(duplicateGroups([{item:1,hash:"a"},{item:2,hash:"a"},{item:3,hash:"b"}]),[[1,2]]);
assert.ok(imageSignals(new Uint8ClampedArray(100).fill(255),5,5).contrast<.001);
assert.throws(()=>imageSignals(new Uint8ClampedArray(4),5,5));
console.log("[phase2c] Retained validity, quality, photo and duplicate checks PASS (10 assertions)");
