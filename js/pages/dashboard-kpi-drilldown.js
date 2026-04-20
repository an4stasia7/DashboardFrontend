(function (global) {
  var DRILLDOWN_KPI_CACHE_MAX = 32;
  var DRILLDOWN_FETCH_CONCURRENCY = 6;
  var drilldownKpiTilesCache = Object.create(null);
  var kpiTileDetailsState = Object.create(null);
  var drilldownContextTile = null;
  var latestContext = {};

  function mergeContext(nextContext) {
    latestContext = Object.assign({}, latestContext || {}, nextContext || {});
    return latestContext;
  }

  function getContext() {
    return latestContext || {};
  }

  function getTiles() {
    var fn = getContext().getTiles;
    return typeof fn === "function" ? fn() : [];
  }

  function getFlippedTileIndices() {
    var fn = getContext().getFlippedTileIndices;
    return typeof fn === "function" ? fn() : new Set();
  }

  function getDepartmentForCurrentKpiContextSafe() {
    var fn = getContext().getDepartmentForCurrentKpiContext;
    return typeof fn === "function" ? fn() : "";
  }

  function hideKpiHelpPopoverSafe() {
    var fn = getContext().hideKpiHelpPopover;
    if (typeof fn === "function") fn();
  }

  function syncKpiTileFlipStateSafe() {
    var fn = getContext().syncKpiTileFlipState;
    if (typeof fn === "function") fn();
  }

  function renderKpiTileBackFaceSafe(tileIndex) {
    var fn = getContext().renderKpiTileBackFace;
    if (typeof fn !== "function") return;
    var selector = '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]';
    fn(document.querySelector(selector), tileIndex);
  }

  function shouldRenderKpiTileBackSafe(tile) {
    var fn = getContext().shouldRenderKpiTileBack;
    return typeof fn === "function" ? !!fn(tile) : true;
  }

  function scrollTileIntoViewSafe(tileIndex) {
    var selector = '#kpi-container article.kpi-tile[data-kpi-tile-index="' + String(tileIndex) + '"]';
    DashUi.scrollElementIntoViewCentered(document.querySelector(selector));
  }

  function setPendingFocusSafe(value) {
    var fn = getContext().setPendingFocus;
    if (typeof fn === "function") fn(value);
  }

  function goToDepartmentDashboardSafe(deptName) {
    var fn = getContext().goToDepartmentDashboard;
    if (typeof fn === "function") fn(deptName);
  }

  function loadDrilldownTilesForDeptSafe(deptName) {
    var fn = getContext().loadDrilldownTilesForDept;
    return typeof fn === "function" ? fn(deptName) : Promise.resolve({ name: String(deptName || ""), tiles: [] });
  }

  function mapWithConcurrencyLimitSafe(items, limit, mapper) {
    var fn = getContext().mapWithConcurrencyLimit;
    if (typeof fn === "function") return fn(items, limit, mapper);
    return Promise.resolve([]);
  }

  function onUnauthorizedSafe() {
    var fn = getContext().onUnauthorized;
    if (typeof fn === "function") fn();
  }

  function getSessionApiMode() {
    var fn = getContext().getSessionApiMode;
    return typeof fn === "function" ? fn() : "mock";
  }

  function getSessionUserDepartment() {
    var fn = getContext().getSessionUserDepartment;
    return typeof fn === "function" ? fn() : "";
  }

  function getChairmanDashboardCatalogId() {
    var fn = getContext().getChairmanDashboardCatalogId;
    return typeof fn === "function" ? fn() : "";
  }

  function getPeriodCacheSignature() {
    if (typeof DashboardMonthNav === "undefined" || !DashboardMonthNav || typeof DashboardMonthNav.getPeriodState !== "function") {
      return "";
    }
    var ps = DashboardMonthNav.getPeriodState();
    if (!ps || typeof ps !== "object") return "";
    var year = ps.currentPeriodYear != null && !isNaN(Number(ps.currentPeriodYear)) ? Number(ps.currentPeriodYear) : null;
    var month = ps.currentPeriodMonth != null && !isNaN(Number(ps.currentPeriodMonth)) ? Number(ps.currentPeriodMonth) : null;
    var mode = ps.aggregationMode != null ? String(ps.aggregationMode).trim() : "";
    var quarters = Array.isArray(ps.selectedQuarters)
      ? ps.selectedQuarters
          .slice()
          .map(function (v) {
            return parseInt(String(v), 10);
          })
          .filter(function (q) {
            return !isNaN(q) && q >= 1 && q <= 4;
          })
          .sort(function (a, b) {
            return a - b;
          })
          .join(",")
      : "";
    return [year != null && month != null ? year + "-" + month : "no-period", mode || "current", quarters].join("|");
  }

  function drilldownTilesCacheKey(deptName) {
    var d = deptName != null ? String(deptName).trim() : "";
    if (!d) return "";
    var signature = getPeriodCacheSignature();
    return signature ? d + "\0" + signature : d;
  }

  function rememberDrilldownKpiTiles(dept, tiles) {
    var d = dept != null ? String(dept).trim() : "";
    if (!d || !tiles || !tiles.length) return;
    drilldownKpiTilesCache[drilldownTilesCacheKey(d)] = tiles;
    var keys = Object.keys(drilldownKpiTilesCache);
    while (keys.length > DRILLDOWN_KPI_CACHE_MAX) {
      delete drilldownKpiTilesCache[keys[0]];
      keys = Object.keys(drilldownKpiTilesCache);
    }
  }

  function loadDrilldownTilesForDept(deptName) {
    var cn = deptName != null ? String(deptName).trim() : "";
    if (!cn) return Promise.resolve({ name: cn, tiles: [] });
    var cached = drilldownKpiTilesCache[drilldownTilesCacheKey(cn)];
    if (cached && cached.length) {
      return Promise.resolve({ name: cn, tiles: cached });
    }
    return loadDrilldownTilesForDeptSafe(cn).then(function (result) {
      var tiles = result && Array.isArray(result.tiles) ? result.tiles.slice() : [];
      if (tiles.length) rememberDrilldownKpiTiles(cn, tiles);
      return { name: cn, tiles: tiles };
    });
  }

  function getKpiTileDetailsState(tileIndex) {
    if (!kpiTileDetailsState[tileIndex]) {
      kpiTileDetailsState[tileIndex] = {
        loading: false,
        loaded: false,
        rows: [],
        hint: "",
      };
    }
    return kpiTileDetailsState[tileIndex];
  }

  function resetState() {
    kpiTileDetailsState = Object.create(null);
    drilldownContextTile = null;
  }

  function drilldownRagSortWeight(rag) {
    var key = rag != null ? String(rag).toLowerCase().trim() : "";
    if (key === "red") return 0;
    if (key === "yellow") return 1;
    if (key === "green") return 2;
    if (key === "blue") return 3;
    return 4;
  }

  function drillRowFromTile(deptName, tile, isCurrentContext) {
    var label = deptName != null ? String(deptName).trim() : "—";
    if (!tile) {
      return {
        department: label,
        kpiPct: "—",
        rag: "blue",
        isCurrentContext: !!isCurrentContext,
        focus_kpi_id: "",
        focus_title: "",
      };
    }
    var pres = MockData.getKpiTilePresentation(tile);
    var pct =
      tile.kpi_pct != null && typeof tile.kpi_pct === "number" && !isNaN(tile.kpi_pct)
        ? tile.kpi_pct
        : tile.kpi_pst != null && typeof tile.kpi_pst === "number" && !isNaN(tile.kpi_pst)
          ? tile.kpi_pst
          : pres.percent;
    var pctLabel = MockData.formatKpiPercentLabel(pct) + "%";
    return {
      department: label,
      kpiPct: pctLabel,
      rag: pres.rag || "blue",
      isCurrentContext: !!isCurrentContext,
      focus_kpi_id: tile.kpi_id != null ? String(tile.kpi_id).trim() : "",
      focus_title: tile.title != null ? String(tile.title).trim() : "",
    };
  }

  function drillRowHasNoKpiValue(row) {
    if (!row || row.kpiPct == null) return true;
    return String(row.kpiPct).indexOf("—") !== -1;
  }

  function findMatchingTileAmongChildren(childTiles, clickedTile) {
    var fn = getContext().findMatchingTileAmongChildren;
    return typeof fn === "function" ? fn(childTiles, clickedTile) : null;
  }

  function buildDrilldownRowsForChildrenOnly(results, clicked) {
    var rows = [];
    (results || []).forEach(function (item) {
      if (!item || !item.name) return;
      var matched = findMatchingTileAmongChildren(item.tiles || [], clicked);
      if (!matched) return;
      var childRow = drillRowFromTile(item.name, matched, false);
      if (drillRowHasNoKpiValue(childRow)) return;
      rows.push(childRow);
    });
    return rows;
  }

  function sortDrilldownRows(rows) {
    return (rows || []).slice().sort(function (a, b) {
      var ragDiff = drilldownRagSortWeight(a && a.rag) - drilldownRagSortWeight(b && b.rag);
      if (ragDiff !== 0) return ragDiff;
      var aName = a && a.department ? String(a.department).toLowerCase() : "";
      var bName = b && b.department ? String(b.department).toLowerCase() : "";
      return aName.localeCompare(bName, "ru");
    });
  }

  function close(options) {
    mergeContext(options);
    drilldownContextTile = null;
    getFlippedTileIndices().clear();
    hideKpiHelpPopoverSafe();
    var panel = document.getElementById("kpi-tile-drilldown");
    if (panel) panel.hidden = true;
    syncKpiTileFlipStateSafe();
  }

  function navigateToDepartmentFromDrill(deptName, contextTile, focusTarget, options) {
    mergeContext(options);
    var d = deptName != null ? String(deptName).trim() : "";
    if (!d) return;
    var ctx = getDepartmentForCurrentKpiContextSafe();
    if (d === ctx) {
      close();
      return;
    }
    var explicitFocus =
      focusTarget && (focusTarget.kpi_id || focusTarget.title)
        ? {
            kpi_id: focusTarget.kpi_id != null ? String(focusTarget.kpi_id).trim() : "",
            title: focusTarget.title != null ? String(focusTarget.title).trim() : "",
          }
        : null;
    var focusTile = contextTile || drilldownContextTile;
    if (explicitFocus) {
      setPendingFocusSafe(explicitFocus);
    } else if (focusTile) {
      setPendingFocusSafe({
        kpi_id: focusTile.kpi_id != null ? String(focusTile.kpi_id) : "",
        title: focusTile.title != null ? String(focusTile.title) : "",
      });
    }
    close();
    goToDepartmentDashboardSafe(d);
  }

  function loadKpiTileDrilldownData(tileIndex, options) {
    mergeContext(options);
    var tiles = getTiles();
    if (!tiles || !tiles[tileIndex]) return;
    var clicked = tiles[tileIndex];
    var state = getKpiTileDetailsState(tileIndex);
    if (state.loading || state.loaded) return;
    var parentDept = getDepartmentForCurrentKpiContextSafe();
    state.loading = true;
    state.loaded = false;
    state.rows = [];
    state.hint = "";
    renderKpiTileBackFaceSafe(tileIndex);

    if (getSessionApiMode() === "mock" || typeof Api === "undefined" || !Api.fetchImmediateSubordinates) {
      state.loading = false;
      state.loaded = true;
      state.hint =
        "Список дочерних отделов доступен в режиме API. В mock-режиме показана только информация по самой карточке.";
      renderKpiTileBackFaceSafe(tileIndex);
      return;
    }

    if (!parentDept) {
      state.loading = false;
      state.loaded = true;
      state.hint = "В профиле не указано подразделение, поэтому список дочерних отделов недоступен.";
      renderKpiTileBackFaceSafe(tileIndex);
      return;
    }

    var fetchOpts = { department: parentDept };
    var chairmanFor = getChairmanDashboardCatalogId();
    if (chairmanFor) {
      fetchOpts.for = chairmanFor;
    }

    Api.fetchImmediateSubordinates(fetchOpts)
      .then(function (r) {
        if (r.unauthorized) {
          onUnauthorizedSafe();
          return;
        }
        var parentDeptNorm = String(parentDept).trim();
        var selfDeptNorm = getSessionUserDepartment() != null ? String(getSessionUserDepartment()).trim() : "";
        var childrenRaw = r.ok && Array.isArray(r.immediate_children) ? r.immediate_children : [];
        var children = childrenRaw
          .map(function (c) {
            return c != null ? String(c).trim() : "";
          })
          .filter(function (n) {
            return n && n !== parentDeptNorm && n !== selfDeptNorm;
          });
        if (!children.length) {
          state.loading = false;
          state.loaded = true;
          state.rows = [];
          state.hint = childrenRaw.length
            ? "В ответе API нет других дочерних отделов кроме текущего контекста."
            : "У этого подразделения нет дочерних отделов в ответе API.";
          renderKpiTileBackFaceSafe(tileIndex);
          return;
        }
        return mapWithConcurrencyLimitSafe(children, DRILLDOWN_FETCH_CONCURRENCY, function (childName) {
          return loadDrilldownTilesForDept(childName);
        }).then(function (results) {
          state.loading = false;
          state.loaded = true;
          state.rows = sortDrilldownRows(buildDrilldownRowsForChildrenOnly(results, clicked));
          state.hint = children.length && state.rows.length === 0
            ? "Среди дочерних отделов нет данных по этому показателю или KPI не заполнен."
            : "";
          renderKpiTileBackFaceSafe(tileIndex);
        });
      })
      .catch(function () {
        state.loading = false;
        state.loaded = true;
        state.rows = [];
        state.hint = "Не удалось загрузить список дочерних отделов.";
        renderKpiTileBackFaceSafe(tileIndex);
      });
  }

  function open(tileIndex, options) {
    mergeContext(options);
    var tiles = getTiles();
    if (!tiles || !tiles[tileIndex]) return;
    if (!shouldRenderKpiTileBackSafe(tiles[tileIndex])) return;
    var flippedTileIndices = getFlippedTileIndices();
    if (flippedTileIndices.has(tileIndex)) {
      flippedTileIndices.delete(tileIndex);
      if (drilldownContextTile === tiles[tileIndex]) {
        drilldownContextTile = null;
      }
      syncKpiTileFlipStateSafe();
      return;
    }
    drilldownContextTile = tiles[tileIndex];
    flippedTileIndices.add(tileIndex);
    syncKpiTileFlipStateSafe();
    loadKpiTileDrilldownData(tileIndex);
    scrollTileIntoViewSafe(tileIndex);
  }

  function renderLegacyTableRows(rows, tbody, table) {
    if (!tbody || !table) return;
    tbody.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.className = "kpi-tile-drilldown-row";
      if (r.department) tr.setAttribute("data-department", r.department);
      if (r.focus_kpi_id) tr.setAttribute("data-focus-kpi-id", r.focus_kpi_id);
      if (r.focus_title) tr.setAttribute("data-focus-title", r.focus_title);
      if (r.isCurrentContext) tr.setAttribute("data-no-nav", "1");
      var td1 = document.createElement("td");
      td1.textContent = DashUi.capitalizeHeaderTitle(r.department);
      var td2 = document.createElement("td");
      td2.textContent = r.kpiPct;
      td2.className = "kpi-tile-drilldown-pct";
      var td3 = document.createElement("td");
      var dot = document.createElement("span");
      dot.className = "rag-dot rag-" + (r.rag || "blue");
      dot.title = r.rag || "";
      td3.appendChild(dot);
      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      if (!r.isCurrentContext && r.department && r.department !== "—") {
        tr.classList.add("kpi-tile-drilldown-row--nav");
        tr.setAttribute("tabindex", "0");
        tr.setAttribute("role", "link");
        tr.setAttribute("aria-label", "Открыть дашборд отдела «" + r.department + "»");
      } else {
        tr.classList.add("kpi-tile-drilldown-row--static");
      }
      tbody.appendChild(tr);
    });
    table.hidden = rows.length === 0;
  }

  function buildFocusTargetFromElement(el) {
    if (!el || typeof el.getAttribute !== "function") return null;
    var focusKpiId = el.getAttribute("data-focus-kpi-id") || "";
    var focusTitle = el.getAttribute("data-focus-title") || "";
    if (!focusKpiId && !focusTitle) return null;
    return { kpi_id: focusKpiId, title: focusTitle };
  }

  function bindLegacyPanel(options) {
    mergeContext(options);
    var drillTbodyEl = document.getElementById("kpi-tile-drilldown-tbody");
    var drillCloseEl = document.getElementById("kpi-tile-drilldown-close");
    if (drillCloseEl && !drillCloseEl.__dashboardKpiDrilldownBound) {
      drillCloseEl.__dashboardKpiDrilldownBound = true;
      drillCloseEl.addEventListener("click", function () {
        close();
      });
    }
    if (drillTbodyEl && !drillTbodyEl.__dashboardKpiDrilldownBound) {
      drillTbodyEl.__dashboardKpiDrilldownBound = true;
      drillTbodyEl.addEventListener("click", function (e) {
        var tr = e.target.closest("tr.kpi-tile-drilldown-row--nav");
        if (!tr || !drillTbodyEl.contains(tr)) return;
        var dept = tr.getAttribute("data-department");
        if (!dept) return;
        navigateToDepartmentFromDrill(dept, null, buildFocusTargetFromElement(tr));
      });
      drillTbodyEl.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var tr = e.target.closest("tr.kpi-tile-drilldown-row--nav");
        if (!tr || !drillTbodyEl.contains(tr)) return;
        e.preventDefault();
        var dept = tr.getAttribute("data-department");
        if (dept) navigateToDepartmentFromDrill(dept, null, buildFocusTargetFromElement(tr));
      });
    }
  }

  global.DashboardKpiDrilldown = {
    bindLegacyPanel: bindLegacyPanel,
    buildDrilldownRowsForChildrenOnly: buildDrilldownRowsForChildrenOnly,
    buildFocusTargetFromElement: buildFocusTargetFromElement,
    close: close,
    getKpiTileDetailsState: getKpiTileDetailsState,
    loadKpiTileDrilldownData: loadKpiTileDrilldownData,
    navigateToDepartmentFromDrill: navigateToDepartmentFromDrill,
    open: open,
    renderLegacyTableRows: renderLegacyTableRows,
    resetState: resetState,
    sortDrilldownRows: sortDrilldownRows,
  };
})(typeof window !== "undefined" ? window : globalThis);
