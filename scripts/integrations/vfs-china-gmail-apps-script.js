/**
 * ESSAFARIA VISA OS — owner-installed Apps Script for the Gmail alias.
 *
 * Setup by the mailbox owner (not automatic from the ChatGPT connection):
 * 1) Create Apps Script in the account receiving visa@essafariavoyages.com.
 * 2) Enable Advanced Google Service "Drive API" (v3). Authorize Gmail,
 *    Drive/Docs and outbound HTTPS for text-layer extraction.
 * 3) Add Script properties: VISA_OS_URL (Preview URL without trailing slash),
 *    VFS_CHINA_MAIL_HMAC_SECRET (shared 40+ char secret, never in source code).
 * 4) Install a time-driven trigger for runVfsChinaSweep every five minutes.
 * 5) Only enable the Vercel integration flags after Preview acceptance.
 *
 * The PDF is temporarily converted to a Google Doc, read and immediately
 * trashed. This uses Google Drive processing; it does not send a passport.
 * The original Gmail messages are never moved, deleted or marked read.
 */
const VFS_CHINA_QUERY =
  'to:visa@essafariavoyages.com from:service@visaforchina.org ' +
  'subject:"Online review completed" has:attachment newer_than:30d';

function strictVfsHeaders_(message) {
  const raw = String(message.getRawContent() || "");
  // Parse only the RFC 822 header section; never match a forged body excerpt.
  const headerBlock = raw.split(/\r?\n\r?\n/, 1)[0].slice(0, 24_000);
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const results = unfolded.match(/^Authentication-Results:[^\r\n]*$/gim) || [];
  const googleVerified = results.some(line =>
    /^Authentication-Results:\s*mx\.google\.com\s*;/i.test(line) &&
    /\bdmarc=pass\b/i.test(line) &&
    /\bheader\.from=visaforchina\.org\b/i.test(line));
  return googleVerified;
}

function extractCertificateText_(pdfBlob) {
  // Requires the Drive advanced service; Docs conversion uses Google's
  // document OCR/text extraction. No persistent Drive file is retained.
  let tempId = null;
  try {
    const doc = Drive.Files.create({
      name: "VISA_OS_VFS_TEMP_" + Date.now(),
      mimeType: "application/vnd.google-apps.document",
    }, pdfBlob, { fields: "id" });
    tempId = String(doc.id);
    return DocumentApp.openById(tempId).getBody().getText().slice(0, 80_000);
  } finally {
    if (tempId) {
      try { DriveApp.getFileById(tempId).setTrashed(true); }
      catch (_error) { throw new Error("Temporary Google document cleanup failed"); }
    }
  }
}

function hmacPost_(path, input, origin, secret) {
  const body = JSON.stringify(input);
  const timestamp = String(Date.now());
  const canonical = timestamp + "\nPOST\n" + path + "\n" +
    Utilities.base64Encode(Utilities.newBlob(body).getBytes());
  const signature = Utilities.computeHmacSha256Signature(canonical, secret);
  const hex = signature.map(b => ("0" + ((b + 256) % 256).toString(16)).slice(-2)).join("");
  const response = UrlFetchApp.fetch(origin + path, {
    method: "post",
    contentType: "application/json",
    payload: body,
    headers: { "x-vfs-timestamp": timestamp, "x-vfs-signature": hex },
    muteHttpExceptions: true,
    followRedirects: false,
  });
  const status = response.getResponseCode();
  if (status !== 200) throw new Error("VISA OS endpoint unavailable (" + status + ")");
  return JSON.parse(response.getContentText());
}

function runVfsChinaSweep() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10_000)) return;
  const counters = { completed: 0, offline: 0, review: 0, error: 0 };
  try {
    const settings = PropertiesService.getScriptProperties();
    const origin = String(settings.getProperty("VISA_OS_URL") || "").replace(/\/+$/, "");
    const secret = String(settings.getProperty("VFS_CHINA_MAIL_HMAC_SECRET") || "");
    if (!/^https:\/\/[^/]+$/.test(origin) || secret.length < 40)
      throw new Error("Approved HTTPS origin and HMAC secret required");

    const threads = GmailApp.search(VFS_CHINA_QUERY, 0, 25);
    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        const key = "vfs:" + message.getId();
        if (settings.getProperty(key) === "done") continue;
        try {
          const sender = String(message.getFrom() || "");
          const recipients = String(message.getTo() || "");
          const title = String(message.getSubject() || "");
          if (!/service@visaforchina\.org/i.test(sender) ||
              !/visa@essafariavoyages\.com/i.test(recipients) ||
              !/^Online review completed\b/i.test(title)) continue;
          if (!strictVfsHeaders_(message)) { counters.review++; continue; }

          const body = String(message.getPlainBody() || "").slice(0, 20_000);
          const pdfs = message.getAttachments({ includeInlineImages: false })
            .filter(a => /^application\/pdf$/i.test(a.getContentType()) &&
              /^ALG[A-Z0-9]{10,26}\.pdf$/i.test(a.getName()) &&
              a.getSize() > 0 && a.getSize() <= 2 * 1024 * 1024);
          if (pdfs.length !== 1) { counters.review++; continue; }
          const blob = pdfs[0];
          const bytes = blob.getBytes();
          const text = extractCertificateText_(blob);
          if (!text || text.length < 35) { counters.review++; continue; }
          const result = hmacPost_("/api/integrations/vfs-china/mail", {
            gmailMessageId: message.getId(),
            from: sender,
            recipients: recipients.split(/[,;]/).map(v => v.trim()),
            subject: title, body,
            pdfFilename: blob.getName(),
            pdfBase64: Utilities.base64Encode(bytes),
            certificateText: text,
            gmailDmarcVerified: true,
          }, origin, secret);
          if (["APPROVED", "IGNORED_OFFLINE", "ALREADY_PROCESSED"].includes(result.outcome)) {
            // Gmail messages themselves remain untouched; only script cache.
            settings.setProperty(key, "done");
            counters[result.outcome === "IGNORED_OFFLINE" ? "offline" : "completed"]++;
          } else counters.review++;
        } catch (_error) {
          // Do not log the Gmail message, traveler details, certificate or PDF.
          counters.error++;
        }
      }
    }
    console.log("VFS China sweep summary " + JSON.stringify(counters));
  } finally {
    lock.releaseLock();
  }
}
