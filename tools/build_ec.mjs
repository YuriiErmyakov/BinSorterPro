// Builds effectcraft/BinSorterPro-EC.jsx, the EffectCraft edition: one ScriptUI panel file made of
// a synchronous Promise, ext/js/core.js, ext/host_ae.jsx (patched below) and effectcraft/ui_ec.jsx.
// The CEP, Resolve and Unreal files stay untouched; run `node tools/build_ec.mjs` after changing them.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
let host = read("ext/host_ae.jsx");

function swap(from, to) {
    if (!host.includes(from)) throw new Error("build_ec: pattern not found: " + from);
    host = host.split(from).join(to);
}
// EffectCraft has one FootageSource class: a file source has a file (or a missing path), a solid has neither
swap(`if (!(src instanceof FileSource) || !src.file) return false;`, `if (!src || !src.file) return false;`);
swap(`if (src instanceof SolidSource) o.solid = true;
                else if (src instanceof FileSource) {`, `if (it.typeName == "Solid") o.solid = true;
                else if (src && (src.file || src.missingFootagePath)) {`);
// settings and undo history go to EffectCraft's script settings: writing files needs a preference
swap(host.slice(host.indexOf("function store(name) {"), host.indexOf("ASB.settingsLoad")),
`function readJson(name) {
    try { if (app.settings.haveSetting("BinSorterPro", name)) return JSON.parse(app.settings.getSetting("BinSorterPro", name)); } catch (e) {}
    return null;
}
function writeJson(name, v) { app.settings.saveSetting("BinSorterPro", name, str(v)); }

`);
swap(`// ---------------------------------------------------------------- files in %APPDATA%\\AutoSortBinsPro`,
    `// ---------------------------------------------------------------- EffectCraft script settings`);

const out = [
    "// BinSorter Pro for EffectCraft - built by tools/build_ec.mjs from ext/js/core.js, ext/host_ae.jsx and effectcraft/ui_ec.jsx.",
    "// Install: copy this file into <settings folder>/Scripts/ScriptUI Panels/ (EffectCraft: File > Scripts > Install ScriptUI Panel...),",
    "// then Window > BinSorterPro-EC.jsx. Free and open source (MIT): https://github.com/YuriiErmyakov/BinSorterPro",
    "var window = {};",
    read("effectcraft/syncpromise.js"),
    read("ext/js/core.js"),
    host,
    read("effectcraft/ui_ec.jsx")
].join("\n");
writeFileSync(join(root, "effectcraft", "BinSorterPro-EC.jsx"), out);
console.log("wrote effectcraft/BinSorterPro-EC.jsx (" + out.length + " chars)");
