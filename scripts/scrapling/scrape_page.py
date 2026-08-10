#!/usr/bin/env python3
"""Scrape a single public webpage with Scrapling and emit JSON on stdout.

Input (argv[1] or --url): absolute http(s) URL, already SSRF-checked by the
Node caller. Output: {"url","finalUrl","title","html","text","status"}.
"""

from __future__ import annotations

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape one page with Scrapling")
    parser.add_argument("url", nargs="?", help="Page URL")
    parser.add_argument("--url", dest="url_flag", help="Page URL (flag form)")
    parser.add_argument(
        "--stealth",
        action="store_true",
        help="Use StealthyFetcher (browser) instead of HTTP Fetcher",
    )
    args = parser.parse_args()
    url = (args.url_flag or args.url or "").strip()
    if not url:
        print(json.dumps({"error": "Missing URL"}))
        return 2

    try:
        from scrapling.fetchers import Fetcher
    except ImportError as exc:
        print(
            json.dumps(
                {
                    "error": (
                        "Scrapling is not installed. From the repo root run: "
                        "scripts/scrapling/.venv/bin/pip install -r "
                        "scripts/scrapling/requirements.txt"
                    ),
                    "detail": str(exc),
                }
            )
        )
        return 1

    try:
        if args.stealth:
            try:
                from scrapling.fetchers import StealthyFetcher
            except ImportError:
                print(
                    json.dumps(
                        {
                            "error": (
                                "StealthyFetcher requires scrapling[fetchers] + "
                                "`scrapling install`. Or unset WEBPAGE_STEALTH."
                            )
                        }
                    )
                )
                return 1
            StealthyFetcher.adaptive = True
            page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
        else:
            Fetcher.adaptive = True
            # HTTP fetcher: fast, no browser. Impersonates a real browser TLS/JA3.
            try:
                page = Fetcher.get(url, impersonate="chrome")
            except TypeError:
                page = Fetcher.get(url)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"Fetch failed: {exc}"}))
        return 1

    status = getattr(page, "status", None) or 0
    if isinstance(status, int) and status >= 400:
        print(json.dumps({"error": f"Remote server returned HTTP {status}", "status": status}))
        return 1

    title = ""
    try:
        title_bits = page.css("title::text").getall()
        title = " ".join(t.strip() for t in title_bits if t and t.strip())
    except Exception:  # noqa: BLE001
        title = ""

    # Prefer semantic main content when present; fall back to full body.
    html = ""
    for selector in ("article", "main", "[role='main']", "body"):
        try:
            nodes = page.css(selector)
            if not nodes:
                continue
            node = nodes[0]
            html = getattr(node, "html", None) or str(node)
            if html and len(html) > 40:
                break
        except Exception:  # noqa: BLE001
            continue

    if not html:
        body = getattr(page, "body", b"") or b""
        encoding = getattr(page, "encoding", None) or "utf-8"
        if isinstance(body, bytes):
            html = body.decode(encoding, errors="replace")
        else:
            html = str(body)

    try:
        text = page.get_all_text(
            ignore_tags=("script", "style", "noscript", "svg", "iframe")
        )
    except TypeError:
        text = page.get_all_text()
    except Exception:  # noqa: BLE001
        text = ""

    final_url = getattr(page, "url", None) or url

    print(
        json.dumps(
            {
                "url": url,
                "finalUrl": final_url,
                "title": title.strip(),
                "html": html,
                "text": (text or "").strip(),
                "status": status,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
