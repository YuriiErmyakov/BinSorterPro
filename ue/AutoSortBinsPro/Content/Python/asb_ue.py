# AutoSortBins Pro for Unreal Engine - backend inside the editor (started by init_unreal.py).
#  * serves the shared panel UI (AutoSortBinsPro/ext) on 127.0.0.1 for the C++ tab (SWebBrowser);
#  * answers the panel's host calls (asb_ue_host.py) on the game thread (slate post-tick queue);
#  * adds "AutoSortBins Pro" to the Tools menu and to the Content Browser folder menu.
import json
import os
import queue
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import unreal

import asb_ue_host as H

NO_WINDOW = 0x08000000
PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json"}


def log(msg):
    unreal.log("[AutoSortBins Pro] " + msg)


def ui_dir():
    cands = [os.environ.get("ASB_UE_UI"),
             os.path.join(PLUGIN_DIR, "Resources", "Web"),
             os.path.normpath(os.path.join(PLUGIN_DIR, "..", "..", "ext"))]
    for c in cands:
        if c and os.path.isfile(os.path.join(c, "index.html")) and os.path.isfile(os.path.join(c, "js", "core.js")):
            return c
    return None


class _Job(object):
    __slots__ = ("fn", "args", "ev", "res", "err")

    def __init__(self, fn, args):
        self.fn, self.args, self.ev, self.res, self.err = fn, args, threading.Event(), None, None


class GameThread(object):
    """Runs the host calls on the editor's game thread, one at a time."""

    def __init__(self):
        self.q = queue.Queue()
        self.handle = None
        self.inside = False

    def start(self):
        self.handle = unreal.register_slate_post_tick_callback(self._tick)

    def stop(self):
        if self.handle is not None:
            unreal.unregister_slate_post_tick_callback(self.handle)
            self.handle = None

    def _tick(self, dt):
        if self.inside:                # a progress dialog of a running call ticks Slate: do not start another call
            return
        try:
            job = self.q.get_nowait()
        except queue.Empty:
            return
        self.inside = True
        try:
            job.res = job.fn(job.args)
        except BaseException as e:
            job.err = e
        finally:
            self.inside = False
        job.ev.set()

    def call(self, fn, args=None, timeout=1800):
        job = _Job(fn, args)
        self.q.put(job)
        if not job.ev.wait(timeout):
            raise RuntimeError("Unreal Editor did not answer (a modal dialog?)")
        if job.err is not None:
            raise job.err
        return job.res


def make_handler(backend):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass

        def _send(self, code, body=b"", ctype="application/json; charset=utf-8"):
            if isinstance(body, (dict, list)):
                body = json.dumps(body, ensure_ascii=False).encode("utf-8")
            elif isinstance(body, str):
                body = body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def do_GET(self):
            u = urllib.parse.urlsplit(self.path)
            root = backend.ui
            if not root:
                return self._send(500, "AutoSortBins Pro: UI folder not found (AutoSortBinsPro/ext)", "text/plain; charset=utf-8")
            rel = urllib.parse.unquote(u.path).lstrip("/") or "index.html"
            full = os.path.realpath(os.path.join(root, rel))
            if not full.startswith(os.path.realpath(root) + os.sep) or not os.path.isfile(full):
                return self._send(404, "not found", "text/plain")
            with open(full, "rb") as f:
                data = f.read()
            return self._send(200, data, MIME.get(os.path.splitext(full)[1].lower(), "application/octet-stream"))

        def do_POST(self):
            u = urllib.parse.urlsplit(self.path)
            if u.path != "/api/host":
                return self._send(404, {"error": "not found"})
            if not secrets.compare_digest(self.headers.get("X-ASB-Key") or "", backend.key):
                return self._send(403, {"error": "forbidden"})
            n = int(self.headers.get("Content-Length") or 0)
            try:
                msg = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
                data = backend.gt.call(lambda a: H.run(a["fn"], a.get("args")), msg)
                return self._send(200, {"ok": True, "data": data})
            except BaseException as e:
                return self._send(200, {"ok": False, "error": str(e) or type(e).__name__})

    return Handler


