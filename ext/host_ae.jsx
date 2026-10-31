// BinSorter Pro for After Effects - ExtendScript host. Keep pure ASCII.
// The panel calls ASB.run("<fn>", "<json args>") and gets a JSON string {ok, data | error}.
// Deciding what goes where happens in js/core.js; this file only reads the project and moves things.
// Ids cross this border as strings (item.id). "Bins" are project folders here.

(function () {
var ASB = {};
$.global.ASB = ASB;
ASB.VERSION = "1.0.0";

var list = [];       // ids of the items of the last walk, folders and the contents of unit folders left out
var kids = {};       // folder id ("" = root) -> [{name, id}] of its sub-folders
var walked = "";     // project the tables above belong to

// ---------------------------------------------------------------- JSON (ES3)

function str(v) {
    var t = typeof v, i, a;
    if (v === null || v === undefined) return "null";
    if (t == "number") return isFinite(v) ? String(v) : "null";
    if (t == "boolean") return v ? "true" : "false";
    if (t == "string") {
        return '"' + v.replace(/[\\"\u0000-\u001f\u007f-\uffff]/g, function (c) {
            if (c == '"') return '\\"';
            if (c == "\\") return "\\\\";
            return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }
    if (v instanceof Array) { a = []; for (i = 0; i < v.length; i++) a.push(str(v[i])); return "[" + a.join(",") + "]"; }
    a = [];
    for (i in v) if (v.hasOwnProperty(i) && typeof v[i] != "function") a.push(str(i) + ":" + str(v[i]));
    return "{" + a.join(",") + "}";
}

ASB.run = function (fn, json) {
    try {
        var args = json ? eval("(" + json + ")") : {};
        if (!ASB[fn] || fn == "run") throw new Error("Unknown call " + fn);
        return str({ ok: true, data: ASB[fn](args) });
    } catch (e) {
        return str({ ok: false, error: String(e.message || e.toString()) + (e.line ? " (line " + e.line + ")" : "") });
    }
};

// ---------------------------------------------------------------- project

function docId(p) { return p.file ? String(p.file.fsName) : "(untitled)"; }
function proj() {
    if (!app.project) throw new Error("Open a project");
    return app.project;
}
// every call that acts on the tables names the project they were built from
function same(a) {
    var p = proj();
    if (!a.doc || a.doc != walked || docId(p) != walked) throw new Error("The project changed - press Rescan");
    return p;
}
function parentId(p, it) {
    var f = it.parentFolder;
    return !f || f.id == p.rootFolder.id ? null : String(f.id);
}
function byId(p, id) {
    try { return p.itemByID(parseInt(id, 10)); } catch (e) { return null; }
}

// `adds` is what auto-sort watches: it changes whenever something is imported, created or deleted
ASB.info = function () {
    var p = app.project;
    if (!p) return { project: null };
    return { project: p.file ? decodeURI(p.file.name) : "Untitled Project", path: p.file ? String(p.file.fsName) : "", doc: docId(p), adds: p.numItems };
};

// The layers of a PSD or AI imported as a composition come as a folder of footage that all points at one file.
// Such a folder is sorted whole, so its layers are not listed as items.
function isUnit(f) {
    var n = f.numItems, i, it, src, first = null;
    if (!n) return false;
    for (i = 1; i <= n; i++) {
        it = f.item(i);
        if (!(it instanceof FootageItem)) return false;
        src = it.mainSource;
        if (!(src instanceof FileSource) || !src.file) return false;
        if (first === null) first = String(src.file.fsName);
        else if (String(src.file.fsName) != first) return false;
    }
    return n > 1 || / (Layers|\u0421\u043b\u043e\u0438)$/i.test(f.name);
}

ASB.snapBegin = function () {
    var p = proj(), n = p.numItems, bins = [], unit = {}, i, it, id, par, rec;
    list = []; kids = { "": [] };
    for (i = 1; i <= n; i++) {
        it = p.item(i);
        if (!(it instanceof FolderItem)) continue;
        id = String(it.id);
        par = parentId(p, it);
        rec = { id: id, name: it.name, parent: par, virtual: false, unit: isUnit(it), label: it.label };
        if (rec.unit) unit[id] = true;
        bins.push(rec);
        if (!kids[par || ""]) kids[par || ""] = [];
        kids[par || ""].push({ name: rec.name, id: id });
        if (!kids[id]) kids[id] = [];
    }
    for (i = 1; i <= n; i++) {
        it = p.item(i);
        if (it instanceof FolderItem) continue;
        par = parentId(p, it);
        if (par && unit[par]) continue;
        list.push(String(it.id));
    }
    walked = docId(p);
    return { doc: walked, project: ASB.info().project, path: ASB.info().path, bins: bins, total: list.length, seqs: 0 };
};

// facts about list[from .. from+n) of the last walk
ASB.snapChunk = function (a) {
    var p = same(a), out = [], end = Math.min(list.length, a.from + a.n), i, it, o, src;
    for (i = a.from; i < end; i++) {
        it = byId(p, list[i]);
        if (!it) continue;
        o = { id: list[i], name: it.name, bin: parentId(p, it), label: it.label, kind: "other", used: 0,
              solid: false, placeholder: false, path: "", still: false, hasVideo: false, hasAudio: false, dur: 0 };
        if (it instanceof CompItem) {
            o.kind = "comp";
            try { o.used = it.usedIn.length; } catch (e) {}
        } else if (it instanceof FootageItem) {
            o.kind = "footage";
            try {
                o.hasVideo = !!it.hasVideo; o.hasAudio = !!it.hasAudio; o.dur = it.duration;
                src = it.mainSource;
                if (src instanceof SolidSource) o.solid = true;
                else if (src instanceof FileSource) {
                    o.still = !!src.isStill;
                    o.path = src.file ? String(src.file.fsName) : String(src.missingFootagePath || "");
                } else o.placeholder = true;
            } catch (e1) {}
        }
        out.push(o);
    }
    return out;
};

// Fingerprint of the project tree (which items exist and in which folder) and the time it took to make, for auto-sort.
ASB.sig = function () {
    var p = app.project, h = 7, n, i, it, t0 = new Date().getTime();
    if (!p) return { sig: "", ms: 0 };
    n = p.numItems;
    function mix(text) { for (var k = 0; k < text.length; k++) h = (h * 31 + text.charCodeAt(k)) % 2147483629; }
    for (i = 1; i <= n; i++) {
        it = p.item(i);
        mix(it.id + ">" + (it.parentFolder ? it.parentFolder.id : 0) + ";");
    }
    return { sig: docId(p) + ":" + n + ":" + h, ms: new Date().getTime() - t0 };
};

// ---------------------------------------------------------------- folders

function findKid(parentKey, name) {
    var l = kids[parentKey] || [], lowName = name.toLowerCase(), i;
    for (i = 0; i < l.length; i++) if (l[i].name == name) return l[i].id;
    for (i = 0; i < l.length; i++) if (l[i].name.toLowerCase() == lowName) return l[i].id;
    return null;
}
// id of the folder at this path of names ("" = root); with `made` (an array) missing folders are created and listed there
function binAt(p, path, made, label) {
    var parentKey = "", i, id, f;
    for (i = 0; i < path.length; i++) {
        id = findKid(parentKey, path[i]);
        if (!id) {
            if (!made) return null;
            f = p.items.addFolder(path[i]);
            if (parentKey !== "") f.parentFolder = byId(p, parentKey);
            if (i == path.length - 1 && typeof label == "number" && label >= 0) f.label = label;
            id = String(f.id);
            kids[parentKey].push({ name: path[i], id: id });
            kids[id] = [];
            made.push(path.slice(0, i + 1));
        }
        parentKey = id;
    }
    return parentKey;
}

// paths: [[names]]; labels (optional, one per path, -1 = none) colour the folders that had to be created
ASB.ensureBins = function (a) {
    var p = same(a), out = { bins: [], created: [] }, i;
    for (i = 0; i < a.paths.length; i++) {
        out.bins.push({ path: a.paths[i], id: binAt(p, a.paths[i], out.created, a.labels ? a.labels[i] : -1) });
    }
    return out;
};

// moves: [{id, bin (folder id) or path ([names], [] = root), label (-1 = leave)}]. Works for folders too.
ASB.move = function (a) {
    var p = same(a), r = { moved: 0, missing: [], failed: [] }, i, m, it, dest, destId;
    for (i = 0; i < a.moves.length; i++) {
        m = a.moves[i];
        it = byId(p, m.id);
        if (m.path) {
            // no nested ?: here, ExtendScript groups them from the left
            destId = binAt(p, m.path, null);
            if (destId === "") dest = p.rootFolder;
            else dest = destId ? byId(p, destId) : null;
        }
        else dest = m.bin ? byId(p, m.bin) : p.rootFolder;
        if (!it || !dest) { r.missing.push(m.id); continue; }
        try {
            it.parentFolder = dest;
            r.moved++;
            if (typeof m.label == "number" && m.label >= 0) it.label = m.label;
        } catch (e) { r.failed.push(m.id); }
    }
    return r;
};

ASB.setLabels = function (a) {
    var p = same(a), n = 0, i, it;
    for (i = 0; i < a.items.length; i++) {
        it = byId(p, a.items[i].id);
        try { if (it) { it.label = a.items[i].label; n++; } } catch (e) {}
    }
    return n;
};

function onlyFolders(f) {
    for (var i = 1; i <= f.numItems; i++) if (!(f.item(i) instanceof FolderItem) || !onlyFolders(f.item(i))) return false;
    return true;
}
// Deletes folders given by ids or by paths, deepest first, and only those that hold no item at any depth.
ASB.deleteBins = function (a) {
    var p = same(a), ids = [], r = { deleted: 0, kept: 0 }, i, f, id;
    if (a.paths) {
        a.paths.sort(function (x, y) { return y.length - x.length; });
        for (i = 0; i < a.paths.length; i++) { id = binAt(p, a.paths[i], null); if (id) ids.push(id); }
    } else {
        ids = a.ids;
    }
    for (i = 0; i < ids.length; i++) {
        f = byId(p, ids[i]);
        try {
            if (f && (f instanceof FolderItem) && onlyFolders(f)) { f.remove(); r.deleted++; }
            else r.kept++;
        } catch (e) { r.kept++; }
    }
    return r;
};

// Several of the calls above as one undo step: calls = [[fn, args], ...]; returns their results in order.
ASB.batch = function (a) {
    same(a);
    var out = [], i, args;
    app.beginUndoGroup(a.name || "AutoSortBins");
    try {
        for (i = 0; i < a.calls.length; i++) {
            args = a.calls[i][1] || {};
            args.doc = a.doc;
            out.push(ASB[a.calls[i][0]](args));
        }
    } finally {
        app.endUndoGroup();
    }
    return out;
};

// ---------------------------------------------------------------- files in %APPDATA%\AutoSortBinsPro

function store(name) {
    var d = new Folder(Folder.userData.fsName + "/AutoSortBinsPro");
    if (!d.exists) d.create();
    return new File(d.fsName + "/" + name);
}
function readJson(name) {
    var f = store(name), text;
    if (!f.exists) return null;
    f.encoding = "UTF-8";
    if (!f.open("r")) return null;
    text = f.read();
    f.close();
    try { return eval("(" + text + ")"); } catch (e) { return null; }
}
function writeJson(name, v) {
    var f = store(name);
    f.encoding = "UTF-8";
    if (!f.open("w")) throw new Error("Cannot write " + String(f.fsName) + " (Preferences > Scripting & Expressions > Allow Scripts to Write Files)");
    f.write(str(v));
    f.close();
}

ASB.settingsLoad = function () { return readJson("settings_ae.json"); };
ASB.settingsSave = function (a) { writeJson("settings_ae.json", a.settings); return true; };

// sort records for Undo, per project file; the 30 most recently sorted projects are kept
ASB.historyLoad = function (a) {
    var h = readJson("history_ae.json") || {};
    return h[a.key] || [];
};
ASB.historySave = function (a) {
    var h = readJson("history_ae.json") || {}, keys = [], k;
    if (a.records.length) h[a.key] = a.records; else delete h[a.key];
    for (k in h) if (h.hasOwnProperty(k)) keys.push(k);
    if (keys.length > 30) {
        keys.sort(function (x, y) { return h[y][h[y].length - 1].t - h[x][h[x].length - 1].t; });
        for (k = 30; k < keys.length; k++) delete h[keys[k]];
    }
    writeJson("history_ae.json", h);
    return true;
};
})();
