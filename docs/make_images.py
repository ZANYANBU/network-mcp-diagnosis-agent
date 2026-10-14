"""Draws the terminal images in docs/images from real `netdiag` output.

    python docs/make_images.py

The healthy run uses this computer's network. The DNS failure is simulated with a fake
toolbox, the same way the tests break the network, so it can be drawn on any machine.
"""

import html
import textwrap
import pathlib
import sys
from types import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from netdiag.diagnose import diagnose, format_report  # noqa: E402
from netdiag.tools import check_host  # noqa: E402

OUT = pathlib.Path(__file__).parent / "images"
COLOURS = {"PASS": "#4ade80", "FAIL": "#f87171", "Warning:": "#fbbf24", "Fix:": "#93c5fd"}


def terminal(text: str, title: str, path: pathlib.Path) -> None:
    lines = []
    for line in text.splitlines():
        lines += textwrap.wrap(line, 96, subsequent_indent="    ") or [""]
    width = max(len(line) for line in lines) * 7.6 + 56
    height = len(lines) * 19 + 64
    rows = []
    for i, line in enumerate(lines):
        y = 58 + i * 19
        safe = html.escape(line)
        for word, colour in COLOURS.items():
            safe = safe.replace(word, f'<tspan fill="{colour}" font-weight="700">{word}</tspan>', 1)
        if line.startswith("Problem") or line.startswith("Everything"):
            safe = f'<tspan fill="#ffffff" font-weight="700">{safe}</tspan>'
        rows.append(f'<text x="24" y="{y}" xml:space="preserve">{safe}</text>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height}" viewBox="0 0 {width:.0f} {height}">
<rect width="100%" height="100%" rx="10" fill="#0e1a2b"/>
<circle cx="22" cy="18" r="6" fill="#f87171"/><circle cx="42" cy="18" r="6" fill="#fbbf24"/><circle cx="62" cy="18" r="6" fill="#4ade80"/>
<text x="{width / 2:.0f}" y="23" text-anchor="middle" fill="#9aaab9" font-family="Menlo, Consolas, monospace" font-size="12">{html.escape(title)}</text>
<g fill="#d7f5ee" font-family="Menlo, Consolas, 'DejaVu Sans Mono', monospace" font-size="12.5">
{chr(10).join(rows)}
</g></svg>'''
    path.write_text(svg)
    print("wrote", path)


def dns_down_toolbox():
    good = {"reachable": True, "sent": 3, "received": 3, "avg_ms": 4.2, "loss_percent": 0.0, "jitter_ms": 1.0}
    return SimpleNamespace(
        check_host=check_host,
        interfaces=lambda: [{"name": "en0", "is_up": True, "loopback": False, "ipv4": ["192.168.1.21"], "ipv6": [],
                             "errors_in": 0, "errors_out": 0}],
        wifi_signal=lambda: {"available": True, "rssi_dbm": -58, "quality": "strong"},
        default_gateway=lambda: "192.168.1.1",
        ping=lambda host, count=4: dict(good),
        arp_table=lambda: [],
        traceroute=lambda host, max_hops=15: {"hops": [], "last_responding_hop": None},
        dns_lookup=lambda name, server=None: ({"ok": True, "addresses": ["142.250.183.14"]} if server
                                              else {"ok": False, "error": "Timeout: the DNS operation timed out"}),
        port_check=lambda host, port=443: {"open": True, "time_ms": 21.0},
        http_check=lambda url: {"ok": True, "status": 200, "time_ms": 90.0},
    )


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    real = "$ netdiag diagnose youtube.com\n" + format_report(diagnose("youtube.com"))
    terminal(real, "netdiag: a working home network", OUT / "diagnose-healthy.svg")
    simulated = "$ netdiag diagnose youtube.com\n" + format_report(diagnose("youtube.com", t=dns_down_toolbox()))
    terminal(simulated, "netdiag: DNS server down (simulated)", OUT / "diagnose-dns-down.svg")
