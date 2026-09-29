/** Preserve workspace tabs and keep form-provided return paths on this origin. */
export function actionFeedbackPath(path: string, kind: "ok" | "error", message: string): string {
  const safe = path.startsWith("/") && !path.startsWith("//") && !/[\\\u0000-\u0020]/.test(path);
  const url = new URL(safe ? path : "/", "https://local.invalid");
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  url.searchParams.set(kind, message);
  return `${url.pathname}${url.search.replaceAll("+", "%20")}${url.hash}`;
}
