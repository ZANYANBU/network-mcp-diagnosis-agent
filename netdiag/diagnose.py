"""The diagnosis agent's method: test the network one layer at a time, from the bottom up.

Each step runs one or two tools and passes or fails. The first failure is the answer, because
every layer above it depends on it. The result says which layer broke, what the evidence was,
what it means in plain words, and what to try.
"""

from dataclasses import asdict, dataclass, field

from . import tools as default_tools

PUBLIC_IPS = ["1.1.1.1", "8.8.8.8"]

# Interfaces that are not a real link: Apple wireless direct, VPN tunnels, bridges, containers.
VIRTUAL = ("awdl", "llw", "utun", "gif", "stf", "anpi", "bridge", "vmenet", "docker", "veth")


@dataclass
class Step:
    layer: str
    check: str
    passed: bool
    evidence: str
    warning: str | None = None


@dataclass
class Report:
    target: str
    steps: list[Step] = field(default_factory=list)
    failed_layer: str | None = None
    diagnosis: str = ""
    fix: str = ""
    warnings: list[str] = field(default_factory=list)

    def add(self, step: Step) -> bool:
        self.steps.append(step)
        if step.warning:
            self.warnings.append(step.warning)
        return step.passed

    def fail(self, layer: str, diagnosis: str, fix: str) -> "Report":
        self.failed_layer, self.diagnosis, self.fix = layer, diagnosis, fix
        return self

    def to_dict(self) -> dict:
        return asdict(self)


def _latency_warning(result: dict, what: str) -> str | None:
    loss, avg, jitter = result.get("loss_percent") or 0, result.get("avg_ms"), result.get("jitter_ms") or 0
    if loss >= 2:
        return f"{what}: {loss:g}% of packets were lost, which feels like freezing and buffering."
    if avg and avg > 150:
        return f"{what}: average delay {avg:g} ms is high; pages will feel slow."
    if jitter > 30:
        return f"{what}: delay jumps around by {jitter:g} ms (jitter), bad for calls and games."
    return None


