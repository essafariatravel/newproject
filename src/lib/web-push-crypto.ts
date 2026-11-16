/** RFC 8291 / RFC 8292 Web Push using Node built-in crypto, no paid provider. */
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";

export type PushSubscriptionInfo = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const b64url = (bytes: Buffer) => bytes.toString("base64url");
const fromB64url = (text: string) => Buffer.from(text, "base64url");

/** Disallow private addresses, arbitrary destinations and SSRF through a supplied endpoint. */
export function isTrustedPushEndpoint(endpoint: string): boolean {
  try {
    if (endpoint.length > 2048) return false;
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.port || u.username || u.password || u.hash) return false;
    const h = u.hostname.toLowerCase();
    return h === "fcm.googleapis.com" ||
      h === "updates.push.services.mozilla.com" ||
      h === "push.services.mozilla.com" ||
      h === "web.push.apple.com" || h.endsWith(".push.apple.com") ||
      h.endsWith(".notify.windows.com");
  } catch { return false; }
}

export function isValidSubscription(value: unknown): value is PushSubscriptionInfo {
  if (!value || typeof value !== "object") return false;
  const sub = value as Partial<PushSubscriptionInfo>;
  if (typeof sub.endpoint !== "string" || !isTrustedPushEndpoint(sub.endpoint)) return false;
  const p = sub.keys?.p256dh, a = sub.keys?.auth;
  if (typeof p !== "string" || typeof a !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(p) || !/^[A-Za-z0-9_-]+$/.test(a)) return false;
  const userPublic = fromB64url(p), secret = fromB64url(a);
  return userPublic.length === 65 && userPublic[0] === 4 && secret.length === 16;
}

export function vapidPublicKey(): string | null {
  const pub = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const priv = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  try {
    const ecdh = createECDH("prime256v1");
    if (fromB64url(priv).length !== 32) return null;
    ecdh.setPrivateKey(fromB64url(priv));
    if (ecdh.getPublicKey().toString("base64url") !== pub) return null;
    return pub;
  } catch { return null; }
}

function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}
const label = (value: string) => Buffer.from(value + "\0", "utf8");

/** RFC 8291 aes128gcm single-record encoding, max record size 4096. */
export function encryptWebPush(keys: PushSubscriptionInfo["keys"], message: string): Buffer {
  const uaPublic = fromB64url(keys.p256dh), authSecret = fromB64url(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) {
    throw new Error("INVALID_PUSH_KEYS");
  }
  const sender = createECDH("prime256v1");
  const senderPublic = sender.generateKeys();
  const shared = sender.computeSecret(uaPublic);
  const ikm = hkdf(shared, authSecret, Buffer.concat([label("WebPush: info"), uaPublic, senderPublic]), 32);
  const salt = randomBytes(16);
  const cek = hkdf(ikm, salt, label("Content-Encoding: aes128gcm"), 16);
  const nonce = hkdf(ikm, salt, label("Content-Encoding: nonce"), 12);
  const clear = Buffer.concat([Buffer.from(message, "utf8"), Buffer.from([2])]); // final-record delimiter
  if (clear.length > 4079) throw new Error("PUSH_PAYLOAD_TOO_LARGE");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(clear), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([senderPublic.length]), senderPublic, ciphertext]);
}

/** RFC 8292 VAPID compact ES256 JWT: never expose the private signing key. */
export function vapidAuthorization(endpoint: string): string {
  const pub = vapidPublicKey();
  if (!pub) throw new Error("WEB_PUSH_NOT_CONFIGURED");
  const privateBytes = fromB64url(process.env.WEB_PUSH_VAPID_PRIVATE_KEY!);
  const publicBytes = fromB64url(pub);
  const key = createPrivateKey({ key: {
    kty: "EC", crv: "P-256",
    d: b64url(privateBytes),
    x: b64url(publicBytes.subarray(1, 33)),
    y: b64url(publicBytes.subarray(33, 65)),
  }, format: "jwk" });
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(Buffer.from(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: "mailto:info@essafariavoyages.com",
  })));
  const unsigned = header + "." + claims;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64url(signature)}, k=${pub}`;
}

/** Returns an HTTP status; never logs the subscription endpoint or key material. */
export async function deliverWebPush(sub: PushSubscriptionInfo, payload: { kind: string; url: string }): Promise<number> {
  if (!isValidSubscription(sub)) throw new Error("INVALID_PUSH_SUBSCRIPTION");
  const content = encryptWebPush(sub.keys, JSON.stringify(payload));
  const response = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "normal",
    },
    body: new Uint8Array(content),
    signal: AbortSignal.timeout(4500),
    cache: "no-store",
  });
  return response.status;
}
