// Dev harness: serves the panel in a normal browser and wires it to the live Premiere Pro or After Effects
// through the Claude MCP bridge, so the whole flow can be tested without reopening the CEP panel.
//   node dev/server.js [port] [ppro|ae|dr] [mock]
// Open with ?still to stop the page polling the app (the bridge serves one client at a time).
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const bridge = require("./bridge.js");

const PORT = Number(process.argv[2] || process.env.PORT || 4635);
const APP = ["ppro", "ae", "dr"].includes(process.argv[3]) ? process.argv[3] : bridge.appName();
bridge.use(APP);
const MOCK = process.argv[4] === "mock";            // no Adobe application: dev/mock.js answers instead
const EXT = bridge.EXT, hostRaw = MOCK ? require("./mock.js").hostRaw : bridge.hostRaw;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

function body(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on("data", d => parts.push(d)); req.on("end", () => resolve(Buffer.concat(parts).toString("utf8"))); req.on("error", reject);
  });
}
function send(res, code, type, data) { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(data); }

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/host") {
      const q = JSON.parse(await body(req));
      return send(res, 200, MIME[".json"], JSON.stringify(await hostRaw(q.fn, q.args)));
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const file = path.join(EXT, rel);
    if (!file.startsWith(EXT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "text/plain", "not found");
    let data = fs.readFileSync(file);
    // the panel learns its host from CEP; here we tell it
    if (rel === "/index.html") data = data.toString("utf8").replace("<script src=\"js/core.js\">", "<script>window.ASB_APP = \"" + APP + "\";</script>\n<script src=\"js/core.js\">");
    send(res, 200, MIME[path.extname(file).toLowerCase()] || "application/octet-stream", data);
  } catch (e) {
    send(res, 200, MIME[".json"], JSON.stringify({ ok: false, error: String(e && e.message || e) }));
  }
}).listen(PORT, "127.0.0.1", () => console.log("BinSorter Pro dev panel (" + APP + (MOCK ? ", mock" : "") + "): http://localhost:" + PORT));