def diagnose(target: str = "google.com", port: int = 443, t=default_tools) -> Report:
    """Run the bottom-up checks against `target` and stop at the first layer that fails."""
    target = t.check_host(target)
    r = Report(target=target)

    # 1. Physical: is any real interface up?
    active = [i for i in t.interfaces()
              if i["is_up"] and not i["loopback"] and i["ipv4"] and not i["name"].startswith(VIRTUAL)]
    names = ", ".join(i["name"] for i in active) or "none"
    if not r.add(Step("Physical", "Network interface up", bool(active), f"active interfaces: {names}")):
        return r.fail("Physical", "No network interface is connected.",
                      "Plug in the cable or turn Wi-Fi on and join a network.")
    wifi = t.wifi_signal()
    if wifi.get("available"):
        weak = wifi["rssi_dbm"] < -70
        r.add(Step("Physical", "Wi-Fi signal", True, f"{wifi['rssi_dbm']} dBm ({wifi['quality']})",
                   warning="Wi-Fi signal is weak; move closer to the router." if weak else None))
    errors = sum((i.get("errors_in") or 0) + (i.get("errors_out") or 0) for i in active)
    if errors > 100:
        r.add(Step("Data link", "Frame errors", True, f"{errors} errors on the active interfaces",
                   warning="Many frame errors: a damaged cable or radio interference is likely."))

    # 2. Addressing: a usable IPv4 address and a gateway.
    ipv4 = [a for i in active for a in i["ipv4"]]
    usable = [a for a in ipv4 if not a.startswith("169.254.")]
    if not r.add(Step("Network", "Has an IP address", bool(usable), f"IPv4: {', '.join(ipv4) or 'none'}")):
        if ipv4:
            return r.fail("Network", "The computer gave itself a 169.254 address, so DHCP failed: the router never handed out an address.",
                          "Restart the router, or reconnect to the network to ask for a new address.")
        return r.fail("Network", "The interface is up but has no IPv4 address.",
                      "Reconnect to the network or set the address to automatic (DHCP).")
    gateway = t.default_gateway()
    if not r.add(Step("Network", "Default gateway set", bool(gateway), f"gateway: {gateway or 'none'}")):
        return r.fail("Network", "There is no default gateway, so nothing can leave the local network.",
                      "Set the gateway to the router's address, or switch the connection to automatic (DHCP).")

    # 3. Local network: can we reach the router?
    gw = t.ping(gateway, count=3)
    if not r.add(Step("Network", "Reach the gateway", gw["reachable"],
                      _ping_text(gateway, gw), _latency_warning(gw, "Local network"))):
        in_arp = any(e["ip"] == gateway for e in t.arp_table())
        if in_arp:
            r.warnings.append("The router is in the ARP table, so it may simply be ignoring ping.")
        return r.fail("Network", f"The router at {gateway} does not answer, so the problem is between this computer and the router.",
                      "Check the cable or Wi-Fi, then restart the router.")

    # 4. Internet by address, without DNS.
    internet = None
    for ip in PUBLIC_IPS:
        res = t.ping(ip, count=3)
        if res["reachable"]:
            internet = (ip, res)
            break
    if not r.add(Step("Network", "Reach the Internet by IP", internet is not None,
                      _ping_text(internet[0], internet[1]) if internet else "1.1.1.1 and 8.8.8.8 did not reply",
                      _latency_warning(internet[1], "Internet") if internet else None)):
        trace = t.traceroute(PUBLIC_IPS[1], max_hops=12)
        last = trace.get("last_responding_hop")
        where = f"Replies stop after hop {last['hop']} ({last['address']})." if last else "Not even the first hop replied."
        r.steps.append(Step("Network", "Traceroute to 8.8.8.8", False, where))
        beyond_home = bool(last and last["address"] != gateway)
        return r.fail("Network",
                      ("The router answers but the Internet does not. " + where +
                       (" The break is inside the ISP's network." if beyond_home else " The break is at the router's connection to the ISP.")),
                      "Restart the router or modem; if it continues, contact the Internet provider.")

    # 5. DNS: can the name be turned into an address?
    looked = t.dns_lookup(target)
    if not r.add(Step("Application", f"DNS lookup of {target}", looked["ok"],
                      _addresses(looked) or looked.get("error", "no answer"))):
        public = t.dns_lookup(target, server=PUBLIC_IPS[0])
        if public["ok"]:
            r.steps.append(Step("Application", "DNS lookup through 1.1.1.1", True, _addresses(public)))
            return r.fail("Application", "The Internet works, but this computer's DNS server is not answering, so names cannot be found.",
                          "Change the DNS server to 1.1.1.1 or 8.8.8.8, or restart the router.")
        return r.fail("Application", f"No DNS server can find {target}. The name may be wrong or the site may not exist.",
                      "Check the spelling of the address.")

    # 6. Transport: does the service's port accept a TCP connection?
    conn = t.port_check(target, port)
    if not r.add(Step("Transport", f"TCP port {port} on {target}", conn["open"],
                      f"connected in {conn['time_ms']} ms" if conn["open"] else conn.get("error", "no connection"))):
        return r.fail("Transport", f"{target} was found but port {port} does not accept connections.",
                      "The service may be down, or a firewall is blocking it. Try again later or from another network.")

    # 7. Application: does the web server answer?
    if port in (80, 443):
        scheme = "https" if port == 443 else "http"
        web = t.http_check(f"{scheme}://{target}")
        if not r.add(Step("Application", f"Web page from {target}", web["ok"],
                          f"HTTP {web['status']} in {web['time_ms']} ms" if "status" in web else web.get("error", ""))):
            return r.fail("Application", f"{target} accepts connections but its web server returned an error.",
                          "The website itself has a problem; nothing on your side to fix.")

    r.diagnosis = f"Everything works: the connection, the Internet, DNS and {target} itself."
    if r.warnings:
        r.diagnosis += " A few things are worth a look below."
    r.fix = "Nothing to fix." if not r.warnings else "See the warnings."
    return r


def _addresses(result: dict, limit: int = 2) -> str:
    found = result.get("addresses", [])
    more = f" (+{len(found) - limit} more)" if len(found) > limit else ""
    return ", ".join(found[:limit]) + more


def _ping_text(host: str, res: dict) -> str:
    if not res.get("reachable"):
        return f"{host}: no replies"
    return f"{host}: {res['received']}/{res['sent']} replies, avg {res['avg_ms']} ms, loss {res['loss_percent']:g}%"


def format_report(r: Report) -> str:
    """The report as text for a terminal or a chat reply."""
    lines = [f"Diagnosis for {r.target}", ""]
    for i, s in enumerate(r.steps, 1):
        mark = "PASS" if s.passed else "FAIL"
        lines.append(f"{i:>2}. [{mark}] {s.layer:<11} {s.check}: {s.evidence}")
    lines += ["", ("Problem at the " + r.failed_layer + " layer. " if r.failed_layer else "") + r.diagnosis, "Fix: " + r.fix]
    for w in r.warnings:
        lines.append("Warning: " + w)
    return "\n".join(lines)
