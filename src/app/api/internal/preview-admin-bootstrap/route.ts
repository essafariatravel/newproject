/**
 * Historical Preview bootstrap endpoint.
 *
 * Remote HTTP bootstrap has been retired. Preview administrator recovery is
 * performed only by the explicitly confirmed, schema-pinned CI/CLI reset path
 * (scripts/reset-preview-admin.ts). Keeping this route as a hard 404 avoids
 * reviving a second privileged account-creation channel through environment
 * drift or a future unprotected branch.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): Response {
  return Response.json({ error: "Not found" }, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(): Promise<Response> {
  return notFound();
}

export function GET(): Response {
  return notFound();
}
