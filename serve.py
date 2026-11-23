"""
SOS Guardian – Local Test Server
Serves the mobile application locally so you can test single/double/triple taps,
GPS location acquisition, Bluetooth Low Energy discovery, and safe diagnostics.
"""

import http.server
import socketserver
import os
import sys
import webbrowser
import socket

PORT = 8080
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def log_message(self, format, *args):
        # Keep terminal log clean
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

def find_available_port(start_port=8080):
    port = start_port
    while port < 65535:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
            port += 1
    return start_port

def run():
    port = find_available_port(PORT)
    local_ip = get_local_ip()
    url_local = f"http://localhost:{port}"
    url_network = f"http://{local_ip}:{port}"

    print("=" * 65)
    print("  🚨 SOS GUARDIAN – SMART EMERGENCY ALERT SYSTEM 🚨")
    print("=" * 65)
    print(f"  ✓ Local Browser Access : {url_local}")
    print(f"  ✓ Mobile Phone Access  : {url_network} (Connect on same Wi-Fi)")
    print(f"  ✓ Directory Served     : {PUBLIC_DIR}")
    print("=" * 65)
    print("  Press Ctrl+C to stop the server\n")

    # Open browser automatically
    try:
        webbrowser.open(url_local)
    except Exception:
        pass

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down SOS Guardian server.")

if __name__ == '__main__':
    run()
