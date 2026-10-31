// DaVinci Resolve profile: rules and the one-command sort, without Resolve.
//   node test/core_dr_test.js
"use strict";
const core = require("../ext/js/core.js").use("dr");
const { toLua } = require("../ext/js/dr_link.js");

let failed = 0;
function ok(cond, text) { if (!cond) failed++; console.log((cond ? "  ok   " : "  FAIL ") + text); }

const st = core.defaults(), rules = core.rulesOf(st);
const snapN = { nested: { t2: true } };
[
  [{ name: "A001.mov", type: "Video + Audio", path: "D:\\m\\A001.mov" }, "video"], [{ name: "plate.[0001-0240].exr", type: "Video", path: "D:\\m\\plate.0001.exr" }, "video"],
  [{ name: "logo.png", type: "Still", path: "D:\\m\\logo.png" }, "gfx"], [{ id: "t1", name: "Edit v3", type: "Timeline", path: "" }, "seq"],
  [{ id: "t2", name: "Titles", type: "Timeline", path: "" }, "nested"], [{ name: "Combo", type: "Compound", path: "" }, "compound"],
  [{ name: "Cam sync", type: "Multicam", path: "" }, "compound"], [{ name: "Fusion Clip 1", type: "Fusion", path: "" }, "fusion"],
  [{ name: "Solid Color", type: "Generator", path: "" }, "fusion"], [{ name: "Text+", type: "Fusion Title", path: "" }, "fusion"],
  [{ name: "whoosh.wav", type: "Audio", path: "D:\\m\\whoosh.wav", dur: 40 }, "sfx"], [{ name: "Track.mp3", type: "Audio", path: "D:\\m\\Track.mp3", dur: 5 }, "music"],
  [{ name: "ZOOM0001.wav", type: "Audio", path: "D:\\m\\ZOOM0001.wav", dur: 30 }, "audio"], [{ name: "subs.srt", type: "Subtitle", path: "D:\\m\\subs.srt" }, "other"],
  [{ name: "odd.mov", type: "", path: "D:\\m\\odd.mov" }, "video"], [{ name: "thing", type: "", path: "" }, "other"]
].forEach(([item, want]) => { const got = core.classify(item, [], rules, snapN); ok(got === want, item.name + " (" + (item.type || "no type") + ") -> " + want + (got === want ? "" : "   got " + got)); });
ok(core.labelOf(1)[0] === "Orange" && core.labelOf(16)[0] === "Chocolate" && core.labelOf(0) === null, "clip colours are numbered from 1");
ok(core.CATS.length === 10 && core.WORD === "bin" && core.HOST === "DaVinci Resolve", "profile");

// commands travel to the Lua side as Lua source
ok(toLua({ id: "7-1", fn: "move", args: { moves: [{ id: "a", path: [], label: -1 }, { id: "b", path: ["Звук", 'He said "hi"\\'], bin: null }], n: 2.5, on: true } }) ===
  '{["id"]="7-1",["fn"]="move",["args"]={["moves"]={{["id"]="a",["path"]={},["label"]=-1},{["id"]="b",["path"]={"\\208\\151\\208\\178\\209\\131\\208\\186","He said \\034hi\\034\\092"},["bin"]=nil}},["n"]=2.5,["on"]=true}}',
  "toLua writes strings byte by byte");

(async function () {
  const B = (id, name, parent) => ({ id, name, parent: parent || null, virtual: false });
  const snap = { doc: "P", project: "Film", nested: { t2: true }, bins: [B("b1", "Day 1"), B("b2", "Timeline")],
    items: [{ id: "c1", name: "A001.mov", type: "Video + Audio", bin: "b1", label: 0 }, { id: "t1", name: "Edit", type: "Timeline", bin: "b2", label: 0 },
      { id: "t2", name: "Titles", type: "Timeline", bin: "b2", label: 3 }, { id: "a1", name: "Song.mp3", type: "Audio", label: 0 }] };
  const s = core.defaults();
  s.labels = true;
  const pl = core.plan(snap, s);
  let sent = null;
  const rec = await core.execute((fn, a) => { sent = [fn, a]; return Promise.resolve([{ bins: [], created: a.calls[0][1].paths }, { moved: 4, missing: [], failed: [] }, { deleted: 2, kept: 0 }]); }, snap, pl, s, {});
  ok(sent[0] === "batch" && sent[1].calls.map(c => c[0]).join() === "ensureBins,move,deleteBins" && rec.moves.length === 4 && rec.removed.length === 2, "a sort is one batch command");
  ok(JSON.stringify(sent[1].calls[1][1].moves.map(m => [m.path.join("/"), m.label])) === JSON.stringify([["Video", 9], ["Timelines", 12], ["Nested Timelines", 8], ["Music", 7]]), "paths and clip colours");
  let usent = null;
  await core.undo((fn, a) => { if (fn === "batch") usent = a; return Promise.resolve(fn === "snapBegin" ? { doc: "P" } : [{}, { moved: 4, missing: [], failed: [] }, { deleted: 4 }]); }, rec);
  ok(JSON.stringify(usent.calls[1][1].moves.map(m => [m.path.join("/"), m.label])) === JSON.stringify([["Day 1", 0], ["Timeline", 0], ["Timeline", 3], ["", 0]]), "undo sends clips home and puts their colours back (0 clears)");
  ok(/for DaVinci Resolve - sort report/.test(core.report(rec)), "report names the host");
  console.log(failed ? failed + " FAILED" : "all passed");
  process.exit(failed ? 1 : 0);
})();
