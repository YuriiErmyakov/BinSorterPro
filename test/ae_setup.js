// Builds the After Effects test project test\ASB_test.aep (from nothing, every time).
//   node test/ae_setup.js             the test project must already be the open project
//   node test/ae_setup.js --switch    closes the open project (only if it has no unsaved changes) and opens the test project
//   node test/ae_setup.js --open "D:\work\my.aep"    saves the test project and opens that project again
// Run test/make_media.js first. After Effects holds one project at a time, hence the switching.
"use strict";
const fs = require("fs");
const { evalJsx, lit } = require("../dev/bridge.js").use("ae");
const { MEDIA, PROJECT_AE, FILES, EMPTY_BINS } = require("./fixture.js");

(async function () {
  const now = JSON.parse(await evalJsx("'{\"file\":' + (app.project.file ? '\"' + encodeURI(String(app.project.file.fsName)) + '\"' : '\"\"') + ',\"dirty\":' + app.project.dirty + '}'"));
  const file = decodeURI(now.file);
  const at = process.argv.indexOf("--open");
  if (at > 0) {
    const target = process.argv[at + 1];
    if (!target || !fs.existsSync(target)) throw new Error("No such project: " + target);
    if (file.toLowerCase() !== PROJECT_AE.toLowerCase()) throw new Error("The test project is not the open one (open: " + (file || "untitled") + ")");
    console.log(await evalJsx("app.project.save(); app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.open(new File(" + lit(target) + ")); String(app.project.file.fsName)"));
    return process.exit(0);
  }
  if (file.toLowerCase() !== PROJECT_AE.toLowerCase()) {
    if (!process.argv.includes("--switch")) throw new Error("The open project is " + (file || "untitled") + ". Run with --switch to close it and open the test project.");
    if (now.dirty) throw new Error("The open project has unsaved changes: save it first.");
    console.log("was open: " + (file || "(untitled)"));
    const open = fs.existsSync(PROJECT_AE)
      ? "app.open(new File(" + lit(PROJECT_AE) + "));"
      : "app.newProject(); app.project.save(new File(" + lit(PROJECT_AE) + "));";
    await evalJsx("app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); " + open + " 'ok'");
  }
  const T = { project: PROJECT_AE, media: MEDIA, files: FILES.map(f => [f[0], f[1]]), empty: EMPTY_BINS };
  console.log(await evalJsx("$.global.ASB_TEST = " + lit(JSON.stringify(T)) + "; $.global.ASB_TEST = eval('(' + $.global.ASB_TEST + ')'); $.evalFile(" + lit(__dirname + "\\ae_build.jsx") + ")", 180000));
  process.exit(0);
})().catch(e => { console.error(String(e.message || e)); process.exit(1); });
