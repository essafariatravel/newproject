const PREVIEW_HOST_SUFFIX = "-essafaria-travel-s-projects.vercel.app";
const PRODUCTION_HOSTS = new Set(["visa.essafariavoyages.com"]);

export function validatePreviewOrigin(input: string): URL {
  const parsed = new URL(input);
  const hostname = parsed.hostname.toLowerCase();

  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new Error("Refusing: Preview verifier cannot target the Production host.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("PREVIEW_BASE_URL must use HTTPS.");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(
      "PREVIEW_BASE_URL must be a clean HTTPS origin with no credentials, port, path, query or fragment.",
    );
  }
  if (!hostname.startsWith("newproject-") || !hostname.endsWith(PREVIEW_HOST_SUFFIX)) {
    throw new Error(
      "Refusing: Preview verifier only accepts ESSAFARIA newproject Vercel Preview hosts.",
    );
  }
  return parsed;
}

export function assertApprovedPreviewRedirect(target: URL, approvedHostname: string): void {
  if (
    target.protocol !== "https:" ||
    target.hostname.toLowerCase() !== approvedHostname.toLowerCase()
  ) {
    throw new Error(
      "Refusing: Preview verification redirect left the approved ESSAFARIA host.",
    );
  }
}
