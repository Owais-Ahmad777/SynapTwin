#!/usr/bin/env python3
"""
Simple HTTP server with API proxy for SynapTwin frontend development.
Proxies /api/* requests to the backend on port 5000.
"""
import http.server
import socketserver
import urllib.request
import json
import sys
import os

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
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
        backend_url = f'http://localhost:5000{self.path}'
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None
        
        # Prepare request to backend
        req = urllib.request.Request(
            f'http://localhost:5000{self.path}',
            data=self.rfile.read(int(self.headers.get('Content-Length', 0))) if self.headers.get('Content-Length') else None,
            headers={k: v for k, v in self.headers.items()},
            method=self.command
        )
        
        try:
            with urllib.request.urlopen(urllib.request.Request(
                f'http://localhost:5000{self.path}',
                data=self.rfile.read(int(self.headers.get('Content-Length', 0))) if self.headers.get('Content-Length') else None,
                headers={k: v for k, v in self.headers.items()},
                method=self.command
            )) as response:
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