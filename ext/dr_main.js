// BinSorter Pro - Electron main process of the DaVinci Resolve Workflow Integration plugin.
// The window shows the same panel as in Premiere Pro and After Effects (index.html + js/main.js), with Node
// switched on so that js/dr_link.js can start Resolve's fuscript and talk to the Media Pool.
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const STATE = path.join(process.env.APPDATA || app.getPath("userData"), "AutoSortBinsPro", "dr-window.json");
let win = null;

function loadBounds() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) { return null; }
}
function saveBounds() {
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(win.getBounds()));
  } catch (e) {}
}

function createWindow() {
  const b = loadBounds() || {};
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width || 320, height: b.height || 640, minWidth: 250, minHeight: 260,
    title: "BinSorter Pro", backgroundColor: "#060B17", alwaysOnTop: true, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false }
  });
  win.setMenu(null);
  win.setAlwaysOnTop(true, "floating");
  win.on("close", saveBounds);
  win.on("closed", () => { win = null; app.quit(); });
  win.loadFile(path.join(__dirname, "index.html"));
}

// Export report: a save dialog, then the file
ipcMain.handle("asb:saveText", async (e, name, text) => {
  const r = await dialog.showSaveDialog(win, { title: "Export report", defaultPath: name, filters: [{ name: "Text", extensions: ["txt"] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, String.fromCharCode(0xFEFF) + text, "utf8");
  return r.filePath;
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
