// Live test against test\ASB_test.aep (must be the open project in After Effects, MCP bridge running, no dev page polling).
// Sorts the project, checks where everything went, checks Edit > Undo and the panel's own undo. Leaves the project unsorted.
//   node test/ae_setup.js && node test/ae_test.js
"use strict";
const core = require("../ext/js/core.js").use("ae");
const { host, evalJsx } = require("../dev/bridge.js").use("ae");
const { FILES, EMPTY_BINS, AE_CAT, AE_EXTRA } = require("./fixture.js");

let failed = 0;
function ok(cond, text) { if (!cond) failed++; console.log((cond ? "  ok   " : "  FAIL ") + text); }
const base = rel => rel.split("/").pop();

// name -> "Folder/Sub folder" for everything that gets sorted, plus the list of folder paths
function layout(snap) {
  const byId = {}, memo = {};
  snap.bins.forEach(b => { byId[b.id] = b; });
  const full = id => !id ? [] : memo[id] || (memo[id] = full(byId[id].parent).concat([byId[id].name]));
  const at = {}, labels = {};
  snap.items.forEach(i => { at[i.name] = full(i.bin).join("/"); labels[i.name] = i.label; });
  snap.bins.filter(b => b.unit).forEach(b => { at[b.name] = full(b.parent).join("/"); labels[b.name] = b.label; });
  return { at, labels, bins: snap.bins.map(b => full(b.id).join("/")).sort() };
}

