import { authorizeOperatorRequest } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

/**
 * Safe synthetic server error for Preview alert-delivery tests.
 * Never available in Production and never mutates application data.
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json(
      { status: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const auth = authorizeOperatorRequest(request);
  if (auth === "disabled") {
    return Response.json(
      { status: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (auth === "denied") {
    return Response.json(
      { status: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const error = new Error("Synthetic observability verification failure");
  error.name = "ObservabilitySyntheticError";
  throw error;
}