class Backend(object):
    def __init__(self):
        self.key = secrets.token_hex(16)
        self.gt = GameThread()
        self.ui = ui_dir()
        self.server = None
        self.port = 0

    def start(self):
        self.gt.start()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self))
        self.server.daemon_threads = True
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True, name="AutoSortBinsHTTP").start()
        log("panel on %s (UI: %s)" % (self.url(), self.ui))

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
        self.gt.stop()

    def url(self):
        return "http://127.0.0.1:%d/index.html?app=ue&k=%s" % (self.port, self.key)


# ---------------------------------------------------------------- entry points

def instance():
    return getattr(sys, "_asb_ue_backend", None)


def open_external():
    """The panel in a separate app-style window (when the C++ tab is not loaded)."""
    b = instance()
    if not b:
        return
    for edge in (r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"):
        if os.path.isfile(edge):
            subprocess.Popen([edge, "--app=" + b.url(), "--window-size=320,760"], creationflags=NO_WINDOW)
            return
    os.startfile(b.url())


def open_panel():
    L = getattr(unreal, "AutoSortBinsLibrary", None)
    if L:
        L.open_panel()
    else:
        open_external()


def sort_selected_folder():
    """Content Browser folder menu: make the clicked folder the one the panel sorts, and show the panel."""
    p = H.selected_folder()
    if p:
        H.set_root(p)
        log("folder to sort: " + p)
    open_panel()


def _entry(menu, section, name, label, tip, command):
    e = unreal.ToolMenuEntry(name=name, type=unreal.MultiBlockType.MENU_ENTRY)
    e.set_label(label)
    e.set_tool_tip(tip)
    e.set_string_command(unreal.ToolMenuStringCommandType.PYTHON, "", command)
    menu.add_menu_entry(section, e)


def _register_menus():
    try:
        menus = unreal.ToolMenus.get()
        m = menus.extend_menu("LevelEditor.MainMenu.Tools")
        m.add_section("AutoSortBinsPro", "AutoSortBins Pro")
        _entry(m, "AutoSortBinsPro", "AutoSortBinsOpen", "AutoSortBins Pro", "Sort Content Browser assets into folders by type",
               "import asb_ue; asb_ue.open_panel()")
        _entry(m, "AutoSortBinsPro", "AutoSortBinsExternal", "AutoSortBins Pro (separate window)",
               "Open the panel in its own window", "import asb_ue; asb_ue.open_external()")
        f = menus.extend_menu("ContentBrowser.FolderContextMenu")
        f.add_section("AutoSortBinsPro", "AutoSortBins Pro")
        _entry(f, "AutoSortBinsPro", "AutoSortBinsFolder", "Sort with AutoSortBins Pro",
               "Make this folder the one AutoSortBins Pro sorts and open the panel", "import asb_ue; asb_ue.sort_selected_folder()")
        menus.refresh_all_widgets()
    except Exception as ex:
        log("menu: %s" % ex)


def _hand_url_to_tab(b):
    """Gives the C++ tab our address; the module may load a little after the Python startup scripts run."""
    state = {"t": 0.0, "h": None}

    def tick(dt):
        state["t"] += dt
        L = getattr(unreal, "AutoSortBinsLibrary", None)
        if L:
            L.set_panel_url(b.url())
        elif state["t"] < 30:
            return
        else:
            log("C++ module not loaded: use Tools > AutoSortBins Pro (separate window)")
        unreal.unregister_slate_post_tick_callback(state["h"])
    state["h"] = unreal.register_slate_post_tick_callback(tick)


def start():
    old = instance()
    if old:
        try:
            old.stop()
        except Exception:
            pass
    b = Backend()
    b.start()
    sys._asb_ue_backend = b
    _hand_url_to_tab(b)
    _register_menus()
    return b


def restart():
    """Reloads the Python modules (after edits) and restarts the backend; an open panel gets the new address."""
    import importlib
    importlib.reload(H)
    mod = importlib.reload(sys.modules[__name__])
    return mod.start()