(async function () {
  const name = await evalJsx("app.project.file ? decodeURI(app.project.file.name) : ''");
  if (name !== "ASB_test.aep") throw new Error("Open test\\ASB_test.aep first: node test/ae_setup.js --switch (open: " + (name || "untitled") + ")");

  // name -> [folder before, category]
  const want = {};
  FILES.forEach(f => { want[base(f[0])] = [f[1], AE_CAT[f[2]] || f[2]]; });
  Object.keys(AE_EXTRA).forEach(n => { want[n] = AE_EXTRA[n]; });

  const st = core.defaults();
  st.labels = true;
  let snap = await core.collect(host);
  const before = layout(snap);
  ok(Object.keys(before.at).length === Object.keys(want).length, Object.keys(before.at).length + " things to sort, the two layers of design Layers are not among them");
  Object.keys(want).forEach(n => ok(before.at[n] === want[n][0].join("/"), "starts in " + (want[n][0].join("/") || "(root)") + ": " + n + (before.at[n] === want[n][0].join("/") ? "" : "   is in " + before.at[n])));

  // ---- plan
  const pl = core.plan(snap, st);
  const rules = core.rulesOf(st), byId = {};
  snap.bins.forEach(b => { byId[b.id] = b; });
  snap.items.forEach(i => {
    const names = []; for (let b = i.bin; b; b = byId[b].parent) names.unshift(byId[b].name);
    const got = core.classify(i, names, rules, snap);
    ok(got === want[i.name][1], i.name + " -> " + want[i.name][1] + (got === want[i.name][1] ? "" : "   got " + got));
  });
  const unit = pl.moves.filter(m => m.folder);
  ok(unit.length === 1 && unit[0].name === "design Layers" && unit[0].cat === "image", "design Layers moves whole, as an image");
  ok(pl.moves.length === 24, "24 moves: all but clip_b, clip_c and the two solids already in Solids (" + pl.moves.length + ")");
  ok(pl.removed.map(p => p.join("/")).sort().join() === "Footage,Footage/Day 1,Old stuff,Sounds", "folders to remove: " + pl.removed.map(p => p.join("/")).join(", "));

  // ---- sort: one host call, one undo step
  const sig0 = (await host("sig")).sig;
  let t = Date.now();
  const rec = await core.execute(host, snap, pl, st, {});
  console.log("sort " + (Date.now() - t) + " ms");
  ok(rec.moves.length === 24 && !rec.failed, "moved " + rec.moves.length + ", failed " + rec.failed);
  ok(rec.created.map(p => p.join("/")).sort().join() === "Audio,Comps,Images,Music,Other,Precomps,SFX", "new folders: " + rec.created.map(p => p.join("/")).join(", "));
  snap = await core.collect(host);
  const sorted = layout(snap);
  Object.keys(want).forEach(n => {
    const bin = core.CAT[want[n][1]].bin, got = sorted.at[n];
    ok(n === "clip_c.mp4" ? got === "Video/Selects" : got === bin, n + " is in " + got);
  });
  ["Video", "Video/Selects", "Empty before", "Solids", "Images/design Layers"].forEach(p => ok(sorted.bins.includes(p), "folder kept: " + p));
  ["Footage", "Footage/Day 1", "Sounds", "Old stuff", "design Layers"].forEach(p => ok(!sorted.bins.includes(p), "folder gone from its old place: " + p));
  ok(sorted.labels["whoosh_01.wav"] === core.CAT.sfx.label && sorted.labels["clip_b.mp4"] === 0 && sorted.labels["design Layers"] === core.CAT.image.label,
    "moved items are colour-labelled, untouched ones are not");
  const made = snap.bins.filter(b => b.name === "Comps")[0];
  ok(made && made.label === core.CAT.comp.label, "a new folder takes the label of its category");
  ok(core.plan(snap, st).moves.length === 0, "a second sort has nothing to do");
  ok((await host("sig")).sig !== sig0, "the project fingerprint changed");
  const kids = await evalJsx("(function () { var p = app.project, i, f; for (i = 1; i <= p.numItems; i++) if (p.item(i).name == 'design Layers') f = p.item(i); return f.numItems + ' in ' + f.parentFolder.name; })()");
  ok(kids === "2 in Images", "the layers are still inside design Layers (" + kids + ")");

  // ---- Edit > Undo takes the whole sort back, Redo brings it again
  await evalJsx("app.executeCommand(16); 'undo'");
  snap = await core.collect(host);
  let now = layout(snap);
  ok(Object.keys(before.at).every(n => before.at[n] === now.at[n]) && before.bins.join("|") === now.bins.join("|"), "one Edit > Undo restores the whole layout");
  await evalJsx("app.executeCommand(2035); 'redo'");
  snap = await core.collect(host);
  ok(layout(snap).bins.join("|") === sorted.bins.join("|"), "Edit > Redo sorts it again");

  // ---- the panel's undo, from the stored record
  t = Date.now();
  const back = await core.undo(host, JSON.parse(JSON.stringify(rec)));
  console.log("undo " + (Date.now() - t) + " ms");
  ok(back.moved === rec.moves.length && !back.missing, "undo moved " + back.moved + ", missing " + back.missing);
  snap = await core.collect(host);
  now = layout(snap);
  ok(Object.keys(before.at).every(n => before.at[n] === now.at[n]), "every item is back in its folder");
  ok(before.bins.join("|") === now.bins.join("|"), "the folder tree is the same as before (" + now.bins.join(", ") + ")");
  ok(Object.keys(before.labels).every(n => before.labels[n] === now.labels[n]), "labels are back");
  EMPTY_BINS.forEach(p => ok(now.bins.includes(p.join("/")), "empty folder untouched: " + p.join("/")));

  // ---- root-only scope and an ignored folder
  const st2 = core.defaults();
  st2.scope = "root";
  const p2 = core.plan(snap, st2);
  ok(p2.moves.every(m => m.from.length === 0) && p2.moves.length === 15 && !p2.removed.length, "root scope: only the 15 loose things (" + p2.moves.length + ")");
  const st3 = core.defaults();
  st3.ignore = "Sounds, design layers";
  const p3 = core.plan(snap, st3);
  ok(p3.skipped === 4 && !p3.moves.some(m => m.from[0] === "Sounds" || m.name === "design Layers"), "ignored folders are left alone (skipped " + p3.skipped + ")");

  // ---- settings and history files, written by After Effects itself
  await host("historySave", { key: "__test__", records: [rec] });
  const h = await host("historyLoad", { key: "__test__" });
  ok(h.length === 1 && h[0].moves.length === rec.moves.length && h[0].moves[0].name === rec.moves[0].name, "history round trip");
  await host("historySave", { key: "__test__", records: [] });
  ok((await host("historyLoad", { key: "__test__" })).length === 0, "history entry removed");

  console.log(failed ? failed + " FAILED" : "all passed");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
