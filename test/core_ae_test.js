// After Effects profile: rules, whole-folder moves and the one-call sort, without After Effects.
//   node test/core_ae_test.js
"use strict";
const core = require("../ext/js/core.js").use("ae");

let failed = 0;
function ok(cond, text) { if (!cond) failed++; console.log((cond ? "  ok   " : "  FAIL ") + text); }

const st = core.defaults(), rules = core.rulesOf(st);
const F = (name, extra) => Object.assign({ name, kind: "footage", path: "D:\\job\\" + name, still: false, hasVideo: true, hasAudio: false, dur: 5, used: 0, solid: false, placeholder: false }, extra || {});

[
  [{ name: "Main", kind: "comp", used: 0 }, "comp"], [{ name: "Wheel", kind: "comp", used: 2 }, "precomp"],
  [F("shot.mov"), "video"], [F("render_[0001-0100].exr"), "video"], [F("logo.ai", { still: true }), "image"], [F("photo.jpg", { still: true }), "image"],
  [F("White Solid 1", { path: "", solid: true, still: true }), "solid"], [F("Null 3", { path: "", solid: true, still: true }), "solid"],
  [F("robot.glb", { still: true }), "model"], [F("scene.c4d"), "model"],
  [F("data.json", { hasVideo: false }), "other"], [F("Missing", { path: "", placeholder: true }), "other"], [{ name: "odd", kind: "other" }, "other"],
  [F("whoosh.wav", { hasVideo: false, hasAudio: true, dur: 30 }), "sfx"], [F("Track 02.mp3", { hasVideo: false, hasAudio: true }), "music"],
  [F("VO_final.wav", { hasVideo: false, hasAudio: true, dur: 2 }), "audio"], [F("take.wav", { hasVideo: false, hasAudio: true, dur: 2 }), "sfx"],
  [F("gone.mp4", { hasVideo: false }), "video"], [F("gone.png", { hasVideo: false }), "image"]
].forEach(([item, want]) => { const got = core.classify(item, [], rules, null); ok(got === want, item.name + " -> " + want + (got === want ? "" : "   got " + got)); });
ok(core.labelOf(1)[0] === "Red" && core.labelOf(16)[0] === "Dark Green" && core.labelOf(0) === null && core.labelOf(null) === null, "label values start at 1");
ok(core.normalize({ cats: { comp: { label: 0 }, video: { label: 16 } } }).cats.comp.label === 8 && core.normalize({ cats: { video: { label: 16 } } }).cats.video.label === 16, "normalize checks labels against 1..16");

// ---- plan with a folder that moves whole
const B = (id, name, parent, unit) => ({ id, name, parent: parent || null, virtual: false, unit: !!unit, label: 2 });
const I = (id, name, bin, extra) => Object.assign(F(name, extra), { id, bin: bin || null, label: 0 });
const snap = {
  doc: "D", project: "x.aep", nested: {},
  bins: [B("1", "Assets"), B("2", "hero Layers", "1", true), B("3", "Solids"), B("4", "Images"), B("5", "ui Layers", "4", true), B("6", "Shots"), B("7", "sky Layers", "6", true)],
  items: [I("10", "hero", "1", { kind: "comp" }), I("11", "bg.png", "1", { still: true }), I("12", "Black Solid 1", "3", { solid: true, path: "" }),
    I("13", "plate.mov", "6"), I("14", "Final", null, { kind: "comp" })]
};
let pl = core.plan(snap, st);
const to = pl => Object.fromEntries(pl.moves.map(m => [m.name, m.to.join("/") + (m.folder ? " (whole)" : "")]));
ok(JSON.stringify(to(pl)) === JSON.stringify({ "hero": "Comps", "bg.png": "Images", "plate.mov": "Video", "Final": "Comps", "hero Layers": "Images (whole)", "sky Layers": "Images (whole)" }),
  "ui Layers is already under Images, the solid under Solids: " + JSON.stringify(to(pl)));
