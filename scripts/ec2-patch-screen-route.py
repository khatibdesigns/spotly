# One-shot patch: add a /screen route to caption-proxy/server.py that delegates
# to screen_mod.run_screen(). Idempotent.
p = "server.py"
s = open(p).read()
orig = s

route = '''        if self.path == "/screen":
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                self._send(400, {"error": "invalid JSON body"})
                return
            places = payload.get("places") or []
            if not places:
                self._send(200, {"results": []})
                return
            try:
                import screen_mod
                self._send(200, {"results": screen_mod.run_screen(places[:60])})
            except subprocess.TimeoutExpired:
                self._send(504, {"error": "screen timed out"})
            except Exception as e:
                self._send(500, {"error": str(e)[:300]})
            return
'''

marker = "    def do_POST(self):\n"
if marker not in s:
    raise SystemExit("ERROR: do_POST marker not found")
if '"/screen"' not in s:
    s = s.replace(marker, marker + route, 1)

open(p, "w").write(s)
print("route present:", '"/screen"' in s, "| delta bytes:", len(s) - len(orig))
