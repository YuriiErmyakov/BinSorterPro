# AutoSortBins Pro for Unreal Engine - the host calls (the same call set as host_ae.jsx and dr/asb_server.lua).
# The panel posts {fn, args} to asb_ue.py, which runs run(fn, args) here on the game thread.
# Deciding what goes where happens in ext/js/core.js; this file only reads the Content Browser and moves assets.
# "Bins" are folders inside the sort folder (settings root); ids are folder paths and asset package names.
import json
import os
import subprocess
import time
import zlib

import unreal

STORE = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "AutoSortBinsPro")
SKIP_DIRS = ("__externalactors__", "__externalobjects__")   # World Partition data: never listed, never moved
NO_WINDOW = 0x08000000

eal = unreal.EditorAssetLibrary
_listed = []           # items of the last walk (dicts the panel gets in chunks)
_walked = ""           # doc the list above belongs to
_anc = {}              # class path -> [ancestor class names]
_settings = None       # last saved panel settings (the sort folder lives there)

# folder colours of the palette in core.js (PROFILES.ue.labels), label 1..16
COLOURS = ["#D9534F", "#E8873A", "#E3C34A", "#9BCB3B", "#5BC254", "#4FB3A0", "#2EC4D6", "#9AA9C0",
           "#4D8DF7", "#8C6CF0", "#A65BD6", "#C05BD6", "#E06A9A", "#B5A27A", "#7A7F87", "#E2E4E8"]


def registry():
    return unreal.AssetRegistryHelpers.get_asset_registry()


def lib():
    """The C++ half of the plugin (folder colours, redirector fix-up); None until the editor was restarted with it."""
    return getattr(unreal, "AutoSortBinsLibrary", None)


# ---------------------------------------------------------------- files in %APPDATA%\AutoSortBinsPro

def _store(name):
    os.makedirs(STORE, exist_ok=True)
    return os.path.join(STORE, name)


def _read(name):
    try:
        with open(_store(name), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write(name, value):
    tmp = _store(name) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False)
    os.replace(tmp, _store(name))


def settings():
    global _settings
    if _settings is None:
        _settings = _read("settings_ue.json") or {}
    return _settings


def save_settings(value):
    global _settings
    _settings = value
    _write("settings_ue.json", value)


def root():
    parts = [p for p in str(settings().get("root") or "/Game").replace("\\", "/").split("/") if p.strip()]
    return "/" + "/".join(p.strip() for p in parts) if parts else "/Game"


def set_root(path):
    st = dict(settings())
    st["root"] = path
    save_settings(st)


# ---------------------------------------------------------------- project

def _project():
    f = unreal.Paths.convert_relative_path_to_full(unreal.Paths.get_project_file_path())
    return os.path.basename(f), os.path.normpath(f)


def _doc():
    return _project()[1] + "#" + root()


def _same(a):
    if not a.get("doc") or a["doc"] != _walked or _doc() != _walked:
        raise RuntimeError("The project or the folder changed - press Rescan")


def _skipped(path):
    return any(p.lower() in SKIP_DIRS for p in str(path).split("/"))


def _assets(base):
    out = []
    for a in registry().get_assets_by_path(base, recursive=True, include_only_on_disk_assets=False):
        if a.is_redirector() or _skipped(a.package_path):
            continue
        out.append(a)
    return out


def _parent_of(path, base):
    p = path.rsplit("/", 1)[0]
    return None if p.lower() == base.lower() or len(p) < len(base) else p


def info(a=None):
    name, path = _project()
    base = root()
    exists = eal.does_directory_exist(base)
    return {"project": name, "path": path + "#" + base, "doc": path + "#" + base, "root": base,
            "exists": exists, "adds": len(_assets(base)) if exists else 0}


def _ancestors(cls_path):
    key = str(cls_path.package_name) + "." + str(cls_path.asset_name)
    if key not in _anc:
        try:
            _anc[key] = [str(x.asset_name) for x in registry().get_ancestor_class_names(cls_path)]
        except Exception:
            _anc[key] = []
    return _anc[key]


def _source(a):
    raw = a.get_tag_value("AssetImportData")
    if not raw or raw == "None":
        return ""
    try:
        files = json.loads(str(raw))
        return files[0].get("RelativeFilename", "") if files else ""
    except Exception:
        return ""


