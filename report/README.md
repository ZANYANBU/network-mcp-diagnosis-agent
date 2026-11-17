# Case study report

The 21CSC302J Computer Networks case study report for this project, 60 pages.

| File | What it is |
|---|---|
| [`CN_Case_Study_Report_Network_MCP_Diagnosis_Agent.pdf`](CN_Case_Study_Report_Network_MCP_Diagnosis_Agent.pdf) | The report |
| [`CN_Case_Study_Report_Network_MCP_Diagnosis_Agent.docx`](CN_Case_Study_Report_Network_MCP_Diagnosis_Agent.docx) | The same, editable |
| `shots/` | Real Cisco Packet Tracer 9.0.1 screenshots: the healthy network and three injected faults |
| `capture/` | Real output of `netdiag` on the college Wi-Fi, the MCP client session and the test run |
| `assets/` | Diagrams and the terminal images drawn from `capture/` |
| `source/` | The report builder |

## Rebuild

Needs Node with the `docx` package, LibreOffice and poppler (`pdftotext`).

```bash
npm install docx@9
NODE_PATH=$(pwd)/node_modules report/source/make_report.sh
```

The terminal images are drawn from the captured text with `report/source/term.py` (Pillow).
