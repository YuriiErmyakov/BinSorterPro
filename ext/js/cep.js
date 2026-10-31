// BinSorter Pro - the way into the host application: evalScript inside the panel, dev/server.js in a plain browser.
(function () {
"use strict";

var CEP = window.__adobe_cep__, IS_CEP = !!CEP, nodePath = null, nodeFs = null, extDir = "", APP = window.ASB_APP || "ppro";
// the DaVinci Resolve plugin window is Electron with Node switched on, and has no CEP
var link = null, IS_DR = !IS_CEP && typeof process === "object" && !!(process.versions && process.versions.electron);
// Unreal Editor: the page is served by the plugin's Python backend (asb_ue.py) as index.html?app=ue&k=<key>
var UE_KEY = !IS_CEP && !IS_DR ? (/[?&]app=ue&k=([0-9a-f]+)/.exec(location.search) || [])[1] : null, IS_UE = !!UE_KEY;
if (IS_UE) APP = "ue";
if (IS_DR) {
  APP = "dr";
  link = require("./js/dr_link.js");
  window.addEventListener("beforeunload", function () { link.stop(); });
}
if (IS_CEP) {
  nodePath = require("path"); nodeFs = require("fs");
  extDir = decodeURIComponent(nodePath.dirname(window.location.pathname)).replace(/^\/([A-Za-z]:)/, "$1");
  try { APP = JSON.parse(CEP.getHostEnvironment()).appId === "AEFT" ? "ae" : "ppro"; } catch (e) {}
}
var HOST_FILE = APP === "ae" ? "host_ae.jsx" : "host.jsx";

function lit(text) {
  return JSON.stringify(String(text)).replace(/[^\x00-\x7e]/g, function (c) { return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4); });
}
function evalScript(code) { return new Promise(function (res) { CEP.evalScript(code, res); }); }

var chain = Promise.resolve();
function raw(fn, args) {
  if (IS_DR) {
    return link.call(fn, args || {}).then(function (data) { return { ok: true, data: data }; },
      function (e) { return { ok: false, error: String(e && e.message || e) }; });
  }
  if (IS_UE) {
    return fetch("/api/host", { method: "POST", headers: { "X-ASB-Key": UE_KEY }, body: JSON.stringify({ fn: fn, args: args || {} }) })
      .then(function (r) { return r.json(); });
  }
  if (!IS_CEP) {
    return fetch("/host", { method: "POST", body: JSON.stringify({ fn: fn, args: args || {} }) }).then(function (r) { return r.json(); });
  }
  // loads the host script first if the application has not done it for us
  var code = "(typeof ASB==='undefined'?'__NOASB__':ASB.run(" + lit(fn) + "," + lit(JSON.stringify(args || {})) + "))";
  return evalScript(code).then(function (out) {
    if (out !== "__NOASB__") return out;
    return evalScript("$.evalFile(" + lit(nodePath.join(extDir, HOST_FILE)) + "); 'ok'").then(function () { return evalScript(code); });
  }).then(function (out) {
    try { return JSON.parse(out); } catch (e) { return { ok: false, error: "Host: " + out }; }
  });
}
// one call at a time, in order
function call(fn, args) {
  if (IS_DR) return link.call(fn, args || {});               // dr_link.js keeps its own queue
  var run = function () {
    return raw(fn, args).then(function (r) { if (!r.ok) throw new Error(r.error); return r.data; });
  };
  var p = chain.then(run, run);
  chain = p.catch(function () {});
  return p;
}

// save a text file: a save dialog in the panel, a download in the browser
function saveText(name, text) {
  if (IS_DR) return require("electron").ipcRenderer.invoke("asb:saveText", name, text);
  if (IS_UE) return call("saveText", { name: name, text: text });   // the editor's web view has no file dialogs
  if (IS_CEP && window.cep && window.cep.fs) {
    var r = window.cep.fs.showSaveDialogEx("Export report", "", ["txt"], name);
    if (r.err || !r.data) return Promise.resolve(null);
    var file = String(r.data);
    if (!/\.txt$/i.test(file)) file += ".txt";
    nodeFs.writeFileSync(file, String.fromCharCode(0xFEFF) + text, "utf8");
    return Promise.resolve(file);
  }
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  return Promise.resolve(name);
}

window.ASBHost = { IS_CEP: IS_CEP, APP: APP, call: call, saveText: saveText };
})();
