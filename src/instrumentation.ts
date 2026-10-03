import type { Instrumentation } from "next";

/**
 * Native Next.js server error hook.
 *
 * Deliberately excludes request headers, query values and request bodies.
 * Node.js uses the shared privacy-first logger; Edge emits only structural
 * context because the Node logger relies on AsyncLocalStorage/node:crypto.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  _request,
  context,
) => {
  const metadata = {
    router_kind: context.routerKind,
    route_type: context.routeType,
    render_source: context.renderSource ?? null,
    render_type: context.renderType ?? null,
    revalidate_reason: context.revalidateReason ?? null,
    digest: error.digest ?? null,
  };

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logErrorOnce } = await import("@/lib/observability");
    logErrorOnce("next.request.unhandled_error", error, {
      severity: "error",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      route: context.routePath,
      action: context.routeType,
      metadata,
    });
    return;
  }

  // Edge-safe fallback: never include error.message, headers or request.path.
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    release_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    event_name: "next.request.unhandled_error",
    severity: "error",
    classification: "BUSINESS_FAILURE",
    result: "technical_failed",
    route: context.routePath,
    action: context.routeType,
    ...metadata,
  }));
};
