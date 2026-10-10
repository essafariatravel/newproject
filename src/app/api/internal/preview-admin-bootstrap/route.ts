/**
 * Retired credential bootstrap. Account management and recovery must use the
 * authenticated, audited identity services. A legacy environment token must
 * never rotate, reactivate or promote an account on any deployment branch.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function notFound(): Response { return Response.json({ error: "Not found" }, { status: 404 }); }
export async function POST(_request: Request): Promise<Response> { return notFound(); }
export function GET(): Response { return notFound(); }
