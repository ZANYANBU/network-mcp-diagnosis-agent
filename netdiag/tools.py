"""The network checks the agent can run. Every function is read-only and returns plain data.

Commands are run with an argument list (never through a shell) and every host name is
checked first, so nothing the agent passes in can be turned into another command.
"""

import ipaddress
import platform
import re
import socket
import ssl
import subprocess
import time
import urllib.error
import urllib.request

import psutil

from . import parse

SYSTEM = platform.system()  # "Darwin", "Linux" or "Windows"
_HOSTNAME = re.compile(r"^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$")


def check_host(host: str) -> str:
    """Return the host if it is an IP address or a valid host name, otherwise raise."""
    host = (host or "").strip()
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        pass
    if _HOSTNAME.match(host) and not host.startswith("-"):
        return host
    raise ValueError(f"not a valid host name or IP address: {host!r}")


def _run(args: list[str], timeout: float) -> tuple[int, str]:
    try:
        done = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return done.returncode, (done.stdout or "") + (done.stderr or "")
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        return 124, out
    except FileNotFoundError:
        return 127, f"{args[0]} is not installed on this computer"


# ---------------------------------------------------------------- physical and data link


def interfaces() -> list[dict]:
    """Every network interface: up or down, its addresses, speed and error counters."""
    stats = psutil.net_if_stats()
    addresses = psutil.net_if_addrs()
    counters = psutil.net_io_counters(pernic=True)
    result = []
    for name, st in stats.items():
        ipv4 = [a.address for a in addresses.get(name, []) if a.family == socket.AF_INET]
        ipv6 = [a.address.split("%")[0] for a in addresses.get(name, []) if a.family == socket.AF_INET6]
        mac = [a.address for a in addresses.get(name, []) if a.family == psutil.AF_LINK]
        io = counters.get(name)
        result.append({
            "name": name,
            "is_up": st.isup,
            "speed_mbps": st.speed or None,
            "mtu": st.mtu,
            "ipv4": ipv4,
            "ipv6": ipv6,
            "mac": mac[0] if mac else None,
            "loopback": name.startswith("lo") or "127.0.0.1" in ipv4,
            "errors_in": io.errin if io else None,
            "errors_out": io.errout if io else None,
            "dropped_in": io.dropin if io else None,
            "dropped_out": io.dropout if io else None,
        })
    return result


def wifi_signal() -> dict:
    """Wi-Fi signal strength in dBm, when the computer is on Wi-Fi and the system reports it."""
    if SYSTEM == "Darwin":
        code, out = _run(["system_profiler", "SPAirPortDataType"], 20)
        # Only the network we are connected to has a Signal / Noise line before "Other Local".
        out = out.split("Other Local Wi-Fi Networks")[0]
    elif SYSTEM == "Windows":
        code, out = _run(["netsh", "wlan", "show", "interfaces"], 10)
    else:
        code, out = _run(["nmcli", "-t", "-f", "IN-USE,SIGNAL", "dev", "wifi"], 10)
        m = re.search(r"^\*:(\d+)", out, re.M)
        if m:
            out = f"Signal : {m.group(1)}%"
    signal = parse.wifi_signal(out)
    if not signal:
        return {"available": False, "note": "no Wi-Fi signal reported (wired, Wi-Fi off, or not permitted)"}
    rssi = signal.get("rssi_dbm")
    quality = "strong" if rssi >= -60 else "ok" if rssi >= -70 else "weak"
    return {"available": True, **signal, "quality": quality}


def arp_table() -> list[dict]:
    """Devices this computer has recently talked to on the local network: IP to MAC address."""
    code, out = _run(["arp", "-a"], 10)
    return parse.arp_table(out)


# ---------------------------------------------------------------- network layer


def default_gateway() -> str | None:
    if SYSTEM == "Darwin":
        _, out = _run(["route", "-n", "get", "default"], 5)
    elif SYSTEM == "Windows":
        _, out = _run(["route", "print", "0.0.0.0"], 5)
    else:
        _, out = _run(["ip", "route", "show", "default"], 5)
    return parse.default_gateway(out)


def dns_servers() -> list[str]:
    if SYSTEM == "Windows":
        _, out = _run(["ipconfig", "/all"], 10)
    elif SYSTEM == "Darwin":
        _, out = _run(["scutil", "--dns"], 5)
    else:
        try:
            with open("/etc/resolv.conf") as f:
                out = f.read()
        except OSError:
            out = ""
    return parse.dns_servers(out)


def ip_config() -> dict:
    """This computer's addresses, default gateway and DNS servers, like `ipconfig`."""
    active = [i for i in interfaces() if i["is_up"] and not i["loopback"] and i["ipv4"]]
    return {
        "interfaces": [{"name": i["name"], "ipv4": i["ipv4"], "mac": i["mac"]} for i in active],
        "default_gateway": default_gateway(),
        "dns_servers": dns_servers(),
    }


