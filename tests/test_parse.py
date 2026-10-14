from netdiag import parse

MAC_PING = """PING 8.8.8.8 (8.8.8.8): 56 data bytes
64 bytes from 8.8.8.8: icmp_seq=0 ttl=117 time=21.4 ms
64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=23.0 ms
64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=19.8 ms
64 bytes from 8.8.8.8: icmp_seq=3 ttl=117 time=88.6 ms

--- 8.8.8.8 ping statistics ---
4 packets transmitted, 4 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 19.8/38.2/88.6/28.4 ms
"""

LINUX_PING_LOSS = """PING 10.0.0.2 (10.0.0.2) 56(84) bytes of data.
64 bytes from 10.0.0.2: icmp_seq=1 ttl=64 time=0.512 ms

--- 10.0.0.2 ping statistics ---
4 packets transmitted, 1 received, 75% packet loss, time 3050ms
"""

WINDOWS_PING = """Pinging 192.168.1.1 with 32 bytes of data:
Reply from 192.168.1.1: bytes=32 time=2ms TTL=64
Reply from 192.168.1.1: bytes=32 time<1ms TTL=64
Request timed out.

Ping statistics for 192.168.1.1:
    Packets: Sent = 3, Received = 2, Lost = 1 (33% loss),
"""

DEAD_PING = """PING 203.0.113.80 (203.0.113.80): 56 data bytes
Request timeout for icmp_seq 0

--- 203.0.113.80 ping statistics ---
2 packets transmitted, 0 packets received, 100.0% packet loss
"""


def test_mac_ping():
    r = parse.ping_output(MAC_PING)
    assert (r["sent"], r["received"], r["loss_percent"]) == (4, 4, 0.0)
    assert r["avg_ms"] == 38.2 and r["min_ms"] == 19.8 and r["max_ms"] == 88.6
    assert r["jitter_ms"] == 24.5 and r["reachable"]


def test_linux_ping_with_loss():
    r = parse.ping_output(LINUX_PING_LOSS)
    assert (r["sent"], r["received"], r["loss_percent"]) == (4, 1, 75.0)


def test_windows_ping():
    r = parse.ping_output(WINDOWS_PING)
    assert (r["sent"], r["received"], r["loss_percent"]) == (3, 2, 33.0)
    assert r["times_ms"] == [2.0, 1.0]


def test_no_replies():
    r = parse.ping_output(DEAD_PING)
    assert not r["reachable"] and r["loss_percent"] == 100.0


def test_traceroute_unix_and_windows():
    unix = """traceroute to 8.8.8.8 (8.8.8.8), 15 hops max, 52 byte packets
 1  192.168.1.1  2.112 ms
 2  10.21.0.1  9.004 ms
 3  *
 4  103.21.44.9  14.2 ms
"""
    hops = parse.traceroute_output(unix)
    assert [h["address"] for h in hops] == ["192.168.1.1", "10.21.0.1", None, "103.21.44.9"]
    assert hops[2]["timed_out"] and hops[0]["delay_ms"] == 2.1
    windows = """Tracing route to 8.8.8.8 over a maximum of 15 hops

  1    <1 ms    <1 ms    <1 ms  192.168.1.1
  2     *        *        *     Request timed out.
"""
    hops = parse.traceroute_output(windows)
    assert hops[0]["address"] == "192.168.1.1" and hops[1]["timed_out"]


def test_default_gateway_every_system():
    assert parse.default_gateway("   route to: default\n    gateway: 192.168.1.1\n") == "192.168.1.1"
    assert parse.default_gateway("default via 10.0.0.1 dev wlan0 proto dhcp") == "10.0.0.1"
    assert parse.default_gateway("          0.0.0.0          0.0.0.0      192.168.0.1    192.168.0.23     25") == "192.168.0.1"
    assert parse.default_gateway("") is None


def test_dns_servers():
    assert parse.dns_servers("nameserver 1.1.1.1\nnameserver 8.8.8.8\n") == ["1.1.1.1", "8.8.8.8"]
    assert parse.dns_servers("resolver #1\n  nameserver[0] : 192.168.1.1\n  nameserver[0] : 192.168.1.1\n") == ["192.168.1.1"]
    win = "   DNS Servers . . . . . . . . . . . : 203.0.113.53\n                                       8.8.8.8\n   NetBIOS"
    assert parse.dns_servers(win) == ["203.0.113.53", "8.8.8.8"]


def test_arp_and_wifi():
    arp = "? (192.168.1.1) at a4:2b:b0:1:2:3 on en0 ifscope [ethernet]\n  192.168.1.1          a4-2b-b0-01-02-03     dynamic"
    assert parse.arp_table(arp)[1] == {"ip": "192.168.1.1", "mac": "a4:2b:b0:01:02:03"}
    assert parse.wifi_signal("  Signal / Noise: -58 dBm / -90 dBm") == {"rssi_dbm": -58, "noise_dbm": -90}
    assert parse.wifi_signal("    Signal                 : 80%")["rssi_dbm"] == -60
    assert parse.wifi_signal("nothing here") == {}
