// BinSorter Pro - panel UI
(function () {
"use strict";

var H = window.ASBHost, C = window.ASBCore.use(H.APP);
var W = C.WORD;                                    // "bin" in Premiere Pro, "folder" in After Effects
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

var STILL = /[?&]still\b/.test(location.search);   // dev: no polling, the bridge serves one client at a time
var KEEP = 5;                                      // sorts that can be undone, per project
var S = {
  info: null,                 // last ASB.info()
  settings: C.defaults(),
  snap: null,                 // last scan of the project
  plan: null,                 // what a sort would do with it
  history: [],                // sort records of this project, the newest last
  open: null,                 // id of the expanded category
  busy: false,
  cleanSig: null,             // project fingerprint that auto-sort has nothing to do with
  adds: 0,                    // Premiere's count of added items when auto-sort last looked
  sigCost: 0, lastSig: 0,     // ms the last fingerprint took, and when: big projects are walked once a minute at most
  lastInfo: 0, lastAuto: 0,
  autoTemp: false             // auto-sort of a project that has no file yet: not remembered
};

var GLYPH = {
  video: '<path d="M7.900 6.300v5.400l4.500-2.700z"/>',
  audio: '<path d="M5.900 8h1.300v2H5.900zM8 6.400h1.300v5.200H8zM10.100 7.300h1.300v3.400h-1.300zM12.200 8.200h1.300v1.600h-1.300z"/>',
  music: '<path d="M8.500 6.300l3.800-.9v4.700a1.250 1.250 0 1 1-.9-1.200V7l-2 .5v3.400a1.250 1.250 0 1 1-.9-1.200z"/>',
  sfx: '<path d="M10.500 5.500L7.300 9.600h1.900l-.7 2.900 3.200-4.100H9.800z"/>',
  gfx: '<path d="M5.900 11.900l2.400-3.100 1.600 1.900 1.200-1.300 2 2.500zM11.700 5.900a.95.95 0 1 0 0 1.900.95.95 0 0 0 0-1.900z"/>',
  mogrt: '<path d="M6.700 6.200h5.600v1.400h-2.100v4.400H8.800V7.600H6.700z"/>',
  proxy: '<path d="M6 6.200h3.800v3.300H6zM10.600 8.100H13v3.800H8.300v-1.600h2.300z"/>',
  seq: '<path d="M5.900 6.300h7.200v1.300H5.900zM5.900 8.400h4.600v1.300H5.900zM8 10.500h5.100v1.300H8z"/>',
  nested: '<path fill-rule="evenodd" d="M6.100 5.900h6.800v6.200H6.100zM7.300 7.100v3.800h4.400V7.100zM8.400 8.200h2.200v1.600H8.400z"/>',
  solid: '<path d="M6.500 6.200h6v5.600h-6z"/>',
  model: '<path fill-rule="evenodd" d="M9.500 5.400l3.500 1.750v3.700L9.500 12.600 6 10.850v-3.700zM9.500 6.900l-1.800.900 1.800.900 1.800-.900z"/>',
  other: '<path d="M6.700 8.100a.95.95 0 1 0 0 1.900.95.95 0 0 0 0-1.900zM9.500 8.100a.95.95 0 1 0 0 1.900.95.95 0 0 0 0-1.900zM12.300 8.100a.95.95 0 1 0 0 1.900.95.95 0 0 0 0-1.900z"/>'
};
GLYPH.comp = GLYPH.seq; GLYPH.precomp = GLYPH.nested; GLYPH.image = GLYPH.gfx; GLYPH.compound = GLYPH.nested;
// Unreal categories
GLYPH.map = '<path d="M9.500 5.300a2.300 2.300 0 0 0-2.300 2.300c0 1.700 2.300 4.600 2.300 4.600s2.300-2.900 2.300-4.600a2.300 2.300 0 0 0-2.300-2.300zm0 1.400a.9.9 0 1 1 0 1.800.9.9 0 0 1 0-1.800z"/>';
GLYPH.blueprint = '<path d="M6.300 6h2.500v2.200H6.300zM10.200 9.800h2.500V12h-2.500zM8.800 6.700h1.900v3.800h-.9V7.600h-1z"/>';
GLYPH.ui = '<path fill-rule="evenodd" d="M6 6h7v6H6zM7.100 8v2.900h4.800V8z"/>';
GLYPH.mesh = GLYPH.model;
GLYPH.material = '<path d="M9.500 5.600a3.400 3.400 0 1 0 0 6.800 3.400 3.400 0 0 0 0-6.800zm-1 1.300a1.100 1.100 0 1 1 0 2.200 1.100 1.100 0 0 1 0-2.200z"/>';
GLYPH.texture = '<path d="M6 6h2.300v2.300H6zM10.600 6h2.300v2.300h-2.300zM8.300 8.300h2.300v2.300H8.300zM6 10.600h2.300v1.600H6zM10.600 10.600h2.300v1.600h-2.300z"/>';
GLYPH.anim = '<path d="M9.800 5.600a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM8.500 8.100l2.200.200 1.200 1.400-.8.600-.9-.9-.5 1.500 1.200 1.700-.9.500-1.400-1.800-1 1.800-1-.4 1.300-2.500.2-1.200-.9.500-.6 1.100-.8-.4.900-1.600z"/>';
GLYPH.fx = '<path d="M9.500 5.300l.900 2.700 2.700.900-2.700.900-.900 2.700-.900-2.700-2.700-.900 2.700-.900z"/>';
GLYPH.cine = '<path d="M6 7h4.800v4.400H6zM11.400 8.300l2-1.100v4l-2-1.100z"/>';
GLYPH.data = '<path d="M6 6.200h7v1.400H6zM6 8.300h7v1.400H6zM6 10.400h7v1.400H6z"/>';
GLYPH.fusion ='<path d="M5.700 7.300h2.700v2.700H5.700zM10.600 7.300h2.700v2.700h-2.700zM8.400 8.250h2.200v.800H8.400z"/>';
function folderSvg(c) {
  return '<svg viewBox="0 0 19 15"><path fill="' + c.color + '" d="M1 3.200A1.700 1.700 0 0 1 2.700 1.500h4l1.600 1.900h8A1.700 1.700 0 0 1 18 5.100v7.200a1.700 1.700 0 0 1-1.700 1.700H2.700A1.700 1.700 0 0 1 1 12.300z"/>' +
    '<g class="glyph">' + GLYPH[c.id] + '</g></svg>';
}

// ---------------------------------------------------------------- status and progress

function say(text, kind) {
  var s = $("status");
  s.textContent = text || "";
  s.title = text || "";
  s.className = "status" + (kind ? " " + kind : "");
}
function fail(e) { progress(null); say(String(e && e.message || e).replace(/^Error: /, ""), "bad"); }
function progress(text, k) {
  $("progress").classList.toggle("hidden", text === null);
  if (text === null) return;
  $("progText").textContent = text;
  $("progFill").style.width = Math.round(Math.max(0, Math.min(1, k || 0)) * 100) + "%";
}
function clock(t) { return C.stamp(t).slice(11, 16); }

// one job at a time: scans, sorts and undo never overlap
function guard(job) {
  if (S.busy) return Promise.resolve();
  S.busy = true;
  render();
  return Promise.resolve().then(job).catch(fail).then(function () { S.busy = false; progress(null); render(); });
}

// ---------------------------------------------------------------- settings

// Auto-sort belongs to a project: switching it on in one project never starts sorting another one.
function projKey() { return S.info && S.info.path ? String(S.info.path).toLowerCase() : ""; }
function autoIs() { var k = projKey(); return k ? !!S.settings.autoFor[k] : S.autoTemp; }
function autoSet(on) {
  var k = projKey();
  if (!k) { S.autoTemp = on; return; }
  if (on) S.settings.autoFor[k] = Date.now(); else delete S.settings.autoFor[k];
  saveSettings();
}

var saveTimer = 0;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () { H.call("settingsSave", { settings: S.settings }).catch(fail); }, 400);
}
// a rule changed: plan again from the scan we have, and let auto-sort look at the project again
function changed() {
  S.settings = C.normalize(S.settings);
  if (S.snap) S.plan = C.plan(S.snap, S.settings);
  S.cleanSig = null;
  saveSettings();
  render(true);
}

