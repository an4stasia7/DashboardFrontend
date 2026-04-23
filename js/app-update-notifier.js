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

  function runAutoUpdate() {
    if (updateInProgress) return;
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
        updateInProgress = false;
        setButtonsDisabled(false);
        setPrimaryButtonText("Обновить");
        setBannerStatus(
          err && err.message ? err.message : "Не удалось выполнить автообновление.",
          true
        );
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

    var localUrl =
      String(cfg.APP_VERSION_PATH || "/package.json").replace(/\?+$/, "") +
      "?t=" +
      Date.now();
    var remoteUrl =
      String(cfg.APP_UPDATE_REMOTE_PACKAGE_URL || "").replace(/\?+$/, "") +
      "?t=" +
      Date.now();
    if (!remoteUrl) return Promise.resolve();

    return Promise.all([fetchJson(localUrl), fetchJson(remoteUrl)])
      .then(function (results) {
        var localPkg = results[0] || {};
        var remotePkg = results[1] || {};
        currentVersion = normalizeVersion(localPkg.version);
        latestVersion = normalizeVersion(remotePkg.version);
        if (!currentVersion || !latestVersion) return;

        if (compareVersions(latestVersion, currentVersion) <= 0) {
          removeBanner();
          return;
        }

        if (normalizeVersion(getDismissedVersion()) === latestVersion) {
          return;
        }

        ensureBanner(currentVersion, latestVersion);
      })
      .catch(function () {
        /* ignore update check failures */
      });
  }

  function init() {
    if (global.electronApp && typeof global.electronApp.getAppVersion === "function") {
      global.electronApp.getAppVersion().then(function (version) {
        if (version) currentVersion = normalizeVersion(version);
      }).catch(function () {
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