def route_table() -> str:
    """The routing table as the system prints it."""
    if SYSTEM == "Windows":
        _, out = _run(["route", "print"], 10)
    elif SYSTEM == "Darwin":
        _, out = _run(["netstat", "-rn", "-f", "inet"], 10)
    else:
        _, out = _run(["ip", "route"], 10)
    return out.strip()


def ping(host: str, count: int = 4, timeout_s: int = 2) -> dict:
    """Send `count` echo requests and report replies, loss, latency and jitter."""
    host = check_host(host)
    count = max(1, min(int(count), 10))
    if SYSTEM == "Windows":
        args = ["ping", "-n", str(count), "-w", str(timeout_s * 1000), host]
    elif SYSTEM == "Darwin":
        args = ["ping", "-c", str(count), "-W", str(timeout_s * 1000), host]
    else:
        args = ["ping", "-c", str(count), "-W", str(timeout_s), host]
    code, out = _run(args, timeout=count * (timeout_s + 1) + 5)
    result = parse.ping_output(out)
    result["host"] = host
    lowered = out.lower()
    if not result["times_ms"] and ("unknown host" in lowered or "could not find host" in lowered):
        result["error"] = "name could not be resolved"
    return result


def traceroute(host: str, max_hops: int = 15) -> dict:
    """Every router on the path to `host`, and where replies stop."""
    host = check_host(host)
    max_hops = max(1, min(int(max_hops), 30))
    if SYSTEM == "Windows":
        args = ["tracert", "-d", "-h", str(max_hops), "-w", "1500", host]
    else:
        args = ["traceroute", "-n", "-m", str(max_hops), "-w", "2", "-q", "1", host]
    code, out = _run(args, timeout=max_hops * 4 + 10)
    hops = parse.traceroute_output(out)
    answered = [h for h in hops if not h["timed_out"]]
    return {
        "host": host,
        "hops": hops,
        "last_responding_hop": answered[-1] if answered else None,
        "reached": bool(answered) and _resolves_to(host, answered[-1]["address"]),
    }


def _resolves_to(host: str, address: str | None) -> bool:
    if not address:
        return False
    try:
        return address in {a[4][0] for a in socket.getaddrinfo(host, None, socket.AF_INET)}
    except OSError:
        return host == address


# ---------------------------------------------------------------- transport and application


def dns_lookup(name: str, server: str | None = None, timeout_s: float = 3.0) -> dict:
    """Resolve a name to IP addresses, with the system's DNS or a chosen DNS server."""
    name = check_host(name)
    started = time.monotonic()
    try:
        import dns.resolver

        resolver = dns.resolver.Resolver(configure=server is None)
        if server:
            resolver.nameservers = [check_host(server)]
        resolver.lifetime = timeout_s
        answer = resolver.resolve(name, "A")
        addresses = sorted({r.address for r in answer})
        used = server or (resolver.nameservers[0] if resolver.nameservers else None)
        return {"name": name, "ok": True, "addresses": addresses, "server": used,
                "time_ms": round((time.monotonic() - started) * 1000, 1)}
    except Exception as e:  # dnspython raises several error types; all mean "no answer"
        return {"name": name, "ok": False, "server": server, "error": type(e).__name__ + ": " + str(e)[:160],
                "time_ms": round((time.monotonic() - started) * 1000, 1)}


def port_check(host: str, port: int = 443, timeout_s: float = 3.0) -> dict:
    """Try a TCP connection (the three-way handshake) to `host:port`."""
    host = check_host(host)
    port = int(port)
    if not 1 <= port <= 65535:
        raise ValueError("port must be between 1 and 65535")
    started = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout_s):
            pass
        return {"host": host, "port": port, "open": True,
                "time_ms": round((time.monotonic() - started) * 1000, 1)}
    except socket.timeout:
        return {"host": host, "port": port, "open": False, "error": "timed out (filtered or unreachable)"}
    except ConnectionRefusedError:
        return {"host": host, "port": port, "open": False, "error": "refused (host reachable, nothing listening)"}
    except OSError as e:
        return {"host": host, "port": port, "open": False, "error": str(e)}


def http_check(url: str, timeout_s: float = 5.0) -> dict:
    """Fetch a web page's headers and report the HTTP status and how long it took."""
    if not re.match(r"^https?://", url):
        url = "https://" + url
    check_host(re.sub(r"^https?://", "", url).split("/")[0].split(":")[0])
    started = time.monotonic()
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "netdiag/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout_s, context=ssl.create_default_context()) as r:
            status = r.status
        ok = True
    except urllib.error.HTTPError as e:
        status, ok = e.code, e.code < 500  # the server answered, even if with an error page
    except Exception as e:
        return {"url": url, "ok": False, "error": type(e).__name__ + ": " + str(e)[:160]}
    return {"url": url, "ok": ok, "status": status, "time_ms": round((time.monotonic() - started) * 1000, 1)}
