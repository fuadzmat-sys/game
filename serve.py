"""Optional localhost server for browsers that restrict opening local files."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import webbrowser

if __name__ == "__main__":
    root=Path(__file__).resolve().parent
    server=ThreadingHTTPServer(("127.0.0.1",8765),partial(SimpleHTTPRequestHandler,directory=str(root)))
    print("Reverse Falls: open http://127.0.0.1:8765 in your browser. Ctrl+C to stop.")
    webbrowser.open("http://127.0.0.1:8765")
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
