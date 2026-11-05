// BinSorter Pro for EffectCraft - the ScriptUI panel. tools/build_ec.mjs puts it after js/core.js and
// host_ae.jsx in effectcraft/BinSorterPro-EC.jsx; the CEP panel's ext/js/main.js does the same job there.
(function (thisObj) {
var C = window.ASBCore.use("ae"), W = C.WORD, KEEP = 5, VERSION = "1.3.0";
var S = { settings: C.normalize(null), info: null, snap: null, plan: null, history: [], cleanSig: null,
          busy: false, autoTemp: false, adds: -1, lastAuto: 0 };

function call(fn, args) {
    return new Promise(function (res, rej) {
        var r = JSON.parse(ASB.run(fn, JSON.stringify(args || {})));
        if (r.ok) res(r.data); else rej(new Error(r.error));
    });
}

// ------------------------------------------------------------ look (the navy theme of ext/style.css)
function hex(h, a) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255, a == null ? 1 : a]; }
var COL = { bg: hex("#060B17"), card: hex("#0E1A30"), line: hex("#223352"), text: hex("#E6EEFB"), dim: hex("#8FA1C0"),
            accent: hex("#2F9BF0"), accent2: hex("#6FC3FF"), mint: hex("#5FE3B0"), warn: hex("#FFB454"), bad: hex("#FF7A8A") };
function paint(el, color) { try { el.graphics.backgroundColor = el.graphics.newBrush(el.graphics.BrushType.SOLID_COLOR, color); } catch (e) {} }
function ink(el, color) { try { el.graphics.foregroundColor = el.graphics.newPen(el.graphics.PenType.SOLID_COLOR, color, 1); } catch (e) {} }
function bold(el, size) { try { el.graphics.font = ScriptUI.newFont(el.graphics.font.name, "BOLD", size); } catch (e) {} }
function text(parent, t, color) { var s = parent.add("statictext", undefined, t); ink(s, color || COL.text); return s; }
// a folder shape: body plus a tab on the top left
function drawFolder(q, x, y, wd, ht, color) {
    var b = q.newBrush(q.BrushType.SOLID_COLOR, color), tab = Math.round(ht * 0.28);
    q.newPath(); q.rectPath(x, y, Math.round(wd * 0.45), tab + 1); q.fillPath(b);
    q.newPath(); q.rectPath(x, y + tab, wd, ht - tab); q.fillPath(b);
}
function folderIcon(parent, color, wd, ht) {
    var g = parent.add("group"); g.preferredSize = [wd, ht]; g.minimumSize = [wd, ht];
    g.onDraw = function () { drawFolder(this.graphics, 0, Math.max(0, Math.round((this.size[1] - ht) / 2)), wd, ht, color); };
    return g;
}
// a checkbox with its label as separate text, so EffectCraft does not centre it inside the row
function check(parent, label) {
    var g = parent.add("group"); g.alignChildren = ["left", "center"]; g.spacing = 4; g.alignment = ["fill", "center"];
    var cb = g.add("checkbox", undefined, ""); cb.preferredSize.width = 18;
    text(g, label);
    return cb;
}
// the main action, drawn in the accent colour
function primary(b) {
    b.onDraw = function () {
        var q = this.graphics, wd = this.size[0], ht = this.size[1], on = this.enabled !== false;
        q.newPath(); q.rectPath(0, 0, wd, ht);
        q.fillPath(q.newBrush(q.BrushType.SOLID_COLOR, on ? COL.accent : COL.line));
        var f = q.font; try { f = ScriptUI.newFont(q.font.name, "BOLD", 13); } catch (e) {}
        var m = q.measureString(this.text, f) || [0, 0];
        q.drawString(this.text, q.newPen(q.PenType.SOLID_COLOR, [1, 1, 1, on ? 1 : 0.5], 1), Math.round((wd - m[0]) / 2), Math.round((ht - m[1]) / 2), f);
    };
}

// ------------------------------------------------------------ UI
var w = (thisObj instanceof Panel) ? thisObj : new Window("palette", "BinSorter Pro", undefined, { resizeable: true });
w.orientation = "column"; w.alignChildren = ["fill", "top"]; w.spacing = 7; w.margins = 10;
paint(w, COL.bg);

