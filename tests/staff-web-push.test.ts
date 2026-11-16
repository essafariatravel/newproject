import { createDecipheriv, createECDH, hkdfSync, randomBytes, createPublicKey, verify } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  encryptWebPush, isTrustedPushEndpoint, isValidSubscription, vapidAuthorization, vapidPublicKey,
} from "../src/lib/web-push-crypto";

const previousPub = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
const previousPriv = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
afterEach(() => {
  if (previousPub === undefined) delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  else process.env.WEB_PUSH_VAPID_PUBLIC_KEY = previousPub;
  if (previousPriv === undefined) delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  else process.env.WEB_PUSH_VAPID_PRIVATE_KEY = previousPriv;
});

describe("staff Web Push - encryption, identity and SSRF", () => {
  it("allows known push services only", () => {
    expect(isTrustedPushEndpoint("https://web.push.apple.com/Q/example")).toBe(true);
    expect(isTrustedPushEndpoint("https://fcm.googleapis.com/fcm/send/example")).toBe(true);
    expect(isTrustedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example")).toBe(true);
    for (const url of ["http://localhost/", "https://127.0.0.1/", "https://fcm.googleapis.com.evil.org/",
      "https://user@web.push.apple.com/", "https://evil.org/push", "https://web.push.apple.com:444/"]) {
      expect(isTrustedPushEndpoint(url)).toBe(false);
    }
  });

  it("validates the browser subscription keys", () => {
    const receiver = createECDH("prime256v1"); receiver.generateKeys();
    const good = { endpoint: "https://web.push.apple.com/abc", keys: {
      p256dh: receiver.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url"),
    }};
    expect(isValidSubscription(good)).toBe(true);
    expect(isValidSubscription({ ...good, endpoint: "https://127.0.0.1/" })).toBe(false);
    expect(isValidSubscription({ ...good, keys: { ...good.keys, auth: "abc" } })).toBe(false);
  });

  it("produces a decryptable RFC 8291 aes128gcm push record", () => {
    const receiver = createECDH("prime256v1"); receiver.generateKeys();
    const auth = randomBytes(16);
    const keys = { p256dh: receiver.getPublicKey().toString("base64url"), auth: auth.toString("base64url") };
    const encrypted = encryptWebPush(keys, JSON.stringify({ kind: "TEST", url: "/admin/notifications" }));
    expect(encrypted.readUInt32BE(16)).toBe(4096);
    const pub = encrypted.subarray(21, 21 + encrypted[20]);
    const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, size: number) =>
      Buffer.from(hkdfSync("sha256", ikm, salt, info, size));
    const ikm = hkdf(receiver.computeSecret(pub), auth, Buffer.concat([
      Buffer.from("WebPush: info\0"), receiver.getPublicKey(), pub,
    ]), 32);
    const cek = hkdf(ikm, encrypted.subarray(0, 16), Buffer.from("Content-Encoding: aes128gcm\0"), 16);
    const nonce = hkdf(ikm, encrypted.subarray(0, 16), Buffer.from("Content-Encoding: nonce\0"), 12);
    const body = encrypted.subarray(21 + pub.length);
    const d = createDecipheriv("aes-128-gcm", cek, nonce);
    d.setAuthTag(body.subarray(-16));
    const plaintext = Buffer.concat([d.update(body.subarray(0, -16)), d.final()]);
    expect(plaintext.at(-1)).toBe(2);
    expect(JSON.parse(plaintext.subarray(0, -1).toString("utf8")).kind).toBe("TEST");
  });

  it("signs a scoped ES256 VAPID token without exposing its private key", () => {
    const issuer = createECDH("prime256v1"); issuer.generateKeys();
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = issuer.getPublicKey().toString("base64url");
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = issuer.getPrivateKey().toString("base64url");
    expect(vapidPublicKey()).toBe(process.env.WEB_PUSH_VAPID_PUBLIC_KEY);
    const auth = vapidAuthorization("https://web.push.apple.com/xyz");
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(auth);
    expect(match).not.toBeNull();
    const [header, claims, signature] = match![1].split(".");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString()).aud).toBe("https://web.push.apple.com");
    const point = issuer.getPublicKey();
    const pub = createPublicKey({ key: {
      kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"),
      y: point.subarray(33).toString("base64url"),
    }, format: "jwk" });
    expect(verify("sha256", Buffer.from(header + "." + claims),
      { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
  });
});
