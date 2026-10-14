# Network MCP Server with a Diagnosis Agent

21CSC302J Computer Networks project, SRM Institute of Science and Technology.

When a network stops working, users only see the symptom: "YouTube won't load". The cause can be at any layer. This project gives an AI agent the same tests a network engineer runs, through the **Model Context Protocol (MCP)**, and a diagnosis method that tests from the **bottom layer up** and stops at the first failure.

```
User ─► Diagnosis agent (Claude) ◄─MCP─► Network MCP server ─► ping, traceroute, DNS, … ─► the network
```

## What is in it

| Part | Command | Needs an API key? |
|---|---|---|
| **MCP server** with 11 read-only network tools | `netdiag-server` | No |
| **Diagnosis** that runs every check bottom-up | `netdiag diagnose youtube.com` | No |
| **Agent**: ask in plain English, Claude picks the tools | `netdiag-agent "YouTube is not loading"` | Yes |

### The tools

| Tool | Layer | What it tells you |
|---|---|---|
| `interfaces` | Physical, data link | Interfaces up or down, addresses, MAC, speed, frame errors |
| `wifi_signal` | Physical | Signal strength in dBm: strong, ok or weak |
| `ip_config` | Network | IPv4 address, default gateway, DNS servers |
| `ping` | Network | Replies, packet loss, latency, jitter |
| `traceroute` | Network | Every router on the path, and where replies stop |
| `route_table` | Network | The routing table, including the default route |
| `arp_table` | Data link | IP-to-MAC pairs on the local network |
| `dns_lookup` | Application | Name to IP, with the system DNS or a chosen server |
| `port_check` | Transport | TCP three-way handshake to a port |
| `http_check` | Application | HTTP status code and response time |
| `diagnose` | All | The whole bottom-up sequence and a plain-English answer |

Every tool only reads. Host names are validated and commands run without a shell, so the agent cannot be tricked into running anything else.

### How the diagnosis works

1. **Physical:** is a real interface up? Wi-Fi signal, frame errors.
2. **Network:** an IP address that is not `169.254.x.x` (that means DHCP failed), a default gateway, a reply from the gateway.
3. **Network:** a reply from `1.1.1.1` or `8.8.8.8`. If not, a traceroute shows where the path breaks.
4. **Application:** DNS lookup of the site. If it fails, the same lookup through `1.1.1.1` tells "your DNS server is down" apart from "the name does not exist".
5. **Transport:** a TCP connection to the site's port.
6. **Application:** the web page's HTTP status.

It also warns about packet loss, high latency, jitter and a weak Wi-Fi signal even when everything passes.

## Install

Python 3.10 or newer, on macOS, Linux or Windows.

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[test]"
```

## Use it

```bash
netdiag diagnose youtube.com     # the full check, no AI needed
netdiag ping 8.8.8.8
netdiag traceroute 8.8.8.8
netdiag dns youtube.com --server 1.1.1.1
netdiag ipconfig
```

Example on a working home network:

```
 1. [PASS] Physical    Network interface up: active interfaces: en0
 2. [PASS] Physical    Wi-Fi signal: -70 dBm (ok)
 3. [PASS] Network     Has an IP address: IPv4: 192.168.1.4
 4. [PASS] Network     Default gateway set: gateway: 192.168.1.1
 5. [PASS] Network     Reach the gateway: 192.168.1.1: 3/3 replies, avg 4.0 ms, loss 0%
 6. [PASS] Network     Reach the Internet by IP: 1.1.1.1: 3/3 replies, avg 7.1 ms, loss 0%
 7. [PASS] Application DNS lookup of youtube.com: 142.251.43.142
 8. [PASS] Transport   TCP port 443 on youtube.com: connected in 21.0 ms
 9. [PASS] Application Web page from youtube.com: HTTP 200 in 349.6 ms

Everything works: the connection, the Internet, DNS and youtube.com itself.
```

### The agent

```bash
export ANTHROPIC_API_KEY=...      # from console.anthropic.com
netdiag-agent "YouTube is not loading"
netdiag-agent                     # interactive
```

The agent starts the MCP server, gives Claude its tools, and prints each tool call as it happens.

### Use the server from Claude Desktop or Claude Code

Claude Code:

```bash
claude mcp add network-diagnosis -- /full/path/to/.venv/bin/netdiag-server
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "network-diagnosis": { "command": "/full/path/to/.venv/bin/netdiag-server" }
  }
}
```

## Tests

```bash
pytest
```

The tests feed saved ping, traceroute and route outputs from macOS, Linux and Windows into the parsers, and run the diagnosis on a made-up network broken one layer at a time: link down, DHCP failure, wrong gateway, a routing break inside the ISP, a dead DNS server, a misspelt name and a closed port. These match the four scenes of the Packet Tracer demo.

## Syllabus mapping

| Unit | Where it shows up |
|---|---|
| 1 | Interfaces, Wi-Fi signal, latency, jitter, packet loss |
| 2 | IPv4 addressing, 169.254 (DHCP), gateway, ARP |
| 3 | Routing table, default route, traceroute and TTL |
| 4 | Frame error counters (CRC), MAC addresses |
| 5 | TCP handshake, ports, DNS, HTTP |

## Team

ANBU CHELVAN (RA2411003011803) · Charith Reddy B (RA2411003011823) · Rupesh Reddy (RA2411003011831) · Basith Nistar (RA2411003011771) · Adhityan (RA2411003011764)