var top = w.add("group"); top.alignChildren = ["left", "center"]; top.spacing = 0;
var logo = top.add("group"); logo.preferredSize = [30, 20];
logo.onDraw = function () {
    var q = this.graphics;
    drawFolder(q, 0, 4, 16, 12, hex("#3BA7F5")); drawFolder(q, 7, 2, 16, 12, hex("#F5B82E")); drawFolder(q, 14, 6, 16, 12, hex("#3DCB6C"));
};
top.add("group").preferredSize = [7, 4];
var title = text(top, "BinSorter Pro", COL.accent2); bold(title, 14);
text(top, "  EC  v" + VERSION, COL.dim);

var bSort = w.add("button", undefined, "Sort now"); bSort.preferredSize.height = 32; primary(bSort);
var row1 = w.add("group"); row1.alignChildren = ["fill", "center"];
var bUndo = row1.add("button", undefined, "Undo"); bUndo.alignment = ["fill", "center"]; bUndo.helpTip = "Undo the last sort (5 per project are kept)";
var bScan = row1.add("button", undefined, "Rescan"); bScan.alignment = ["fill", "center"];
var bReport = row1.add("button", undefined, "Report"); bReport.alignment = ["fill", "center"]; bReport.helpTip = "Export a .txt of what was moved";

var gAuto = w.add("group"); gAuto.alignChildren = ["left", "center"]; gAuto.spacing = 4;
var cAuto = gAuto.add("checkbox", undefined, ""); cAuto.preferredSize.width = 18;
text(gAuto, "Auto-sort this project every");
var tSec = gAuto.add("edittext", undefined, "15"); tSec.preferredSize.width = 40;
text(gAuto, "s", COL.dim);

var pCats = w.add("panel", undefined, "Folders"); pCats.alignChildren = ["fill", "top"]; pCats.spacing = 3; pCats.margins = [8, 14, 8, 8];
paint(pCats, COL.card); ink(pCats, COL.dim);
var rows = {};
C.CATS.forEach(function (c) {
    var g = pCats.add("group"); g.alignChildren = ["left", "center"]; g.spacing = 5; g.alignment = ["fill", "center"];
    var chk = g.add("checkbox", undefined, ""); chk.preferredSize.width = 18;
    folderIcon(g, hex(c.color), 16, 12);
    var name = g.add("edittext", undefined, c.bin); name.preferredSize.width = 130; name.helpTip = c.desc;
    var n = text(g, "", COL.warn); n.preferredSize.width = 62;
    chk.onClick = function () { S.settings.cats[c.id].on = chk.value; changed(); };
    name.onChange = function () {
        var p = C.splitPath(name.text).join("/");
        S.settings.cats[c.id].bin = p || c.bin; name.text = S.settings.cats[c.id].bin; changed();
    };
    rows[c.id] = { chk: chk, name: name, n: n };
});

var pOpt = w.add("panel", undefined, "Options"); pOpt.alignChildren = ["fill", "top"]; pOpt.spacing = 4; pOpt.margins = [8, 14, 8, 8];
paint(pOpt, COL.card); ink(pOpt, COL.dim);
var dScope = pOpt.add("dropdownlist", undefined, ["Whole project", "Only loose items in the project root"]);
var cEmpty = check(pOpt, "Remove " + W + "s the sort has emptied");
var cLabels = check(pOpt, "Colour-label what gets sorted");
var gIgn = pOpt.add("group"); gIgn.alignChildren = ["left", "center"];
text(gIgn, "Leave alone:", COL.dim);
var tIgn = gIgn.add("edittext", undefined, ""); tIgn.preferredSize.width = 170; tIgn.helpTip = "Folder names the sort never touches, comma-separated";
dScope.onChange = function () { S.settings.scope = dScope.selection && dScope.selection.index === 1 ? "root" : "all"; changed(); };
cEmpty.onClick = function () { S.settings.removeEmpty = cEmpty.value; changed(); };
cLabels.onClick = function () { S.settings.labels = cLabels.value; changed(); };
tIgn.onChange = function () { S.settings.ignore = tIgn.text; changed(); };

var status = w.add("statictext", undefined, "", { multiline: true }); status.preferredSize = [260, 46]; ink(status, COL.dim);

