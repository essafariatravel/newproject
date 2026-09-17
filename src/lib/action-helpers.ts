import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "@/lib/types";

/**
 * Shared server-action wrapper: runs the mutation, converts expected errors to
 * user-safe feedback via redirect query params, and never leaks internals.
 * NEXT_REDIRECT from redirect() propagates (thrown outside try/catch).
 */
export async function runAction(path: string, fn: () => Promise<string>): Promise<never> {
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
      console.error("action-failed", err);
      msg = "Something went wrong. Please try again.";
    }
    kind = "error";
  }
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
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