function fillSheet() {
  var st = S.settings;
  $("optScope").value = st.scope;
  $("optEmpty").checked = st.removeEmpty;
  $("optLabels").checked = st.labels;
  $("optSfxMax").value = st.sfxMax;
  $("optMusicMin").value = st.musicMin;
  $("optSfxWords").value = st.sfxWords;
  $("optMusicWords").value = st.musicWords;
  $("optVoiceWords").value = st.voiceWords;
  $("optIgnore").value = st.ignore;
  if (C.APP === "ue") $("optRoot").value = st.root;
}
function num(input, fallback) { var v = parseFloat(input.value); return isFinite(v) && v >= 0 ? v : fallback; }
function bindSheet() {
  var d = C.defaults();
  $("optScope").onchange = function () { S.settings.scope = this.value; changed(); };
  $("optEmpty").onchange = function () { S.settings.removeEmpty = this.checked; changed(); };
  $("optLabels").onchange = function () { S.settings.labels = this.checked; changed(); };
  $("optSfxMax").onchange = function () { S.settings.sfxMax = num(this, d.sfxMax); changed(); fillSheet(); };
  $("optMusicMin").onchange = function () { S.settings.musicMin = num(this, d.musicMin); changed(); fillSheet(); };
  $("optSfxWords").onchange = function () { S.settings.sfxWords = this.value; changed(); };
  $("optMusicWords").onchange = function () { S.settings.musicWords = this.value; changed(); };
  $("optVoiceWords").onchange = function () { S.settings.voiceWords = this.value; changed(); };
  $("optIgnore").onchange = function () { S.settings.ignore = this.value; changed(); };
  $("optRoot").onchange = function () { setRoot(this.value); };
  $("optRoot").onkeydown = function (e) { if (e.key === "Enter") this.blur(); };
  $("btnRootCur").onclick = function () {
    H.call("browserPath").then(function (p) { if (p) setRoot(p); else say("Open a folder in the Content Browser first", "bad"); }).catch(fail);
  };
  $("btnSettings").onclick = function () { fillSheet(); $("sheet").classList.remove("hidden"); };
  $("btnClose").onclick = $("btnDone").onclick = function () { $("sheet").classList.add("hidden"); };
  $("btnReset").onclick = function () {
    var auto = S.settings.autoFor, every = S.settings.interval, root = S.settings.root;
    S.settings = C.defaults();
    S.settings.autoFor = auto; S.settings.interval = every;
    if (root) S.settings.root = root;                 // Unreal: the folder being sorted stays
    changed(); fillSheet();
    say("Settings are back to the defaults");
  };
}

