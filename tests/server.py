"""Локальный сервер, повторяющий поведение Vercel: cleanUrls и заголовки из vercel.json (включая CSP).

Так e2e-тесты ловят то же, что сломалось бы в продакшене: инлайн-скрипты, запрещённые CSP,
битые «чистые» адреса (/app, /checkin) и т. п.
Запуск вручную: python tests/server.py 8765
"""
from __future__ import annotations

import http.server
import json
import re
import socketserver
import sys
import threading
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_rules():
    cfg = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    rules = []
    for block in cfg.get("headers", []):
        src = block["source"]
        # Vercel path-to-regexp: "/(.*)" и "/(.*)\\.(woff2|png)" — достаточно простой трансляции
        rx = re.compile("^" + src + "$")
        hdrs = []
        for h in block["headers"]:
            k, v = h["key"], h["value"]
            if k.lower() == "strict-transport-security":
                continue  # не для http://127.0.0.1
            if k.lower() == "content-security-policy":
                v = v.replace("; upgrade-insecure-requests", "")
            hdrs.append((k, v))
        rules.append((rx, hdrs))
    return rules


RULES = _load_rules()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webmanifest": "application/manifest+json", ".js": "text/javascript", ".woff2": "font/woff2"}

    def log_message(self, *args):  # тихо
        pass

    def _clean(self):
        path, _, query = self.path.partition("?")
        if path != "/" and not Path(path).suffix:
            cand = ROOT / (path.lstrip("/") + ".html")
            if cand.is_file():
                path = path + ".html"
        self.path = path + ("?" + query if query else "")

    def do_GET(self):
        self._orig = self.path.partition("?")[0]
        self._clean()
        return super().do_GET()

    def do_HEAD(self):
        self._orig = self.path.partition("?")[0]
        self._clean()
        return super().do_HEAD()

    def end_headers(self):
        p = getattr(self, "_orig", self.path)
        for rx, hdrs in RULES:
            if rx.match(p):
                for k, v in hdrs:
                    self.send_header(k, v)
        super().end_headers()


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start(port: int = 0):
    srv = _Server(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv, url = start(port)
    print("serving", url)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        srv.shutdown()