// kind: "good" (mint), "bad" (red) or none (grey)
function say(t, kind) { ink(status, kind === "good" ? COL.mint : kind === "bad" ? COL.bad : COL.dim); status.text = t; }
function fill() {
    var st = S.settings;
    C.CATS.forEach(function (c) { rows[c.id].chk.value = !!st.cats[c.id].on; rows[c.id].name.text = st.cats[c.id].bin; });
    dScope.selection = st.scope === "root" ? 1 : 0;
    cEmpty.value = !!st.removeEmpty; cLabels.value = !!st.labels; tIgn.text = st.ignore || "";
    tSec.text = String(st.interval); cAuto.value = autoIs();
}
function counts() {
    var n = {};
    if (S.plan) S.plan.moves.forEach(function (m) { n[m.cat] = (n[m.cat] || 0) + 1; });
    C.CATS.forEach(function (c) { rows[c.id].n.text = n[c.id] ? n[c.id] + " to sort" : ""; });
    bUndo.enabled = S.history.length > 0;
    bUndo.text = S.history.length ? "Undo (" + S.history.length + ")" : "Undo";
    bSort.text = S.plan && S.plan.pending ? "Sort now  (" + S.plan.pending + ")" : "Sort now";
}

// ------------------------------------------------------------ settings and history
function projKey() { return S.info && S.info.path ? String(S.info.path).toLowerCase() : ""; }
function autoIs() { var k = projKey(); return k ? !!S.settings.autoFor[k] : S.autoTemp; }
function autoSet(on) {
    var k = projKey();
    if (k) { if (on) S.settings.autoFor[k] = new Date().getTime(); else delete S.settings.autoFor[k]; save(); }
    else S.autoTemp = on;
}
function save() { call("settingsSave", { settings: S.settings }); }
function changed() { S.settings = C.normalize(S.settings); save(); run(scan); }
function saveHistory() {
    while (S.history.length > KEEP) S.history.shift();
    return projKey() ? call("historySave", { key: projKey(), records: S.history }) : Promise.resolve();
}

