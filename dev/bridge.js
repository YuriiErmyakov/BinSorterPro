// Runs host calls in the live Premiere Pro or After Effects through the Claude MCP bridge files, and in
// DaVinci Resolve through the panel's own link (ext/js/dr_link.js, in test mode). Dev server and tests share this.
// The app comes from ASB_APP=ppro|ae|dr or from use("ae").
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const EXT = path.join(__dirname, "..", "ext");
const APPS = {
  ppro: { name: "Premiere Pro", host: "host.jsx", dir: process.env.PR_MCP_BRIDGE_DIR || "C:\\Все файлы\\Premiere Pro MCP\\.pr-mcp-bridge" },
  ae:   { name: "After Effects", host: "host_ae.jsx", dir: process.env.AE_MCP_BRIDGE_DIR || "C:\\Все файлы\\After Effects MCP\\.ae-mcp-bridge" },
  dr:   { name: "DaVinci Resolve" }
};
let link = null;
function drLink() { return link || (link = require(path.join(EXT, "js", "dr_link.js")).dev(true)); }
let app = APPS[process.env.ASB_APP] ? process.env.ASB_APP : "ppro";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let chain = Promise.resolve(), hostStamp = 0;

function use(name) { if (!APPS[name]) throw new Error("Unknown app " + name); app = name; hostStamp = 0; return module.exports; }

async function prEval(code, timeout) {
  const A = APPS[app], id = crypto.randomUUID(), cmd = path.join(A.dir, "command.json"), res = path.join(A.dir, "result.json");
  try { fs.rmSync(res, { force: true }); } catch (e) {}
  fs.writeFileSync(cmd + ".tmp", JSON.stringify({ commandId: id, action: "runJsx", args: { code } }), "utf8");
  fs.renameSync(cmd + ".tmp", cmd);
  const end = Date.now() + (timeout || 120000);
  while (Date.now() < end) {
    try {
      const r = JSON.parse(fs.readFileSync(res, "utf8"));
      if (r.commandId === id) {
        try { fs.rmSync(res, { force: true }); } catch (e) {}
        if (!r.ok) throw new Error(r.error || A.name + " error");
        return r.data.result;
      }
    } catch (e) { if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e; }
    await sleep(40);
  }
  throw new Error(A.name + " did not answer (is the Claude MCP bridge panel running?)");
}
function lit(s) { return JSON.stringify(String(s)).replace(/[\u007f-\uffff]/g, c => "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4)); }

// raw {ok, data|error} answer of ASB.run; reloads the host file when it changed
function hostRaw(fn, args) {
  if (app === "dr") return drLink().call(fn, args || {}).then(data => ({ ok: true, data }), e => ({ ok: false, error: String(e && e.message || e) }));
  const run = async () => {
    const file = path.join(EXT, APPS[app].host), stamp = fs.statSync(file).mtimeMs;
    if (stamp !== hostStamp) { await prEval("$.evalFile(" + lit(file) + "); 'loaded'"); hostStamp = stamp; }
    return JSON.parse(await prEval("ASB.run(" + lit(fn) + "," + lit(JSON.stringify(args || {})) + ")"));
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}
async function host(fn, args) {
  const r = await hostRaw(fn, args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
// a piece of ExtendScript; for Resolve a piece of Lua (resolve and ASB_API are at hand, use return)
function evalJsx(code, timeout) {
  if (app === "dr") return drLink().call("eval", { code }, timeout);
  const p = chain.then(() => prEval(code, timeout), () => prEval(code, timeout));
  chain = p.catch(() => {});
  return p;
}

module.exports = { EXT, use, host, hostRaw, evalJsx, lit, appName: () => app };
