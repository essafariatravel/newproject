import { readFile, lstat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { legalReviewEnabled, parseLegalReviewPack, type LegalReviewPack } from "./legal-review-pack";

/** Private server-side path, outside Git. Never bundle draft clauses in public source. */
export async function readPrivateLegalReviewPack():Promise<LegalReviewPack|null> {
  if(!legalReviewEnabled())return null;
  const file=process.env.LEGAL_REVIEW_PACK_PATH;
  if(!file||!isAbsolute(file))return null;
  try {
    const info=await lstat(file);
    if(!info.isFile()||info.isSymbolicLink()||info.size>512*1024)return null;
    return parseLegalReviewPack(JSON.parse(await readFile(file,"utf8")));
  } catch { return null; } // No path, document content or parsing error in logs.
}

/** Private operator evidence only; approval does not publish, migrate or enable purge. */
export async function readPrivateOwnerLegalApproval():Promise<unknown|null> {
  if(!legalReviewEnabled())return null;
  const file=process.env.LEGAL_APPROVAL_RECORD_PATH;
  if(!file||!isAbsolute(file))return null;
  try { const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>64*1024)return null;return JSON.parse(await readFile(file,"utf8")); }
  catch { return null; }
}