// Unreal: the folder that is sorted. The editor keeps it too (its context menu can change it), so it is saved at once.
function setRoot(text) {
  var root = C.rootPath(text);
  $("optRoot").value = root;
  if (root === S.settings.root) return;
  S.settings.root = root;
  clearTimeout(saveTimer);
  H.call("settingsSave", { settings: S.settings }).then(function () { S.lastInfo = 0; tick(); }).catch(fail);
}

// ---------------------------------------------------------------- the list of bins

function bodyOf(c) {
  var cs = S.settings.cats[c.id], body = el("div", "body"), row, inp, sel, sw, o;
  body.appendChild(el("div", "desc", c.desc));

  row = el("div", "row");
  row.appendChild(el("span", "", cap(W)));
  inp = el("input"); inp.type = "text"; inp.value = cs.bin; inp.spellcheck = false;
  inp.title = "Name of the " + W + ". A path like 01 Media/" + c.bin + " nests it";
  inp.onchange = function () { cs.bin = C.splitPath(inp.value).join("/") || c.bin; changed(); };
  inp.onkeydown = function (e) { if (e.key === "Enter") inp.blur(); };
  row.appendChild(inp);
  body.appendChild(row);

  row = el("div", "row");
  row.appendChild(el("span", "", "Label"));
  sw = el("span", "sw");
  sel = el("select");
  o = el("option", "", "None"); o.value = ""; sel.appendChild(o);
  C.LABELS.forEach(function (l, i) { var x = el("option", "", l[0]); x.value = String(C.LABEL_BASE + i); sel.appendChild(x); });
  sel.value = cs.label === null ? "" : String(cs.label);
  sel.title = S.settings.labels ? "Label colour given to what is sorted into this " + W : "Used when Settings > Color-label sorted items is on";
  sel.disabled = !S.settings.labels;
  sw.style.background = C.labelOf(cs.label) ? C.labelOf(cs.label)[1] : "transparent";
  sel.onchange = function () { cs.label = sel.value === "" ? null : parseInt(sel.value, 10); changed(); };
  row.appendChild(sw); row.appendChild(sel);
  body.appendChild(row);

  var moves = S.plan ? S.plan.moves.filter(function (m) { return m.cat === c.id; }) : [];
  if (!moves.length) {
    body.appendChild(el("div", "none", !S.plan ? "" : cs.on ? "Nothing to move here" : "Switched off: these items stay where they are"));
  } else {
    var list = el("div", "list");
    moves.slice(0, 60).forEach(function (m) {
      var line = el("div"), a = el("span", "a", m.name + (m.folder ? " /" : "")), b = el("span", "b", m.from.length ? m.from.join("/") : "root");
      a.title = m.name + (m.folder ? " (the whole " + W + ")" : ""); b.title = "Now in: " + C.where(m.from);
      line.appendChild(a); line.appendChild(b);
      list.appendChild(line);
    });
    if (moves.length > 60) list.appendChild(el("div", "more", "and " + (moves.length - 60) + " more"));
    body.appendChild(list);
  }
  return body;
}

