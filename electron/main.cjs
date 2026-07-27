// Electron shell: launches the Next server and shows it in a native window.
// - From the repo (`npm run app`): spawns `next start`.
// - Packaged (.app): runs the bundled Next standalone server.
const { app, BrowserWindow, shell } = require("electron");
const { spawn, fork } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");

const PORT = Number(process.env.JARVIS_PORT || 3000);
const URL = `http://127.0.0.1:${PORT}`;
let serverProc = null;
let win = null;

function ping(cb) {
  const req = http.get(URL, () => { cb(true); req.destroy(); });
  req.on("error", () => cb(false));
  req.setTimeout(1000, () => { req.destroy(); cb(false); });
}
function waitUp(cb, tries = 120) {
  ping((up) => (up ? cb() : tries > 0 ? setTimeout(() => waitUp(cb, tries - 1), 500) : cb()));
}

function startServer() {
  return new Promise((resolve) => {
    ping((up) => {
      if (up) return resolve(); // reuse an already-running server (e.g. `npm run serve`)
      const env = {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
      };
      if (app.isPackaged) {
        const serverJs = path.join(process.resourcesPath, "app", "server.js");
        serverProc = fork(serverJs, [], {
          cwd: path.join(process.resourcesPath, "app"),
          env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: "ignore",
        });
      } else {
        const nextBin = path.join(__dirname, "..", "node_modules", ".bin", "next");
        serverProc = spawn(nextBin, ["start", "-p", String(PORT)], {
          cwd: path.join(__dirname, ".."),
          env,
          stdio: "ignore",
        });
      }
      waitUp(resolve);
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1460,
    height: 980,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#05080f",
    titleBarStyle: "hiddenInset",
    title: "Jarvis",
    webPreferences: { contextIsolation: true },
  });
  win.loadURL(URL);
  // open external links in the real browser, not inside the app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.setName("Jarvis");
app.whenReady().then(async () => {
  try {
    const png = path.join(__dirname, "icon.png");
    if (app.dock && fs.existsSync(png)) app.dock.setIcon(png);
  } catch {
    /* ignore */
  }
  await startServer();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("quit", () => {
  if (serverProc) {
    try {
      serverProc.kill();
    } catch {
      /* ignore */
    }
  }
});
