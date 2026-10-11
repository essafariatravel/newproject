// Only non-secret, owner-reviewed aggregate evidence belongs in these inputs.
const {writeFileSync} = require('node:fs');
for (const [input, output] of [
 ['RELEASE_APPROVAL_JSON','RELEASE_APPROVAL_FILE'],
 ['RELEASE_DR_VERIFIED_JSON','RELEASE_DR_VERIFIED_MANIFEST'],
 ['RELEASE_DR_BUNDLE_JSON','RELEASE_DR_EVIDENCE_BUNDLE'],
 ['RELEASE_KEY_CUSTODY_JSON','RELEASE_KEY_CUSTODY_RECEIPT'],
]) {
 const value=process.env[input], filename=process.env[output];
 if (!value || !filename) throw new Error('Owner approval and verified DR evidence are required.');
 JSON.parse(value);
 writeFileSync(filename, value, {flag:'wx',mode:0o600});
}
console.log('Owner approval and DR evidence staged; contents omitted.');
