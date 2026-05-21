"use strict";

(function (global) {
  var cfg = global.AppConfig || {};
  if (!cfg.APP_UPDATE_ENABLED) return;

  var DISMISSED_KEY = "dashboard_app_update_dismissed_version";
  var BANNER_ID = "app-update-banner";
  var checkTimer = null;
  var currentVersion = null;
  var latestVersion = null;
  var updateInProgress = false;
  var updateMode = global.electronApp ? "git" : "web";
  var releaseState = null;
  var releaseListenerCleanup = null;

  function safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function normalizeVersion(version) {
    return String(version || "").trim().replace(/^v/i, "");
  }

  function parseVersionParts(version) {
    return normalizeVersion(version)
      .split(".")
      .map(function (part) {
        var n = parseInt(part, 10);
        return isNaN(n) ? 0 : n;
      });
  }

  function compareVersions(left, right) {
    var a = parseVersionParts(left);
    var b = parseVersionParts(right);
    var len = Math.max(a.length, b.length);
    for (var i = 0; i < len; i++) {
      var av = a[i] || 0;
      var bv = b[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  /** Берём более новую из двух строк версий (пустые игнорируются). */
  function pickNewerSemver(a, b) {
    var na = normalizeVersion(a);
    var nb = normalizeVersion(b);
    if (!na) return nb;
    if (!nb) return na;
    return compareVersions(na, nb) >= 0 ? na : nb;
  }

  function getLatestVersionFromReleaseInfo(releaseInfo) {
    if (!releaseInfo || typeof releaseInfo !== "object") return "";
    return normalizeVersion(releaseInfo.tag_name || releaseInfo.name || releaseInfo.version || "");
  }

  function getDismissedVersion() {
    try {
      return localStorage.getItem(DISMISSED_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setDismissedVersion(version) {
    try {
      localStorage.setItem(DISMISSED_KEY, normalizeVersion(version));
    } catch (e) {
      /* ignore */
    }
  }

  function removeBanner() {
    var banner = document.getElementById(BANNER_ID);
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
  }

  function openUpdateUrl() {
    var updateUrl = cfg.APP_UPDATE_OPEN_URL;
    if (!updateUrl) return;
    try {
      if (global.electronApp && typeof global.electronApp.openExternal === "function") {
        global.electronApp.openExternal(updateUrl);
        return;
      }
      global.open(updateUrl, "_blank", "noopener");
    } catch (e) {
      try {
        global.location.href = updateUrl;
      } catch (e2) {
        /* ignore */
      }
    }
  }

  function setBannerStatus(message, isError) {
    var banner = document.getElementById(BANNER_ID);
    if (!banner) return;
    var statusEl = banner.querySelector(".app-update-banner__status");
    if (!statusEl) return;
    if (!message) {
      statusEl.textContent = "";
      statusEl.hidden = true;
      statusEl.classList.remove("is-error");
      return;
    }
    statusEl.textContent = String(message);
    statusEl.hidden = false;
    statusEl.classList.toggle("is-error", !!isError);
  }

  function setButtonsDisabled(disabled) {
    var banner = document.getElementById(BANNER_ID);
    if (!banner) return;
    var buttons = banner.querySelectorAll(".app-update-banner__btn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = !!disabled;
    }
  }

  function setPrimaryButtonText(text) {
    var banner = document.getElementById(BANNER_ID);
    if (!banner) return;
    var button = banner.querySelector(".app-update-banner__btn--primary");
    if (button) {
      button.textContent = String(text || "Обновить");
    }
  }

  function showUpdateReadyBanner() {
    if (!currentVersion || !latestVersion) return;
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      removeBanner();
      return;
    }
    if (normalizeVersion(getDismissedVersion()) === latestVersion) return;
    ensureBanner(currentVersion, latestVersion);
  }

  function resetUpdateUi() {
    updateInProgress = false;
    setButtonsDisabled(false);
    setPrimaryButtonText("Обновить");
  }

  function getModeLabel() {
    return String(updateMode || "").trim().toLowerCase();
  }

  function isReleaseMode() {
    return getModeLabel() === "release";
  }

  function isPortableMode() {
    return getModeLabel() === "portable";
  }

  function checkPackageJsonUpdates() {
    var localPromise = currentVersion
      ? Promise.resolve({ version: currentVersion })
      : fetchJson(
          String(cfg.APP_VERSION_PATH || "/package.json").replace(/\?+$/, "") +
            "?t=" +
            Date.now()
        );
    var releaseUrl = String(cfg.APP_UPDATE_REMOTE_RELEASES_URL || "").replace(/\?+$/, "");
    var remoteUrl =
      String(cfg.APP_UPDATE_REMOTE_PACKAGE_URL || "").replace(/\?+$/, "") +
      "?t=" +
      Date.now();
    var releasePromise = releaseUrl
      ? fetchJson(releaseUrl + "?t=" + Date.now()).catch(function () {
          return null;
        })
      : Promise.resolve(null);
    var packagePromise = remoteUrl ? fetchJson(remoteUrl) : Promise.resolve(null);
    if (!remoteUrl && !releaseUrl) return Promise.resolve();

    return Promise.all([localPromise, releasePromise, packagePromise])
      .then(function (results) {
        var localPkg = results[0] || {};
        var releaseInfo = results[1] || null;
        var remotePkg = results[2] || {};
        currentVersion = normalizeVersion(localPkg.version || currentVersion);
        var fromRelease = getLatestVersionFromReleaseInfo(releaseInfo);
        var fromPkg = normalizeVersion(remotePkg.version || "");
        latestVersion = pickNewerSemver(fromRelease, fromPkg);
        if (!currentVersion || !latestVersion) return;
        showUpdateReadyBanner();
      })
      .catch(function () {
        /* ignore update check failures */
      });
  }

  function applyReleaseUpdateState(nextState) {
    if (!nextState || typeof nextState !== "object") return;
    releaseState = nextState;
    if (nextState.mode) updateMode = String(nextState.mode);
    if (nextState.currentVersion) {
      currentVersion = normalizeVersion(nextState.currentVersion);
    }
    if (nextState.latestVersion) {
      latestVersion = normalizeVersion(nextState.latestVersion);
    }

    if (nextState.downloaded) {
      updateInProgress = true;
      setButtonsDisabled(true);
      setPrimaryButtonText("Перезапуск…");
      setBannerStatus("Обновление загружено. Приложение перезапускается…", false);
      showUpdateReadyBanner();
      return;
    }

    if (nextState.downloading) {
      updateInProgress = true;
      setButtonsDisabled(true);
      setPrimaryButtonText(
        nextState.progress != null ? "Загрузка " + String(nextState.progress) + "%" : "Загрузка…"
      );
      setBannerStatus(
        nextState.progress != null
          ? "Загрузка обновления… " + String(nextState.progress) + "%"
          : "Загрузка обновления…",
        false
      );
      showUpdateReadyBanner();
      return;
    }

    if (nextState.available) {
      resetUpdateUi();
      setBannerStatus("", false);
      showUpdateReadyBanner();
      return;
    }

    if (nextState.error) {
      if (updateInProgress) {
        resetUpdateUi();
        setBannerStatus(String(nextState.error), true);
      }
      return;
    }

    if (!nextState.checking) {
      resetUpdateUi();
      if (isReleaseMode()) {
        removeBanner();
      }
    }
  }

  function runAutoUpdate() {
    if (updateInProgress) return;

    if (isReleaseMode()) {
      if (
        compareVersions(latestVersion, currentVersion) > 0 &&
        (!releaseState || (!releaseState.available && !releaseState.downloaded))
      ) {
        setBannerStatus(
          "На GitHub есть новая версия кода, но опубликованный Release для автообновления пока недоступен. Открываю страницу релизов.",
          false
        );
        openUpdateUrl();
        return;
      }
      if (!global.electronApp || typeof global.electronApp.installReleaseUpdate !== "function") {
        openUpdateUrl();
        return;
      }
      updateInProgress = true;
      setButtonsDisabled(true);
      setPrimaryButtonText("Загрузка…");
      setBannerStatus("Загружаю обновление из GitHub Releases…", false);
      global.electronApp
        .installReleaseUpdate()
        .then(function (result) {
          if (!result || result.ok !== true) {
            throw new Error(
              result && result.error ? result.error : "Не удалось установить обновление приложения."
            );
          }
          if (result.state) applyReleaseUpdateState(result.state);
          setBannerStatus("Обновление загружено. Приложение перезапускается…", false);
        })
        .catch(function (err) {
          resetUpdateUi();
          setBannerStatus(
            err && err.message ? err.message : "Не удалось установить обновление приложения.",
            true
          );
        });
      return;
    }

    if (isPortableMode()) {
      setBannerStatus(
        "Для portable-сборки автоматическая установка недоступна. Открываю страницу последнего релиза.",
        false
      );
      openUpdateUrl();
      return;
    }

    if (!global.electronApp || typeof global.electronApp.runSelfUpdate !== "function") {
      openUpdateUrl();
      return;
    }

    updateInProgress = true;
    setButtonsDisabled(true);
    setPrimaryButtonText("Обновление…");
    setBannerStatus("Загружаю код, выполняю npm install и перезапуск приложения…", false);

    global.electronApp
      .runSelfUpdate()
      .then(function (result) {
        if (!result || result.ok !== true) {
          throw new Error(
            result && result.error
              ? result.error
              : "Не удалось выполнить автообновление."
          );
        }
        setBannerStatus("Обновление установлено. Приложение перезапускается…", false);
      })
      .catch(function (err) {
        resetUpdateUi();
        setBannerStatus(
          err && err.message ? err.message : "Не удалось выполнить автообновление.",
          true
        );
      });
  }

  function runSidebarUpdate() {
    runAutoUpdate();
  }

  function bindSidebarUpdateButton() {
    var btn = document.getElementById("app-update-sidebar-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      runSidebarUpdate();
    });
  }

  function ensureBanner(versionNow, versionLatest) {
    if (!document.body) return;

    var existing = document.getElementById(BANNER_ID);
    if (existing) {
      var textEl = existing.querySelector(".app-update-banner__text");
      if (textEl) {
        textEl.textContent =
          "Вышла новая версия " +
          versionLatest +
          ". Сейчас установлена " +
          versionNow +
          ". Рекомендуется обновить приложение.";
      }
      existing.hidden = false;
      return;
    }

    var banner = document.createElement("section");
    banner.id = BANNER_ID;
    banner.className = "app-update-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    var text = document.createElement("div");
    text.className = "app-update-banner__text";
    text.textContent =
      "Вышла новая версия " +
      versionLatest +
      ". Сейчас установлена " +
      versionNow +
      ". Рекомендуется обновить приложение.";

    var status = document.createElement("div");
    status.className = "app-update-banner__status";
    status.hidden = true;

    var actions = document.createElement("div");
    actions.className = "app-update-banner__actions";

    var updateBtn = document.createElement("button");
    updateBtn.type = "button";
    updateBtn.className = "app-update-banner__btn app-update-banner__btn--primary";
    updateBtn.textContent = "Обновить";
    updateBtn.addEventListener("click", function () {
      runAutoUpdate();
    });

    var laterBtn = document.createElement("button");
    laterBtn.type = "button";
    laterBtn.className = "app-update-banner__btn";
    laterBtn.textContent = "Позже";
    laterBtn.addEventListener("click", function () {
      setDismissedVersion(versionLatest);
      removeBanner();
    });

    actions.appendChild(updateBtn);
    actions.appendChild(laterBtn);
    banner.appendChild(text);
    banner.appendChild(status);
    banner.appendChild(actions);
    document.body.appendChild(banner);

    if (updateInProgress) {
      setButtonsDisabled(true);
    }
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.text();
      })
      .then(function (text) {
        var data = safeParseJson(text);
        if (!data || typeof data !== "object") {
          throw new Error("Invalid JSON");
        }
        return data;
      });
  }

  function shouldSkipCheck() {
    return document.visibilityState === "hidden";
  }

  function checkForUpdates() {
    if (shouldSkipCheck()) return Promise.resolve();
    if (updateInProgress) return Promise.resolve();

    if (!global.electronApp || typeof global.electronApp.getUpdateMode !== "function") {
      return checkPackageJsonUpdates();
    }

    return global.electronApp
      .getUpdateMode()
      .then(function (info) {
        if (info && info.mode) updateMode = String(info.mode);
        if (info && info.currentVersion) {
          currentVersion = normalizeVersion(info.currentVersion);
        }
        if (isReleaseMode() && typeof global.electronApp.checkReleaseUpdates === "function") {
          return global.electronApp.checkReleaseUpdates().then(function (result) {
            if (result && result.state) {
              applyReleaseUpdateState(result.state);
            }
            if (
              !result ||
              result.ok !== true ||
              !result.state ||
              (!result.state.available && !result.state.downloaded)
            ) {
              return checkPackageJsonUpdates();
            }
          });
        }
        return checkPackageJsonUpdates();
      })
      .catch(function () {
        return checkPackageJsonUpdates();
      });
  }

  function init() {
    if (global.electronApp && typeof global.electronApp.getAppVersion === "function") {
      global.electronApp
        .getAppVersion()
        .then(function (version) {
          if (version) currentVersion = normalizeVersion(version);
        })
        .catch(function () {
          /* ignore */
        });
    }

    if (global.electronApp && typeof global.electronApp.onReleaseUpdateState === "function") {
      releaseListenerCleanup = global.electronApp.onReleaseUpdateState(applyReleaseUpdateState);
    }

    if (global.electronApp && typeof global.electronApp.getReleaseUpdateState === "function") {
      global.electronApp.getReleaseUpdateState().then(applyReleaseUpdateState).catch(function () {
        /* ignore */
      });
    }

    checkForUpdates();
    if (!checkTimer) {
      checkTimer = global.setInterval(
        checkForUpdates,
        Number(cfg.APP_UPDATE_CHECK_INTERVAL_MS) || 300000
      );
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    });
    bindSidebarUpdateButton();
    global.addEventListener("beforeunload", function () {
      if (typeof releaseListenerCleanup === "function") {
        releaseListenerCleanup();
        releaseListenerCleanup = null;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  global.AppUpdate = Object.assign(global.AppUpdate || {}, {
    runAutoUpdate: runSidebarUpdate,
    checkForUpdates: checkForUpdates,
  });
})(typeof window !== "undefined" ? window : globalThis);
