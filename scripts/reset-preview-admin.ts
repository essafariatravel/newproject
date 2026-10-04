/** Retired privileged Preview bootstrap. Use authenticated user management and
 * authorized recovery so identity revocation and durable audits remain atomic.
 * Deliberately imports nothing and never reads private environment files. */
console.error("[reset-preview-admin] REFUSING: retired credential bootstrap. Use authenticated user management and authorized recovery.");
process.exitCode = 2;
