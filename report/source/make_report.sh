#!/bin/bash
# Builds CN_Case_Study_Report_Network_MCP_Diagnosis_Agent.docx and .pdf with page numbers in the contents lists.
# Needs: node with the "docx" package on NODE_PATH, LibreOffice (soffice), poppler (pdftotext).
set -e
cd "$(dirname "$0")"
export PATH="/Applications/LibreOffice.app/Contents/MacOS:$PATH"
NAME=CN_Case_Study_Report_Network_MCP_Diagnosis_Agent
TMP=$(mktemp -d)
node build_report.js
soffice --headless --convert-to pdf --outdir "$TMP" "../$NAME.docx" >/dev/null 2>&1
python3 - "$TMP/$NAME.pdf" "$TMP/pages.json" <<'PY'
import json, re, subprocess, sys
pdf, out = sys.argv[1], sys.argv[2]
keys = json.load(open(".keys.json"))
n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
pages = [[" ".join(l.split()) for l in subprocess.run(["pdftotext", "-layout", "-f", str(i), "-l", str(i), pdf, "-"],
         capture_output=True, text=True).stdout.splitlines()] for i in range(1, n + 1)]
body = next(i for i, p in enumerate(pages) if "Chapter 1" in p)       # first body page (0-based)
found = {}
for k in keys:
    for i in range(body, n):
        p = pages[i]
        if any(l == k or (not k.startswith("Chapter") and l.startswith(k + " ")) or (k.startswith(("Figure", "Table")) and l.startswith(k)) for l in p):
            found[k] = i - body + 1; break
missing = [k for k in keys if k not in found]
json.dump(found, open(out, "w"))
print(f"{n} pages, body starts at pdf page {body + 1}; {len(found)} of {len(keys)} entries placed" + (f"; missing: {missing}" if missing else ""))
PY
TOC_PAGES="$TMP/pages.json" node build_report.js
soffice --headless --convert-to pdf --outdir .. "../$NAME.docx" >/dev/null 2>&1
rm -rf "$TMP" .keys.json
pdfinfo "../$NAME.pdf" | grep Pages
