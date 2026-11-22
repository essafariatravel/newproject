#!/usr/bin/env python3
"""ESSAFARIA VISA OS — zero-cloud-API passport OCR worker.

Requires locally installed Tesseract OCR (English) and Poppler pdftoppm.
Fetches only undetermined China passports from a PRIVATE HMAC-protected API.
Never stores passport files, OCR text, or customer identities to disk after
processing. Run on a trusted workstation/server with encrypted local disk.

Configuration via environment (never commit secrets):
  VISA_OS_URL=https://<preview-host>
  VFS_CHINA_OCR_HMAC_SECRET=<same value configured in Preview>
  VFS_CHINA_OCR_MAX_DOCS=10
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROUTE = "/api/integrations/vfs-china/ocr"
MAX_FILE = 2 * 1024 * 1024
MAX_TEXT = 80_000
API_TIMEOUT = 30

def request(method: str, path: str, payload: dict | None = None) -> tuple[bytes, str]:
    root = os.environ.get("VISA_OS_URL", "").rstrip("/")
    secret = os.environ.get("VFS_CHINA_OCR_HMAC_SECRET", "")
    if not root.startswith("https://") or len(secret) < 40 or urlsplit(root).path not in ("", "/"):
        raise RuntimeError("Missing approved HTTPS portal origin or HMAC secret")
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8") if payload is not None else b""
    timestamp = str(int(time.time() * 1000))
    canonical = f"{timestamp}\n{method}\n{path}\n{base64.b64encode(body).decode('ascii')}"
    signature = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    headers = {
        "x-vfs-timestamp": timestamp,
        "x-vfs-signature": signature,
        "Content-Type": "application/json" if method == "POST" else "application/octet-stream",
    }
    # Short-lived OIDC token from `vercel env run --`; no SSO/Preview protection disabled.
    oidc_token = os.environ.get("VERCEL_OIDC_TOKEN", "").strip()
    if oidc_token:
        headers["x-vercel-trusted-oidc-idp-token"] = oidc_token
    req = Request(root + path, data=body if method == "POST" else None, method=method, headers=headers)
    with urlopen(req, timeout=API_TIMEOUT) as response:
        data = response.read(MAX_FILE + 200_000)
        if len(data) > MAX_FILE + 150_000:
            raise RuntimeError("OCR response over limit")
        mime = response.headers.get("Content-Type", "")
        if urlsplit(response.geturl()).netloc != urlsplit(root).netloc:
            raise RuntimeError("Unexpected OCR endpoint redirect (check Vercel Authentication)")
        if (method == "POST" or path == ROUTE + "?action=queue") and "application/json" not in mime.lower():
            raise RuntimeError("OCR endpoint returned non-JSON content (check Vercel Authentication)")
        return data, mime


def _run(command: list[str], timeout: int = 60) -> str:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode != 0:
        # Never include Tesseract stderr, which can contain file names.
        raise RuntimeError("OCR tool returned a nonzero exit code")
    return result.stdout


def ocr_document(binary: bytes, mime: str) -> str:
    if not binary or len(binary) > MAX_FILE:
        raise RuntimeError("Invalid or oversized passport document")
    if mime == "application/pdf" and not binary.startswith(b"%PDF-"):
        raise RuntimeError("PDF magic bytes mismatch")
    if mime == "image/png" and not binary.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("PNG magic bytes mismatch")
    if mime == "image/jpeg" and not binary.startswith(b"\xff\xd8\xff"):
        raise RuntimeError("JPEG magic bytes mismatch")
    if mime not in ("image/jpeg", "image/png", "image/webp", "application/pdf"):
        raise RuntimeError("Unsupported passport file type")

    suffix = {
        "application/pdf": ".pdf", "image/jpeg": ".jpg",
        "image/png": ".png", "image/webp": ".webp"
    }[mime]
    with tempfile.TemporaryDirectory(prefix="visaos-ocr-") as temp:
        source = Path(temp) / ("passport" + suffix)
        source.write_bytes(binary)
        if mime == "application/pdf":
            # One passport scan usually occupies a single page. Bound CPU to 2.
            images = Path(temp) / "page"
            _run(["pdftoppm", "-f", "1", "-l", "2", "-r", "250", "-png",
                  str(source), str(images)], timeout=80)
            pages = sorted(Path(temp).glob("page-*.png"))
            if not pages:
                raise RuntimeError("No rasterized passport page")
        else:
            pages = [source]
        output = []
        for page in pages[:2]:
            for psm in ("6", "11"):
                text = _run(["tesseract", str(page), "stdout", "-l", "eng", "--psm", psm], timeout=60)
                if text.strip():
                    output.append(text[:40_000])
        return "\n".join(output)[:MAX_TEXT]


def main() -> int:
    try:
        raw, _ = request("GET", ROUTE + "?action=queue")
        queue = json.loads(raw.decode("utf-8")).get("documents", [])
        if not isinstance(queue, list):
            raise RuntimeError("Invalid OCR queue")
        maximum = max(1, min(30, int(os.environ.get("VFS_CHINA_OCR_MAX_DOCS", "10"))))
        counters = {"recorded": 0, "review": 0, "error": 0}
        for item in queue[:maximum]:
            stage = "download"
            try:
                identifier = str(item["id"])
                if len(identifier) != 36:
                    raise RuntimeError("Invalid document identifier")
                path = ROUTE + "?action=file&documentId=" + quote(identifier, safe="")
                binary, mime = request("GET", path)
                mime = mime.split(";", 1)[0].strip().lower()
                stage = "local-ocr"
                text = ocr_document(binary, mime)
                if len(text) < 10:
                    counters["review"] += 1
                    continue
                stage = "submit-result"
                response, _ = request("POST", ROUTE, {
                    "documentId": identifier, "ocrText": text,
                    "extractorVersion": "tesseract-local-v1",
                })
                outcome = json.loads(response.decode("utf-8")).get("outcome")
                if outcome in ("RECORDED", "UNCHANGED"):
                    counters["recorded"] += 1
                else:
                    counters["review"] += 1
            except (ValueError, KeyError, HTTPError, URLError, RuntimeError, subprocess.TimeoutExpired) as exc:
                counters["error"] += 1
                # Never print document IDs, OCR text, MRZ, secret headers or HTTP bodies.
                # Only report the failed phase, exception class, and HTTP status.
                if isinstance(exc, HTTPError):
                    print(f"OCR diagnostic: stage={stage}, type=HTTPError, status={exc.code}", file=sys.stderr)
                else:
                    print(f"OCR diagnostic: stage={stage}, type={type(exc).__name__}", file=sys.stderr)
        print("OCR summary:", json.dumps(counters, sort_keys=True))
        return 0 if counters["error"] == 0 else 1
    except (HTTPError, URLError, RuntimeError, ValueError, KeyError) as exc:
        # No payloads, names, passport numbers, attachment contents or secrets.
        print("OCR worker unavailable:", type(exc).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
