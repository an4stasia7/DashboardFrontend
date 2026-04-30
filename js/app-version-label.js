"use strict";

(function (global) {
  function normalizeVersion(version) {
    return String(version || "").trim().replace(/^v/i, "");
  }

  function setVersionLabel(version) {
    var el = document.getElementById("app-version-label");
    var normalized = normalizeVersion(version);
    if (!el || !normalized) return;
    el.textContent = "Версия " + normalized;
  }

  function fetchPackageVersion() {
    var cfg = global.AppConfig || {};
    var path = String(cfg.APP_VERSION_PATH || "/package.json").replace(/\?+$/, "");
    return fetch(path + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (pkg) {
        return pkg && pkg.version;
      });
  }

  function init() {
    if (global.electronApp && typeof global.electronApp.getAppVersion === "function") {
      global.electronApp
        .getAppVersion()
        .then(setVersionLabel)
        .catch(function () {
          return fetchPackageVersion().then(setVersionLabel).catch(function () {});
        });
      return;
    }

    fetchPackageVersion().then(setVersionLabel).catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
