import { AppError } from '@/lib/types';

// Offline denylist of common breached choices; no password or hash is sent to a third party.
const COMMON_PASSWORDS = new Set(['password','password1','password123','password1234','password12345','password123456','password123456789','123456789012','123456789012345','qwerty123456','qwertyuiop123','administrator','administrateur','letmein123456','welcome123456','changeme12345','motdepasse123','essafaria1234','essafaria123456']);
export function assertSafePassword(value:string):void {
  if(value.length<12||value.length>200)throw new AppError('VALIDATION','Use 12–200 characters, preferably a unique passphrase.');
  const comparable=value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
  if(COMMON_PASSWORDS.has(comparable)||/^(.)\1+$/u.test(comparable)||new Set(comparable).size<4)
    throw new AppError('VALIDATION','Choose a unique passphrase instead of a common or predictable password.');
}
