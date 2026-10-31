// AutoSortBins Pro - the way into DaVinci Resolve (Node: the plugin window, the dev server and the tests use it).
// Resolve is scripted through its own fuscript.exe: this module starts dr/asb_server.lua once, keeps it running and
// passes it one command at a time through two files in a private temp folder. Settings and undo history are kept here.
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { spawn } = require("child_process");

const FUSCRIPT = process.env.DR_FUSCRIPT || "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fuscript.exe";
const SERVER = path.join(__dirname, "..", "dr", "asb_server.lua");
const STORE = path.join(process.env.APPDATA || os.homedir(), "AutoSortBinsPro");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let dir = null, child = null, chain = Promise.resolve(), seq = 0, devMode = false;

// a value as Lua source; strings byte by byte, so any text survives
function toLua(v) {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "number") return isFinite(v) ? String(v) : "nil";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") {
    let s = "";
    for (const b of Buffer.from(v, "utf8")) s += b >= 32 && b < 127 && b !== 34 && b !== 92 ? String.fromCharCode(b) : "\\" + String(b).padStart(3, "0");
    return '"' + s + '"';
  }
  if (Array.isArray(v)) return "{" + v.map(toLua).join(",") + "}";
  return "{" + Object.keys(v).map(k => "[" + toLua(k) + "]=" + toLua(v[k])).join(",") + "}";
}

// Lua opens files by their ANSI name, so the folder for the two files must have a plain ASCII path
function privateDir() {
  const bases = [os.tmpdir(), process.env.PROGRAMDATA, "C:\\Windows\\Temp"].filter(b => b && /^[\x20-\x7e]+$/.test(b));
  for (const b of bases) {
    try {
      // folders left by earlier sessions: the Lua side quits after two idle minutes, so five minutes old means dead
      for (const n of fs.readdirSync(b)) {
        const old = path.join(b, n);
        if (/^asb-dr-/.test(n) && Date.now() - fs.statSync(old).mtimeMs > 300000) fs.rmSync(old, { recursive: true, force: true });
      }
    } catch (e) {}
    try { return fs.mkdtempSync(path.join(b, "asb-dr-")); } catch (e) {}
  }
  throw new Error("No temp folder with a plain ASCII path to talk to Resolve through");
}

function start() {
  if (child) return;
  if (!fs.existsSync(FUSCRIPT)) throw new Error("fuscript.exe not found (" + FUSCRIPT + "). Set DR_FUSCRIPT to its path.");
  dir = privateDir();
  const mine = child = spawn(FUSCRIPT, ["-l", "lua", SERVER], {
    env: Object.assign({}, process.env, { ASB_DR_DIR: dir, ASB_DR_DEV: devMode ? "1" : "" }), windowsHide: true, stdio: "ignore"
  });
  const folder = dir;
  mine.on("error", () => { if (child === mine) child = null; });
  mine.on("exit", () => {
    if (child === mine) child = null;
    try { fs.rmSync(folder, { recursive: true, force: true }); } catch (e) {}
  });
}

function store(name) { fs.mkdirSync(STORE, { recursive: true }); return path.join(STORE, name); }
function readJson(name) { try { return JSON.parse(fs.readFileSync(store(name), "utf8")); } catch (e) { return null; } }
// answered here, without Resolve
const LOCAL = {
  settingsLoad: () => readJson("settings_dr.json"),
  settingsSave: a => { fs.writeFileSync(store("settings_dr.json"), JSON.stringify(a.settings)); return true; },
  historyLoad: a => (readJson("history_dr.json") || {})[a.key] || [],
  historySave: a => {
    const h = readJson("history_dr.json") || {};
    if (a.records.length) h[a.key] = a.records; else delete h[a.key];
    const keys = Object.keys(h).sort((x, y) => h[y][h[y].length - 1].t - h[x][h[x].length - 1].t);
    keys.slice(30).forEach(k => { delete h[k]; });           // the 30 most recently sorted projects are kept
    fs.writeFileSync(store("history_dr.json"), JSON.stringify(h));
    return true;
  }
};

async function raw(fn, args, timeout) {
  if (LOCAL[fn]) return LOCAL[fn](args);
  start();
  const id = process.pid + "-" + (++seq), cmd = path.join(dir, "command.lua"), res = path.join(dir, "result.json");
  try { fs.rmSync(res, { force: true }); } catch (e) {}
  fs.writeFileSync(cmd + ".tmp", "return " + toLua({ id, fn, args }), "latin1");
  fs.renameSync(cmd + ".tmp", cmd);
  const end = Date.now() + (timeout || 60000);
  while (Date.now() < end) {
    let r = null;
    try { r = JSON.parse(fs.readFileSync(res, "utf8")); } catch (e) {}
    if (r && r.id === id) {
      try { fs.rmSync(res, { force: true }); } catch (e) {}
      if (!r.ok) throw new Error(r.error || "Resolve error");
      return r.data;
    }
    if (!child) throw new Error("Lost the link to DaVinci Resolve. Is it running?");
    await sleep(20);
  }
  throw new Error("DaVinci Resolve did not answer");
}

// one call at a time, in order; resolves to the data, rejects with the error
function call(fn, args, timeout) {
  const run = () => raw(fn, args || {}, timeout);
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// lets the Lua side finish: it also leaves by itself two minutes after the last command
function stop() {
  if (!child || !dir) return;
  try { fs.writeFileSync(path.join(dir, "command.lua"), "return " + toLua({ id: "quit", fn: "quit" }), "latin1"); } catch (e) {}
}
process.on("exit", stop);

module.exports = { call, stop, toLua, dev(on) { devMode = !!on; return module.exports; } };
