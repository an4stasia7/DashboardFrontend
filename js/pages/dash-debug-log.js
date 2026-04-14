/**
 * @fileoverview Панель DEBUG: дерево JSON из `window.__apiDebugJsonLog`.
 * Подключать до `dashboard.js`. Задаёт `window.ApiDebugLog` и `window.DashDebug`.
 */
(function (global) {
  var debugRenderScheduled = false;

  function scheduleRenderDebugJsonLogPanel() {
    if (debugRenderScheduled) return;
    debugRenderScheduled = true;
    setTimeout(function () {
      debugRenderScheduled = false;
      renderDebugJsonLogPanel();
    }, 0);
  }

  function buildJsonTree(val, startOpen) {
    if (val === null) {
      var sNull = document.createElement("span");
      sNull.className = "jt-null";
      sNull.textContent = "null";
      return sNull;
    }
    if (typeof val === "string") {
      var sStr = document.createElement("span");
      sStr.className = "jt-str";
      sStr.textContent = '"' + val + '"';
      return sStr;
    }
    if (typeof val === "number") {
      var sNum = document.createElement("span");
      sNum.className = "jt-num";
      sNum.textContent = String(val);
      return sNum;
    }
    if (typeof val === "boolean") {
      var sBool = document.createElement("span");
      sBool.className = "jt-bool";
      sBool.textContent = String(val);
      return sBool;
    }

    var isArr = Array.isArray(val);
    var keys = Object.keys(val);
    var openBr = isArr ? "[" : "{";
    var closeBr = isArr ? "]" : "}";

    if (keys.length === 0) {
      var sEmpty = document.createElement("span");
      sEmpty.className = "jt-bracket";
      sEmpty.textContent = openBr + closeBr;
      return sEmpty;
    }

    var frag = document.createDocumentFragment();

    var toggle = document.createElement("span");
    toggle.className = "jt-toggle" + (startOpen ? "" : " jt-collapsed");
    var br1 = document.createElement("span");
    br1.className = "jt-bracket";
    br1.textContent = openBr;
    toggle.appendChild(br1);

    var preview = document.createElement("span");
    preview.className = "jt-preview";
    preview.textContent = " " + (isArr ? keys.length + " элем." : keys.length + " ключ.") + " ";
    toggle.appendChild(preview);

    toggle.addEventListener("click", function () {
      toggle.classList.toggle("jt-collapsed");
    });

    frag.appendChild(toggle);

    var ul = document.createElement("ul");
    ul.className = "jt-children";
    keys.forEach(function (k, idx) {
      var li = document.createElement("li");
      if (!isArr) {
        var keySpan = document.createElement("span");
        keySpan.className = "jt-key";
        keySpan.textContent = '"' + k + '"';
        li.appendChild(keySpan);
        li.appendChild(document.createTextNode(": "));
      }
      li.appendChild(buildJsonTree(val[k], true));
      if (idx < keys.length - 1) {
        li.appendChild(document.createTextNode(","));
      }
      ul.appendChild(li);
    });
    frag.appendChild(ul);

    var closeBrSpan = document.createElement("span");
    closeBrSpan.className = "jt-bracket";
    closeBrSpan.textContent = closeBr;
    frag.appendChild(closeBrSpan);

    return frag;
  }

  function renderDebugJsonLogPanel() {
    var el = document.getElementById("debug-kpi-json");
    if (!el) return;
    var log = global.__apiDebugJsonLog || [];
    el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "debug-json-log-wrap";

    var toolbar = document.createElement("div");
    toolbar.className = "debug-json-log-toolbar";
    var countSpan = document.createElement("span");
    countSpan.className = "debug-json-log-count";
    countSpan.textContent = "Записей: " + log.length;
    toolbar.appendChild(countSpan);
    var btnClear = document.createElement("button");
    btnClear.type = "button";
    btnClear.className = "debug-json-log-clear";
    btnClear.textContent = "Очистить";
    btnClear.addEventListener("click", function () {
      global.__apiDebugJsonLog = [];
      renderDebugJsonLogPanel();
    });
    toolbar.appendChild(btnClear);
    wrap.appendChild(toolbar);

    if (!log.length) {
      var empty = document.createElement("p");
      empty.className = "debug-json-log-empty";
      empty.textContent =
        "Пока нет ответов API. Здесь появятся JSON из входа (POST login), KPI (GET /api/kpi/, /api/kpi/all/), immediate-subordinates и заметки mock.";
      wrap.appendChild(empty);
      el.appendChild(wrap);
      return;
    }

    for (var i = log.length - 1; i >= 0; i--) {
      (function (entry) {
        var block = document.createElement("div");
        block.className = "debug-json-log-entry";
        var head = document.createElement("div");
        head.className = "debug-json-log-entry-head";
        var statusPart =
          entry.status !== "" && entry.status !== undefined && entry.status !== null
            ? String(entry.status) + " "
            : "";
        head.textContent =
          (entry.at || "") +
          " · " +
          (entry.method || "—") +
          " " +
          statusPart +
          "· " +
          (entry.source || "?");
        var urlLine = document.createElement("div");
        urlLine.className = "debug-json-log-entry-url";
        urlLine.textContent = entry.url || "";
        var bodyEl = document.createElement("div");
        bodyEl.className = "debug-json-log-entry-body json-tree-root";
        if (entry.body == null) {
          var n0 = document.createElement("span");
          n0.className = "jt-null";
          n0.textContent = "null";
          bodyEl.appendChild(n0);
        } else {
          bodyEl.appendChild(buildJsonTree(entry.body, false));
        }
        block.appendChild(head);
        if (entry.url) block.appendChild(urlLine);
        block.appendChild(bodyEl);
        wrap.appendChild(block);
      })(log[i]);
    }
    el.appendChild(wrap);
  }

  global.ApiDebugLog = function () {
    scheduleRenderDebugJsonLogPanel();
  };

  global.DashDebug = {
    renderDebugJsonLogPanel: renderDebugJsonLogPanel,
    scheduleRenderDebugJsonLogPanel: scheduleRenderDebugJsonLogPanel,
    buildJsonTree: buildJsonTree,
  };
})(typeof window !== "undefined" ? window : globalThis);
