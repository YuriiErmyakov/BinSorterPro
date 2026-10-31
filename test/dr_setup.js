// Builds the DaVinci Resolve test project "ASB_test" (from nothing, every time).
//   node test/dr_setup.js                 the test project must already be the open project
//   node test/dr_setup.js --switch        saves the open project, then creates or opens the test project
//   node test/dr_setup.js --open "Name" ["Timeline name"]    saves the test project and opens that project again
// Run test/make_media.js first. Resolve holds one project at a time, hence the switching.
"use strict";
const fs = require("fs"), path = require("path");
const { evalJsx } = require("../dev/bridge.js").use("dr");
const { toLua } = require("../ext/js/dr_link.js");
const { MEDIA, PROJECT_DR, FILES, EMPTY_BINS } = require("./fixture.js");

(async function () {
  const now = await evalJsx("local pm = resolve:GetProjectManager(); local p = pm:GetCurrentProject(); local t = p and p:GetCurrentTimeline(); " +
    "return { project = p and p:GetName() or '', timeline = t and t:GetName() or '', page = resolve:GetCurrentPage() or '' }");
  const at = process.argv.indexOf("--open");
  if (at > 0) {
    const target = process.argv[at + 1], tl = process.argv[at + 2] || "";
    if (!target) throw new Error("Which project?");
    if (now.project !== PROJECT_DR) throw new Error("The test project is not the open one (open: " + now.project + ")");
    console.log(await evalJsx("local pm = resolve:GetProjectManager(); pm:SaveProject(); local p = pm:LoadProject(" + toLua(target) + "); if not p then return 'could not open' end; " +
      "local want = " + toLua(tl) + "; if want ~= '' then for i = 1, p:GetTimelineCount() do local t = p:GetTimelineByIndex(i); if t:GetName() == want then p:SetCurrentTimeline(t) end end end; " +
      "local t = p:GetCurrentTimeline(); return 'open: ' .. p:GetName() .. ' / ' .. (t and t:GetName() or '-')", 120000));
    return process.exit(0);
  }
  if (now.project !== PROJECT_DR) {
    if (!process.argv.includes("--switch")) throw new Error("The open project is \"" + now.project + "\". Run with --switch to save it and open the test project.");
    console.log("was open: " + JSON.stringify(now));
    const r = await evalJsx("local pm = resolve:GetProjectManager(); pm:SaveProject(); local p = pm:LoadProject(" + toLua(PROJECT_DR) + ") or pm:CreateProject(" + toLua(PROJECT_DR) + "); " +
      "return p and p:GetName() or 'failed'", 120000);
    if (r !== PROJECT_DR) throw new Error("Could not open the test project: " + r);
  }
  const T = { name: PROJECT_DR, media: MEDIA, files: FILES.map(f => [f[0], f[1]]), empty: EMPTY_BINS };
  console.log(await evalJsx("T = " + toLua(T) + "\n" + fs.readFileSync(path.join(__dirname, "dr_build.lua"), "utf8"), 300000));
  process.exit(0);
})().catch(e => { console.error(String(e.message || e)); process.exit(1); });
