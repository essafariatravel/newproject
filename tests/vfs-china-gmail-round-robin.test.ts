import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/integrations/vfs-china-gmail-apps-script.js", "utf8");
const origin = "https://newproject-git-feature-vfs-c-72c740-essafaria-travel-s-projects.vercel.app";

function harness(destination = origin) {
  const properties = new Map<string, string>([
    ["VISA_OS_URL", destination],
    ["VFS_CHINA_MAIL_HMAC_SECRET", "SYNTHETIC_TEST_SECRET_".repeat(4)],
  ]);
  const logs: string[] = [];
  let now = Date.parse("2026-11-23T10:00:00.000Z");
  let conversions = 0;
  let requests = 0;
  let searchedThreads = 0;
  const makeMessage = (id: string) => ({
    getId: () => id,
    getFrom: () => "VFS <service@visaforchina.org>",
    getTo: () => "visa@essafariavoyages.com",
    getSubject: () => "Online review completed / 线上审核完成",
    getRawContent: () =>
      "Authentication-Results: mx.google.com; dmarc=pass header.from=visaforchina.org\r\n\r\nbody",
    getPlainBody: () => "Your Application ALG123456789000 has completed the online review",
    getAttachments: () => {
      conversions++;
      return [{
        getContentType: () => "application/pdf",
        getName: () => "ALG123456789000.pdf",
        getSize: () => 300,
        getBytes: () => [37, 80, 68, 70],
      }];
    },
  });
  // Three certificates in one conversation; another in a second conversation.
  const messages = ["A", "B", "C", "D"].map((id) => makeMessage("testMessage_" + id));
  const threads = [
    { getMessages: () => messages.slice(0, 3) },
    { getMessages: () => messages.slice(3) },
  ];
  const context = createContext({
    GmailApp: { search: (_query: string, start: number, limit: number) => {
      expect(start).toBe(0);
      expect(limit).toBe(25);
      searchedThreads++;
      return threads;
    } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key: string) => properties.get(key),
      setProperty: (key: string, value: string) => properties.set(key, value),
    }) },
    Date: class extends Date { static now() { return now; } },
    console: { log: (value: string) => logs.push(value) },
    Utilities: { base64Encode: () => "AAAA" },
  });
  runInContext(script, context);
  context.extractCertificateText_ = () => "TEST CERTIFICATE TEXT WITH MORE THAN THIRTY FIVE CHARACTERS";
  context.hmacPost_ = () => { requests++; return { outcome: "IGNORED_OFFLINE" }; };
  return {
    properties, messages, logs,
    execute: () => runInContext("runVfsChinaSweep()", context),
    advanceHours: (hours: number) => { now += hours * 3600_000; },
    metrics: () => ({ conversions, requests, searchedThreads }),
  };
}

describe("VFS China Gmail runner — Preview round-robin safety", () => {
  it("visits all conversations before retrying the first offline certificate", () => {
    const run = harness();
    for (const message of run.messages) {
      run.advanceHours(7); // All previous offline messages are eligible again.
      run.execute();
      expect(run.properties.get("VFS_CHINA_LAST_SCANNED_MESSAGE_ID")).toBe(message.getId());
      expect(run.logs.at(-1)).toContain('"processed":1');
      expect(run.logs.at(-1)).toContain('"offline":1');
    }
    expect(run.metrics()).toEqual({ conversions: 4, requests: 4, searchedThreads: 4 });
    run.execute();
    expect(run.properties.get("VFS_CHINA_LAST_SCANNED_MESSAGE_ID")).toBe("testMessage_A");
  });

  it("never processes more than one candidate in one sweep", () => {
    const run = harness();
    run.execute();
    expect(run.metrics().conversions).toBe(1);
    expect(run.metrics().requests).toBe(1);
    run.execute(); // First certificate is in cooldown; next is selected.
    expect(run.properties.get("VFS_CHINA_LAST_SCANNED_MESSAGE_ID")).toBe("testMessage_B");
    expect(run.metrics().conversions).toBe(2);
    expect(run.metrics().requests).toBe(2);
  });

  it("refuses a non-Preview target before reading Gmail or sending data", () => {
    const run = harness("https://visa.essafariavoyages.com");
    expect(run.execute).toThrow(/Preview-only policy/);
    expect(run.metrics()).toEqual({ conversions: 0, requests: 0, searchedThreads: 0 });
  });
});
