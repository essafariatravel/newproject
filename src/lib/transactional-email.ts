const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const EMAIL_ELIGIBLE_TYPES = new Set([
  "STATUS_CHANGED",
  "DOCUMENTS_REQUIRED",
  "DOCUMENT_REQUESTED",
  "DOCUMENT_REJECTED",
  "RESUBMISSION_REQUIRED",
  "APPLICATION_COMPLETED",
  "APPLICATION_DECISION",
  "REGISTRATION_APPROVED",
  "REGISTRATION_REJECTED",
  "AGENCY_ONBOARDED",
  "WALLET_TOPUP_DECIDED",
]);

type EmailPurpose = "ACTIVATION" | "PASSWORD_RESET";

function configuredProvider(): "disabled" | "brevo" {
  return process.env.TRANSACTIONAL_EMAIL_PROVIDER?.trim().toLowerCase() === "brevo" ? "brevo" : "disabled";
}

function emailConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim() ?? "";
  const from = process.env.TRANSACTIONAL_EMAIL_FROM?.trim() ?? "";
  const fromName = process.env.TRANSACTIONAL_EMAIL_FROM_NAME?.trim() || "ESSAFARIA VISA OS";
  const replyTo = process.env.TRANSACTIONAL_EMAIL_REPLY_TO?.trim() || "info@essafariavoyages.com";
  const origin = process.env.TRANSACTIONAL_EMAIL_APP_ORIGIN?.trim().replace(/\/+$/, "") ?? "";
  return { apiKey, from, fromName, replyTo, origin };
}

function absolutePortalLink(path: string | null | undefined, origin: string): string | null {
  if (!path || !origin || !path.startsWith("/")) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

async function sendBrevo(input: {
  to: string;
  name?: string | null;
  subject: string;
  textContent: string;
  tag: string;
}): Promise<boolean> {
  if (configuredProvider() !== "brevo") return false;
  const cfg = emailConfig();
  if (!cfg.apiKey || !cfg.from || !input.to) return false;

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": cfg.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: cfg.from, name: cfg.fromName },
        to: [{ email: input.to, name: input.name || undefined }],
        replyTo: { email: cfg.replyTo, name: "ESSAFARIA TRAVEL" },
        subject: input.subject,
        textContent: input.textContent,
        tags: [input.tag],
      }),
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
    });
    if (!response.ok) {
      console.error("[transactional-email] provider rejected request", { status: response.status });
      return false;
    }
    const confirmation:unknown=await response.json();
    if(!confirmation||typeof confirmation!=="object"||!("messageId" in confirmation)||typeof confirmation.messageId!=="string"||!confirmation.messageId.trim()||confirmation.messageId.length>500){
      console.error("[transactional-email] invalid provider confirmation",{code:"EMAIL_PROVIDER_MALFORMED_RESPONSE"});
      return false;
    }
    // Provider acceptance is not recipient delivery; no recipient/content enters logs.
    return true;
  } catch (error) {
    console.error("[transactional-email] delivery failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}

export function transactionalEmailReadiness(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const provider = env.TRANSACTIONAL_EMAIL_PROVIDER?.trim().toLowerCase() ?? "disabled";
  const missing: string[] = [];
  if (provider !== "brevo") {
    missing.push("TRANSACTIONAL_EMAIL_PROVIDER=brevo");
  } else {
    if (!env.BREVO_API_KEY?.trim()) missing.push("BREVO_API_KEY");
    if (!env.TRANSACTIONAL_EMAIL_FROM?.trim()) missing.push("TRANSACTIONAL_EMAIL_FROM");
    if (!absolutePortalLink("/",env.TRANSACTIONAL_EMAIL_APP_ORIGIN?.trim() ?? "")) missing.push("TRANSACTIONAL_EMAIL_APP_ORIGIN");
  }
  return { ready: missing.length === 0, provider, missing };
}

export async function sendOperationalNotificationEmail(input: {
  type: string;
  to: string;
  name?: string | null;
  link?: string | null;
}): Promise<boolean> {
  if (!EMAIL_ELIGIBLE_TYPES.has(input.type)) return false;
  const cfg = emailConfig();
  const link = absolutePortalLink(input.link, cfg.origin);
  const action = input.type.includes("DOCUMENT") || input.type === "RESUBMISSION_REQUIRED"
    ? "Action is required in your ESSAFARIA VISA OS account."
    : "There is an update in your ESSAFARIA VISA OS account.";
  const lines = [
    `Hello${input.name ? ` ${input.name}` : ""},`,
    "",
    action,
    "For privacy and security, the details are available only inside the portal.",
    ...(link ? ["", `Open the secure portal: ${link}`] : []),
    "",
    "ESSAFARIA TRAVEL",
    "Privacy & support: info@essafariavoyages.com",
  ];
  return sendBrevo({
    to: input.to,
    name: input.name,
    subject: input.type.includes("DOCUMENT")
      ? "ESSAFARIA VISA OS — action required"
      : "ESSAFARIA VISA OS — account update",
    textContent: lines.join("\n"),
    tag: "visa-os-operational",
  });
}

export async function sendSecureAccessEmail(input: {
  to: string;
  name?: string | null;
  purpose: EmailPurpose;
  path: string;
  expiresAt: Date;
}): Promise<boolean> {
  const cfg = emailConfig();
  const link = absolutePortalLink(input.path, cfg.origin);
  if (!link) return false;
  const activation = input.purpose === "ACTIVATION";
  const lines = [
    `Hello${input.name ? ` ${input.name}` : ""},`,
    "",
    activation
      ? "Your ESSAFARIA VISA OS account access is ready."
      : "A secure password reset link was created for your ESSAFARIA VISA OS account.",
    "This link is single-use. Do not forward it.",
    `It expires at ${input.expiresAt.toISOString()}.`,
    "",
    link,
    "",
    "If you did not expect this message, contact ESSAFARIA TRAVEL.",
    "Privacy & support: info@essafariavoyages.com",
  ];
  return sendBrevo({
    to: input.to,
    name: input.name,
    subject: activation
      ? "ESSAFARIA VISA OS — activate your access"
      : "ESSAFARIA VISA OS — reset your password",
    textContent: lines.join("\n"),
    tag: activation ? "visa-os-activation" : "visa-os-password-reset",
  });
}
