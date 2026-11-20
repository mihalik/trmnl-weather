#!/usr/bin/env python3
"""Push a local markup file to the hosted TRMNL plugin over its MCP endpoint.

Usage:
    python3 scripts/push-trmnl.py [file]

Defaults to fun.html. The MCP URL (with the plugin's api_key) is read from
.mcp.json at the repo root, which is gitignored; the key is never printed.

TRMNL's MCP server rejects requests over ~64 KB, so:
  - A file containing the SPLIT_MARKER line is pushed in two requests:
    everything above the marker to markup_shared (TRMNL prepends it to every
    layout), everything below to markup_full. Without the marker, the whole
    file goes to markup_full and markup_shared is cleared.
  - Leading indentation, blank lines, and full-line // comments are stripped.
    Newlines are kept, so rendering is unchanged (avoid <pre> blocks,
    whitespace-sensitive multi-line strings, and lines starting with // inside
    template literals).
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPLIT_MARKER = "<!-- trmnl:split"
EMPTY_SHARED = "<!-- no shared markup -->"
MAX_REQUEST_BYTES = 64 * 1024
HEADERS = {
    # TRMNL's edge returns 403 for Python's default User-Agent.
    "User-Agent": "trmnl-weather-push/1.0",
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


def compact(markup):
    lines = (line.strip() for line in markup.splitlines())
    return "\n".join(l for l in lines if l and not l.startswith("//"))


def split(markup):
    """Return (shared, full); shared is None when the file has no marker."""
    lines = markup.splitlines()
    at = [i for i, l in enumerate(lines) if l.strip().startswith(SPLIT_MARKER)]
    if not at:
        return None, markup
    if len(at) > 1:
        sys.exit(f"More than one {SPLIT_MARKER} marker")
    return "\n".join(lines[:at[0]]), "\n".join(lines[at[0] + 1:])


class Client:
    def __init__(self, url):
        self.url = url
        self.session_id = None
        self.next_id = 1

    def post(self, payload):
        headers = dict(HEADERS)
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        data = json.dumps(payload).encode()
        req = urllib.request.Request(self.url, data=data, headers=headers, method="POST")
        try:
            resp = urllib.request.urlopen(req, timeout=60)
        except urllib.error.HTTPError as e:
            sys.exit(f"HTTP {e.code}: {e.read().decode()[:500]}")
        with resp:
            self.session_id = resp.headers.get("Mcp-Session-Id") or self.session_id
            body = resp.read().decode()
        if "id" not in payload or not body.strip():
            return None
        if body.lstrip().startswith("{"):
            return json.loads(body)
        for line in body.splitlines():  # SSE response
            if line.startswith("data:"):
                msg = json.loads(line[5:])
                if msg.get("id") == payload["id"]:
                    return msg
        sys.exit(f"Unexpected response: {body[:500]}")

    def request(self, method, params=None):
        self.next_id += 1
        return self.post({"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params or {}})

    def connect(self):
        self.request("initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "trmnl-weather-push", "version": "1.0"},
        })
        self.post({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def write_markup(self, size, content):
        res = self.request("tools/call", {"name": "MarkupsWriteTool", "arguments": {"size": size, "content": content}})
        if "error" in res:
            sys.exit(f"{size}: error {res['error']}")
        result = json.loads(res["result"]["content"][0]["text"])
        if not result.get("success"):
            sys.exit(f"{size}: failed {result}")
        return result.get("warnings", [])


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "fun.html")
    url = json.loads((ROOT / ".mcp.json").read_text())["mcpServers"]["trmnl"]["url"]

    shared, full = split(src.read_text(encoding="utf-8"))
    shared = compact(shared) if shared is not None else EMPTY_SHARED
    full = compact(full)
    # Order keeps every intermediate state renderable: new shared code is only
    # used once the new full markup lands, and stale shared code is harmless.
    parts = [("markup_shared", shared), ("markup_full", full)]
    if shared == EMPTY_SHARED:
        parts.reverse()

    for size, content in parts:
        request_size = len(json.dumps(content)) + 300  # + JSON-RPC envelope
        print(f"{src.name} -> {size}: ~{request_size:,} bytes (limit ~{MAX_REQUEST_BYTES:,})")
        if request_size > MAX_REQUEST_BYTES:
            sys.exit(f"{size} too large for the MCP endpoint; move the {SPLIT_MARKER} marker, trim, "
                     "or paste in the TRMNL web editor. Nothing was uploaded.")

    client = Client(url)
    client.connect()
    for size, content in parts:
        warnings = client.write_markup(size, content)
        print(f"Uploaded {size}.")
        for w in warnings:
            print(f"  warning: {w.get('message')}")


if __name__ == "__main__":
    main()
