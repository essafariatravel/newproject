// Only non-secret, owner-reviewed aggregate evidence belongs in these inputs.
const {writeFileSync,existsSync,realpathSync} = require('node:fs');
const path=require('node:path'),{createHash}=require('node:crypto');
const approvalText=process.env.RELEASE_APPROVAL_JSON;
if(!approvalText||createHash('sha256').update(approvalText).digest('hex')!==process.env.RELEASE_APPROVAL_SHA256)throw new Error('Exact owner approval integrity is required before staging.');
const approval=JSON.parse(approvalText);
const kind=approval.version===1?'INDEPENDENT_DR_V1':approval.version===2?approval.recoveryPolicy?.kind:null;
if(!['INDEPENDENT_DR_V1','SUPABASE_MANAGED_PHYSICAL_V1'].includes(kind))throw new Error('Explicit supported recovery policy is required; no fallback.');
const inputs=[['RELEASE_APPROVAL_JSON','RELEASE_APPROVAL_FILE']];
if(kind==='INDEPENDENT_DR_V1')inputs.push(['RELEASE_DR_VERIFIED_JSON','RELEASE_DR_VERIFIED_MANIFEST'],['RELEASE_DR_BUNDLE_JSON','RELEASE_DR_EVIDENCE_BUNDLE'],['RELEASE_KEY_CUSTODY_JSON','RELEASE_KEY_CUSTODY_RECEIPT']);
else inputs.push(['RELEASE_MANAGED_BACKUP_JSON','RELEASE_MANAGED_BACKUP_EVIDENCE']);
if(approval.version===2&&approval.batch==='B')inputs.push(['RELEASE_BATCH_A_POSTFLIGHT_JSON','RELEASE_BATCH_A_POSTFLIGHT_FILE']);
const temporary=process.env.RUNNER_TEMP;
if(!temporary||!path.isAbsolute(temporary))throw new Error('Private absolute runner temporary directory is required.');
const root=realpathSync(temporary),seen=new Set();
const files=inputs.map(([input,output])=>{
 const value=process.env[input],filename=process.env[output];
 if(!value||!filename||!path.isAbsolute(filename)||realpathSync(path.dirname(filename))!==root||existsSync(filename)||seen.has(filename))throw new Error('Every selected evidence input and fresh private output is required before writing.');
 JSON.parse(value);seen.add(filename);return {filename,value};
});
for(const {filename,value} of files)writeFileSync(filename,value,{flag:'wx',mode:0o600});
console.log('Selected owner approval and recovery evidence staged privately; contents omitted, no restoration success claimed.');
