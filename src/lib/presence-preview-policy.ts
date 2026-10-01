/** Server-side policy for the dedicated read-only North Star Vercel Preview.
 * NODE_ENV is deliberately not used: Preview builds also run in production mode.
 */
export function presenceWritesSuppressed(): boolean {
  return process.env.VERCEL === "1"
    && process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "design/essafaria-northstar";
}
