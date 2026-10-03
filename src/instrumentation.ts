import type { Instrumentation } from "next";
import {
  logErrorOnce,
  withObservabilityContext,
} from "@/lib/observability";

/**
 * Last-resort server error capture for errors Next.js observes outside the
 * explicitly instrumented application services.
 *
 * Privacy rule: never log request.path, request headers, cookies, query
 * parameters, or bodies here. Only framework-owned route templates/context and
 * the HTTP method are emitted.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const action = `next.${context.routeType}.unhandled_error`;

  await withObservabilityContext({ action }, async () => {
    logErrorOnce("next.request.unhandled_error", error, {
      severity: "error",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      route: context.routePath ?? null,
      metadata: {
        method: request.method,
        router_kind: context.routerKind,
        route_type: context.routeType,
        render_source: context.renderSource ?? null,
        revalidate_reason: context.revalidateReason ?? null,
        error_digest:
          typeof (error as Error & { digest?: unknown }).digest === "string"
            ? (error as Error & { digest: string }).digest
            : null,
      },
    });
  });
};
