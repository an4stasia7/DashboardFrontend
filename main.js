"use strict";

const { app, BrowserWindow, screen, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const url = require("url");
const { spawn } = require("child_process");

/** Корень приложения: HTML, css/, js/ */
const STATIC_ROOT = __dirname;
const APP_ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

function createStaticServer(root) {
  const rootResolved = path.resolve(root);

  return http.createServer(function (req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.end();
      return;
    }

    let pathname = url.parse(req.url).pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch (e) {
      res.statusCode = 400;
      res.end();
      return;
    }

    let relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    relative = path.normalize(relative);
    const filePath = path.resolve(rootResolved, relative);
    if (path.relative(rootResolved, filePath).startsWith("..")) {
      res.statusCode = 403;
      res.end();
      return;
    }

    fs.readFile(filePath, function (err, data) {
      if (err) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", getMime(filePath));
      res.setHeader("Cache-Control", "no-cache");
      res.end(data);
    });
  });
}

let staticServer = null;
let staticPort = null;
let updatePromise = null;

/**
 * Стабильный порт нужен, чтобы origin (http://127.0.0.1:PORT) не менялся между запусками —
 * иначе localStorage для «Запомнить меня» каждый раз пустой.
 * Переопределение: переменная окружения DASHBOARD_STATIC_PORT.
 */
function parsePreferredPort() {
  var n = parseInt(process.env.DASHBOARD_STATIC_PORT || "48947", 10);
  if (!n || n < 1 || n > 65535) return 48947;
  return n;
}

function bindStaticServer(portToUse, onListening) {
  if (staticServer) {
    try {
      staticServer.close();
    } catch (e) {
      /* ignore */
    }
    staticServer = null;
  }
  staticServer = createStaticServer(STATIC_ROOT);
  staticServer.once("error", function (err) {
    if (err.code === "EADDRINUSE" && portToUse !== 0) {
      try {
        staticServer.close();
      } catch (e) {
        /* ignore */
      }
      staticServer = null;
      bindStaticServer(0, onListening);
    }
  });
  staticServer.listen(portToUse, "127.0.0.1", function () {
    staticPort = staticServer.address().port;
    onListening();
  });
}

function getLoadUrl() {
  return "http://127.0.0.1:" + staticPort + "/index.html";
}

function getCliCommand(baseName) {
  return process.platform === "win32" ? baseName + ".cmd" : baseName;
}

function runCommand(command, args, options) {
  const opts = Object.assign(
    {
      cwd: APP_ROOT,
      windowsHide: true,
      shell: false,
    },
    options || {}
  );

  return new Promise(function (resolve, reject) {
    const child = spawn(command, args, opts);
    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", function (chunk) {
        stdout += String(chunk);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", function (chunk) {
        stderr += String(chunk);
      });
    }

    child.once("error", function (err) {
      reject(err);
    });

    child.once("close", function (code) {
      if (code === 0) {
        resolve({ stdout: stdout, stderr: stderr });
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            stdout.trim() ||
            (command + " exited with code " + String(code))
        )
      );
    });
  });
}

async function getRemoteDefaultBranch() {
  try {
    const result = await runCommand("git", [
      "symbolic-ref",
      "--short",
      "refs/remotes/origin/HEAD",
    ]);
    const ref = String(result.stdout || "").trim();
    const match = ref.match(/^origin\/(.+)$/);
    return match ? match[1] : "master";
  } catch (err) {
    return "master";
  }
}

async function ensureGitRepoReady() {
  const gitDir = path.join(APP_ROOT, ".git");
  if (!fs.existsSync(gitDir)) {
    throw new Error(
      "Автообновление доступно только для приложения, запущенного из git-репозитория."
    );
  }

  const status = await runCommand("git", ["status", "--porcelain"]);
  if (String(status.stdout || "").trim()) {
    throw new Error(
      "Автообновление остановлено: в проекте есть локальные изменения. Сначала закоммитьте или уберите их."
    );
  }
}

async function ensureBranchCheckedOut(branchName) {
  const current = await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const currentBranch = String(current.stdout || "").trim();
  if (currentBranch === branchName) return;

  try {
    await runCommand("git", ["checkout", branchName]);
  } catch (err) {
    await runCommand("git", ["checkout", "-t", "origin/" + branchName]);
  }
}

async function performSelfUpdate() {
  if (updatePromise) return updatePromise;

  updatePromise = (async function () {
    await ensureGitRepoReady();

    const defaultBranch = await getRemoteDefaultBranch();
    await runCommand("git", ["fetch", "origin", defaultBranch]);
    await ensureBranchCheckedOut(defaultBranch);
    await runCommand("git", ["pull", "--ff-only", "origin", defaultBranch]);
    await runCommand(getCliCommand("npm"), ["install"]);

    const result = {
      ok: true,
      branch: defaultBranch,
      restarting: true,
    };

    setTimeout(function () {
      app.relaunch();
      app.exit(0);
    }, 800);

    return result;
  })().finally(function () {
    updatePromise = null;
  });

  return updatePromise;
}

function createWindow() {
  const defaultWidth = 1280;
  const defaultHeight = 800;
  const win = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", function () {
    win.show();
  });

  win.on("will-resize", function (event) {
    if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
    event.preventDefault();
  });

  win.on("unmaximize", function () {
    const display = screen.getDisplayMatching(win.getBounds());
    const workArea = display && display.workArea ? display.workArea : null;
    const nextWidth = workArea ? Math.min(defaultWidth, workArea.width) : defaultWidth;
    const nextHeight = workArea ? Math.min(defaultHeight, workArea.height) : defaultHeight;
    win.setSize(nextWidth, nextHeight);
    win.center();
  });

  win.loadURL(getLoadUrl());
}

app.whenReady().then(function () {
  bindStaticServer(parsePreferredPort(), function () {
    createWindow();
  });
});

ipcMain.handle("app:get-version", function () {
  return app.getVersion();
});

ipcMain.handle("app:open-external", async function (_event, targetUrl) {
  if (!targetUrl) return false;
  await shell.openExternal(String(targetUrl));
  return true;
});

ipcMain.handle("app:run-self-update", async function () {
  try {
    return await performSelfUpdate();
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
    };
  }
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", function () {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
    staticPort = null;
  }
});
