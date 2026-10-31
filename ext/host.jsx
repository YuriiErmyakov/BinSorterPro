// AutoSortBins Pro for Premiere Pro - ExtendScript host. Keep pure ASCII.
// The panel calls ASB.run("<fn>", "<json args>") and gets a JSON string {ok, data | error}.
// Deciding what goes where happens in js/core.js; this file only reads the project and moves things.

(function () {
var ASB = {};
$.global.ASB = ASB;
ASB.VERSION = "1.0.0";

var BIN = 2;
var map = {};        // nodeId -> ProjectItem, bins and items of the last walk
var items = [];      // [{ref, bin}] of the last walk
var kids = {};       // bin nodeId ("" = root) -> [{name, id}] of its sub-bins
var virt = {};       // nodeId of bins whose children live elsewhere (search bins)
var walked = "";     // documentID the tables above belong to

// Premiere reports every item added to a project (imports, new sequences). Auto-sort watches this counter,
// so it does not have to walk the whole tree on every check.
if (typeof $.global.__asbAdds != "number") $.global.__asbAdds = 0;
if (!$.global.__asbBound) {
    $.global.__asbOnAdd = function () { $.global.__asbAdds++; };
    try { $.global.__asbBound = !!app.bind("onItemsAddedToProjectSuccess", $.global.__asbOnAdd); } catch (e0) {}
}

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
        return str({ ok: false, error: (e.message || e.toString()) + (e.line ? " (line " + e.line + ")" : "") });
    }
};

// ---------------------------------------------------------------- project

function proj() {
    if (!app.project || !app.project.rootItem) throw new Error("Open a project");
    return app.project;
}
// every call that acts on the tables names the project they were built from
function same(a) {
    var p = proj();
    if (!a.doc || a.doc != walked || p.documentID != walked) throw new Error("The active project changed - press Rescan");
    return p;
}

ASB.info = function () {
    var p = app.project;
    if (!p || !p.rootItem) return { project: null };
    return { project: p.name, path: p.path, doc: p.documentID, adds: $.global.__asbAdds };
};

// Fills the tables. Returns false when the bin turns out to be a search bin: its children report
// a tree path that is not under it, so they are left to be found where they really are.
function walk(bin, binId, bins) {
    var ch = bin.children, n = ch ? ch.numItems : 0, i, c, id, rec, base = bin.treePath, list = [];
    kids[binId] = list;
    for (i = 0; i < n; i++) {
        c = ch[i];
        if (!c) continue;
        if (i === 0 && binId !== "" && c.treePath != base + "\\" + c.name) return false;
        id = c.nodeId;
        if (map[id]) continue;
        map[id] = c;
        if (c.type == BIN) {
            rec = { id: id, name: c.name, parent: binId || null, virtual: false };
            bins.push(rec);
            list.push({ name: rec.name, id: id });
            if (!walk(c, id, bins)) { rec.virtual = true; virt[id] = true; }
        } else {
            items.push({ ref: c, bin: binId || null });
        }
    }
    return true;
}

ASB.snapBegin = function () {
    var p = proj(), bins = [];
    map = {}; items = []; kids = {}; virt = {};
    walk(p.rootItem, "", bins);
    walked = p.documentID;
    return { doc: walked, project: p.name, path: p.path, bins: bins, total: items.length, seqs: p.sequences.numSequences };
};

// facts about items[from .. from+n) of the last walk
ASB.snapChunk = function (a) {
    same(a);
    var out = [], end = Math.min(items.length, a.from + a.n), i, c, o, m;
    for (i = a.from; i < end; i++) {
        c = items[i].ref;
        o = { id: c.nodeId, name: c.name, bin: items[i].bin, seq: false, path: "", mt: "", dur: 0, label: -1 };
        try { o.seq = !!c.isSequence(); } catch (e) {}
        try { o.label = c.getColorLabel(); } catch (e1) {}
        if (!o.seq) {
            try { o.path = c.getMediaPath() || ""; } catch (e2) {}
            try { m = /Intrinsic\.MediaType>([^<]*)</.exec(c.getProjectMetadata()); if (m) o.mt = m[1]; } catch (e3) {}
            try { o.dur = c.getOutPoint().seconds - c.getInPoint().seconds; } catch (e4) {}
        }
        out.push(o);
    }
    return out;
};

// nodeIds of the sequences that sequences[from .. from+n) use as clips
ASB.nested = function (a) {
    var p = same(a), out = [], seen = {}, end = Math.min(p.sequences.numSequences, a.from + a.n), i, g, t, k, s, group, clips, pi, id;
    for (i = a.from; i < end; i++) {
        s = p.sequences[i];
        for (g = 0; g < 2; g++) {
            group = g ? s.audioTracks : s.videoTracks;
            for (t = 0; t < group.numTracks; t++) {
                clips = group[t].clips;
                for (k = 0; k < clips.numItems; k++) {
                    try {
                        pi = clips[k].projectItem;
                        if (!pi) continue;
                        id = pi.nodeId;
                        if (seen[id]) continue;
                        seen[id] = true;
                        if (pi.isSequence()) out.push(id);
                    } catch (e) {}
                }
            }
        }
    }
    return out;
};