// ------------------------------------------------------------ work
function run(job) {
    if (S.busy) return;
    S.busy = true;
    Promise.resolve().then(job).then(null, function (e) { say(String(e && e.message || e).replace(/^Error: /, ""), "bad"); })
        .then(function () { S.busy = false; counts(); });
}
function scan() {
    return C.collect(call, function () {}).then(function (snap) {
        S.snap = snap; S.plan = C.plan(snap, S.settings);
        if (S.plan.pending) return null;
        return call("sig").then(function (r) { S.cleanSig = r.sig; });
    });
}
function sortNow(auto) {
    return scan().then(function () {
        var pl = S.plan;
        if (!pl.pending) { if (!auto) say("Everything is already in its " + W + ".", "good"); return null; }
        return C.execute(call, S.snap, pl, S.settings, { auto: auto }).then(function (rec) {
            var bins = {}, nb = 0, k, text;
            rec.moves.forEach(function (m) { bins[m.to.join("/").toLowerCase()] = true; });
            for (k in bins) if (bins.hasOwnProperty(k)) nb++;
            text = (auto ? "Auto " + C.stamp(rec.t).slice(11, 16) + ": " : "") + "Sorted " + C.plural(rec.moves.length, "item") + " into " + C.plural(nb, W);
            if (rec.removed.length) text += ", removed " + C.plural(rec.removed.length, "empty " + W);
            if (rec.failed) text += ", " + rec.failed + " could not be moved";
            if (rec.moves.length) S.history.push(rec);
            return (rec.moves.length ? saveHistory() : Promise.resolve()).then(scan).then(function () { return call("sig"); })
                .then(function (r) { S.cleanSig = r.sig; say(text + ".", rec.failed ? "bad" : "good"); });
        });
    });
}
function undoLast() {
    var rec = S.history[S.history.length - 1], wasAuto = autoIs();
    if (!rec) return null;
    return C.undo(call, rec, function () {}).then(function (r) {
        S.history.pop();
        if (wasAuto) { autoSet(false); cAuto.value = false; }
        return saveHistory().then(scan).then(function () {
            var text = "Undone: " + C.plural(r.moved, "item") + " back in place";
            if (r.missing) text += ", " + r.missing + " no longer in the project";
            if (wasAuto) text += ". Auto-sort is off";
            say(text + ".", r.missing ? "" : "good");
        });
    });
}
function exportReport() {
    var rec = S.history[S.history.length - 1] || (S.snap && S.plan ? C.preview(S.snap, S.plan) : null);
    if (!rec) { say("Nothing to report yet."); return; }
    var text = C.report(rec), base = String(S.info && S.info.project || "project").replace(/\.(ecproj|aepx?)$/i, "");
    var f = null;
    try { f = File.saveDialog("Save the sort report", "*.txt"); } catch (e) { f = null; }
    if (f) {
        try {
            if (!/\.txt$/i.test(f.name)) f = File(f.fsName + ".txt");
            f.encoding = "UTF-8";
            if (f.open("w")) { f.write(text); f.close(); say("Report saved: " + f.fsName, "good"); return; }
        } catch (e2) {}
    }
    // writing files is off (Preferences > Scripting & Expressions): show the text to copy instead
    var d = new Window("dialog", base + (rec.preview ? " - sort preview" : " - sort report"));
    d.alignChildren = ["fill", "fill"];
    var t = d.add("edittext", undefined, text, { multiline: true, scrolling: true }); t.preferredSize = [520, 360];
    d.add("button", undefined, "Close", { name: "ok" });
    d.show();
}
function sameProject(a, b) { return !!a && !!b && a.project === b.project && a.doc === b.doc && a.path === b.path; }
function onProject(info) {
    S.info = info; S.snap = null; S.plan = null; S.history = []; S.cleanSig = null; S.adds = info.adds; S.autoTemp = false;
    cAuto.value = autoIs();
    return (projKey() ? call("historyLoad", { key: projKey() }) : Promise.resolve([])).then(function (h) {
        S.history = h instanceof Array ? h : [];
        return scan();
    }).then(function () { say(S.plan && S.plan.pending ? C.plural(S.plan.pending, "item") + " to sort." : "Everything is already in its " + W + "."); });
}
// every second while the panel is open: follow project switches, and auto-sort when something changed
function tick() {
    if (S.busy) return;
    var info;
    try { info = JSON.parse(ASB.run("info", "{}")).data; } catch (e) { return; }
    if (!info) return;
    if (!sameProject(info, S.info)) { run(function () { return onProject(info); }); return; }
    var now = new Date().getTime();
    if (!autoIs() || now - S.lastAuto < S.settings.interval * 1000) return;
    S.lastAuto = now;
    var r = JSON.parse(ASB.run("sig", "{}"));
    if (!r.ok || r.data.sig === S.cleanSig) return;
    run(function () { return sortNow(true); });
}

bSort.onClick = function () { run(function () { return sortNow(false); }); };
bUndo.onClick = function () { run(undoLast); };
bScan.onClick = function () {
    run(function () {
        return call("info").then(function (info) {
            if (!sameProject(info, S.info)) return onProject(info);
            return scan().then(function () { say(S.plan.pending ? C.plural(S.plan.pending, "item") + " to sort." : "Everything is already in its " + W + "."); });
        });
    });
};
bReport.onClick = function () { try { exportReport(); } catch (e) { say(String(e)); } };
cAuto.onClick = function () {
    autoSet(cAuto.value); S.cleanSig = null; S.lastAuto = 0;
    say(cAuto.value ? "Auto-sort is on for this project: checking every " + S.settings.interval + " s while this panel is open." : "Auto-sort is off.");
};
tSec.onChange = function () {
    var v = parseInt(tSec.text, 10);
    S.settings.interval = isFinite(v) ? v : 15;
    S.settings = C.normalize(S.settings); tSec.text = String(S.settings.interval); save();
};

// ------------------------------------------------------------ start
try { S.settings = C.normalize(JSON.parse(ASB.run("settingsLoad", "{}")).data); } catch (e) {}
fill();
run(function () { return call("info").then(onProject); });
$.global.__binSorterTick = tick;
var task = null;
try { task = app.scheduleTask("if ($.global.__binSorterTick) $.global.__binSorterTick();", 1000, true); } catch (e) {}
w.onClose = function () { try { if (task !== null) app.cancelTask(task); } catch (e) {} $.global.__binSorterTick = null; };
if (w instanceof Window) { w.center(); w.show(); } else if (w.layout) w.layout.layout(true);
$.global.BinSorterEC = { S: S, sortNow: function () { run(function () { return sortNow(false); }); }, undo: function () { run(undoLast); }, tick: tick };
})(this);
