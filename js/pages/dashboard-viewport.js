/**
 * Electron: корень страницы = размер окна, пересчёт графиков при resize.
 */
(function (global) {
  var bound = false;
  var isElectron = !!(global.electronApp && global.electronApp.isElectron);

  function pageBackgroundColor() {
    var body = document.body;
    if (body && body.classList.contains("auth-login-body")) return "#061936";
    return "#f4f7fb";
  }

  function applyElectronShellClass() {
    if (!isElectron) return;
    var doc = document.documentElement;
    var body = document.body;
    if (!doc) return;
    doc.classList.add("app-electron-shell");
    if (body && body.classList.contains("auth-login-body")) {
      doc.classList.add("app-electron-shell--login");
    }
    doc.style.backgroundColor = pageBackgroundColor();
  }

  function syncViewportSize() {
    if (!isElectron) return;
    var doc = document.documentElement;
    if (doc) {
      doc.style.backgroundColor = pageBackgroundColor();
    }
  }

  function notifyChartsResize() {
    if (global.DashboardCharts && typeof global.DashboardCharts.handleViewportResize === "function") {
      global.DashboardCharts.handleViewportResize();
    }
  }

  function handleViewportResize() {
    syncViewportSize();
    notifyChartsResize();
  }

  function ensureViewportResizeBound() {
    if (bound || typeof global.addEventListener !== "function") return;
    bound = true;
    applyElectronShellClass();
    syncViewportSize();
    global.addEventListener("resize", handleViewportResize);
    if (global.visualViewport && typeof global.visualViewport.addEventListener === "function") {
      global.visualViewport.addEventListener("resize", handleViewportResize);
    }
    if (isElectron && global.electronApp && typeof global.electronApp.onWindowResize === "function") {
      global.electronApp.onWindowResize(handleViewportResize);
    }
  }

  global.DashboardViewport = {
    ensureViewportResizeBound: ensureViewportResizeBound,
    syncViewportSize: syncViewportSize,
    handleViewportResize: handleViewportResize,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureViewportResizeBound);
  } else {
    ensureViewportResizeBound();
  }
})(typeof window !== "undefined" ? window : globalThis);
