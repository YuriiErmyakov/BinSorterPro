// Rules and plan without Premiere.
//   node test/core_test.js
"use strict";
const core = require("../ext/js/core.js");

let failed = 0;
function ok(cond, text) { if (!cond) failed++; console.log((cond ? "  ok   " : "  FAIL ") + text); }

const st = core.defaults(), rules = core.rulesOf(st);
const cls = (name, extra, bins) => core.classify(Object.assign({ name, path: "D:\\job\\" + name, seq: false, mt: "", dur: 0 }, extra || {}), bins || [], rules, null);

// ---- classify
[
  ["A001_C003.mov", null, "video"], ["drone.MP4", null, "video"], ["scan.mxf", { mt: "Audio" }, "audio"],
  ["render.exr", null, "gfx"], ["Layout.psd", null, "gfx"], ["Comp 1/titles.aep", { path: "D:\\job\\titles.aep" }, "gfx"],
  ["Adjustment Layer", { path: "", mt: "Still Image" }, "gfx"], ["Color Matte", { path: "" }, "gfx"],
  ["weird.xyz", { mt: "Movie" }, "video"], ["weird.xyz", { mt: "Audio", dur: 30 }, "audio"], ["notes.srt", null, "other"],
  ["Lower Third", { path: "D:\\job\\Motion Graphics Template Media\\Lower Third.aegraphic" }, "mogrt"],
  ["Title 01", { path: "C:\\Users\\x\\AppData\\Local\\Temp\\Motion Graphics Template Media\\ab12\\Title 01.mov" }, "mogrt"],
  ["A001_Proxy.mp4", null, "proxy"], ["A001.proxy.mov", null, "proxy"], ["approximate.mp4", null, "video"],
  ["cam.mp4", { path: "D:\\job\\Proxies\\cam.mp4" }, "proxy"],
  ["Whooshes_03.wav", null, "sfx"], ["FX riser.wav", null, "sfx"], ["Cinematic Soundtrack.wav", null, "music"],
  ["MusicBed.wav", null, "music"], ["VO_take2.wav", null, "audio"], ["Interview Music.wav", null, "audio"],
  ["Музыка финал.mp3", null, "music"], ["вжух.wav", null, "sfx"], ["озвучка_3.wav", { dur: 3 }, "audio"],
  ["take.wav", { dur: 4 }, "sfx"], ["take.wav", { dur: 30 }, "audio"], ["take.wav", { dur: 200 }, "music"], ["take.wav", { dur: 0 }, "audio"],
  ["a1.wav", { path: "D:\\lib\\SFX\\Doors\\a1.wav", dur: 200 }, "sfx"], ["a1.wav", { path: "D:\\lib\\Foley\\x\\y\\a1.wav", dur: 30 }, "audio"]
].forEach(([name, extra, want]) => { const got = cls(name, extra); ok(got === want, name + (extra ? " " + JSON.stringify(extra) : "") + " -> " + want + (got === want ? "" : "   got " + got)); });
ok(cls("clip.wav", { dur: 30 }, ["Assets", "Music"]) === "music", "the project bin name is a hint");
ok(cls("Отчетный ролик.mp4 — звук", { path: "", mt: "Audio", dur: 62 }, ["Звук"]) === "music" && cls("Ease_01.mp3", { dur: 30 }, ["Звук"]) === "audio", "the word for sound itself is not an SFX hint");
ok(core.normalize({ sfxWords: core.defaults().sfxWords.replace("эффект", "звук, звуки, эффект") }).sfxWords === core.defaults().sfxWords && core.normalize({ sfxWords: "boom" }).sfxWords === "boom",
  "an untouched 1.0 word list is replaced by the new default, an edited one is kept");
ok(cls("Graphic", { path: "" }, ["Motion Graphics Template Media"]) === "mogrt", "items of the Motion Graphics Template Media bin");
ok(core.classify({ id: "s", name: "Cut", seq: true }, [], rules, { nested: {} }) === "seq" && core.classify({ id: "s", name: "Cut", seq: true }, [], rules, { nested: { s: true } }) === "nested", "sequences and nested sequences");
const off = core.rulesOf(Object.assign(core.defaults(), { sfxMax: 0, musicMin: 0 }));
ok(core.classify({ name: "take.wav", path: "D:\\take.wav", dur: 2 }, [], off, null) === "audio", "length rules switched off");

// ---- plan
const B = (id, name, parent, virtual) => ({ id, name, parent: parent || null, virtual: !!virtual });
const I = (id, name, bin, extra) => Object.assign({ id, name, bin: bin || null, seq: false, path: "D:\\m\\" + name, mt: "", dur: 30, label: 0 }, extra || {});
const snap = {
  project: "x.prproj",
  bins: [B("b1", "Footage"), B("b2", "Cam A", "b1"), B("b3", "audio"), B("b4", "Search", null, true), B("b5", "Keep"), B("b6", "Inner", "b5"), B("b7", "Spare")],
  items: [I("i1", "a.mp4"), I("i2", "b.mp4", "b2"), I("i3", "c.wav", "b3"), I("i4", "d.png", "b6"), I("i5", "Main", null, { seq: true, path: "" }),
    I("i6", "Sub", "b1", { seq: true, path: "" }), I("i7", "song.mp3", "b3")],
  nested: { i6: true }
};
let pl = core.plan(snap, st);
const to = pl => Object.fromEntries(pl.moves.map(m => [m.name, m.to.join("/")]));
ok(JSON.stringify(to(pl)) === JSON.stringify({ "a.mp4": "Video", "b.mp4": "Video", "d.png": "GFX", "Main": "Sequences", "Sub": "Nested Sequences", "song.mp3": "Music" }),
  "whole project: c.wav stays in its lower-case 'audio' bin, the rest moves  " + JSON.stringify(to(pl)));
