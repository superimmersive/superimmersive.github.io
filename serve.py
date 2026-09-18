"""Local static server with USDZ / GLB MIME types for AR Quick Look."""
import http.server
import json
import mimetypes
import os
import re
import socket
import sys

mimetypes.add_type("model/vnd.usdz+zip", ".usdz")
mimetypes.add_type("model/gltf-binary", ".glb")
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("image/gif", ".gif")
mimetypes.add_type("image/jpeg", ".jpeg")

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
VIDEO_EXT = {".mp4", ".webm", ".mov"}


def natural_key(name):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]


def client_manifest():
    root = os.path.join(os.getcwd(), "assets", "clients")
    catalog = {}
    if not os.path.isdir(root):
        return catalog
    for name in sorted(os.listdir(root)):
        folder = os.path.join(root, name)
        if not os.path.isdir(folder) or name.startswith("_"):
            continue
        files = []
        for filename in os.listdir(folder):
            ext = os.path.splitext(filename)[1].lower()
            if ext in VIDEO_EXT:
                kind = "video"
            elif ext in IMAGE_EXT:
                kind = "image"
            else:
                continue
            files.append({"file": filename, "kind": kind})
        files.sort(key=lambda item: natural_key(item["file"]))
        catalog[name] = files
    return catalog


def write_client_manifest():
    path = os.path.join("assets", "clients", "manifest.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(client_manifest(), handle, indent=2)
        handle.write("\n")
    return path

PORT = 5183
BIND = "0.0.0.0"


def lan_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("1.1.1.1", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        lowered = path.lower()
        if lowered.endswith(".usdz"):
            return "model/vnd.usdz+zip"
        if lowered.endswith(".glb"):
            return "model/gltf-binary"
        if lowered.endswith(".svg"):
            return "image/svg+xml"
        if lowered.endswith(".mp4"):
            return "video/mp4"
        return super().guess_type(path)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/assets/clients/manifest.json":
            body = json.dumps(client_manifest()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/lan.json":
            body = json.dumps({"origin": "http://%s:%s" % (lan_ip(), PORT)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()


if __name__ == "__main__":
    write_client_manifest()
    ip = lan_ip()
    print("Local  http://127.0.0.1:%s/" % PORT)
    print("Phone  http://%s:%s/services/interactive-web.html" % (ip, PORT))
    sys.stdout.flush()
    http.server.test(HandlerClass=Handler, port=PORT, bind=BIND)
