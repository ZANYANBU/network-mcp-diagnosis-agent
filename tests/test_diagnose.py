"""The diagnosis on a made-up network, broken one layer at a time like the Packet Tracer demo."""

from types import SimpleNamespace

import pytest

from netdiag.diagnose import diagnose, format_report
from netdiag.tools import check_host


def healthy(**changes):
    """A toolbox that reports a working network; `changes` swaps out single tools to break it."""
    nic = {"name": "en0", "is_up": True, "loopback": False, "ipv4": ["192.168.1.21"], "ipv6": [],
           "errors_in": 0, "errors_out": 0}
    good_ping = {"reachable": True, "sent": 3, "received": 3, "avg_ms": 5.0, "loss_percent": 0.0, "jitter_ms": 1.0}
    tools = dict(
        check_host=check_host,
        interfaces=lambda: [nic],
        wifi_signal=lambda: {"available": True, "rssi_dbm": -55, "quality": "strong"},
        default_gateway=lambda: "192.168.1.1",
        ping=lambda host, count=4: dict(good_ping),
        arp_table=lambda: [{"ip": "192.168.1.1", "mac": "aa:bb:cc:dd:ee:ff"}],
        traceroute=lambda host, max_hops=15: {"hops": [], "last_responding_hop": None},
        dns_lookup=lambda name, server=None: {"ok": True, "addresses": ["203.0.113.80"]},
        port_check=lambda host, port=443: {"open": True, "time_ms": 12.0},
        http_check=lambda url: {"ok": True, "status": 200, "time_ms": 80.0},
    )
    tools.update(changes)
    return SimpleNamespace(**tools)


def dead(host, count=4):
    return {"reachable": False, "sent": count, "received": 0, "loss_percent": 100.0}


def test_everything_passes():
    r = diagnose("youtube.com", t=healthy())
    assert r.failed_layer is None and all(s.passed for s in r.steps)
    assert "Everything works" in r.diagnosis


def test_scene1_physical_link_down():
    nic = {"name": "en0", "is_up": False, "loopback": False, "ipv4": [], "ipv6": []}
    r = diagnose("youtube.com", t=healthy(interfaces=lambda: [nic]))
    assert r.failed_layer == "Physical" and len(r.steps) == 1


def test_dhcp_failure_169_254():
    nic = {"name": "en0", "is_up": True, "loopback": False, "ipv4": ["169.254.10.4"], "ipv6": []}
    r = diagnose("youtube.com", t=healthy(interfaces=lambda: [nic]))
    assert r.failed_layer == "Network" and "DHCP" in r.diagnosis


def closed(host, port=443):
    return {"open": False, "error": "timed out"}


def test_scene2_wrong_gateway():
    r = diagnose("youtube.com", t=healthy(default_gateway=lambda: "192.168.1.100", ping=dead, arp_table=lambda: [],
                                          port_check=closed))
    assert r.failed_layer == "Network" and "192.168.1.100" in r.diagnosis


def test_scene3_routing_break_inside_isp():
    def ping(host, count=4):
        return dead(host) if host in ("1.1.1.1", "8.8.8.8") else {"reachable": True, "sent": 3, "received": 3,
                                                                    "avg_ms": 3.0, "loss_percent": 0.0}
    trace = {"hops": [], "last_responding_hop": {"hop": 3, "address": "103.21.44.9"}}
    r = diagnose("youtube.com", t=healthy(ping=ping, traceroute=lambda host, max_hops=15: trace, port_check=closed))
    assert r.failed_layer == "Network" and "hop 3" in r.diagnosis and "ISP" in r.diagnosis


def test_scene4_dns_server_down_but_public_dns_works():
    def lookup(name, server=None):
        return {"ok": True, "addresses": ["142.250.183.14"]} if server else {"ok": False, "error": "Timeout"}
    r = diagnose("youtube.com", t=healthy(dns_lookup=lookup))
    assert r.failed_layer == "Application" and "DNS server" in r.diagnosis and "1.1.1.1" in r.fix


def test_name_that_does_not_exist():
    r = diagnose("no-such-site.example", t=healthy(dns_lookup=lambda name, server=None: {"ok": False, "error": "NXDOMAIN"}))
    assert r.failed_layer == "Application" and "spelling" in r.fix


def test_port_closed():
    r = diagnose("youtube.com", t=healthy(port_check=lambda host, port=443: {"open": False, "error": "timed out"}))
    assert r.failed_layer == "Transport"


def test_warnings_for_weak_wifi_and_loss():
    lossy = {"reachable": True, "sent": 10, "received": 9, "avg_ms": 20.0, "loss_percent": 10.0, "jitter_ms": 2.0}
    r = diagnose("youtube.com", t=healthy(wifi_signal=lambda: {"available": True, "rssi_dbm": -80, "quality": "weak"},
                                         ping=lambda host, count=4: dict(lossy)))
    assert r.failed_layer is None and len(r.warnings) >= 2
    assert "Warning:" in format_report(r)


@pytest.mark.parametrize("bad", ["", "a b", "-c 1 8.8.8.8", "x;rm -rf /", "$(id)"])
def test_unsafe_hosts_are_refused(bad):
    with pytest.raises(ValueError):
        check_host(bad)


def test_router_in_arp_but_ignores_ping_and_nothing_gets_through():
    r = diagnose("youtube.com", t=healthy(ping=dead, port_check=closed))
    assert r.failed_layer == "Network" and any("ARP" in w for w in r.warnings)


def test_campus_network_that_blocks_ping_is_not_a_failure():
    """The real college Wi-Fi: gateway and 1.1.1.1/8.8.8.8 drop ICMP, yet TCP and HTTPS work."""
    calls = []

    def port_check(host, port=443):
        calls.append((host, port))
        return {"open": True, "time_ms": 32.0}

    r = diagnose("youtube.com", t=healthy(default_gateway=lambda: "10.9.0.1", ping=dead, port_check=port_check))
    assert r.failed_layer is None and all(s.passed for s in r.steps)
    gw_step = next(s for s in r.steps if s.check == "Reach the gateway")
    assert "ignores ping" in gw_step.evidence
    assert any("ICMP filtered" in w for w in r.warnings) and len(r.warnings) == 2
    assert calls.count(("youtube.com", 443)) == 2  # probed once (cached), then the real transport step


def test_internet_ping_blocked_but_tcp_works():
    def ping(host, count=4):
        return dead(host) if host in ("1.1.1.1", "8.8.8.8") else {"reachable": True, "sent": 3, "received": 3,
                                                                    "avg_ms": 3.0, "loss_percent": 0.0}
    r = diagnose("youtube.com", t=healthy(ping=ping))
    assert r.failed_layer is None
    assert "ignore ping" in next(s for s in r.steps if s.check == "Reach the Internet by IP").evidence
