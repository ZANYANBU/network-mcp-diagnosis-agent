"""`netdiag-agent`: ask about your network in plain English and let Claude diagnose it.

The agent starts this project's MCP server, gives Claude its tools, and lets Claude decide
which checks to run. Needs an Anthropic API key in ANTHROPIC_API_KEY.

    netdiag-agent "YouTube is not loading"
    netdiag-agent            # interactive
"""

import asyncio
import sys

import anthropic
from anthropic.lib.tools.mcp import async_mcp_tool
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

MODEL = "claude-opus-5-5"
NO_KEY = "No valid Anthropic API key. Set ANTHROPIC_API_KEY, or use `netdiag diagnose`, which needs no key."
NO_API = "Could not reach the Anthropic API. If the Internet is down, use `netdiag diagnose` instead."

SYSTEM = """You are a network diagnosis assistant running on the user's own computer.
You have read-only tools that test the network. Use them; do not guess.

Work from the bottom layer up and stop at the first layer that fails:
1. Physical: interfaces up, Wi-Fi signal.
2. Network: an IP address that is not 169.254.x.x, a default gateway, ping the gateway,
   ping a public IP such as 1.1.1.1, and traceroute if the Internet is unreachable.
3. Application: DNS lookup of the site; if it fails, try the same lookup through 1.1.1.1.
4. Transport and application: TCP port check, then an HTTP check.
For a general "is my Internet OK" question, the `diagnose` tool runs the whole sequence.

Reply in plain, simple English for a student: say which layer failed, the evidence
(the actual numbers), what it means, and the fix the user can try. Keep it short.
Mention a check you skipped only if it matters."""


async def ask(client: anthropic.AsyncAnthropic, session: ClientSession, tools: list, history: list, question: str) -> str:
    history.append({"role": "user", "content": question})
    runner = client.beta.messages.tool_runner(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        tools=tools,
        messages=list(history),
    )
    final = None
    async for message in runner:
        final = message
        for block in message.content:
            if block.type == "tool_use":
                print(f"  · {block.name}({', '.join(f'{k}={v}' for k, v in block.input.items())})", file=sys.stderr)
    if final is None:
        return "No answer."
    if final.stop_reason == "refusal":
        return "The model declined to answer this request."
    text = "".join(b.text for b in final.content if b.type == "text").strip()
    history.append({"role": "assistant", "content": text or "(no text)"})
    return text


async def run(question: str | None) -> str | None:
    """Answer one question, or keep asking; returns an error message if the API cannot be used."""
    client = anthropic.AsyncAnthropic()
    server = StdioServerParameters(command=sys.executable, args=["-m", "netdiag.server"])
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            listed = await session.list_tools()
            tools = [async_mcp_tool(t, session) for t in listed.tools]
            history: list = []
            questions = [question] if question else None
            while True:
                if questions is not None:
                    if not questions:
                        return None
                    q = questions.pop(0)
                else:
                    try:
                        q = input("\nYou: ").strip()
                    except EOFError:
                        return None
                    if q.lower() in {"", "exit", "quit"}:
                        return None
                try:
                    answer = await ask(client, session, tools, history, q)
                except anthropic.AuthenticationError:
                    return NO_KEY
                except anthropic.APIConnectionError:
                    return NO_API
                print("\nAgent: " + answer)


def main() -> None:
    question = " ".join(sys.argv[1:]) or None
    try:
        problem = asyncio.run(run(question))
    except KeyboardInterrupt:
        return
    if problem:
        sys.exit(problem)


if __name__ == "__main__":
    main()
