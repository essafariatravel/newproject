import {databaseSchema} from "../../src/lib/database-schema";
import {databaseUrl,targetsSupabaseProject} from "../../src/lib/database-config";
import {assertLocalPerfEnvironment,assertLocalPostgresUrl} from "../../perf/local-safety.js";
export {qualifiedTable as maintenanceTable} from "../../src/lib/database-schema";

function acknowledge(env:NodeJS.ProcessEnv){
  // Retain the existing acknowledgement contract; this is not deployment authority.
  if(env.PERF_ACK_NONPROD!=="YES")throw new Error("Explicit non-Production maintenance acknowledgement required.");
}
/** Local first-admin ceremony, not a performance campaign or MFA exemption. */
export function assertLocalMfaBootstrapTarget(env:NodeJS.ProcessEnv=process.env){
  acknowledge(env);
  const policyEnv={...env};
  // This operation legitimately requires its local encryption key. The actual
  // performance entrypoints never call this function and still refuse the key.
  for(const key of Object.keys(policyEnv))if(key.toUpperCase()==="MFA_ENCRYPTION_KEY")delete policyEnv[key];
  assertLocalPerfEnvironment(policyEnv);
  assertLocalPostgresUrl(env.DATABASE_URL??"");
  if(databaseSchema(env)==="visa_os")throw new Error("Production bootstrap is not authorized by this local tool.");
}
/** Preserve the old exact-project, acknowledged, serial Preview maintenance scope. */
export function assertConsolidationPreviewTarget(env:NodeJS.ProcessEnv=process.env){
  acknowledge(env);
  if((env.VERCEL_ENV&&env.VERCEL_ENV!=="preview")||databaseSchema(env)!=="visa_os_preview")throw new Error("Only the recorded Preview maintenance scope is permitted.");
  const connection=databaseUrl(env);
  if(!targetsSupabaseProject(connection,"xgetzgixalrsmuvfthpf"))throw new Error("The recorded Preview project is required.");
  return {remote:true as const,schema:"visa_os_preview" as const};
}
