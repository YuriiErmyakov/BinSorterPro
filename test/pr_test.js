// Live test against test\ASB_test.prproj (must be the active project, MCP bridge panel open, no dev page polling).
// Sorts the project, checks where everything went, undoes, checks the layout is back. Leaves the project unsorted.
//   node test/setup.js && node test/pr_test.js
"use strict";
const core = require("../ext/js/core.js");
const { host, evalJsx } = require("../dev/bridge.js");
const { FILES, EMPTY_BINS, BINS_AFTER } = require("./fixture.js");

let failed = 0;
function ok(cond, text) { if (!cond) failed++; console.log((cond ? "  ok   " : "  FAIL ") + text); }
const base = rel => rel.split("/").pop();
const SEQS = { "Main Edit": "seq", "Social Cut": "seq", "Nested Intro": "nested", "Black Video": "gfx" };

// name -> "Bin/Sub bin" for every item, and the list of bin paths
function layout(snap) {
  const byId = {}, memo = {};
  snap.bins.forEach(b => { byId[b.id] = b; });
  const full = id => !id ? [] : memo[id] || (memo[id] = full(byId[id].parent).concat([byId[id].name]));
  const at = {};
  snap.items.forEach(i => { at[i.name] = full(i.bin).join("/"); });
  return { at, bins: snap.bins.map(b => full(b.id).join("/")).sort(), labels: Object.fromEntries(snap.items.map(i => [i.name, i.label])) };
}

(async function () {
  const name = await evalJsx("app.project ? app.project.name : ''");
  if (name !== "ASB_test.prproj") throw new Error("Make test\\ASB_test.prproj the active project first (active: " + name + ")");

  const st = core.defaults();
  st.labels = true;
  let snap = await core.collect(host);
  const before = layout(snap);
  FILES.forEach(f => ok(before.at[base(f[0])] === f[1].join("/"), "starts in " + (f[1].join("/") || "(root)") + ": " + base(f[0])));

  // ---- plan
  const pl = core.plan(snap, st);
  const want = {};
  FILES.forEach(f => { want[base(f[0])] = f[2]; });
  Object.assign(want, SEQS);
  const rules = core.rulesOf(st), byId = {};
  snap.bins.forEach(b => { byId[b.id] = b; });
  snap.items.forEach(i => {
    const names = []; for (let b = i.bin; b; b = byId[b].parent) names.unshift(byId[b].name);
    const got = core.classify(i, names, rules, snap);
    ok(got === want[i.name], i.name + " -> " + want[i.name] + (got === want[i.name] ? "" : "   got " + got));
  });
  ok(pl.moves.length === snap.items.length - 2, "everything moves except the two clips already under Video (" + pl.moves.length + ")");
  ok(pl.removed.map(p => p.join("/")).sort().join() === BINS_AFTER.removed.map(p => p.join("/")).sort().join(), "bins to remove: " + pl.removed.map(p => p.join("/")).join(", "));

  // ---- sort
  const sig0 = (await host("sig")).sig;
  let t = Date.now();
  const rec = await core.execute(host, snap, pl, st, {});
  console.log("sort " + (Date.now() - t) + " ms");
  ok(rec.moves.length === pl.moves.length && !rec.failed, "moved " + rec.moves.length + ", failed " + rec.failed);
  ok(rec.created.length === 7, "7 category bins created, Video was there (" + rec.created.map(p => p.join("/")).join(", ") + ")");
  snap = await core.collect(host);
  let now = layout(snap);
  snap.items.forEach(i => {
    const bin = core.CAT[want[i.name]].bin, got = now.at[i.name];
    const fine = i.name === "clip_c.mp4" ? got === "Video/Selects" : got === bin;
    ok(fine, i.name + " is in " + got);
  });
  BINS_AFTER.kept.forEach(p => ok(now.bins.includes(p.join("/")), "bin kept: " + p.join("/")));
  BINS_AFTER.removed.forEach(p => ok(!now.bins.includes(p.join("/")), "bin removed: " + p.join("/")));
  ok(now.labels["whoosh_01.wav"] === core.CAT.sfx.label && now.labels["clip_b.mp4"] === 0, "moved items are colour-labelled, untouched ones are not");
  ok(core.plan(snap, st).moves.length === 0, "a second sort has nothing to do");
  ok((await host("sig")).sig !== sig0, "the project fingerprint changed");

  // ---- undo
  t = Date.now();
  const back = await core.undo(host, JSON.parse(JSON.stringify(rec)));
  console.log("undo " + (Date.now() - t) + " ms");
  ok(back.moved === rec.moves.length && !back.missing, "undo moved " + back.moved + ", missing " + back.missing);
  snap = await core.collect(host);
  now = layout(snap);
  ok(Object.keys(before.at).every(n => before.at[n] === now.at[n]), "every item is back in its bin");
  ok(before.bins.join("|") === now.bins.join("|"), "the bin tree is the same as before (" + now.bins.join(", ") + ")");
  ok(Object.keys(before.labels).every(n => before.labels[n] === now.labels[n]), "labels are back");
  EMPTY_BINS.forEach(p => ok(now.bins.includes(p.join("/")), "empty bin untouched: " + p.join("/")));

  // ---- root-only scope and an ignored bin
  const st2 = core.defaults();
  st2.scope = "root";
  const p2 = core.plan(snap, st2);
  ok(p2.moves.every(m => m.from.length === 0) && p2.moves.length === 13 && !p2.removed.length, "root scope: only the 13 loose items (" + p2.moves.length + ")");
  const st3 = core.defaults();
  st3.ignore = "Sounds, old stuff";
  const p3 = core.plan(snap, st3);
  ok(p3.skipped === 4 && !p3.moves.some(m => /^(Sounds|Old stuff)$/.test(m.from[0])) && p3.removed.join() === "Footage,Footage,Day 1", "ignored bins are left alone (skipped " + p3.skipped + ", removed " + p3.removed.join("|") + ")");

  // ---- settings and history files, written by Premiere itself
  const saved = await host("settingsLoad");
  await host("historySave", { key: "__test__", records: [rec] });
  const h = await host("historyLoad", { key: "__test__" });
  ok(h.length === 1 && h[0].moves.length === rec.moves.length && h[0].moves[0].name === rec.moves[0].name, "history round trip");
  await host("historySave", { key: "__test__", records: [] });
  ok((await host("historyLoad", { key: "__test__" })).length === 0, "history entry removed");
  console.log("settings file: " + (saved ? "present" : "none yet"));

  console.log(failed ? failed + " FAILED" : "all passed");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
