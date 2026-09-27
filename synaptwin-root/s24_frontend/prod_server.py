#!/usr/bin/env python3
"""
Simple HTTP server with API proxy for SynapTwin frontend production.
Serves built React app and proxies /api/* to backend on port 5000.
"""
import http.server
import socketserver
import urllib.request
import json
import sys
import os

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=r"C:\Users\owais\Downloads\synaptwin-deploy-ready\synaptwin-root\s24_frontend\dist", **kwargs)

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

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_request()
        else:
            self.send_error(404)

    def proxy_request(self):
        # Forward request to backend
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

if __name__ == '__main__':
    PORT = 3000
    import os
    os.chdir(r'C:\Users\owais\Downloads\synaptwin-deploy-ready\synaptwin-root\s24_frontend\dist')
    
    with socketserver.TCPServer(("0.0.0.0", 3000), ProxyHTTPRequestHandler) as httpd:
        print(f"Serving on http://localhost:3000 (proxying /api to localhost:5000)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()