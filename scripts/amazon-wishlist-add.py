#!/usr/bin/env python3
"""Browser-backed Amazon wishlist add by ASIN or search query.

Guarded: no mutation unless --execute. Uses Brave CDP :9333, the durable
Amazon debug profile. It is intentionally UI-backed until Amazon's list-add
mutation is captured and independently replay-tested.
"""
from __future__ import annotations
import argparse, json, urllib.parse


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--asin")
    ap.add_argument("--query")
    ap.add_argument("--list-name", default="Shopping List")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--cdp", default="http://127.0.0.1:9333")
    args = ap.parse_args()
    if not args.asin and not args.query:
        ap.error("--asin or --query required")
    url = f"https://www.amazon.com/dp/{args.asin}" if args.asin else "https://www.amazon.com/s?k=" + urllib.parse.quote(args.query)
    plan = {"via":"browser", "url":url, "listName":args.list_name, "execute":args.execute}
    if not args.execute:
        print(json.dumps({"ok":True,"submitted":False,"plan":plan}))
        return 0

    from playwright.sync_api import sync_playwright
    p=sync_playwright().start(); b=p.chromium.connect_over_cdp(args.cdp)
    try:
        ctx=b.contexts[0]; page=ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(1500)
        # If search result, open first product; if product page, use direct list button.
        if not args.asin:
            product=page.locator('a[href*="/dp/"]').filter(has_text="").first
            product.click(); page.wait_for_timeout(1500)
        # Amazon variant buttons can be "Add to List", "Add to Wish List", or list popover trigger.
        choices=[
            page.get_by_role("button", name="Add to List", exact=False),
            page.get_by_text("Add to List", exact=False),
            page.get_by_text("Add to Wish List", exact=False),
        ]
        clicked=False
        for c in choices:
            try:
                if c.count() and c.first.is_visible():
                    c.first.click(); clicked=True; break
            except Exception: pass
        if not clicked:
            print(json.dumps({"ok":False,"submitted":False,"plan":plan,"error":"Add to List control not found; product variant/UI changed"}))
            return 1
        page.wait_for_timeout(1000)
        target=page.get_by_text(args.list_name, exact=True)
        if target.count() and target.first.is_visible():
            target.first.click(); page.wait_for_timeout(2000)
            print(json.dumps({"ok":True,"submitted":True,"plan":plan,"mutationVerified":False,"verificationRequired":"Run wishlist list and confirm ASIN appears."}))
            return 0
        print(json.dumps({"ok":False,"submitted":False,"plan":plan,"error":f"List {args.list_name!r} not found in picker"}))
        return 1
    finally:
        b.close(); p.stop()

if __name__=="__main__": raise SystemExit(main())
