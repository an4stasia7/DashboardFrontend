"use strict";

const { app, BrowserWindow, screen, ipcMain, shell, Menu } = require("electron");
const path = require("path");

/** GPU: отключать только при ELECTRON_DISABLE_GPU=1 (RDP/VM). Раньше win32 всегда без GPU — чёрные полосы при resize. */
if (process.env.ELECTRON_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}

/** Win: реже чёрные полосы при resize — Chromium не откладывает отрисовку из‑за occlusion. */
if (process.platform === "win32") {
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

const http = require("http");
const fs = require("fs");
const os = require("os");
const url = require("url");
const { spawn, execFile } = require("child_process");
const { autoUpdater } = require("electron-updater");

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
let releaseCheckPromise = null;
let releaseInstallPromise = null;
let releaseUpdateState = {
  mode: "git",
  supported: false,
  packaged: false,
  portable: false,
  currentVersion: app.getVersion(),
  latestVersion: "",
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  progress: 0,
  error: "",
};

function isPortableBuild() {
  return !!(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR);
}

function getUpdateMode() {
  if (!app.isPackaged) return "git";
  return isPortableBuild() ? "portable" : "release";
}

function isReleaseUpdateSupported() {
  return getUpdateMode() === "release";
}

function getPortableUpdateError() {
  return "Автообновление недоступно для portable-сборки. Используйте установленную версию или скачайте новый релиз с GitHub.";
}

function getReleaseUpdateStateSnapshot() {
  return Object.assign({}, releaseUpdateState);
}

function broadcastReleaseUpdateState() {
  const snapshot = getReleaseUpdateStateSnapshot();
  BrowserWindow.getAllWindows().forEach(function (win) {
    if (!win || win.isDestroyed()) return;
    win.webContents.send("app:release-update-state", snapshot);
  });
}

function setReleaseUpdateState(patch) {
  releaseUpdateState = Object.assign({}, releaseUpdateState, {
    mode: getUpdateMode(),
    supported: isReleaseUpdateSupported(),
    packaged: app.isPackaged,
    portable: isPortableBuild(),
    currentVersion: app.getVersion(),
  }, patch || {});
  broadcastReleaseUpdateState();
  return getReleaseUpdateStateSnapshot();
}

function initializeReleaseUpdater() {
  setReleaseUpdateState({
    latestVersion: "",
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    progress: 0,
    error: "",
  });

  if (!isReleaseUpdateSupported()) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", function () {
    setReleaseUpdateState({
      checking: true,
      available: false,
      downloaded: false,
      downloading: false,
      progress: 0,
      error: "",
    });
  });

  autoUpdater.on("update-available", function (info) {
    setReleaseUpdateState({
      checking: false,
      available: true,
      downloading: false,
      downloaded: false,
      latestVersion: info && info.version ? String(info.version) : "",
      progress: 0,
      error: "",
    });
  });

  autoUpdater.on("update-not-available", function (info) {
    setReleaseUpdateState({
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      latestVersion: info && info.version ? String(info.version) : releaseUpdateState.latestVersion,
      progress: 0,
      error: "",
    });
  });

  autoUpdater.on("download-progress", function (progress) {
    const percent = progress && progress.percent != null ? Number(progress.percent) : 0;
    setReleaseUpdateState({
      checking: false,
      available: true,
      downloading: true,
      downloaded: false,
      progress: Math.max(0, Math.min(100, Math.round(isNaN(percent) ? 0 : percent))),
      error: "",
    });
  });

  autoUpdater.on("update-downloaded", function (info) {
    setReleaseUpdateState({
      checking: false,
      available: true,
      downloading: false,
      downloaded: true,
      latestVersion: info && info.version ? String(info.version) : releaseUpdateState.latestVersion,
      progress: 100,
      error: "",
    });
  });

  autoUpdater.on("error", function (err) {
    setReleaseUpdateState({
      checking: false,
      downloading: false,
      error: err && err.message ? err.message : String(err),
    });
  });
}

