// Live test against the Resolve project "ASB_test" (must be the open project; DaVinci Resolve running, no dev page polling).
// Sorts the Media Pool, checks where everything went, undoes, checks the layout is back. Leaves the project unsorted.
//   node test/dr_setup.js && node test/dr_test.js
"use strict";
const core = require("../ext/js/core.js").use("dr");
const { host, evalJsx } = require("../dev/bridge.js").use("dr");
const { PROJECT_DR, FILES, EMPTY_BINS, DR_CAT, DR_EXTRA } = require("./fixture.js");

let failed = 0;
function ok(cond, text) { if (!cond) failed++; console.log((cond ? "  ok   " : "  FAIL ") + text); }
const base = rel => rel.split("/").pop();

// name -> "Bin/Sub bin" for every item, and the list of bin paths
function layout(snap) {
  const byId = {}, memo = {};
  snap.bins.forEach(b => { byId[b.id] = b; });
  const full = id => !id ? [] : memo[id] || (memo[id] = full(byId[id].parent).concat([byId[id].name]));
  const at = {}, labels = {};
  snap.items.forEach(i => { at[i.name] = full(i.bin).join("/"); labels[i.name] = i.label; });
  return { at, labels, bins: snap.bins.map(b => full(b.id).join("/")).sort() };
}

