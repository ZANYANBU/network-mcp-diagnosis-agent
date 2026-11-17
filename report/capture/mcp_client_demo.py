"""Talk to the Network MCP server exactly as an AI client does: start it, list its tools, call two of them."""
import asyncio, json, os, sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = os.path.join(os.path.dirname(sys.executable), "netdiag-server")

async def main():
    params = StdioServerParameters(command=SERVER, args=[])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as s:
            info = await s.initialize()
            print(f"connected to MCP server: {info.serverInfo.name} (protocol {info.protocolVersion})")
            tools = (await s.list_tools()).tools
            print(f"\n{len(tools)} tools offered:")
            for t in tools:
                print(f"  {t.name:<12} {(t.description or '').splitlines()[0][:70]}")
            for name, args in (("dns_lookup", {"name": "youtube.com"}), ("http_check", {"url": "https://www.youtube.com"})):
                r = await s.call_tool(name, args)
                print(f"\ncall_tool {name} {json.dumps(args)}")
                print("  ->", r.content[0].text.replace("\n", " ")[:160])

asyncio.run(main())