async function checkReleaseUpdates() {
  if (!isReleaseUpdateSupported()) {
    return setReleaseUpdateState({
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      progress: 0,
      error: getUpdateMode() === "portable" ? getPortableUpdateError() : "",
    });
  }

  if (releaseCheckPromise) return releaseCheckPromise;

  releaseCheckPromise = (async function () {
    const result = await autoUpdater.checkForUpdates();
    const info = result && result.updateInfo ? result.updateInfo : null;
    if (info && info.version) {
      setReleaseUpdateState({ latestVersion: String(info.version) });
    }
    return getReleaseUpdateStateSnapshot();
  })().finally(function () {
    releaseCheckPromise = null;
  });

  return releaseCheckPromise;
}

async function installReleaseUpdate() {
  if (!isReleaseUpdateSupported()) {
    throw new Error(
      getUpdateMode() === "portable"
        ? getPortableUpdateError()
        : "Release-обновление доступно только для собранного desktop-приложения."
    );
  }

  if (releaseInstallPromise) return releaseInstallPromise;

  releaseInstallPromise = (async function () {
    if (!releaseUpdateState.available && !releaseUpdateState.downloaded) {
      await checkReleaseUpdates();
    }

    if (!releaseUpdateState.available && !releaseUpdateState.downloaded) {
      throw new Error("Новая версия не найдена.");
    }

    if (!releaseUpdateState.downloaded) {
      setReleaseUpdateState({
        downloading: true,
        progress: 0,
        error: "",
      });
      await autoUpdater.downloadUpdate();
    }

    setTimeout(function () {
      autoUpdater.quitAndInstall(false, true);
    }, 1000);

    return {
      ok: true,
      restarting: true,
      state: getReleaseUpdateStateSnapshot(),
    };
  })().finally(function () {
    releaseInstallPromise = null;
  });

  return releaseInstallPromise;
}

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
  const display = screen.getPrimaryDisplay();
  const workArea = display && display.workArea ? display.workArea : { width: 1280, height: 800 };
  const minWidth = 1024;
  const minHeight = 680;
  const defaultWidth = Math.max(minWidth, Math.min(1280, workArea.width));
  const defaultHeight = Math.max(minHeight, Math.min(800, workArea.height));
  const pageBackground = "#f4f7fb";
  const loginBackground = "#061936";

  function syncWindowBackgroundFromUrl(targetWin) {
    if (!targetWin || targetWin.isDestroyed() || typeof targetWin.setBackgroundColor !== "function") {
      return;
    }
    var pageUrl = "";
    try {
      pageUrl = targetWin.webContents.getURL();
    } catch (e) {
      pageUrl = "";
    }
    var bg = pageUrl.indexOf("login.html") !== -1 ? loginBackground : pageBackground;
    targetWin.setBackgroundColor(bg);
  }

  const win = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth: minWidth,
    minHeight: minHeight,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: pageBackground,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.once("ready-to-show", function () {
    if (typeof win.setBackgroundColor === "function") {
      win.setBackgroundColor(pageBackground);
    }
    win.show();
  });

  win.webContents.on("did-finish-load", function () {
    syncWindowBackgroundFromUrl(win);
    win.webContents.send("app:release-update-state", getReleaseUpdateStateSnapshot());
  });

  win.webContents.on("did-navigate-in-page", function () {
    syncWindowBackgroundFromUrl(win);
  });

  win.webContents.on("did-navigate", function () {
    syncWindowBackgroundFromUrl(win);
  });

  // Menu.setApplicationMenu(null) снимает стандартные accelerator'ы (Ctrl/Cmd+R).
  // Возвращаем reload без видимого меню.
  win.webContents.on("before-input-event", function (event, input) {
    if (input.type !== "keyDown") return;
    if (String(input.key || "").toLowerCase() !== "r") return;
    if (!(input.control || input.meta) || input.alt) return;
    event.preventDefault();
    if (input.shift) {
      win.webContents.reloadIgnoringCache();
    } else {
      win.webContents.reload();
    }
  });

  win.on("will-resize", function () {
    if (win.isDestroyed()) return;
    syncWindowBackgroundFromUrl(win);
    try {
      win.webContents.send("app:window-will-resize");
    } catch (e) {
      /* ignore */
    }
  });

  win.on("resize", function () {
    if (win.isDestroyed()) return;
    syncWindowBackgroundFromUrl(win);
    win.webContents.send("app:window-resized");
  });

  win.loadURL(getLoadUrl());
}