function renderCats(force) {
  var box = $("cats"), at = document.activeElement;
  if (!force && at && box.contains(at) && /^(INPUT|SELECT)$/.test(at.tagName) && at.type !== "checkbox") return;   // someone is typing a bin name
  var top = box.scrollTop;
  box.textContent = "";
  C.CATS.forEach(function (c) {
    var cs = S.settings.cats[c.id], cnt = S.plan ? S.plan.counts[c.id] : null;
    var card = el("div", "cat" + (cs.on ? "" : " off") + (S.open === c.id ? " open" : "")), head = el("div", "head");
    var fold = el("span", "fold"), pend, tot, lab, chk;
    fold.innerHTML = folderSvg(c);
    head.appendChild(fold);
    head.appendChild(el("span", "nm", cs.bin));
    if (cnt && cnt.pending) {
      pend = el("span", "pend", "+" + cnt.pending);
      pend.title = C.plural(cnt.pending, "item") + " to move here";
      head.appendChild(pend);
    }
    tot = el("span", "tot", cnt ? String(cnt.total) : "");
    tot.title = "Items of this kind in the project";
    head.appendChild(tot);
    lab = el("label", "check"); chk = el("input"); chk.type = "checkbox"; chk.checked = cs.on;
    lab.title = cs.on ? "Sorted. Untick to leave these items alone" : "Not sorted";
    lab.onclick = function (e) { e.stopPropagation(); };
    chk.onchange = function () { cs.on = chk.checked; changed(); };
    lab.appendChild(chk); lab.appendChild(el("i"));
    head.appendChild(lab);
    head.title = c.desc;
    head.onclick = function () { S.open = S.open === c.id ? null : c.id; renderCats(true); };
    card.appendChild(head);
    if (S.open === c.id) card.appendChild(bodyOf(c));
    box.appendChild(card);
  });
  box.scrollTop = top;
}

function render(force) {
  var has = !!(S.info && S.info.project), pl = S.plan, line = $("projLine"), b, s;
  line.textContent = "";
  if (!S.info) line.textContent = "Connecting to " + C.HOST + "…";
  else if (!has) line.textContent = "Open a project in " + C.HOST;
  else {
    b = el("b", "", S.info.project.replace(/\.(prproj|aepx?|uproject)$/i, ""));
    line.appendChild(b);
    if (S.info.root) line.appendChild(el("span", "root", "  " + S.info.root));
    if (pl) {
      line.appendChild(document.createTextNode("  ·  " + C.plural(pl.total, "item") + "  ·  "));
      s = el("span", pl.pending ? "todo" : "fine", pl.pending ? pl.pending + " to sort" : "sorted");
      line.appendChild(s);
    }
    line.title = S.info.path || "";
  }
  $("btnSort").disabled = !has || S.busy;
  $("sortCount").classList.toggle("hidden", !(pl && pl.pending));
  $("sortCount").textContent = pl ? String(pl.pending) : "";
  var last = S.history[S.history.length - 1];
  $("btnUndo").disabled = !has || S.busy || !last;
  $("btnUndo").title = last ? "Put back the " + C.plural(last.moves.length, "item") + " sorted at " + clock(last.t) : "Nothing to undo in this project";
  $("btnReport").disabled = !has || S.busy || !(last || pl);
  $("btnReport").title = last ? "Save the sort of " + clock(last.t) + " as a .txt report" : "Save a .txt preview of what a sort would move";
  $("btnRescan").disabled = !has || S.busy;
  $("btnRescan").classList.toggle("spin", S.busy);
  $("autoRow").classList.toggle("on", autoIs());
  $("autoOn").checked = autoIs();
  $("autoOn").disabled = !has;
  if (document.activeElement !== $("autoSec")) $("autoSec").value = S.settings.interval;
  $("binsHint").textContent = pl && pl.skipped ? pl.skipped + " in ignored " + W + "s" : "";
  renderCats(force);
}

