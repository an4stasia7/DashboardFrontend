/**
 * Electron: корень страницы = размер окна, пересчёт layout/графиков при resize.
 */
(function (global) {
  var bound = false;
  var resizeRaf = null;
  var resizeEndTimer = null;
  var layoutResizeObserver = null;
  var isElectron = !!(global.electronApp && global.electronApp.isElectron);

  function pageBackgroundColor() {
    var body = document.body;
    if (body && body.classList.contains("auth-login-body")) return "#061936";
    return "#f4f7fb";
  }

  function isDashboardPage() {
    var body = document.body;
    return !!(body && body.classList.contains("dashboard-body"));
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

  function setWindowResizingState(active) {
    var doc = document.documentElement;
    if (!doc) return;
    if (active) {
      doc.classList.add("app-window-resizing");
    } else {
      doc.classList.remove("app-window-resizing");
    }
  }

  function notifyChartsResize() {
    if (global.DashboardCharts && typeof global.DashboardCharts.handleViewportResize === "function") {
      global.DashboardCharts.handleViewportResize();
    }
  }

  function runViewportResizePass() {
    syncViewportSize();
    notifyChartsResize();
  }

  function scheduleViewportResize() {
    if (resizeRaf != null) return;
    if (typeof global.requestAnimationFrame === "function") {
      resizeRaf = global.requestAnimationFrame(function () {
        resizeRaf = null;
        runViewportResizePass();
        if (typeof global.requestAnimationFrame === "function") {
          global.requestAnimationFrame(runViewportResizePass);
        }
      });
      return;
    }
    runViewportResizePass();
  }

  function handleViewportResize() {
    scheduleViewportResize();
    if (resizeEndTimer != null) {
      clearTimeout(resizeEndTimer);
    }
    resizeEndTimer = setTimeout(function () {
      resizeEndTimer = null;
      setWindowResizingState(false);
      runViewportResizePass();
    }, 120);
  }

  function handleViewportWillResize() {
    setWindowResizingState(true);
    scheduleViewportResize();
  }

  function ensureLayoutResizeObserver() {
    if (!isDashboardPage() || typeof global.ResizeObserver !== "function") return;
    if (layoutResizeObserver) return;
    layoutResizeObserver = new global.ResizeObserver(function () {
      scheduleViewportResize();
    });
    [".dashboard-layout", ".dash-workspace", ".dash-main"].forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el) layoutResizeObserver.observe(el);
    });
    var chartsRow = document.querySelector(".charts-row");
    if (chartsRow) layoutResizeObserver.observe(chartsRow);
  }

  function ensureViewportResizeBound() {
    if (bound || typeof global.addEventListener !== "function") return;
    bound = true;
    applyElectronShellClass();
    syncViewportSize();
    ensureLayoutResizeObserver();
    global.addEventListener("resize", handleViewportResize);
    if (global.visualViewport && typeof global.visualViewport.addEventListener === "function") {
      global.visualViewport.addEventListener("resize", handleViewportResize);
    }
    if (isElectron && global.electronApp) {
      if (typeof global.electronApp.onWindowResize === "function") {
        global.electronApp.onWindowResize(handleViewportResize);
      }
      if (typeof global.electronApp.onWindowWillResize === "function") {
        global.electronApp.onWindowWillResize(handleViewportWillResize);
      }
    }
  }

  global.DashboardViewport = {
    ensureViewportResizeBound: ensureViewportResizeBound,
    syncViewportSize: syncViewportSize,
    handleViewportResize: handleViewportResize,
    scheduleViewportResize: scheduleViewportResize,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureViewportResizeBound);
  } else {
    ensureViewportResizeBound();
  }
})(typeof window !== "undefined" ? window : globalThis);
