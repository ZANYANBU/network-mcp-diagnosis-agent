"""`netdiag`: run the diagnosis or a single tool from the terminal, no AI model needed.

    netdiag diagnose youtube.com
    netdiag ping 8.8.8.8
    netdiag dns youtube.com --server 1.1.1.1
"""

import argparse
import json

from . import tools
from .diagnose import diagnose, format_report


def main() -> None:
    p = argparse.ArgumentParser(prog="netdiag", description="Find which network layer is broken.")
    sub = p.add_subparsers(dest="command", required=True)
    d = sub.add_parser("diagnose", help="run every check from the bottom layer up")
    d.add_argument("target", nargs="?", default="google.com")
    d.add_argument("--port", type=int, default=443)
    d.add_argument("--json", action="store_true", help="print the report as JSON")
    for name in ("ping", "traceroute", "port", "http"):
        s = sub.add_parser(name)
        s.add_argument("host")
        if name == "port":
            s.add_argument("port", type=int, nargs="?", default=443)
    dns = sub.add_parser("dns")
    dns.add_argument("name")
    dns.add_argument("--server")
    for name in ("ipconfig", "interfaces", "wifi", "routes", "arp"):
        sub.add_parser(name)
    a = p.parse_args()

    if a.command == "diagnose":
        report = diagnose(a.target, a.port)
        print(json.dumps(report.to_dict(), indent=2) if a.json else format_report(report))
        return
    result = {
        "ping": lambda: tools.ping(a.host),
        "traceroute": lambda: tools.traceroute(a.host),
        "port": lambda: tools.port_check(a.host, a.port),
        "http": lambda: tools.http_check(a.host),
        "dns": lambda: tools.dns_lookup(a.name, a.server),
        "ipconfig": tools.ip_config,
        "interfaces": tools.interfaces,
        "wifi": tools.wifi_signal,
        "routes": tools.route_table,
        "arp": tools.arp_table,
    }[a.command]()
    print(result if isinstance(result, str) else json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