def _facts(a, base):
    cls = a.asset_class_path
    dur = 0.0
    try:
        d = a.get_tag_value("Duration")
        if d and d != "None":
            dur = float(d)
    except Exception:
        pass
    return {"id": str(a.package_name), "name": str(a.asset_name), "bin": _parent_of(str(a.package_name), base),
            "label": None, "cls": str(cls.asset_name), "anc": _ancestors(cls), "path": _source(a), "dur": dur}


def snapBegin(a=None):
    global _listed, _walked
    base = root()
    if not eal.does_directory_exist(base):
        raise RuntimeError("Folder %s does not exist - pick another one in Settings" % base)
    bins = []
    for p in sorted(str(x) for x in registry().get_sub_paths(base, recurse=True)):
        if _skipped(p):
            continue
        bins.append({"id": p, "name": p.rsplit("/", 1)[1], "parent": _parent_of(p, base),
                     "virtual": False, "unit": False, "label": None})
    _listed = [_facts(x, base) for x in _assets(base)]
    _walked = _doc()
    name, path = _project()
    return {"doc": _walked, "project": name, "path": path + "#" + base, "bins": bins, "total": len(_listed), "seqs": 0}


def snapChunk(a):
    _same(a)
    return _listed[a["from"]:a["from"] + a["n"]]


def sig(a=None):
    t0 = time.perf_counter()
    base = root()
    if not eal.does_directory_exist(base):
        return {"sig": "", "ms": 0}
    names = sorted(str(x.package_name) for x in _assets(base))
    h = zlib.crc32("\n".join(names).encode("utf-8"))
    return {"sig": "%s:%d:%08x" % (_doc(), len(names), h), "ms": round((time.perf_counter() - t0) * 1000)}


# ---------------------------------------------------------------- folders

def _child(parent, name):
    """Existing sub-folder of parent with this name, any case, or None."""
    want = name.lower()
    for p in registry().get_sub_paths(parent, recurse=False):
        p = str(p)
        if p.rsplit("/", 1)[1].lower() == want:
            return p
    return None


def _folder(path, made=None):
    """Full path of the folder at a path of names under the sort folder; with `made` missing ones are created."""
    cur = root()
    for i, name in enumerate(path):
        nxt = _child(cur, name)
        if not nxt:
            nxt = cur + "/" + name
            if made is None:
                return None
            if not eal.does_directory_exist(nxt):
                eal.make_directory(nxt)
                made.append(path[:i + 1])
        cur = nxt
    return cur


def _colour(path, label):
    L = lib()
    if not L or not isinstance(label, (int, float)) or not 1 <= label <= len(COLOURS):
        return
    h = COLOURS[int(label) - 1]
    # Unreal stores folder colours in linear space
    c = [((int(h[i:i + 2], 16) / 255.0) ** 2.2) for i in (1, 3, 5)]
    L.set_folder_color(path, unreal.LinearColor(c[0], c[1], c[2], 1.0))


def ensureBins(a):
    out = {"bins": [], "created": []}
    labels = a.get("labels") or []
    for i, path in enumerate(a["paths"]):
        before = len(out["created"])
        full = _folder(path, out["created"])
        lab = labels[i] if i < len(labels) else -1
        if lab is not None and lab >= 0 and lib() and (len(out["created"]) > before or not lib().has_folder_color(full)):
            _colour(full, lab)
        out["bins"].append({"path": path, "id": full})
    return out


def move(a):
    """moves: [{id (package name), path ([names], [] = the sort folder) or bin (folder path)}].
    Moving renames the asset: ids maps old package names to new ones."""
    r = {"moved": 0, "missing": [], "failed": [], "ids": {}}
    at = unreal.AssetToolsHelpers.get_asset_tools()
    todo, sources = [], set()
    with unreal.ScopedSlowTask(len(a["moves"]), "AutoSortBins Pro: preparing assets") as task:
        task.make_dialog_delayed(0.5)
        for m in a["moves"]:
            task.enter_progress_frame(1)
            old = m["id"]
            dest = _folder(m["path"]) if "path" in m else (m.get("bin") or root())
            if not dest or not eal.does_asset_exist(old):
                r["missing"].append(old)
                continue
            name = old.rsplit("/", 1)[1]
            here = old.rsplit("/", 1)[0]
            if here.lower() == dest.lower():
                r["moved"] += 1
                continue
            if eal.does_asset_exist(dest + "/" + name):
                r["failed"].append(old)            # a different asset of that name is already there
                continue
            obj = eal.load_asset(old)
            if not obj:
                r["missing"].append(old)
                continue
            todo.append((old, dest + "/" + name, unreal.AssetRenameData(asset=obj, new_package_path=dest, new_name=name)))
            sources.add(here)
    if todo:
        at.rename_assets([t[2] for t in todo])
        for old, new, _ in todo:
            if eal.does_asset_exist(new):
                r["moved"] += 1
                r["ids"][old] = new
            else:
                r["failed"].append(old)
        # references that could not be updated in place leave redirectors behind: point them at the new assets
        if lib() and sources:
            lib().fix_up_redirectors(sorted(sources))
        dirty = unreal.EditorLoadingAndSavingUtils.get_dirty_content_packages()
        if dirty:
            unreal.EditorLoadingAndSavingUtils.save_packages(dirty, True)
    return r


