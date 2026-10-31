// Read-only: what a sort of the active project would do with the default settings.
//   node test/dry_run.js [--ae | --dr] [--root] [--items]
// --ae asks After Effects and --dr DaVinci Resolve instead of Premiere Pro, --root plans the root-only scope, --items lists the raw facts.
"use strict";
const app = process.argv.includes("--ae") ? "ae" : process.argv.includes("--dr") ? "dr" : "ppro";
const core = require("../ext/js/core.js").use(app);
const { host } = require("../dev/bridge.js").use(app);

(async function () {
  const t0 = Date.now();
  const snap = await core.collect(host);
  const t1 = Date.now();
  const st = core.defaults();
  if (process.argv.includes("--root")) st.scope = "root";
  const pl = core.plan(snap, st);
  const sig = await host("sig");
  console.log(snap.project + ": " + snap.items.length + " items, " + snap.bins.length + " " + core.WORD + "s (" + snap.bins.filter(b => b.unit).length +
    " sorted whole), collect " + (t1 - t0) + " ms, fingerprint " + sig.ms + " ms");
  core.CATS.forEach(c => console.log("  " + (c.bin + "                  ").slice(0, 18) + pl.counts[c.id].total + " total, " + pl.counts[c.id].pending + " to move"));
  if (process.argv.includes("--items")) snap.items.forEach(i => console.log("  " + JSON.stringify(i)));
  console.log(core.report(core.preview(snap, pl)));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
