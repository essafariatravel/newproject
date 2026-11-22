/**
 * ESSAFARIA VISA OS — owner-installed Apps Script for the Gmail alias.
 *
 * Setup by the mailbox owner (not automatic from the ChatGPT connection):
 * 1) Create Apps Script in the account receiving visa@essafariavoyages.com.
 * 2) Enable Advanced Google Service "Drive API" (v3). Authorize Gmail,
 *    Drive/Docs and outbound HTTPS for text-layer extraction.
 * 3) Add Script properties: VISA_OS_URL (Preview URL without trailing slash),
 *    VFS_CHINA_MAIL_HMAC_SECRET (shared 40+ char secret, never in source code).
 * 4) Run manual Preview-only acceptance tests with the one-message limit.
 * 5) Enable an hourly trigger only after operator approval. Keep auto decisions OFF.
 *
 * The PDF is temporarily converted to a Google Doc, read and immediately
 * permanently deleted. This uses Google Drive processing; it does not send a passport.
 * The original Gmail messages are never moved, deleted or marked read.
 */
// Hard safety boundary: this script can never send certificates to Production.
const VFS_CHINA_APPROVED_ORIGIN =
  "https://newproject-git-feature-vfs-c-72c740-essafaria-travel-s-projects.vercel.app";
const VFS_CHINA_MAX_MESSAGES_PER_RUN = 1;
const VFS_CHINA_MAX_THREADS_PER_RUN = 1;

const VFS_CHINA_QUERY =
  'to:visa@essafariavoyages.com from:service@visaforchina.org ' +
  'subject:"Online review completed" has:attachment newer_than:30d';

function strictVfsHeaders_(message) {
  const raw = String(message.getRawContent() || "");
  // Parse only the RFC 822 header section; never match a forged body excerpt.
  const headerBlock = raw.substring(0, 24000).split("\r\n\r\n")[0].split("\n\n")[0];
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const results = unfolded.match(/^Authentication-Results:[^\r\n]*$/gim) || [];
  const googleVerified = results.some(line =>
    /^Authentication-Results:\s*mx\.google\.com\s*;/i.test(line) &&
    /\bdmarc=pass\b/i.test(line) &&
    /\bheader\.from=visaforchina\.org\b/i.test(line));
  return googleVerified;
}

/**
 * Safe first authorization test. Checks basic Gmail message headers only.
 * No getRawContent(), no attachment/PDF access, no Drive and no HTTP requests.
 * Aggregated counts only, no message IDs or applicant information.
 */
