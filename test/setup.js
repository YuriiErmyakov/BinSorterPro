// Builds the test project, or puts it back into its unsorted layout.
//   node test/setup.js
// test\ASB_test.prproj must be the active project in Premiere (create it once with File > New > Project,
// or app.newProject(path)); run test/make_media.js first.
"use strict";
const path = require("path");
const { host, evalJsx, lit } = require("../dev/bridge.js");
const { MEDIA, FILES, EMPTY_BINS } = require("./fixture.js");

const MOGRT = path.join(process.env.APPDATA, "Adobe", "Common", "Motion Graphics Templates", "Basic Title.mogrt");
const base = rel => rel.split("/").pop();
const uniq = paths => { const seen = {}; return paths.filter(p => p.length && !seen[p.join("/")] && (seen[p.join("/")] = true)); };

async function snapshot() {
  const head = await host("snapBegin");
  const items = head.total ? await host("snapChunk", { doc: head.doc, from: 0, n: 10000 }) : [];
  return { head, items };
}

(async function () {
  const name = await evalJsx("app.project ? app.project.name : ''");
  if (name !== "ASB_test.prproj") throw new Error("Make test\\ASB_test.prproj the active project first (active: " + name + ")");

  let { head, items } = await snapshot();
  const have = {};
  items.forEach(i => { have[i.name] = i; });

  // 1. import what is missing, into the project root
  const missing = FILES.filter(f => !have[base(f[0])]).map(f => path.join(MEDIA, f[0]));
  if (missing.length) {
    await evalJsx("app.project.importFiles([" + missing.map(lit).join(",") + "], true, app.project.rootItem, false); 'ok'");
    console.log("imported " + missing.length + " files");
  }

  // 2. sequences: Main Edit holds Nested Intro, a Motion Graphics template and black video
  if (!have["Main Edit"]) {
    console.log(await evalJsx(`(function () {
      var p = app.project, root = p.rootItem, by = {}, i, c, log = [];
      for (i = 0; i < root.children.numItems; i++) { c = root.children[i]; by[c.name] = c; }
      var intro = p.createNewSequenceFromClips("Nested Intro", [by["clip_b.mp4"]], root);
      var main = p.createNewSequenceFromClips("Main Edit", [by["clip_a.mp4"]], root);
      p.createNewSequenceFromClips("Social Cut", [by["clip_c.mp4"]], root);
      main.videoTracks[0].overwriteClip(intro.projectItem, 2.0);
      try { main.importMGT(${lit(MOGRT)}, "1016064000000", 1, 0); log.push("mogrt ok"); } catch (e) { log.push("mogrt: " + e); }
      try {
        app.enableQE();
        qe.project.newBlackVideo(1920, 1080, 10160640000, 1, 1);
        log.push("black video ok");
      } catch (e2) { log.push("black video: " + e2); }
      return log.join(", ");
    })()`));
  }

  // 3. the unsorted layout: every file into its bin, everything else into the root, no other bins left
  ({ head, items } = await snapshot());
  const where = {};
  FILES.forEach(f => { where[base(f[0])] = f[1]; });
  const wanted = uniq(FILES.map(f => f[1]).concat(EMPTY_BINS));
  const made = await host("ensureBins", { doc: head.doc, paths: wanted });
  const idOf = {};
  made.bins.forEach(b => { idOf[b.path.join("/")] = b.id; });
  const moves = items.map(i => ({ id: i.id, bin: where[i.name] && where[i.name].length ? idOf[where[i.name].join("/")] : null, label: 0 }));
  const res = await host("move", { doc: head.doc, moves });
  // bins that are not part of the layout go, if they are empty by now
  const keep = {};
  wanted.forEach(p => p.forEach((_, n) => { keep[p.slice(0, n + 1).join("/")] = true; }));
  const pathOf = {}, byId = {};
  head.bins.forEach(b => { byId[b.id] = b; });
  const full = b => pathOf[b.id] || (pathOf[b.id] = (b.parent ? full(byId[b.parent]) : []).concat([b.name]));
  const extra = head.bins.map(full).filter(p => !keep[p.join("/")]);
  const del = extra.length ? await host("deleteBins", { doc: head.doc, paths: extra }) : { deleted: 0 };
  console.log("layout: moved " + res.moved + " (failed " + res.failed.length + "), extra bins deleted " + del.deleted);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