// Fingerprint of the project tree (which items exist and in which bin) and the time it took to make, for auto-sort.
ASB.sig = function () {
    var p = app.project, h = 7, n = 0, t0 = new Date().getTime();
    if (!p || !p.rootItem) return { sig: "", ms: 0 };
    function mix(text) { for (var k = 0; k < text.length; k++) h = (h * 31 + text.charCodeAt(k)) % 2147483629; }
    function go(bin, depth) {
        var ch = bin.children, c = ch ? ch.numItems : 0, i, x;
        for (i = 0; i < c; i++) {
            x = ch[i];
            if (!x) continue;
            n++;
            mix(x.nodeId);
            if (x.type == BIN && depth < 30) { mix("{"); go(x, depth + 1); mix("}"); }
        }
    }
    go(p.rootItem, 0);
    return { sig: p.documentID + ":" + n + ":" + h, ms: new Date().getTime() - t0 };
};

// ---------------------------------------------------------------- bins

function findKid(parentId, name) {
    var list = kids[parentId] || [], lowName = name.toLowerCase(), i;
    for (i = 0; i < list.length; i++) if (list[i].name == name && !virt[list[i].id]) return list[i].id;
    for (i = 0; i < list.length; i++) if (list[i].name.toLowerCase() == lowName && !virt[list[i].id]) return list[i].id;
    return null;
}
// nodeId of the bin at this path of names; with `made` (an array) missing bins are created and listed there
function binAt(p, path, made) {
    var parentId = "", parent = p.rootItem, i, id, b, k, ch;
    for (i = 0; i < path.length; i++) {
        id = findKid(parentId, path[i]);
        if (!id) {
            if (!made) return null;
            b = parent.createBin(path[i]);
            if (!b || !b.nodeId) {                  // older builds return nothing: take the newest bin of that name
                ch = parent.children;
                for (k = ch.numItems - 1; k >= 0; k--) if (ch[k].type == BIN && ch[k].name == path[i] && !map[ch[k].nodeId]) { b = ch[k]; break; }
            }
            if (!b || !b.nodeId) throw new Error("Cannot create the bin " + path[i]);
            id = b.nodeId;
            map[id] = b;
            if (!kids[parentId]) kids[parentId] = [];
            kids[parentId].push({ name: path[i], id: id });
            kids[id] = [];
            made.push(path.slice(0, i + 1));
        }
        parent = map[id];
        parentId = id;
    }
    return parentId;
}

ASB.ensureBins = function (a) {
    var p = same(a), out = { bins: [], created: [] }, i;
    for (i = 0; i < a.paths.length; i++) out.bins.push({ path: a.paths[i], id: binAt(p, a.paths[i], out.created) });
    return out;
};

// moves: [{id, bin (nodeId, null = project root), label (-1 = leave)}]
ASB.move = function (a) {
    var p = same(a), root = p.rootItem, r = { moved: 0, missing: [], failed: [] }, i, m, it, dest;
    for (i = 0; i < a.moves.length; i++) {
        m = a.moves[i];
        it = map[m.id];
        dest = m.bin ? map[m.bin] : root;
        if (!it || !dest) { r.missing.push(m.id); continue; }
        try {
            it.moveBin(dest);
            r.moved++;
            if (typeof m.label == "number" && m.label >= 0) it.setColorLabel(m.label);
        } catch (e) { r.failed.push(m.id); }
    }
    return r;
};

ASB.setLabels = function (a) {
    same(a);
    var n = 0, i, it;
    for (i = 0; i < a.items.length; i++) {
        it = map[a.items[i].id];
        try { if (it) { it.setColorLabel(a.items[i].label); n++; } } catch (e) {}
    }
    return n;
};

function onlyBins(b) {
    var ch = b.children, n = ch ? ch.numItems : 0, i;
    for (i = 0; i < n; i++) if (ch[i].type != BIN || !onlyBins(ch[i])) return false;
    return true;
}
// Deletes bins given by ids or by paths, deepest first, and only those that hold no item at any depth.
ASB.deleteBins = function (a) {
    var p = same(a), list = [], r = { deleted: 0, kept: 0 }, i, b, id;
    if (a.paths) {
        a.paths.sort(function (x, y) { return y.length - x.length; });
        for (i = 0; i < a.paths.length; i++) { id = binAt(p, a.paths[i], null); if (id) list.push(id); }
    } else {
        list = a.ids;
    }
    for (i = 0; i < list.length; i++) {
        b = map[list[i]];
        try {
            if (b && b.type == BIN && !virt[list[i]] && onlyBins(b)) { b.deleteBin(); delete map[list[i]]; r.deleted++; }
            else r.kept++;
        } catch (e) { r.kept++; }
    }
    return r;
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
    if (!f.open("w")) throw new Error("Cannot write " + f.fsName);
    f.write(str(v));
    f.close();
}

ASB.settingsLoad = function () { return readJson("settings.json"); };
ASB.settingsSave = function (a) { writeJson("settings.json", a.settings); return true; };

// sort records for Undo, per project file; the 30 most recently sorted projects are kept
ASB.historyLoad = function (a) {
    var h = readJson("history.json") || {};
    return h[a.key] || [];
};
ASB.historySave = function (a) {
    var h = readJson("history.json") || {}, keys = [], k;
    if (a.records.length) h[a.key] = a.records; else delete h[a.key];
    for (k in h) if (h.hasOwnProperty(k)) keys.push(k);
    if (keys.length > 30) {
        keys.sort(function (x, y) { return h[y][h[y].length - 1].t - h[x][h[x].length - 1].t; });
        for (k = 30; k < keys.length; k++) delete h[keys[k]];
    }
    writeJson("history.json", h);
    return true;
};
})();
