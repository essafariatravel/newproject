import { timingSafeEqual } from "node:crypto";

export type OperatorAuthorization = "enabled" | "disabled" | "denied";

/**
 * Shared authorization for internal observability endpoints.
 * If HEALTHCHECK_TOKEN is absent the endpoint must behave as unavailable.
 */
export function authorizeOperatorRequest(request: Request): OperatorAuthorization {
  const expected = process.env.HEALTHCHECK_TOKEN;
  if (!expected) return "disabled";

  const actual = request.headers.get("authorization");
  if (!actual?.startsWith("Bearer ")) return "denied";

  const supplied = Buffer.from(actual.slice(7));
  const configured = Buffer.from(expected);
  if (supplied.length !== configured.length) return "denied";
  return timingSafeEqual(supplied, configured) ? "enabled" : "denied";
}
