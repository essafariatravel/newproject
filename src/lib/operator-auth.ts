import { createHash, timingSafeEqual } from "node:crypto";

export type OperatorAuthorization = "enabled" | "disabled" | "denied";

const MIN_OPERATOR_TOKEN_BYTES = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Shared authorization for internal observability endpoints.
 * If HEALTHCHECK_TOKEN is absent or obviously weak, the endpoint behaves as
 * unavailable. Digests are compared at a fixed length to avoid leaking token
 * length through the comparison path.
 */
export function authorizeOperatorRequest(request: Request): OperatorAuthorization {
  const expected = process.env.HEALTHCHECK_TOKEN;
  if (!expected || Buffer.byteLength(expected, "utf8") < MIN_OPERATOR_TOKEN_BYTES) {
    return "disabled";
  }

  const actual = request.headers.get("authorization");
  if (!actual?.startsWith("Bearer ")) return "denied";

  const supplied = actual.slice(7);
  if (!supplied) return "denied";

  return timingSafeEqual(digest(supplied), digest(expected)) ? "enabled" : "denied";
}