ok(pl.total === 8 && pl.counts.image.total === 4 && pl.counts.image.pending === 3, "a folder that moves whole counts as one thing");
ok(pl.emptied.sort().join() === "1,6" && pl.removed.map(p => p.join("/")).sort().join() === "Assets,Shots", "Assets and Shots are emptied; the layer folders are moved, not removed (" + pl.removed.map(p => p.join("/")).join(", ") + ")");

let s2 = core.defaults(); s2.ignore = "hero layers";
pl = core.plan(snap, s2);
ok(!pl.moves.some(m => m.name === "hero Layers") && pl.skipped === 1 && !pl.emptied.includes("1"), "an ignored layer folder stays, and so does the folder around it");
s2 = core.defaults(); s2.scope = "root";
ok(core.plan(snap, s2).moves.map(m => m.name).join() === "Final", "root scope");
s2 = core.defaults(); s2.cats.image.on = false;
ok(!core.plan(snap, s2).emptied.includes("1"), "Images switched off: Assets keeps bg.png and hero Layers");

// ---- sort and undo are one host call each
function fake() {
  const log = [];
  return { log, call(fn, a) {
    log.push(fn === "batch" ? "batch(" + a.name + ": " + a.calls.map(c => c[0]).join(",") + ")" : fn);
    if (fn === "snapBegin") return Promise.resolve({ doc: "D", project: "x.aep", path: "", bins: snap.bins, total: 0, seqs: 0 });
    if (fn === "batch") return Promise.resolve(a.calls.map(c => {
      if (c[0] === "ensureBins") return { bins: [], created: c[1].paths.filter(p => p[0] !== "Images"), labels: c[1].labels };
      if (c[0] === "move") return { moved: c[1].moves.length - 1, missing: [c[1].moves[0].id], failed: [], sent: c[1].moves };
      return { deleted: 2, kept: 0 };
    }));
    return Promise.resolve(null);
  }, last: null };
}
(async function () {
  const f = fake(), s = core.defaults();
  s.labels = true;
  const p = core.plan(snap, s);
  let sent = null;
  const rec = await core.execute((fn, a) => f.call(fn, a).then(r => { if (fn === "batch") sent = a.calls; return r; }), snap, p, s, { time: 1791840000000 });
  ok(f.log.join() === "batch(AutoSortBins Sort: ensureBins,move,deleteBins)", "one call: " + f.log.join());
  ok(rec.moves.length === 5 && rec.failed === 1 && rec.created.map(x => x.join()).join("|") === "Comps|Video" && rec.removed.length === 2, "record built from the answers");
  ok(sent[0][1].labels.join() === [8, 5, 3].join() && sent[1][1].moves[0].path.join() === "Comps" && sent[1][1].moves[0].label === 8, "folders and moves carry paths and labels");
  const text = core.report(rec);
  ok(/for After Effects - sort report/.test(text) && /into 3 folders/.test(text) && /hero Layers \[folder\]   <- Assets/.test(text) && /New folders: Comps, Video/.test(text) && /Empty folders removed: Assets, Shots/.test(text), "report speaks of folders");
  const g = fake();
  let usent = null;
  const back = await core.undo((fn, a) => g.call(fn, a).then(r => { if (fn === "batch") usent = a.calls; return r; }), rec);
  ok(g.log.join() === "snapBegin,batch(AutoSortBins Undo: ensureBins,move,deleteBins)" && back.moved === 4 && back.missing === 1, "undo: " + g.log.join());
  ok(usent[1][1].moves.some(m => m.path.length === 0) && usent[1][1].moves.every(m => m.label === (/Layers$/.test(rec.moves.filter(x => x.id === m.id)[0].name) ? 2 : 0)) && usent[2][1].paths.length === 2, "undo sends items home by path (root = empty path) with their old labels");
  console.log(failed ? failed + " FAILED" : "all passed");
  process.exit(failed ? 1 : 0);
})();
