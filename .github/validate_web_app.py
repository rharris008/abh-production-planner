#!/usr/bin/env python3
"""Validate a single-HTML-file web app before it ships to GitHub Pages.

Designed to run inside a GitHub Actions workflow on push/PR. Covers the
five ABH web apps (Shed Move, CMMS, Production Planner, 3-Year Plan,
Staff Assessor), each of which is a single index.html with inline JS
and (in one case) JSX via Babel Standalone.

Checks performed:
  1. HTML parses (lenient HTMLParser — catches grossly unclosed tags).
  2. Each inline <script> block:
       - skipped if it has src= (external)
       - skipped if type is text/babel, text/typescript, etc.
       - skipped if content matches known library markers
         (xlsx.js / SheetJS / Chart.js / D3 / lodash / jsPDF / QRCode)
       - otherwise passed to `node --check` (or `node --input-type=module
         --check` for type=module)
  3. Exit 0 = ALL PASS, 1 = any failure.

Runs with Python 3.11+ and requires `node` on PATH (GitHub Actions
ubuntu-latest has both preinstalled).

Usage in CI:
    python3 validate_web_app.py index.html
"""
import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

LIBRARY_MARKERS = (
    "xlsx.js (C)", "SheetJS", "sheetjs.com",
    "QRCode for JavaScript", "jsPDF",
    "/*! Chart", "Chart.min.js",
    "* D3.js", "d3.js (C)",
    "lodash",
    "babel-standalone",
    "Microsoft Authentication Library",
)

SCRIPT_TAG = re.compile(r'<script\b([^>]*)>(.*?)</script>', re.DOTALL | re.IGNORECASE)
ALLOWED_JS_TYPES = {"", "text/javascript", "application/javascript", "module"}


def parse_script_attrs(attr_str):
    attrs = {}
    for m in re.finditer(r'(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|(\S+)))?', attr_str):
        name = m.group(1).lower()
        val = m.group(2) or m.group(3) or m.group(4) or ""
        attrs[name] = val.lower()
    return attrs


class LenientHTMLCheck(HTMLParser):
    """Standard library HTMLParser. Raises on malformed structure."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.errors = []

    def error(self, message):
        self.errors.append(message)


def validate_html_structure(html_text):
    parser = LenientHTMLCheck()
    try:
        parser.feed(html_text)
        parser.close()
    except Exception as e:
        return False, f"HTMLParser raised: {type(e).__name__}: {e}"
    if parser.errors:
        return False, f"HTMLParser errors: {'; '.join(parser.errors[:3])}"
    return True, f"parsed {len(html_text):,} chars OK"


def validate_js_block(body, block_num, script_type, out_dir):
    tmp = out_dir / f"block_{block_num}.js"
    tmp.write_text(body)
    if script_type == "module":
        args = ["node", "--input-type=module", "--check", str(tmp)]
    else:
        args = ["node", "--check", str(tmp)]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        return False, "node --check timed out"
    except FileNotFoundError:
        return False, "node not on PATH"
    if r.returncode != 0:
        # First meaningful stderr line
        err_lines = [l for l in r.stderr.splitlines() if l.strip()]
        first = err_lines[0][:200] if err_lines else "unknown syntax error"
        return False, first
    return True, "syntax OK"


def main():
    if len(sys.argv) < 2:
        print("usage: validate_web_app.py <index.html>", file=sys.stderr)
        sys.exit(2)
    target = Path(sys.argv[1])
    if not target.exists():
        print(f"FAIL: file not found: {target}", file=sys.stderr)
        sys.exit(1)

    html_text = target.read_text()
    print(f"=== Validating {target} ===")

    # Check 1: HTML structure
    ok, msg = validate_html_structure(html_text)
    print(f"  HTML structure: {'PASS' if ok else 'FAIL'} — {msg}")
    if not ok:
        sys.exit(1)

    # Check 2: per-block JS
    out_dir = Path(tempfile.mkdtemp(prefix="validate_"))
    blocks = SCRIPT_TAG.findall(html_text)
    checked = 0
    skipped = {"src": 0, "type": 0, "library": 0}
    failures = []
    for i, (attr_str, body) in enumerate(blocks):
        attrs = parse_script_attrs(attr_str)
        if "src" in attrs:
            skipped["src"] += 1
            continue
        script_type = attrs.get("type", "")
        if script_type not in ALLOWED_JS_TYPES:
            skipped["type"] += 1
            continue
        # Skip vendored libraries by marker match in the first 1.5KB
        if any(m in body[:1500] for m in LIBRARY_MARKERS):
            skipped["library"] += 1
            continue
        ok, msg = validate_js_block(body, i, script_type, out_dir)
        checked += 1
        print(f"  JS block #{i} ({len(body):,} chars, type={script_type or 'inline'}): {'PASS' if ok else 'FAIL'} — {msg}")
        if not ok:
            failures.append((i, msg))

    print(f"  Summary: {checked} JS blocks checked, {sum(skipped.values())} skipped "
          f"({skipped['src']} external, {skipped['type']} non-JS type, {skipped['library']} library)")

    if failures:
        print(f"\nVALIDATION FAILED: {len(failures)} block(s) with syntax errors")
        sys.exit(1)
    print("\nVALIDATION PASSED")


if __name__ == "__main__":
    main()
