#!/usr/bin/env python3
"""One-shot, synthetic VFS China mail-matching test on a fixed Preview host.

No Gmail access, no real passport/certificate, no PDF saved to disk.
The server must have VFS_CHINA_AUTO_DECISION_ENABLED=false.
The test account uses a fictional MRZ passport and a fictional VFS form number.
Obtain the independent Gmail HMAC key from the Windows encrypted local file,
not from the repository or terminal output.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

PREVIEW = "https://newproject-git-feature-vfs-c-72c740-essafaria-travel-s-projects.vercel.app"
ROUTE = "/api/integrations/vfs-china/mail"
FORM = "202611220000000001"
CERT = "ALGTEST20261122001"
PASSPORT = "L898902C3"  # fictional ICAO MRZ specimen, NOT client data


def build_synthetic_pdf() -> bytes:
    """Construct a valid one-page PDF in memory, using Python stdlib only."""
    lines = (
        "SYNTHETIC TEST ONLY - NOT AN OFFICIAL VFS CERTIFICATE",
        "Certificate No. " + CERT,
        "Application Form No. " + FORM,
        "Passport No. " + PASSPORT,
    )
    instructions = ["BT", "/F1 11 Tf", "55 740 Td"]
    for i, line in enumerate(lines):
        if i:
            instructions.append("0 -24 Td")
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        instructions.append("(" + safe + ") Tj")
    instructions.append("ET")
    stream = ("\n".join(instructions) + "\n").encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(str(index).encode() + b" 0 obj\n" + obj + b"\nendobj\n")
    xref_start = len(output)
    output.extend(("xref\n0 " + str(len(objects) + 1) + "\n").encode())
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(("%010d 00000 n \n" % offset).encode())
    output.extend(
        ("trailer\n<< /Size " + str(len(objects) + 1) +
         " /Root 1 0 R >>\nstartxref\n" + str(xref_start) +
         "\n%%EOF\n").encode()
    )
    return bytes(output)


def main() -> int:
    key = os.environ.get("VFS_CHINA_MAIL_HMAC_SECRET", "")
    if len(key) < 40:
        print("TEST ABORTED: Gmail HMAC secret missing", file=sys.stderr)
        return 2
    if os.environ.get("VISA_OS_URL", PREVIEW).rstrip("/") != PREVIEW:
        print("TEST ABORTED: this test is strictly Preview-only", file=sys.stderr)
        return 2
    if not os.environ.get("VERCEL_OIDC_TOKEN"):
        print("TEST ABORTED: Vercel OIDC token missing; use vercel.cmd env run", file=sys.stderr)
        return 2

    pdf = build_synthetic_pdf()
    payload = {
        "gmailMessageId": "PREVIEWDRYRUN_" + str(int(time.time())) + "_" + secrets.token_hex(4),
        "from": "service@visaforchina.org",
        "recipients": ["visa@essafariavoyages.com"],
        "subject": "Online review completed - PREVIEW TEST ONLY",
        "body": (
            "Your Application " + CERT +
            " has completed the online review. PREVIEW SYNTHETIC TEST ONLY."
        ),
        "pdfFilename": CERT + ".pdf",
        "pdfBase64": base64.b64encode(pdf).decode("ascii"),
        "certificateText": (
            "Certificate No. " + CERT + "\n" +
            "Application Form No. " + FORM + "\n" +
            "Passport No. " + PASSPORT + "\n"
        ),
        "gmailDmarcVerified": True,
    }
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    timestamp = str(int(time.time() * 1000))
    canonical = (
        timestamp + "\nPOST\n" + ROUTE + "\n" +
        base64.b64encode(body).decode("ascii")
    ).encode("utf-8")
    signature = hmac.new(key.encode("utf-8"), canonical, hashlib.sha256).hexdigest()

    req = Request(
        PREVIEW + ROUTE, data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "x-vfs-timestamp": timestamp,
            "x-vfs-signature": signature,
            "x-vercel-trusted-oidc-idp-token": os.environ["VERCEL_OIDC_TOKEN"],
        },
    )
    try:
        with urlopen(req, timeout=30) as response:
            if urlsplit(response.geturl()).netloc != urlsplit(PREVIEW).netloc:
                raise ValueError("Unexpected redirect")
            if "application/json" not in response.headers.get("Content-Type", "").lower():
                raise ValueError("Non-JSON response; Vercel authentication may be blocking")
            result = json.loads(response.read(4096).decode("utf-8"))
    except HTTPError as exc:
        print("MATCH TEST: API HTTP", exc.code, file=sys.stderr)
        return 1
    except (URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print("MATCH TEST: transport or validation failure:", type(exc).__name__, file=sys.stderr)
        return 1

    outcome = result.get("outcome")
    print("VFS MATCH TEST:", outcome if isinstance(outcome, str) else "INVALID_RESPONSE")
    print("MODE: PREVIEW; SYNTHETIC; NO GMAIL; NO AUTOMATIC DECISION")
    return 0 if outcome == "MATCHED_DRY_RUN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