// ---------------------------------------------------------------- work

function scan() {
  progress("Scanning…", 0);
  return C.collect(H.call, function (a, b) { progress("Scanning " + a + " / " + b, a / b); }).then(function (snap) {
    S.snap = snap;
    S.plan = C.plan(snap, S.settings);
    progress(null);
    if (S.plan.pending) return null;
    return H.call("sig").then(function (r) { S.cleanSig = r.sig; });
  });
}

// a project that was never saved has no file to remember it by: its history lives until the panel closes
function histKey() { return projKey(); }
function saveHistory() {
  while (S.history.length > KEEP) S.history.shift();
  return histKey() ? H.call("historySave", { key: histKey(), records: S.history }) : Promise.resolve();
}

function sortNow(auto) {
  return scan().then(function () {
    var pl = S.plan;
    if (!pl.pending) { if (!auto) say("Everything is already in its " + W, "good"); return null; }
    progress("Moving " + C.plural(pl.pending, "item") + "…", 0.5);
    return C.execute(H.call, S.snap, pl, S.settings, { auto: auto, progress: function (a, b) { progress("Moving " + a + " / " + b, a / b); } }).then(function (rec) {
      var bins = {}, text;
      rec.moves.forEach(function (m) { bins[m.to.join("/").toLowerCase()] = true; });
      text = (auto ? "Auto " + clock(rec.t) + ": " : "") + "Sorted " + C.plural(rec.moves.length, "item") + " into " + C.plural(Object.keys(bins).length, W);
      if (rec.removed.length) text += ", removed " + C.plural(rec.removed.length, "empty " + W);
      if (rec.failed) text += ", " + rec.failed + " could not be moved";
      if (rec.moves.length) S.history.push(rec);
      return (rec.moves.length ? saveHistory() : Promise.resolve()).then(scan).then(function () { return H.call("sig"); }).then(function (r) {
        S.cleanSig = r.sig;                      // also when something failed, so auto-sort does not retry it forever
        say(text, rec.failed ? "bad" : "good");
      });
    });
  });
}

function undoLast() {
  var rec = S.history[S.history.length - 1], wasAuto = autoIs();
  if (!rec) return null;
  progress("Undoing…", 0);
  return C.undo(H.call, rec, function (a, b) { progress("Moving back " + a + " / " + b, a / b); }).then(function (r) {
    S.history.pop();
    if (wasAuto) autoSet(false);                                    // or it would sort everything again at once
    return saveHistory().then(scan).then(function () {
      var text = "Undone: " + C.plural(r.moved, "item") + " back in place";
      if (r.missing) text += ", " + r.missing + " no longer in the project";
      if (wasAuto) text += ". Auto-sort is off";
      say(text, r.missing ? "" : "good");
    });
  });
}

function exportReport() {
  var rec = S.history[S.history.length - 1] || (S.snap && S.plan ? C.preview(S.snap, S.plan) : null);
  if (!rec) return null;
  var name = String(S.info.project || "project").replace(/\.(prproj|aepx?|uproject)$/i, "") + (rec.preview ? "_sort_preview.txt" : "_sort_report.txt");
  return H.saveText(name, C.report(rec)).then(function (file) { if (file) say("Report saved: " + file, "good"); });
}

