#!/usr/bin/env python3
"""Browser-backed Send-to-Kindle uploader.

Uses the dedicated Brave CDP profile (localhost:9333). This path intentionally
uses Amazon's own UI, so it survives private upload API changes.

stdout: one JSON object. stderr: diagnostics only. It never prints cookies.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--no-archive", action="store_true")
    ap.add_argument("--cdp", default="http://127.0.0.1:9333")
    args = ap.parse_args()

    files = [str(Path(f).resolve()) for f in args.files]
    missing = [f for f in files if not Path(f).is_file()]
    if missing:
        print(json.dumps({"ok": False, "error": "missing files", "files": missing}))
        return 2

    plan = {
        "via": "browser",
        "cdp": args.cdp,
        "files": [{"path": f, "bytes": Path(f).stat().st_size} for f in files],
        "archive": not args.no_archive,
        "execute": args.execute,
        "route": "Brave CDP → amazon.com/sendtokindle → Select files → Send",
    }
    if not args.execute:
        print(json.dumps({"ok": True, "submitted": False, "plan": plan}))
        return 0

    from playwright.sync_api import sync_playwright

    p = sync_playwright().start()
    browser = p.chromium.connect_over_cdp(args.cdp)
    try:
        context = browser.contexts[0]
        page = context.new_page()
        page.goto("https://www.amazon.com/sendtokindle", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2000)

        chooser_button = page.get_by_text("Select files from device", exact=False).first
        with page.expect_file_chooser(timeout=15000) as chosen:
            chooser_button.click()
        chosen.value.set_files(files)
        page.wait_for_timeout(1500)

        # Amazon defaults archive on. Make intent explicit when checkbox exists.
        if args.no_archive:
            for sel in ["input[type=checkbox]", "[role=checkbox]"]:
                boxes = page.locator(sel)
                for i in range(boxes.count()):
                    box = boxes.nth(i)
                    try:
                        nearby = box.evaluate("e => e.parentElement?.innerText || ''")
                        if "Add to your library" in nearby and box.is_checked():
                            box.uncheck()
                    except Exception:
                        pass

        send = page.get_by_role("button", name="Send", exact=True)
        if send.count() == 0:
            send = page.locator('button:has-text("Send")').last
        send.click()
        page.wait_for_timeout(6000)

        # Amazon's conversion is async; recent-docs is the durable receipt.
        recent = context.request.get("https://www.amazon.com/sendtokindle/recent-docs")
        docs = recent.json() if recent.ok else []
        names = {Path(f).name for f in files}
        receipts = [d for d in docs if d.get("filename") in names]
        print(json.dumps({
            "ok": True,
            "submitted": True,
            "plan": plan,
            "receipts": receipts,
            "mutationVerified": any(d.get("status") in {"IN_LIBRARY", "COMPLETE"} for d in receipts),
            "verificationRequired": "If receipt is IN_PROGRESS, poll `kindle recent` until IN_LIBRARY/COMPLETE.",
        }))
        return 0
    finally:
        browser.close()
        p.stop()


if __name__ == "__main__":
    raise SystemExit(main())
