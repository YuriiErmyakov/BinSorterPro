// A stand-in for host.jsx: a small Premiere-like project kept in memory, so the panel can be clicked through
// with no Adobe application running.   node dev/server.js 4637 ppro mock
"use strict";

let seq = 100;
const nid = () => "m" + (++seq);
const state = { bins: [], items: [], settings: null, history: {}, adds: 0 };

function bin(name, parent) { const b = { id: nid(), name, parent: parent || null, virtual: false }; state.bins.push(b); return b.id; }
function item(name, binId, extra) {
  state.items.push(Object.assign({ id: nid(), name, bin: binId || null, seq: false, path: "D:\\media\\" + name, mt: "Movie", dur: 12, label: 0 }, extra || {}));
  state.adds++;
}
(function build() {
  const day = bin("Day 1", bin("Footage")), snd = bin("Sounds"), vid = bin("Video");
  item("A001_C001.mov"); item("logo.png", null, { mt: "Still Image", dur: 5 }); item("whoosh_02.wav", null, { mt: "Audio", dur: 1 });
  item("Main Edit", null, { seq: true, path: "", mt: "" }); item("Titles", null, { seq: true, path: "", mt: "" });
  item("A002_C004.mov", day); item("photo.jpg", day, { mt: "Still Image" });
  item("Summer Song.mp3", snd, { mt: "Audio", dur: 180 }); item("VO_take3.wav", snd, { mt: "Audio", dur: 40 });
  item("A003_C001.mov", vid);
})();
const nested = () => state.items.filter(i => i.name === "Titles").map(i => i.id);

function pathOf(id) { const b = state.bins.find(x => x.id === id); return b ? pathOf(b.parent).concat([b.name]) : []; }
function binAt(path, made) {
  let parent = null;
  for (let i = 0; i < path.length; i++) {
    let b = state.bins.find(x => x.parent === parent && x.name.toLowerCase() === path[i].toLowerCase());
    if (!b) { if (!made) return undefined; b = state.bins[state.bins.push({ id: nid(), name: path[i], parent, virtual: false }) - 1]; made.push(path.slice(0, i + 1)); }
    parent = b.id;
  }
  return parent;
}
function empty(id) { return !state.items.some(i => i.bin === id) && state.bins.filter(b => b.parent === id).every(b => empty(b.id)); }
function drop(id) { state.bins.filter(b => b.parent === id).forEach(b => drop(b.id)); state.bins = state.bins.filter(b => b.id !== id); }

const API = {
  info: () => ({ project: "Mock.prproj", path: "D:\\mock\\Mock.prproj", doc: "mock", adds: state.adds }),
  snapBegin: () => ({ doc: "mock", project: "Mock.prproj", path: "D:\\mock\\Mock.prproj", bins: state.bins.map(b => Object.assign({}, b)), total: state.items.length, seqs: 2 }),
  snapChunk: a => state.items.slice(a.from, a.from + a.n).map(i => Object.assign({}, i)),
  nested: a => a.from === 0 ? nested() : [],
  sig: () => ({ sig: state.items.map(i => i.id + ">" + i.bin).join(";") + "|" + state.bins.length, ms: 1 }),
  ensureBins: a => { const created = []; return { bins: a.paths.map(p => ({ path: p, id: binAt(p, created) })), created }; },
  move: a => {
    const r = { moved: 0, missing: [], failed: [] };
    a.moves.forEach(m => {
      const it = state.items.find(i => i.id === m.id);
      if (!it || (m.bin && !state.bins.some(b => b.id === m.bin))) return r.missing.push(m.id);
      it.bin = m.bin || null; r.moved++;
      if (typeof m.label === "number" && m.label >= 0) it.label = m.label;
    });
    return r;
  },
  setLabels: a => a.items.length,
  deleteBins: a => {
    const ids = a.paths ? a.paths.slice().sort((x, y) => y.length - x.length).map(p => binAt(p, null)).filter(Boolean) : a.ids, r = { deleted: 0, kept: 0 };
    ids.forEach(id => { if (state.bins.some(b => b.id === id) && empty(id)) { drop(id); r.deleted++; } else r.kept++; });
    return r;
  },
  settingsLoad: () => state.settings,
  settingsSave: a => { state.settings = a.settings; return true; },
  historyLoad: a => state.history[a.key] || [],
  historySave: a => { state.history[a.key] = a.records; return true; },
  // test helpers, not part of the real host
  _import: a => { item(a.name, null, a.extra); return true; },
  _tree: () => state.items.map(i => (pathOf(i.bin).join("/") || "(root)") + " : " + i.name).sort().concat(["bins: " + state.bins.map(b => pathOf(b.id).join("/")).sort().join(", ")])
};

async function hostRaw(fn, args) {
  try {
    if (!API[fn]) throw new Error("Unknown call " + fn);
    return { ok: true, data: JSON.parse(JSON.stringify(API[fn](args || {}) ?? null)) };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
module.exports = { hostRaw };
