"""Static local server for the Pong project and its /pong/ shortcut."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PagesHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parents[1]), **kwargs)

    def do_GET(self):  # noqa: N802 - stdlib handler API
        if self.path == "/pong":
            self.send_response(301)
            self.send_header("Location", "/pong/")
            self.end_headers()
            return
        if self.path == "/pong/":
            self.path = "/index.html"
        super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 4000), PagesHandler)
    print("Serving RL Pong at http://localhost:4000/pong/")
    server.serve_forever()