ok(pl.emptied.sort().join() === "b1,b5" && pl.removed.map(p => p.join("/")).sort().join() === "Footage,Footage/Cam A,Keep,Keep/Inner",
  "emptied: Footage and Keep with their sub-bins, not Spare (" + pl.removed.map(p => p.join("/")).join(", ") + ")");
ok(pl.counts.video.total === 2 && pl.counts.audio.total === 1 && pl.counts.audio.pending === 0 && pl.pending === 6, "counts");

let s2 = core.defaults(); s2.scope = "root";
pl = core.plan(snap, s2);
ok(pl.moves.map(m => m.name).join() === "a.mp4,Main" && !pl.removed.length, "root scope: " + pl.moves.map(m => m.name).join());

s2 = core.defaults(); s2.ignore = "keep"; s2.cats.video.on = false;
pl = core.plan(snap, s2);
ok(!pl.moves.some(m => /\.(mp4|png)$/.test(m.name)) && pl.skipped === 1 && pl.removed.length === 0,
  "ignored bin and a switched-off category: nothing leaves them, Footage keeps b.mp4");

s2 = core.defaults(); s2.cats.sfx.bin = "audio / SFX"; s2.cats.music.bin = "Audio/Music"; s2.cats.video.bin = "01 MEDIA/Video";
const snap2 = { project: "x", bins: [B("a", "Audio"), B("s", "SFX", "a")], nested: {},
  items: [I("1", "voice.wav", "a"), I("2", "whoosh.wav", "a"), I("3", "voice2.wav", "s"), I("4", "whoosh2.wav", "s"), I("5", "x.mp4")] };
pl = core.plan(snap2, s2);
ok(JSON.stringify(to(pl)) === JSON.stringify({ "whoosh.wav": "audio/SFX", "voice2.wav": "Audio", "x.mp4": "01 MEDIA/Video" }),
  "nested bin paths: " + JSON.stringify(to(pl)));
ok(!pl.removed.length, "category bins are never removed, even when emptied");

s2 = core.defaults(); s2.removeEmpty = false;
ok(!core.plan(snap, s2).emptied.length, "remove-empty switched off");

// a search bin inside a bin keeps that bin
const snap3 = { project: "x", bins: [B("f", "Folder"), B("q", "Find", "f", true)], items: [I("1", "x.mp4", "f")], nested: {} };
ok(!core.plan(snap3, st).emptied.length, "a bin holding a search bin is not removed");

// ---- execute / undo against a fake host
function fake(snap) {
  const log = [], bins = {};
  let n = 0;
  return { log, call(fn, a) {
    log.push(fn);
    if (fn === "snapBegin") return Promise.resolve({ doc: "D", project: snap.project, path: "", bins: snap.bins, total: snap.items.length, seqs: 0 });
    if (fn === "ensureBins") return Promise.resolve({ bins: a.paths.map(p => ({ path: p, id: bins[p.join("/")] || (bins[p.join("/")] = "n" + (++n)) })), created: a.paths.filter(p => p[0] !== "audio") });
    if (fn === "move") return Promise.resolve({ moved: a.moves.filter(m => m.id !== "i2").length, missing: a.moves.filter(m => m.id === "i2").map(m => m.id), failed: [] });
    if (fn === "deleteBins") return Promise.resolve({ deleted: (a.ids || a.paths).length, kept: 0 });
    return Promise.resolve(null);
  } };
}
(async function () {
  const f = fake(snap), s = core.defaults();
  s.labels = true;
  const p = core.plan(Object.assign({ doc: "D" }, snap), s);
  const rec = await core.execute(f.call, Object.assign({ doc: "D" }, snap), p, s, { time: 1791840000000, auto: true });
  ok(rec.moves.length === 5 && rec.failed === 1, "a failed move is counted and kept out of the record");
  ok(f.log.join() === "ensureBins,move,setLabels,deleteBins", "call order: " + f.log.join());
  const text = core.report(rec);
  ok(/Mode:    auto-sort/.test(text) && /for Premiere Pro - sort report/.test(text) && /Moved:   5 items into 5 bins/.test(text) && /Failed:  1 item could/.test(text) && /  a\.mp4   <- \(project root\)/.test(text) &&
    /Empty bins removed: Footage, Footage\/Cam A, Keep, Keep\/Inner/.test(text), "report text");
  const g = fake(snap), back = await core.undo(g.call, rec);
  ok(back.moved === 5 && g.log.join() === "snapBegin,ensureBins,move,deleteBins", "undo call order: " + g.log.join());

  const n = core.normalize({ auto: true, autoFor: { "d:\\a.prproj": 5, bad: "x" }, interval: 1, scope: "x", cats: { video: { on: false, bin: " / ", label: 99 } }, sfxMax: "7" });
  ok(n.interval === 3 && n.scope === "all" && n.cats.video.on === false && n.cats.video.bin === "Video" && n.cats.video.label === 9 && core.labelOf(9)[0] === "Blue" && n.sfxMax === 10 && n.cats.other.bin === "Other",
    "normalize repairs a broken settings file");
  ok(n.auto === undefined && JSON.stringify(n.autoFor) === JSON.stringify({ "d:\\a.prproj": 5 }), "the old global auto-sort switch is dropped, per-project ones are kept");
  console.log(failed ? failed + " FAILED" : "all passed");
  process.exit(failed ? 1 : 0);
})();
