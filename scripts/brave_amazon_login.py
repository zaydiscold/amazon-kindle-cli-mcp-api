#!/usr/bin/env python3
"""Drive Amazon login on Brave CDP :9333, then dump amazon cookies to ~/.amazon/auth.sh.

Usage:
  python brave_amazon_login.py              # navigate to sign-in, wait for manual OTP
  python brave_amazon_login.py --email X --password Y
  python brave_amazon_login.py --otp 123456
  python brave_amazon_login.py --cookies-only
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

CDP = os.environ.get("BRAVE_CDP", "http://127.0.0.1:9333")


def get_browser():
    from playwright.sync_api import sync_playwright

    p = sync_playwright().start()
    browser = p.chromium.connect_over_cdp(CDP)
    return p, browser


def pick_page(browser):
    for ctx in browser.contexts:
        for page in ctx.pages:
            if "amazon." in (page.url or ""):
                return ctx, page
    ctx = browser.contexts[0] if browser.contexts else browser.new_context()
    page = ctx.new_page()
    page.goto("https://www.amazon.com/", wait_until="domcontentloaded", timeout=60000)
    return ctx, page


def cookies_for_product_origin(ctx):
    """Return only cookies a browser would send to the Amazon product origin."""
    return ctx.cookies("https://www.amazon.com/")


def dump_cookies(ctx) -> dict:
    cookies = cookies_for_product_origin(ctx)
    amz = [c for c in cookies if "amazon" in (c.get("domain") or "")]
    names = sorted({c["name"] for c in amz})
    header = "; ".join(f"{c['name']}={c['value']}" for c in amz)
    out = Path.home() / ".amazon"
    out.mkdir(exist_ok=True)
    safe = header.replace("'", "'\\''")
    (out / "auth.sh").write_text(
        "# Amazon buyer session via Brave CDP\n"
        f"# extracted {time.strftime('%Y-%m-%dT%H:%M:%S')}\n"
        f"export AMAZON_COOKIE='{safe}'\n"
        "export AMAZON_DOMAIN=www.amazon.com\n",
        encoding="utf-8",
    )
    try:
        os.chmod(out / "auth.sh", 0o600)
    except OSError:
        pass
    (out / "auth.bat").write_text(
        "@echo off\n"
        f'set "AMAZON_COOKIE={header}"\n'
        'set "AMAZON_DOMAIN=www.amazon.com"\n',
        encoding="utf-8",
    )
    meta = {
        "extracted_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "cookie_count": len(amz),
        "cookie_names": names,
        "source": "brave_cdp_9333",
        "critical": {
            n: n in set(names)
            for n in (
                "session-id",
                "at-main",
                "x-main",
                "ubid-main",
                "sess-at-main",
                "session-token",
            )
        },
    }
    (out / "session-meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("cookies", len(amz))
    print("critical", meta["critical"])
    print("auth", out / "auth.sh")
    return meta


def signed_in(page) -> bool:
    try:
        txt = page.locator("#nav-link-accountList-nav-line-1").inner_text(timeout=3000)
        return "sign in" not in txt.lower() and "hello" in txt.lower()
    except Exception:
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email")
    ap.add_argument("--password")
    ap.add_argument("--otp")
    ap.add_argument("--cookies-only", action="store_true")
    ap.add_argument("--goto-signin", action="store_true")
    args = ap.parse_args()

    p, browser = get_browser()
    try:
        ctx, page = pick_page(browser)
        print("url", page.url)
        print("title", page.title())

        if args.cookies_only:
            dump_cookies(ctx)
            return 0

        if signed_in(page):
            print("already_signed_in")
            dump_cookies(ctx)
            return 0

        if args.goto_signin or args.email:
            page.goto(
                "https://www.amazon.com/ap/signin?openid.pape.max_auth_age=0"
                "&openid.return_to=https%3A%2F%2Fwww.amazon.com%2F"
                "&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select"
                "&openid.assoc_handle=usflex&openid.mode=checkid_setup"
                "&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select"
                "&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0",
                wait_until="domcontentloaded",
                timeout=60000,
            )
            print("signin_url", page.url)

        if args.email:
            # email step
            email = page.locator('input[name="email"], input#ap_email, input[type="email"]')
            email.first.wait_for(timeout=15000)
            email.first.fill(args.email)
            page.locator('input#continue, button#continue, input[type="submit"]').first.click()
            page.wait_for_timeout(2000)
            print("after_email", page.url, page.title())

        if args.password:
            # dismiss passkey if any
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            pw = page.locator('input[name="password"], input#ap_password, input[type="password"]')
            pw.first.wait_for(timeout=15000)
            pw.first.fill(args.password)
            page.locator('input#signInSubmit, button#signInSubmit, input[type="submit"]').first.click()
            page.wait_for_timeout(3000)
            print("after_password", page.url, page.title())

        if args.otp:
            code = page.locator('input[name="otpCode"], input#auth-mfa-otpcode, input[type="tel"], input[name="code"]')
            code.first.wait_for(timeout=15000)
            code.first.fill(args.otp)
            # don't require checkbox
            try:
                box = page.locator('input[name="rememberDevice"], input#auth-mfa-remember-device')
                if box.count() and not box.first.is_checked():
                    box.first.check()
            except Exception:
                pass
            page.locator('input#auth-signin-button, input[type="submit"], button[type="submit"]').first.click()
            page.wait_for_timeout(4000)
            # dismiss passkey save
            try:
                page.keyboard.press("Escape")
                page.get_by_role("button", name="Cancel").click(timeout=2000)
            except Exception:
                pass
            print("after_otp", page.url, page.title())

        if signed_in(page):
            print("signed_in_ok")
            dump_cookies(ctx)
            return 0

        print("awaiting_manual_or_otp")
        print("page", page.url, page.title())
        # still dump whatever cookies we have
        dump_cookies(ctx)
        return 1
    finally:
        browser.close()
        p.stop()


if __name__ == "__main__":
    raise SystemExit(main())