function runVfsChinaPreflight() {
  const counts = { threads: 0, messagesScanned: 0, metadataMatches: 0 };
  const threads = GmailApp.search(VFS_CHINA_QUERY, 0, 10);
  counts.threads = threads.length;
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      counts.messagesScanned++;
      const sender = String(message.getFrom() || "");
      const recipients = String(message.getTo() || "");
      const title = String(message.getSubject() || "");
      if (/service@visaforchina\.org/i.test(sender) &&
          /visa@essafariavoyages\.com/i.test(recipients) &&
          /^Online review completed\b/i.test(title)) counts.metadataMatches++;
    }
  }
  console.log("VFS China preflight summary " + JSON.stringify(counts));
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
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return DocumentApp.openById(tempId).getBody().getText().slice(0, 80000); }
      catch (err) { lastError = err; Utilities.sleep(700); }
    }
    throw new Error("Temporary certificate text could not be read");
  } finally {
    if (tempId) {
      // Permanently delete rather than leaving sensitive PDFs in Drive Trash.
      try { Drive.Files.remove(tempId); }
      catch (_error) { throw new Error("Temporary Google document deletion failed"); }
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
  const headers = { "x-vfs-timestamp": timestamp, "x-vfs-signature": hex };
  // Optional, owner-approved Vercel protection bypass for external Apps Script.
  // Keep this secret in Script Properties only; do not create it during preflight.
  const previewBypass = String(PropertiesService.getScriptProperties()
    .getProperty("VFS_CHINA_VERCEL_BYPASS_SECRET") || "");
  if (previewBypass) headers["x-vercel-protection-bypass"] = previewBypass;
  const response = UrlFetchApp.fetch(origin + path, {
    method: "post",
    contentType: "application/json",
    payload: body,
    headers: headers,
    muteHttpExceptions: true,
    followRedirects: false,
  });
  const status = response.getResponseCode();
  if (status !== 200) throw new Error("VISA OS endpoint unavailable (" + status + ")");
  return JSON.parse(response.getContentText());
}

/**
 * PREVIEW-ONLY PILOT.
 * At most one eligible Gmail message per invocation, including its PDF import.
 * A Gmail conversation can contain many messages, so the limit belongs inside
 * the inner message loop, not only in GmailApp.search(..., 0, 1).
 * State is retained for offline/review retries; neither mail nor PDF is logged.
 */
function runVfsChinaSweep() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  const counters = {
    processed: 0, completed: 0, offline: 0, review: 0, error: 0,
  };
  const startedAt = Date.now();

  try {
    const settings = PropertiesService.getScriptProperties();
    const origin = String(settings.getProperty("VISA_OS_URL") || "").replace(/\/+$/, "");
    const secret = String(settings.getProperty("VFS_CHINA_MAIL_HMAC_SECRET") || "");

    if (origin !== VFS_CHINA_APPROVED_ORIGIN) {
      throw new Error("Preview-only policy: destination is not the approved Preview");
    }
    if (secret.length < 40) {
      throw new Error("The dedicated Gmail HMAC secret is missing");
    }

    const threads = GmailApp.search(VFS_CHINA_QUERY, 0, VFS_CHINA_MAX_THREADS_PER_RUN);

    vfsThreadLoop: for (const thread of threads) {
      for (const message of thread.getMessages()) {
        if (counters.processed >= VFS_CHINA_MAX_MESSAGES_PER_RUN) break vfsThreadLoop;
        if (Date.now() - startedAt >= 60000) break vfsThreadLoop;

        const key = "vfs:" + message.getId();
        const cached = String(settings.getProperty(key) || "");
        if (cached === "done") continue;

        // Keep offline/review messages retryable; avoid repeated PDF conversion.
        const temporary = cached.match(/^(offline|review):(\d{13})$/);
        if (temporary && Date.now() - Number(temporary[2]) <
            (temporary[1] === "offline" ? 6 * 3600000 : 30 * 60000)) {
          continue;
        }

        const sender = String(message.getFrom() || "");
        const recipients = String(message.getTo() || "");
        const title = String(message.getSubject() || "");
        if (!/service@visaforchina\.org/i.test(sender) ||
            !/visa@essafariavoyages\.com/i.test(recipients) ||
            !/^Online review completed\b/i.test(title)) {
          continue;
        }

        // Count even a rejected/failed message, so a single call cannot
        // download, convert or transmit more than one candidate certificate.
        counters.processed++;

        try {
          if (!strictVfsHeaders_(message)) {
            counters.review++;
            settings.setProperty(key, "review:" + Date.now());
            continue;
          }

          const body = String(message.getPlainBody() || "").slice(0, 20000);
          const pdfs = message.getAttachments({ includeInlineImages: false })
            .filter(a => /^application\/pdf$/i.test(a.getContentType()) &&
              /^ALG[A-Z0-9]{10,26}\.pdf$/i.test(a.getName()) &&
              a.getSize() > 0 && a.getSize() <= 2 * 1024 * 1024);
          if (pdfs.length !== 1) {
            counters.review++;
            settings.setProperty(key, "review:" + Date.now());
            continue;
          }
          const blob = pdfs[0];
          const text = extractCertificateText_(blob);
          if (!text || text.length < 35) {
            counters.review++;
            settings.setProperty(key, "review:" + Date.now());
            continue;
          }

          const result = hmacPost_("/api/integrations/vfs-china/mail", {
            gmailMessageId: message.getId(),
            from: sender,
            recipients: recipients.split(/[,;]/).map(v => v.trim()),
            subject: title, body,
            pdfFilename: blob.getName(),
            pdfBase64: Utilities.base64Encode(blob.getBytes()),
            certificateText: text,
            gmailDmarcVerified: true,
          }, origin, secret);

          if (["APPROVED", "ALREADY_PROCESSED"].includes(result.outcome)) {
            settings.setProperty(key, "done");
            counters.completed++;
          } else if (result.outcome === "IGNORED_OFFLINE") {
            settings.setProperty(key, "offline:" + Date.now());
            counters.offline++;
          } else {
            settings.setProperty(key, "review:" + Date.now());
            counters.review++;
          }
        } catch (_error) {
          // No personally identifiable data, PDF, headers or secrets in logs.
          counters.error++;
          settings.setProperty(key, "review:" + Date.now());
        }
      }
    }
    console.log("VFS China sweep summary " + JSON.stringify(counters));
  } finally {
    lock.releaseLock();
  }
}

/** Preview-only, metadata-only checks retained for troubleshooting. */
function runVfsChinaAuthCheck() {
  const threads = GmailApp.search(VFS_CHINA_QUERY, 0, 2);
  const result = { candidates: 0, verified: 0, review: 0, errors: 0 };
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      if (!/service@visaforchina\.org/i.test(message.getFrom()) ||
          !/visa@essafariavoyages\.com/i.test(message.getTo()) ||
          !/^Online review completed\b/i.test(message.getSubject())) continue;
      result.candidates++;
      try {
        if (strictVfsHeaders_(message)) result.verified++;
        else result.review++;
      } catch (_) { result.errors++; }
    }
  }
  console.log("VFS China auth check " + JSON.stringify(result));
}