// the active project changed (or the panel has just opened)
function onProject(info) {
  if (info.root) S.settings.root = info.root;     // Unreal: the sort folder may have been set from the editor
  S.info = info; S.snap = null; S.plan = null; S.history = []; S.cleanSig = null; S.adds = info.adds; S.autoTemp = false;
  if (!info.project) return null;
  return (histKey() ? H.call("historyLoad", { key: histKey() }) : Promise.resolve([])).then(function (h) {
    S.history = h instanceof Array ? h : [];
    return scan();
  }).then(function () { say(""); });
}
function sameProject(a, b) { return !!a && !!b && a.project === b.project && a.doc === b.doc && a.path === b.path; }

function tick() {
  var now = Date.now();
  if (S.busy || now - S.lastInfo < 2500) return;
  S.lastInfo = now;
  H.call("info", { auto: autoIs() }).then(function (info) {       // Resolve counts its clips only when asked
    if (S.busy) return null;
    if (!sameProject(info, S.info)) return guard(function () { return onProject(info); });
    if (!info.project || !autoIs() || Date.now() - S.lastAuto < S.settings.interval * 1000) return null;
    S.lastAuto = Date.now();
    // something was added, or it is time to look for items the user moved by hand
    if (info.adds === S.adds && Date.now() - S.lastSig < (S.sigCost > 150 ? 60000 : 0)) return null;
    S.adds = info.adds;
    return H.call("sig").then(function (r) {
      S.sigCost = r.ms; S.lastSig = Date.now();
      if (S.busy || r.sig === S.cleanSig) return null;
      return guard(function () { return sortNow(true); });
    });
  }).catch(function () {});               // Premiere is busy or closing: try again on the next tick
}

// ---------------------------------------------------------------- start

$("btnSort").onclick = function () { guard(function () { return sortNow(false); }); };
$("btnUndo").onclick = function () { guard(undoLast); };
$("btnReport").onclick = function () { Promise.resolve().then(exportReport).catch(fail); };
$("btnRescan").onclick = function () {
  guard(function () {
    return H.call("info").then(function (info) {
      if (!sameProject(info, S.info)) return onProject(info);
      return scan().then(function () { say(S.plan.pending ? C.plural(S.plan.pending, "item") + " to sort" : "Everything is already in its " + W, S.plan.pending ? "" : "good"); });
    });
  });
};
$("autoOn").onchange = function () {
  autoSet(this.checked);
  S.cleanSig = null; S.lastAuto = 0; S.lastSig = 0;
  render();
  say(this.checked ? "Auto-sort is on for this project: checking every " + S.settings.interval + " s while this panel is open" : "Auto-sort is off");
};
$("autoSec").onchange = function () {
  var v = parseInt(this.value, 10);
  S.settings.interval = isFinite(v) ? v : 15;
  S.settings = C.normalize(S.settings);
  this.value = S.settings.interval;
  saveSettings();
};
$("autoSec").onkeydown = function (e) { if (e.key === "Enter") this.blur(); };
// wording that depends on the host
document.title = "BinSorter Pro";
$("hostBadge").textContent = { ae: "Ae", dr: "DR", ue: "UE" }[H.APP] || "Pr";
document.documentElement.className = "host-" + H.APP;
if (H.APP === "ue") {
  $("rootBox").classList.remove("hidden");
  $("txtAll").textContent = "Everything inside the folder";
  $("txtRoot").textContent = "Only loose assets in the folder itself";
  $("txtLabels").textContent = "Colour the category folders";
}
$("hostBadge").className = "badge " + H.APP;
$("secTitle").textContent = cap(W) + "s";
$("txtEmpty").textContent = "Remove " + W + "s the sort has emptied";
$("grpIgnore").textContent = cap(W) + "s to leave alone";
$("optIgnore").placeholder = cap(W) + " names, comma-separated";
$("noteBin").innerHTML = "A " + W + " name may be a path: <b>01 Media/Video</b> puts Video inside 01 Media.";
$("grpWords").textContent = H.APP === "ue" ? "Words in asset, source file and folder names" : "Words in file, folder and " + (W === "bin" ? "bin" : "project folder") + " names";
bindSheet();
render();

guard(function () {
  return H.call("settingsLoad").then(function (saved) {
    S.settings = C.normalize(saved);
    return H.call("info");
  }).then(onProject);
}).then(function () { if (!STILL) setInterval(tick, 1000); });
})();
