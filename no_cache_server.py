"""Local dev static file server that sends real no-cache HTTP headers on
every response. Replaces the bare `python -m http.server`, which sends no
Cache-Control headers at all and let the browser's own disk cache serve
stale pages across sessions - a real, confirmed cause of repeated "my
changes aren't showing up" reports, since a <meta http-equiv="Cache-Control">
tag in the HTML is a much weaker signal than a real HTTP response header and
isn't reliably honored by modern browsers' disk cache decisions.
"""
import http.server
import socketserver

PORT = 5173


class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with ReusableTCPServer(('', PORT), NoCacheHTTPRequestHandler) as httpd:
        print('Serving on port', PORT, 'with no-cache headers on every response')
        httpd.serve_forever()