/** One real email's PDF text extraction; does not transmit any data. */
function runVfsChinaPdfPreflight() {
  const threads = GmailApp.search(VFS_CHINA_QUERY, 0, 2);
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      if (!/service@visaforchina\.org/i.test(message.getFrom()) ||
          !/visa@essafariavoyages\.com/i.test(message.getTo()) ||
          !/^Online review completed\b/i.test(message.getSubject()) ||
          !strictVfsHeaders_(message)) continue;
      const pdfs = message.getAttachments({ includeInlineImages: false })
        .filter(file => /^application\/pdf$/i.test(file.getContentType()) &&
          /^ALG[A-Z0-9]{10,26}\.pdf$/i.test(file.getName()) &&
          file.getSize() > 0 && file.getSize() <= 2 * 1024 * 1024);
      if (pdfs.length !== 1) continue;
      try {
        const text = extractCertificateText_(pdfs[0]);
        console.log("VFS PDF TEST : " + JSON.stringify({
          conversion: "OK", textDetected: text.length >= 35,
          characters: text.length,
        }));
      } catch (_error) {
        console.log("VFS PDF TEST : ERROR");
      }
      return;
    }
  }
  console.log("VFS PDF TEST : NO_ELIGIBLE_PDF");
}

/** Checks the presence of certificate/form/passport fields; logs booleans only. */
function runVfsChinaFieldsCheck() {
  const threads = GmailApp.search(VFS_CHINA_QUERY, 0, 2);
  function uniqueField(text, regex) {
    const values = Array.from(text.matchAll(regex), m =>
      String(m[1] || "").replace(/\s+/g, "").toUpperCase());
    return values.length > 0 && new Set(values).size === 1;
  }
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      if (!/service@visaforchina\.org/i.test(message.getFrom()) ||
          !/visa@essafariavoyages\.com/i.test(message.getTo()) ||
          !/^Online review completed\b/i.test(message.getSubject()) ||
          !strictVfsHeaders_(message)) continue;
      const pdfs = message.getAttachments({ includeInlineImages: false })
        .filter(file => /^application\/pdf$/i.test(file.getContentType()) &&
          /^ALG[A-Z0-9]{10,26}\.pdf$/i.test(file.getName()) &&
          file.getSize() > 0 && file.getSize() <= 2 * 1024 * 1024);
      if (pdfs.length !== 1) continue;

      const text = extractCertificateText_(pdfs[0]);
      const result = {
        certificateNo: uniqueField(text,
          /(?:Certificate\s*No\.|凭证号码)\s*[:：]?\s*(ALG[A-Z0-9]{10,26})/gi),
        applicationFormNo: uniqueField(text,
          /(?:Application\s*Form\s*No\.|申请表编号)\s*[:：]?\s*([0-9]{12,24})/gi),
        passportNo: uniqueField(text,
          /(?:Passport\s*No\.|护照号码)\s*[:：]?\s*([A-Z0-9]{5,16})/gi),
      };
      console.log("VFS FIELDS CHECK : " + JSON.stringify(result));
      return;
    }
  }
  console.log("VFS FIELDS CHECK : NO_ELIGIBLE_PDF");
}

/** Synthetic HMAC test. Never sends a real email or a real PDF. */
function runVfsChinaMailHmacProbe() {
  const settings = PropertiesService.getScriptProperties();
  const origin = String(settings.getProperty("VISA_OS_URL") || "").replace(/\/+$/, "");
  const secret = String(settings.getProperty("VFS_CHINA_MAIL_HMAC_SECRET") || "");
  if (origin !== VFS_CHINA_APPROVED_ORIGIN || secret.length < 40) {
    throw new Error("Preview URL or Gmail HMAC secret not configured");
  }
  const fakePdf = "NOT_A_REAL_PDF_TEST_ONLY_" + "X".repeat(180);
  const result = hmacPost_("/api/integrations/vfs-china/mail", {
    gmailMessageId: "VFS_TEST_ONLY_20261122_01",
    from: "service@visaforchina.org",
    recipients: ["visa@essafariavoyages.com"],
    subject: "Online review completed - TEST ONLY",
    body: "TEST ONLY - no personal data",
    pdfFilename: "ALGTEST1234567890.pdf",
    pdfBase64: Utilities.base64Encode(Utilities.newBlob(fakePdf).getBytes()),
    certificateText: "TEST ONLY - NO REAL VFS CERTIFICATE OR PASSPORT DATA",
    gmailDmarcVerified: true,
  }, origin, secret);
  console.log("VFS HMAC PROBE: " + JSON.stringify({ outcome: result.outcome }));
  if (result.outcome !== "REVIEW_REQUIRED") {
    throw new Error("Unexpected HMAC test outcome");
  }
}