app.whenReady().then(function () {
  Menu.setApplicationMenu(null);
  initializeReleaseUpdater();
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

/** Учётные данные входа в дашборд. Только в памяти процесса, на диск не пишутся. */
var onecSessionLogin = null;

function onecClientPath() {
  var roots = ["C:\\Program Files (x86)\\1cv8", "C:\\Program Files\\1cv8"];
  var found = [];
  for (var i = 0; i < roots.length; i++) {
    if (!fs.existsSync(roots[i])) continue;
    var versions;
    try {
      versions = fs.readdirSync(roots[i]);
    } catch (err) {
      continue;
    }
    for (var j = 0; j < versions.length; j++) {
      var exe = path.join(roots[i], versions[j], "bin", "1cv8c.exe");
      if (fs.existsSync(exe)) found.push(exe);
    }
  }
  found.sort();
  return found.length ? found[found.length - 1] : "";
}

function quoteOnecValue(value) {
  return '"' + String(value == null ? "" : value).replace(/"/g, "") + '"';
}

function parseE1cUrl(target) {
  var match = String(target || "").match(/^e1c:\/\/server\/([^/]+)\/([^#]+)#(.+)$/i);
  if (!match) return null;
  return { server: match[1], base: match[2], nav: match[3] };
}

function onecUserFromCommandLine(commandLine) {
  var text = String(commandLine || "");
  var quoted = text.match(/\/N\s*"([^"]*)"/i);
  if (quoted) return quoted[1].trim();
  var plain = text.match(/\/N\s*(\S+)/i);
  return plain ? plain[1].trim() : "";
}

function commandOpensInfobase(commandLine, server, base) {
  var text = String(commandLine || "").toLowerCase().replace(/\//g, "\\").replace(/"/g, "");
  var srv = String(server || "").toLowerCase();
  var ib = String(base || "").toLowerCase();
  if (!srv || !ib) return false;
  if (text.indexOf(srv + "\\" + ib) !== -1) return true;
  // Запуск из стартера 1С: /IBConnectionString"Srvr=""srv1"";Ref=""erp_pm"";"
  return text.indexOf("srvr=" + srv + ";") !== -1 && text.indexOf("ref=" + ib + ";") !== -1;
}

function sameOnecAccount(left, right) {
  return String(left || "").trim().toLocaleLowerCase("ru-RU") === String(right || "").trim().toLocaleLowerCase("ru-RU");
}

function listOnecProcesses() {
  var script = [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$items = @(Get-CimInstance Win32_Process -Filter \"Name = '1cv8c.exe' OR Name = '1cv8.exe'\")",
    "if (-not $items.Count) { '[]'; exit 0 }",
    "$items | ForEach-Object { $o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner -ErrorAction SilentlyContinue; [PSCustomObject]@{ ProcessId = $_.ProcessId; CommandLine = [string]$_.CommandLine; Owner = [string]$o.User } } | ConvertTo-Json -Compress",
  ].join("; ");
  return new Promise(function (resolve) {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 12000, maxBuffer: 4 * 1024 * 1024 },
      function (err, stdout) {
        if (err) {
          resolve([]);
          return;
        }
        var text = String(stdout || "").trim();
        if (!text) {
          resolve([]);
          return;
        }
        try {
          var parsed = JSON.parse(text);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (parseErr) {
          resolve([]);
        }
      }
    );
  });
}

function findOpenOnecSession(parsed, username) {
  return listOnecProcesses().then(function (processes) {
    var found = null;
    for (var i = 0; i < processes.length; i++) {
      var row = processes[i] || {};
      var commandLine = row.CommandLine || "";
      if (!commandOpensInfobase(commandLine, parsed.server, parsed.base)) continue;
      var onecUser = onecUserFromCommandLine(commandLine);
      if (onecUser) {
        if (!username || !sameOnecAccount(onecUser, username)) continue;
      } else if (!sameOnecAccount(row.Owner, os.userInfo().username)) {
        // Без /N вошли через окно 1С или по Windows: своим считаем клиент этого же пользователя Windows.
        continue;
      }
      var pid = Number(row.ProcessId);
      if (!pid) continue;
      found = { pid: pid };
    }
    return found;
  });
}

function reportFilterParts(context, encode) {
  var ctx = context || {};
  var parts = [];
  function put(name, value) {
    var text = value != null ? String(value).trim() : "";
    if (!text) return;
    parts.push(name + "=" + (encode ? encodeURIComponent(text) : text));
  }
  put("Начало", ctx.start);
  put("Конец", ctx.end);
  put("ДатаОтчета", ctx.asof);
  put("ПодразделениеСписок", ctx.departments);
  put("ОбщийСтандартныйПериод", ctx.start && ctx.end ? ctx.start + "-" + ctx.end : "");
  return parts;
}

function reportAppLink(nav) {
  var link = String(nav || "");
  if (link.indexOf("828eac1f6b05524d11e977bbd6e9da00") !== -1) {
    return "e1cib/app/Отчет.ТД_ПланФактПродаж?КлючВарианта=ОсновнойТаблица&СформироватьПриОткрытии=Истина";
  }
  if (link.indexOf("82afac1f6b05524d11ea069f8cb9451f") !== -1) {
    return "e1cib/app/Отчет.ЗадолженностьКлиентовПоСрокам?КлючВарианта=ccb4e716-5242-49a1-b94b-e3779cbed01d&СформироватьПриОткрытии=Истина";
  }
  return link;
}

function reportNavWithContext(nav, context) {
  var link = reportAppLink(nav);
  if (link.indexOf("e1cib/data/Документ.") === 0 || link.indexOf("e1cib/data/Справочник.Соглашения") === 0) {
    return link;
  }
  var parts = reportFilterParts(context, true);
  if (!parts.length) return link;
  return link + (link.indexOf("?") >= 0 ? "&" : "?") + parts.join("&");
}

function focusOnecWindow(pid) {
  if (!pid) return;
  var script = [
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DashOnecWin { [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'",
    "$p = Get-Process -Id " + String(pid) + " -ErrorAction SilentlyContinue",
    "if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) { [DashOnecWin]::ShowWindow($p.MainWindowHandle, 9) | Out-Null; [DashOnecWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null }",
  ].join("; ");
  execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 8000 }, function () {});
}

function spawnOnec(exe, args) {
  // Путь 1cv8c.exe лежит в "Program Files". Если отдать его Node с
  // windowsVerbatimArguments, кавычки вокруг exe пропадают, 1С не видит
  // /N и /P и показывает окно входа. cmd.exe без пробела в пути собирает
  // командную строку в том виде, который понимает 1С: /N"имя" /P"пароль".
  var command = ['"' + exe + '"'].concat(args).join(" ");
  command = command.replace(/%/g, "%%");
  return new Promise(function (resolve) {
    var child;
    try {
      child = spawn(
        "C:\\Windows\\System32\\cmd.exe",
        ["/d", "/s", "/c", '"' + command + '"'],
        {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          windowsVerbatimArguments: true,
        }
      );
    } catch (err) {
      resolve({ ok: false, error: "Не удалось запустить 1С" });
      return;
    }
    child.once("error", function () {
      resolve({ ok: false, error: "Не удалось запустить 1С" });
    });
    child.once("spawn", function () {
      child.unref();
      resolve({ ok: true });
    });
  });
}

function openOnecReport(targetUrl, context) {
  var parsed = parseE1cUrl(targetUrl);
  if (!parsed) return Promise.resolve({ ok: false, error: "Некорректная ссылка 1С" });
  var exe = onecClientPath();
  if (!exe) return Promise.resolve({ ok: false, error: "Не найден установленный клиент 1С." });
  var username = onecSessionLogin && onecSessionLogin.username ? onecSessionLogin.username : "";
  var password = onecSessionLogin && onecSessionLogin.password ? onecSessionLogin.password : "";
  var nav = reportNavWithContext(parsed.nav, context);
  var connection = "/S" + quoteOnecValue(parsed.server + "\\" + parsed.base);
  var urlArg = "/URL" + quoteOnecValue(nav);
  if (!username || !password) {
    return Promise.resolve({
      ok: false,
      error: "Чтобы открыть 1С под вашей учётной записью, выйдите и войдите снова, введя пароль.",
    });
  }
  // /N и /P нужны и когда база уже открыта: без них второй процесс
  // останавливается на окне пароля и не передаёт ссылку в текущую сессию.
  var args = [
    "ENTERPRISE",
    connection,
    "/N" + quoteOnecValue(username),
    "/P" + quoteOnecValue(password),
    "/WA-",
    urlArg,
  ];
  var startup = reportFilterParts(context, false);
  if (startup.length) args.push("/C" + quoteOnecValue(startup.join(";")));
  return findOpenOnecSession(parsed, username).then(function (session) {
    return spawnOnec(exe, args).then(function (result) {
      if (result && result.ok && session) {
        setTimeout(function () {
          focusOnecWindow(session.pid);
        }, 400);
        return { ok: true, reused: true };
      }
      return result;
    });
  });
}

ipcMain.handle("app:remember-onec-login", function (_event, payload) {
  var username = payload && payload.username != null ? String(payload.username).trim() : "";
  var password = payload && payload.password != null ? String(payload.password) : "";
  if (!username || !password) return false;
  onecSessionLogin = { username: username, password: password };
  return true;
});

ipcMain.handle("app:open-onec-report", function (_event, payload) {
  var targetUrl = typeof payload === "string" ? payload : payload && payload.url;
  var username = payload && payload.username != null ? String(payload.username).trim() : "";
  var password = payload && payload.password != null ? String(payload.password) : "";
  if (username && password) {
    onecSessionLogin = { username: username, password: password };
  }
  var context = {
    department: payload && payload.department != null ? payload.department : "",
    departments: payload && payload.departments != null ? payload.departments : "",
    year: payload && payload.year != null ? payload.year : "",
    month: payload && payload.month != null ? payload.month : "",
    start: payload && payload.start != null ? payload.start : "",
    end: payload && payload.end != null ? payload.end : "",
    asof: payload && payload.asof != null ? payload.asof : "",
  };
  return openOnecReport(targetUrl, context);
});

ipcMain.handle("app:get-update-mode", function () {
  return {
    mode: getUpdateMode(),
    supported: isReleaseUpdateSupported(),
    packaged: app.isPackaged,
    portable: isPortableBuild(),
    currentVersion: app.getVersion(),
  };
});

ipcMain.handle("app:get-release-update-state", function () {
  return getReleaseUpdateStateSnapshot();
});

ipcMain.handle("app:check-release-updates", async function () {
  try {
    return {
      ok: true,
      state: await checkReleaseUpdates(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      state: getReleaseUpdateStateSnapshot(),
    };
  }
});

ipcMain.handle("app:install-release-update", async function () {
  try {
    return await installReleaseUpdate();
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      state: getReleaseUpdateStateSnapshot(),
    };
  }
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