def setLabels(a):
    return 0                                       # assets have no colour in Unreal; folders are coloured in ensureBins


def deleteBins(a):
    """Deletes folders given by ids (paths) or by paths of names, deepest first, only when no asset is left inside."""
    r = {"deleted": 0, "kept": 0}
    if a.get("paths"):
        full = [_folder(p) for p in sorted(a["paths"], key=len, reverse=True)]
    else:
        full = list(a.get("ids") or [])
    base = root().lower()
    for f in sorted([x for x in full if x], key=lambda x: -x.count("/")):
        try:
            if f.lower() == base or not eal.does_directory_exist(f) or registry().has_assets(f, recursive=True):
                r["kept"] += 1
                continue
            if eal.delete_directory(f):
                r["deleted"] += 1
                if lib():
                    lib().clear_folder_color(f)
            else:
                r["kept"] += 1
        except Exception:
            r["kept"] += 1
    return r


def batch(a):
    _same(a)
    out = []
    for fn, args in a["calls"]:
        args = dict(args or {})
        args["doc"] = a["doc"]
        out.append(CALLS[fn](args))
    return out


# ---------------------------------------------------------------- the panel's own things

def settingsLoad(a=None):
    global _settings
    _settings = None
    return _read("settings_ue.json")


def settingsSave(a):
    save_settings(a["settings"])
    return True


def historyLoad(a):
    return (_read("history_ue.json") or {}).get(a["key"], [])


def historySave(a):
    h = _read("history_ue.json") or {}
    if a["records"]:
        h[a["key"]] = a["records"]
    else:
        h.pop(a["key"], None)
    keys = sorted(h, key=lambda k: -h[k][-1]["t"])
    for k in keys[30:]:                            # the 30 most recently sorted folders are kept
        del h[k]
    _write("history_ue.json", h)
    return True


def _content_path(p):
    """'/All/Game/Props' (Content Browser virtual path) -> '/Game/Props'."""
    p = str(p or "")
    if p.startswith("/All/"):
        p = p[4:]
    if p.startswith("/Plugins/"):                   # plugin content shows up as /All/Plugins/<Name>/...
        p = p[8:]
    return p.rstrip("/")


def browserPath(a=None):
    try:
        p = unreal.EditorUtilityLibrary.get_current_content_browser_path()
    except Exception:
        p = ""
    p = _content_path(p)
    return p if p and eal.does_directory_exist(p) else None


def selected_folder():
    try:
        sel = [_content_path(p) for p in unreal.EditorUtilityLibrary.get_selected_folder_paths()]
    except Exception:
        sel = []
    sel = [p for p in sel if p and eal.does_directory_exist(p)]
    return sel[0] if sel else browserPath()


def saveText(a):
    """The report goes to <Project>/Saved/AutoSortBinsPro and is shown in Explorer (the web view has no save dialog)."""
    d = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "AutoSortBinsPro")
    os.makedirs(d, exist_ok=True)
    name = "".join("_" if c in '\\/:*?"<>|' else c for c in a["name"]) or "report.txt"
    path = os.path.normpath(os.path.join(d, name))
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(a["text"])
    subprocess.Popen(["explorer", "/select,", path], creationflags=NO_WINDOW)
    return path


CALLS = {f.__name__: f for f in (info, snapBegin, snapChunk, sig, ensureBins, move, setLabels, deleteBins, batch,
                                  settingsLoad, settingsSave, historyLoad, historySave, browserPath, saveText)}


def run(fn, args):
    if fn not in CALLS:
        raise RuntimeError("Unknown call " + str(fn))
    return CALLS[fn](args or {})
