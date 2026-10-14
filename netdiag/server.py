"""The Network MCP server: exposes the diagnostic tools to any MCP client over stdio.

Run it directly (`netdiag-server`) or let a client start it, for example Claude Desktop,
Claude Code, or this project's own agent (`netdiag-agent`). Every tool only reads; none of
them changes the computer's network settings.
"""

from mcp.server.fastmcp import FastMCP

from . import tools
from .diagnose import diagnose as run_diagnosis
from .diagnose import format_report

mcp = FastMCP(
    "network-diagnosis",
    log_level="WARNING",
    instructions=(
        "Tools that test this computer's network. To find a fault, work from the bottom layer up: "
        "interfaces and Wi-Fi, then IP configuration and the gateway, then the Internet by IP, "
        "then DNS, then the service's port and web page. Stop at the first layer that fails. "
        "`diagnose` runs that whole sequence in one call."
    ),
)


@mcp.tool()
def diagnose(target: str = "google.com", port: int = 443) -> str:
    """Run the full bottom-up diagnosis against a site and say which layer fails and how to fix it.

    Args:
        target: Host name or IP address the user is trying to reach, e.g. youtube.com.
        port: TCP port of the service, 443 for websites.
    """
    return format_report(run_diagnosis(target, port))


@mcp.tool()
def interfaces() -> list[dict]:
    """List network interfaces: up or down, IPv4/IPv6 addresses, MAC, speed and error counters (physical and data link layers)."""
    return tools.interfaces()


@mcp.tool()
def wifi_signal() -> dict:
    """Wi-Fi signal strength in dBm and a strong/ok/weak rating, if the computer is on Wi-Fi."""
    return tools.wifi_signal()


@mcp.tool()
def ip_config() -> dict:
    """This computer's IPv4 addresses, default gateway and DNS servers, like `ipconfig`."""
    return tools.ip_config()


@mcp.tool()
def ping(host: str, count: int = 4) -> dict:
    """Ping a host: replies, packet loss, average latency and jitter.

    Args:
        host: Host name or IP address.
        count: Number of echo requests, 1 to 10.
    """
    return tools.ping(host, count)


@mcp.tool()
def traceroute(host: str, max_hops: int = 15) -> dict:
    """List every router on the path to a host and where the replies stop.

    Args:
        host: Host name or IP address.
        max_hops: Most routers to try, 1 to 30.
    """
    return tools.traceroute(host, max_hops)


@mcp.tool()
def dns_lookup(name: str, server: str | None = None) -> dict:
    """Resolve a name to IP addresses with the system's DNS, or with a given DNS server such as 1.1.1.1.

    Args:
        name: Host name to look up, e.g. youtube.com.
        server: Optional DNS server IP to ask instead of the system's own.
    """
    return tools.dns_lookup(name, server)


@mcp.tool()
def port_check(host: str, port: int = 443) -> dict:
    """Try a TCP three-way handshake to host:port and report open, refused or timed out.

    Args:
        host: Host name or IP address.
        port: TCP port, e.g. 443 for HTTPS, 80 for HTTP, 53 for DNS.
    """
    return tools.port_check(host, port)


@mcp.tool()
def http_check(url: str) -> dict:
    """Request a web page's headers and report the HTTP status code and response time.

    Args:
        url: Address such as https://youtube.com; https is assumed if no scheme is given.
    """
    return tools.http_check(url)


@mcp.tool()
def route_table() -> str:
    """The computer's routing table, including the default route (0.0.0.0/0)."""
    return tools.route_table()


@mcp.tool()
def arp_table() -> list[dict]:
    """IP-to-MAC address pairs this computer has learned on the local network."""
    return tools.arp_table()


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
