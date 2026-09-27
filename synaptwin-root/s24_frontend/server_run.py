import socketserver
import http.server
import urllib.request
import os
import sys

os.chdir(r'C:\Users\owais\Downloads\synaptwin-deploy-ready\synaptwin-root\s24_frontend\dist')

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=r'C:\Users\owais\Downloads\synaptwin-deploy-ready\synaptwin-root\s24_frontend\dist', **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_request()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_request()
        else:
            self.send_error(404)

    def proxy_request(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length else None
        
        req = urllib.request.Request(
            f'http://localhost:5000{self.path}',
            data=body,
            headers={k: v for k, v in self.headers.items()},
            method=self.command
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                self.send_response(response.status)
                for header, value in response.headers.items():
                    if header.lower() not in ('content-length', 'transfer-encoding'):
                        self.send_header(header, value)
                self.end_headers()
                self.wfile.write(response.read())
        except Exception as e:
            self.send_error(502, f'Bad Gateway: {e}')

with socketserver.TCPServer(('0.0.0.0', 3000), ProxyHTTPRequestHandler) as httpd:
    httpd.serve_forever()