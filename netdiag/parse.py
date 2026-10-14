"""Turn the text that ping, traceroute and the routing commands print into plain data.

Each operating system words these outputs differently, so every parser here accepts the
macOS, Linux and Windows forms. Keeping parsing separate from running the commands lets the
tests feed in saved outputs.
"""

import re
import statistics

_TIME = re.compile(r"time[=<]\s*([\d.]+)\s*ms", re.I)
_LOSS = re.compile(r"([\d.]+)%\s*(?:packet\s*)?loss", re.I)
_SENT_RECEIVED = re.compile(r"(\d+)\s+packets transmitted,\s+(\d+)\s+(?:packets\s+)?received", re.I)
_WIN_SENT_RECEIVED = re.compile(r"Sent = (\d+), Received = (\d+)", re.I)


def ping_output(text: str) -> dict:
    """Round-trip times, packet loss and jitter from ping's output."""
    times = [float(t) for t in _TIME.findall(text)]
    sent = received = None
    m = _SENT_RECEIVED.search(text) or _WIN_SENT_RECEIVED.search(text)
    if m:
        sent, received = int(m.group(1)), int(m.group(2))
    loss = None
    m = _LOSS.search(text)
    if m:
        loss = float(m.group(1))
    elif sent:
        loss = round(100 * (sent - received) / sent, 1)
    if sent is None and times:
        sent = received = len(times)
        loss = 0.0
    result = {
        "sent": sent,
        "received": received,
        "loss_percent": loss,
        "times_ms": times,
        "reachable": bool(times),
    }
    if times:
        result["min_ms"] = round(min(times), 1)
        result["avg_ms"] = round(sum(times) / len(times), 1)
        result["max_ms"] = round(max(times), 1)
        # Jitter: the average change between one reply and the next.
        diffs = [abs(b - a) for a, b in zip(times, times[1:])]
        result["jitter_ms"] = round(statistics.mean(diffs), 1) if diffs else 0.0
    return result


_IP = r"(\d{1,3}(?:\.\d{1,3}){3})"
_HOP = re.compile(r"^\s*(\d+)\s+(.*)$")


def traceroute_output(text: str) -> list[dict]:
    """One entry per hop: the hop number, the router's address and its delay, or a timeout."""
    hops = []
    for line in text.splitlines():
        m = _HOP.match(line)
        if not m:
            continue
        number, rest = int(m.group(1)), m.group(2)
        address = re.search(_IP, rest)
        delays = [float(d) for d in re.findall(r"<?([\d.]+)\s*ms", rest)]
        hops.append({
            "hop": number,
            "address": address.group(1) if address else None,
            "delay_ms": round(min(delays), 1) if delays else None,
            "timed_out": address is None,
        })
    return hops


def default_gateway(text: str) -> str | None:
    """The default gateway from `route -n get default`, `ip route show default` or `route print`."""
    patterns = [
        r"gateway:\s*" + _IP,                      # macOS
        r"default via\s+" + _IP,                   # Linux
        r"0\.0\.0\.0\s+0\.0\.0\.0\s+" + _IP,       # Windows route print
    ]
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            return m.group(1)
    return None


def dns_servers(text: str) -> list[str]:
    """DNS servers listed in resolv.conf, `scutil --dns` or `ipconfig /all`."""
    found = re.findall(r"nameserver(?:\[\d+\])?\s*:?\s*" + _IP, text)
    if not found:
        block = re.search(r"DNS Servers[ .]*:\s*" + _IP + r"((?:\s+" + _IP + r")*)", text)
        if block:
            found = re.findall(_IP, block.group(0))
    seen, ordered = set(), []
    for server in found:
        if server not in seen:
            seen.add(server)
            ordered.append(server)
    return ordered


def arp_table(text: str) -> list[dict]:
    """IP and MAC pairs from `arp -a` on any of the three systems."""
    entries = []
    mac = r"([0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5})"
    for line in text.splitlines():
        ip = re.search(_IP, line)
        hw = re.search(mac, line)
        if ip and hw:
            entries.append({"ip": ip.group(1), "mac": hw.group(1).lower().replace("-", ":")})
    return entries


def wifi_signal(text: str) -> dict:
    """Signal strength from macOS system_profiler, Linux `iw`/`nmcli`, or Windows `netsh`."""
    m = re.search(r"Signal / Noise:\s*(-?\d+)\s*dBm\s*/\s*(-?\d+)\s*dBm", text)
    if m:
        return {"rssi_dbm": int(m.group(1)), "noise_dbm": int(m.group(2))}
    m = re.search(r"signal:\s*(-?\d+)\s*dBm", text)
    if m:
        return {"rssi_dbm": int(m.group(1))}
    m = re.search(r"^\s*Signal\s*:\s*(\d+)%", text, re.M)
    if m:
        # Windows reports a percentage; roughly 100% is -50 dBm and 0% is -100 dBm.
        percent = int(m.group(1))
        return {"signal_percent": percent, "rssi_dbm": round(percent / 2 - 100)}
    return {}
