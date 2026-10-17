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