(async function () {
  const name = await evalJsx("local p = resolve:GetProjectManager():GetCurrentProject(); return p and p:GetName() or ''");
  if (name !== PROJECT_DR) throw new Error("Open the test project first: node test/dr_setup.js --switch (open: " + name + ")");

  // name -> [bin before, category]
  const want = {};
  FILES.forEach(f => { want[base(f[0])] = [f[1], DR_CAT[f[2]] || f[2]]; });
  Object.keys(DR_EXTRA).forEach(n => { want[n] = DR_EXTRA[n]; });

  const st = core.defaults();
  st.labels = true;
  let snap = await core.collect(host);
  const before = layout(snap);
  ok(Object.keys(before.at).length === Object.keys(want).length, Object.keys(before.at).length + " items in the Media Pool");
  Object.keys(want).forEach(n => ok(before.at[n] === want[n][0].join("/"), "starts in " + (want[n][0].join("/") || "(root)") + ": " + n + (before.at[n] === want[n][0].join("/") ? "" : "   is in " + before.at[n])));

  // ---- plan
  const pl = core.plan(snap, st);
  const rules = core.rulesOf(st), byId = {};
  snap.bins.forEach(b => { byId[b.id] = b; });
  snap.items.forEach(i => {
    const names = []; for (let b = i.bin; b; b = byId[b].parent) names.unshift(byId[b].name);
    const got = core.classify(i, names, rules, snap);
    ok(got === want[i.name][1], i.name + " (" + i.type + ") -> " + want[i.name][1] + (got === want[i.name][1] ? "" : "   got " + got));
  });
  ok(pl.moves.length === 23, "23 moves: all but clip_b and clip_c, already under Video (" + pl.moves.length + ")");
  ok(pl.removed.map(p => p.join("/")).sort().join() === "Footage,Footage/Day 1,Old stuff,Sounds", "bins to remove: " + pl.removed.map(p => p.join("/")).join(", "));

  // ---- sort: one command
  const cur0 = await evalJsx("return resolve:GetProjectManager():GetCurrentProject():GetMediaPool():GetCurrentFolder():GetName()");
  const sig0 = (await host("sig")).sig;
  let t = Date.now();
  const rec = await core.execute(host, snap, pl, st, {});
  console.log("sort " + (Date.now() - t) + " ms");
  ok(rec.moves.length === 23 && !rec.failed, "moved " + rec.moves.length + ", failed " + rec.failed);
  ok(rec.created.map(p => p.join("/")).sort().join() === "Audio,Compound Clips,Fusion,GFX,Music,Nested Timelines,SFX,Timelines", "new bins: " + rec.created.map(p => p.join("/")).join(", "));
  snap = await core.collect(host);
  const sorted = layout(snap);
  Object.keys(want).forEach(n => {
    const bin = core.CAT[want[n][1]].bin, got = sorted.at[n];
    ok(n === "clip_c.mp4" ? got === "Video/Selects" : got === bin, n + " is in " + got);
  });
  ["Video", "Video/Selects", "Empty before"].forEach(p => ok(sorted.bins.includes(p), "bin kept: " + p));
  ["Footage", "Footage/Day 1", "Sounds", "Old stuff"].forEach(p => ok(!sorted.bins.includes(p), "bin removed: " + p));
  ok(sorted.labels["whoosh_01.wav"] === core.CAT.sfx.label && sorted.labels["clip_b.mp4"] === 0 && sorted.labels["Main Edit"] === core.CAT.seq.label,
    "moved items get the clip colour of their category, untouched ones none");
  ok(core.plan(snap, st).moves.length === 0, "a second sort has nothing to do");
  ok((await host("sig")).sig !== sig0, "the Media Pool fingerprint changed");
  const cur1 = await evalJsx("return resolve:GetProjectManager():GetCurrentProject():GetMediaPool():GetCurrentFolder():GetName()");
  ok(cur1 === cur0, "the bin open in the Media Pool is still " + cur0 + " (" + cur1 + ")");
  const tl = await evalJsx("local p = resolve:GetProjectManager():GetCurrentProject(); return p:GetTimelineCount() .. ' timelines, current ' .. p:GetCurrentTimeline():GetName()");
  ok(tl === "4 timelines, current Main Edit", "timelines are intact: " + tl);

  // ---- undo, from the stored record
  t = Date.now();
  const back = await core.undo(host, JSON.parse(JSON.stringify(rec)));
  console.log("undo " + (Date.now() - t) + " ms");
  ok(back.moved === rec.moves.length && !back.missing, "undo moved " + back.moved + ", missing " + back.missing);
  snap = await core.collect(host);
  const now = layout(snap);
  ok(Object.keys(before.at).every(n => before.at[n] === now.at[n]), "every item is back in its bin");
  ok(before.bins.join("|") === now.bins.join("|"), "the bin tree is the same as before (" + now.bins.join(", ") + ")");
  ok(Object.keys(before.labels).every(n => before.labels[n] === now.labels[n]), "clip colours are back");
  EMPTY_BINS.forEach(p => ok(now.bins.includes(p.join("/")), "empty bin untouched: " + p.join("/")));

  // ---- root-only scope and an ignored bin
  const st2 = core.defaults();
  st2.scope = "root";
  const p2 = core.plan(snap, st2);
  ok(p2.moves.every(m => m.from.length === 0) && p2.moves.length === 15 && !p2.removed.length, "root scope: only the 15 loose items (" + p2.moves.length + ")");
  const st3 = core.defaults();
  st3.ignore = "Sounds";
  const p3 = core.plan(snap, st3);
  ok(p3.skipped === 3 && !p3.moves.some(m => m.from[0] === "Sounds"), "an ignored bin is left alone (skipped " + p3.skipped + ")");

  // ---- auto-sort signals, settings and history files
  const info = await host("info", { auto: true });
  ok(info.project === PROJECT_DR && info.adds === 25 && (await host("info", {})).adds === 0, "info counts the clips only when auto-sort asks (" + info.adds + ")");
  await host("historySave", { key: "__test__", records: [rec] });
  const h = await host("historyLoad", { key: "__test__" });
  ok(h.length === 1 && h[0].moves.length === rec.moves.length && h[0].moves[0].name === rec.moves[0].name, "history round trip");
  await host("historySave", { key: "__test__", records: [] });
  ok((await host("historyLoad", { key: "__test__" })).length === 0, "history entry removed");

  console.log(failed ? failed + " FAILED" : "all passed");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
