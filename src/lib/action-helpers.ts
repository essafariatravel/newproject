import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "@/lib/types";
import { actionFeedbackPath } from "@/lib/action-feedback";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT, localizeError } from "@/lib/i18n-content";

/**
 * Shared server-action wrapper: runs the mutation, converts expected errors to
 * user-safe feedback via redirect query params, and never leaks internals.
 * NEXT_REDIRECT from redirect() propagates (thrown outside try/catch).
 */
export async function runAction(path: string, fn: () => Promise<string>, options?: { successPath: () => string }): Promise<never> {
  let msg: string;
  let kind: "ok" | "error";
  try {
    msg = await fn();
    kind = "ok";
  } catch (err) {
    if (err instanceof AppError) {
      msg = err.message;
    } else if (err instanceof ZodError) {
      msg = err.issues[0]?.message ?? "Please check the form values.";
    } else {
      console.error("[action] Operation failed.");
      msg = "Something went wrong. Please try again.";
    }
    kind = "error";
  }
  const locale = await getUiLocale();
  const destination = kind === "ok" && options ? options.successPath() : path;
  redirect(actionFeedbackPath(destination, kind, kind === "error" ? localizeError(locale, msg) : contentT(locale)(msg)));
}

/** Read + clean flash feedback from search params. */
export function flashFrom(params: Record<string, string | string[] | undefined>): {
  error?: string;
  success?: string;
} {
  const ok = params.ok;
  const error = params.error;
  return {
    success: typeof ok === "string" && ok ? ok : undefined,
    error: typeof error === "string" && error ? error : undefined,
  };
}
