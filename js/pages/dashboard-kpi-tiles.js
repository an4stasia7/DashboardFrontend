(function (global) {
  var KPI_TILES_PER_PAGE = 6;
  var kpiTilesPageIndex = 0;
  var pagerBound = false;
  var latestContext = {};

  var KPI_TILE_MSG_GENERATED_DATA = "Данные были сгенерированы";
  var KPI_TILE_TITLE_PLAN_FACT_PERIOD = "Период, за который показаны план и факт";
  var KPI_TILE_ARIA_METRICS_PF = "План и факт";

  function mergeContext(nextContext) {
    latestContext = Object.assign({}, latestContext || {}, nextContext || {});
    return latestContext;
  }

  function getContext() {
    return latestContext || {};
  }

  function getTiles() {
    var tiles = getContext().tiles;
    return Array.isArray(tiles) ? tiles : [];
  }

  function getFlippedTileIndices() {
    var indices = getContext().flippedTileIndices;
    return indices instanceof Set ? indices : new Set();
  }

  function getTileDetailsState(tileIndex) {
    var fn = getContext().getTileDetailsState;
    return typeof fn === "function" ? fn(tileIndex) : null;
  }

  function shouldMatchFocus(tile, focus) {
    var fn = getContext().matchFocusTarget;
    return typeof fn === "function" ? !!fn(tile, focus) : false;
  }

  function clearPendingFocus() {
    var fn = getContext().clearPendingFocus;
    if (typeof fn === "function") fn();
  }

  function beforePageChange() {
    var fn = getContext().onBeforePageChange;
    if (typeof fn === "function") fn();
  }

  function getKpiTileException(tile) {
    var cfg = global.KPI_TILE_EXCEPTIONS || null;
    if (!cfg || !tile) return null;
    var key = tile.kpi_id != null && String(tile.kpi_id).trim()
      ? String(tile.kpi_id).trim()
      : tile.badge != null && String(tile.badge).trim()
        ? String(tile.badge).trim()
        : "";
    return key && cfg[key] ? cfg[key] : null;
  }

  function shouldShowKpiTileHelp(tile) {
    var rule = getKpiTileException(tile);
    return !(rule && rule.hideHelp);
  }

  function shouldShowKpiTilePercent(tile) {
    var rule = getKpiTileException(tile);
    return !(rule && rule.hideKpiPercent);
  }

  function shouldRenderKpiTileBack(tile) {
    var rule = getKpiTileException(tile);
    return !(rule && rule.disableBack);
  }

  function shouldRenderKpiTileBackDepartmentsOnly(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backDepartmentsOnly);
  }

  function buildKpiTileHelpButtonHtml() {
    return (
      '<button type="button" class="kpi-tile-help" aria-label="Справка: формула и цветовые пороги показателя" aria-haspopup="dialog" aria-controls="kpi-thresholds-dialog">' +
      '<span class="kpi-tile-help-icon" aria-hidden="true">?</span>' +
      "</button>"
    );
  }

  function buildKpiTileBadgeRowHtml(tile) {
    var helpHtml = shouldShowKpiTileHelp(tile) ? buildKpiTileHelpButtonHtml() : "";
    return (
      '<div class="kpi-tile-badge-row">' +
      '<span class="badge">' +
      DashUi.escapeHtml(tile.badge) +
      "</span>" +
      helpHtml +
      "</div>"
    );
  }

  function buildKpiTileGeneratedFlagHtml() {
    return (
      '<span class="kpi-tile-generated-flag" title="' +
      DashUi.escapeHtml(KPI_TILE_MSG_GENERATED_DATA) +
      '" role="img" aria-label="' +
      DashUi.escapeHtml(KPI_TILE_MSG_GENERATED_DATA) +
      '">!</span>'
    );
  }

  function buildKpiTileUpdatedAtHtml(tile) {
    var formatted =
      typeof DashUi !== "undefined" && DashUi && typeof DashUi.formatKpiTileUpdatedAt === "function"
        ? DashUi.formatKpiTileUpdatedAt(tile && tile.cache_updated_at)
        : "";
    if (!formatted) return "";
    return (
      '<p class="kpi-tile-updated-at" title="' +
      DashUi.escapeHtml("Последнее обновление данных") +
      '">' +
      DashUi.escapeHtml("Обновлено: " + formatted) +
      "</p>"
    );
  }

  function buildKpiTileBodyHtml(tile, hasPf, pfPeriod) {
    var rule = getKpiTileException(tile);
    var isFactOnly = !!(rule && rule.factOnly);
    var generatedFlag = tile.has_data === false ? buildKpiTileGeneratedFlagHtml() : "";
    var periodExtra =
      (hasPf || isFactOnly) && pfPeriod
        ? '<span class="kpi-tile-plan-fact-period" title="' +
          DashUi.escapeHtml(isFactOnly ? "Период факта" : KPI_TILE_TITLE_PLAN_FACT_PERIOD) +
          '">' +
          (isFactOnly ? "Факт: " : "План/факт: ") +
          DashUi.escapeHtml(pfPeriod) +
          "</span>"
        : "";
    return (
      '<div class="tile-body">' +
      '<div class="kpi-tile-title-row">' +
      "<h3>" +
      DashUi.escapeHtml(tile.title) +
      "</h3>" +
      generatedFlag +
      "</div>" +
      '<p class="period">' +
      DashUi.escapeHtml(tile.period) +
      periodExtra +
      "</p>" +
      buildKpiTileUpdatedAtHtml(tile) +
      "</div>"
    );
  }

  function buildKpiTilePlanFactStackHtml(planFactShown) {
    return (
      '<div class="kpi-tile-pf-stack">' +
      '<div class="kpi-tile-pf-inline">' +
      '<div class="kpi-tile-pf-inline-row">' +
      '<span class="kpi-tile-pf-pill">' +
      DashUi.escapeHtml(planFactShown) +
      '</span><span class="kpi-tile-pf-inline-label">План / факт</span></div></div></div>'
    );
  }

  function buildKpiTileFactOnlyHtml(factShown) {
    return (
      '<div class="kpi-tile-pf-stack">' +
      '<div class="kpi-tile-pf-inline">' +
      '<div class="kpi-tile-pf-inline-row">' +
      '<span class="kpi-tile-pf-pill">' +
      DashUi.escapeHtml(factShown) +
      '</span><span class="kpi-tile-pf-inline-label">Факт</span></div></div></div>'
    );
  }

  function buildKpiTileMetricsSectionHtml(tile, hasPf, planFactShown, factShown) {
    var rule = getKpiTileException(tile);
    if (rule && rule.factOnly) {
      return (
        '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="Факт">' +
        buildKpiTileFactOnlyHtml(factShown) +
        "</div>"
      );
    }
    if (!hasPf) return "";
    return (
      '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="' +
      DashUi.escapeHtml(KPI_TILE_ARIA_METRICS_PF) +
      '">' +
      buildKpiTilePlanFactStackHtml(planFactShown) +
      "</div>"
    );
  }

  function buildKpiTileFrontFaceHtml(tile, hasPf, planFactShown, factShown, pfPeriod) {
    return (
      '<section class="kpi-tile-face kpi-tile-face--front">' +
      buildKpiTileBadgeRowHtml(tile) +
      buildKpiTileBodyHtml(tile, hasPf, pfPeriod) +
      buildKpiTileMetricsSectionHtml(tile, hasPf, planFactShown, factShown) +
      "</section>"
    );
  }

  function buildKpiTileChildrenHtml(state) {
    if (!state) return '<div class="kpi-tile-back-message">Нет данных.</div>';
    if (state.loading) {
      return (
        '<div class="kpi-tile-back-loading">' +
        '<span class="kpi-tile-back-loading-spinner" aria-hidden="true"></span>' +
        "<span>Загрузка дочерних отделов…</span>" +
        "</div>"
      );
    }
    if (state.rows && state.rows.length) {
      return (
        '<div class="kpi-tile-children-list">' +
        state.rows
          .map(function (row) {
            var ragClass = row.rag || "blue";
            return (
              '<a class="kpi-tile-child-item kpi-tile-child-link" tabindex="0" data-department="' +
              DashUi.escapeHtml(row.department) +
              '">' +
              '<span class="kpi-tile-child-dot rag-dot rag-' + ragClass + '"></span>' +
              '<span class="kpi-tile-child-name">' +
              DashUi.escapeHtml(DashUi.capitalizeHeaderTitle(row.department)) +
              "</span>" +
              '<span class="kpi-tile-child-value">' +
              DashUi.escapeHtml(row.kpiPct) +
              '</span>' +
              '<svg class="kpi-tile-child-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              "</a>"
            );
          })
          .join("") +
        "</div>"
      );
    }
    return (
      '<div class="kpi-tile-back-message">' +
      DashUi.escapeHtml(state.hint || "Для этого показателя пока нет доступных дочерних отделов.") +
      "</div>"
    );
  }

  function buildKpiTileBackFaceHtml(tile, tileIndex) {
    var state = getTileDetailsState(tileIndex);
    var pres = MockData.getKpiTilePresentation(tile);
    var percentLabel = MockData.formatKpiPercentLabel(pres.percent) + "%";
    var hint = tile && tile.hint != null ? String(tile.hint).trim() : "";
    var period = tile && tile.period != null ? String(tile.period).trim() : "";
    var code = tile && (tile.badge || tile.kpi_id) ? String(tile.badge || tile.kpi_id).trim() : "";
    var hasPf = DashUi.kpiTileHasPlanAndFact(tile);
    var planFactShown =
      typeof DashUi.formatKpiTilePlanFactPair === "function"
        ? DashUi.formatKpiTilePlanFactPair(tile.plan, tile.fact, tile.units)
        : DashUi.formatKpiTilePlanFactValue(tile.plan) + "/" + DashUi.formatKpiTilePlanFactValue(tile.fact);
    var showHelp = shouldShowKpiTileHelp(tile);
    var showPercent = shouldShowKpiTilePercent(tile);
    if (shouldRenderKpiTileBackDepartmentsOnly(tile)) {
      return (
        '<div class="kpi-tile-back-section kpi-tile-back-section--only">' +
        (code ? '<span class="kpi-tile-back-badge">' + DashUi.escapeHtml(code) + "</span>" : "") +
        '<h3 class="kpi-tile-back-title">' +
        DashUi.escapeHtml(tile && tile.title ? tile.title : "Показатель") +
        "</h3>" +
        (period ? '<p class="kpi-tile-back-period">' + DashUi.escapeHtml(period) + "</p>" : "") +
        '<div class="kpi-tile-back-section-title">Информация по отделам</div>' +
        buildKpiTileChildrenHtml(state) +
        "</div>"
      );
    }
    return (
      '<div class="kpi-tile-back-head">' +
      '<div class="kpi-tile-back-head-copy">' +
      (code ? '<span class="kpi-tile-back-badge">' + DashUi.escapeHtml(code) + "</span>" : "") +
      '<h3 class="kpi-tile-back-title">' +
      DashUi.escapeHtml(tile && tile.title ? tile.title : "Показатель") +
      "</h3>" +
      (period ? '<p class="kpi-tile-back-period">' + DashUi.escapeHtml(period) + "</p>" : "") +
      "</div>" +
      '<div class="kpi-tile-back-head-actions">' +
      '<button type="button" class="kpi-tile-flip-action" aria-label="Вернуться к карточке">Назад</button>' +
      "</div></div>" +
      '<div class="kpi-tile-back-summary">' +
      (showPercent
        ? '<div class="kpi-tile-back-summary-item kpi-tile-back-summary-item--kpi">' +
          (showHelp ? buildKpiTileHelpButtonHtml() : "") +
          '<span class="kpi-tile-back-summary-label">KPI</span>' +
          '<strong class="kpi-tile-back-kpi-pct">' +
          DashUi.escapeHtml(percentLabel) +
          "</strong></div>"
        : "") +
      (hasPf && shouldRenderKpiTileBack(tile)
        ? '<div class="kpi-tile-back-summary-item"><span class="kpi-tile-back-summary-label">План / факт</span><strong>' +
          DashUi.escapeHtml(planFactShown) +
          "</strong></div>"
        : "") +
      "</div>" +
      (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "") +
      '<div class="kpi-tile-back-section">' +
      '<div class="kpi-tile-back-section-title">Информация по отделам</div>' +
      buildKpiTileChildrenHtml(state) +
      "</div>"
    );
  }

  function renderBackFace(options) {
    mergeContext(options);
    var articleEl = options && options.articleEl;
    var tileIndex = options && typeof options.tileIndex === "number" ? options.tileIndex : NaN;
    var tiles = getTiles();
    if (!articleEl || isNaN(tileIndex) || !tiles[tileIndex]) return;
    var backFace = articleEl.querySelector(".kpi-tile-face--back");
    if (!backFace) return;
    backFace.innerHTML = buildKpiTileBackFaceHtml(tiles[tileIndex], tileIndex);
  }

  function syncFlipState(options) {
    mergeContext(options);
    var tiles = getTiles();
    var flipped = getFlippedTileIndices();
    var articles = document.querySelectorAll("#kpi-container article.kpi-tile");
    articles.forEach(function (articleEl) {
      var idx = articleEl.getAttribute("data-kpi-tile-index");
      var i = idx != null ? +idx : NaN;
      var isActive = !isNaN(i) && flipped.has(i);
      articleEl.classList.toggle("is-flipped", isActive);
      articleEl.setAttribute("aria-expanded", isActive ? "true" : "false");
      if (isActive && tiles[i]) {
        renderBackFace({
          articleEl: articleEl,
          tileIndex: i,
        });
      }
    });
  }

  function applyKpiTilesPageVisibility() {
    var container = document.getElementById("kpi-container");
    if (!container) return;
    var articles = container.querySelectorAll("article.kpi-tile");
    var n = articles.length;
    if (n <= KPI_TILES_PER_PAGE) {
      articles.forEach(function (art) {
        art.classList.remove("kpi-tile--page-hidden");
      });
      return;
    }
    var start = kpiTilesPageIndex * KPI_TILES_PER_PAGE;
    var end = start + KPI_TILES_PER_PAGE;
    articles.forEach(function (art, idx) {
      art.classList.toggle("kpi-tile--page-hidden", idx < start || idx >= end);
    });
  }

  function updatePagerUI(options) {
    mergeContext(options);
    var container = document.getElementById("kpi-container");
    var pager = document.getElementById("kpi-tiles-pager");
    var prevBtn = document.getElementById("kpi-tiles-page-prev");
    var nextBtn = document.getElementById("kpi-tiles-page-next");
    var label = document.getElementById("kpi-tiles-page-label");
    var nDom = container ? container.querySelectorAll("article.kpi-tile").length : 0;
    var tiles = getTiles();
    var n = nDom > 0 ? nDom : tiles.length;
    if (!pager) return;
    if (n <= KPI_TILES_PER_PAGE) {
      kpiTilesPageIndex = 0;
      applyKpiTilesPageVisibility();
      pager.setAttribute("hidden", "");
      pager.hidden = true;
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      if (label) label.textContent = "";
      return;
    }
    var pages = Math.ceil(n / KPI_TILES_PER_PAGE);
    kpiTilesPageIndex = Math.min(Math.max(0, kpiTilesPageIndex), pages - 1);
    applyKpiTilesPageVisibility();
    pager.removeAttribute("hidden");
    pager.hidden = false;
    if (label) label.textContent = kpiTilesPageIndex + 1 + " / " + pages;
    if (prevBtn) prevBtn.disabled = kpiTilesPageIndex <= 0;
    if (nextBtn) nextBtn.disabled = kpiTilesPageIndex >= pages - 1;
  }

  function ensurePagerBound() {
    if (pagerBound) return;
    pagerBound = true;
    var prevBtn = document.getElementById("kpi-tiles-page-prev");
    var nextBtn = document.getElementById("kpi-tiles-page-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (kpiTilesPageIndex <= 0) return;
        beforePageChange();
        kpiTilesPageIndex--;
        updatePagerUI();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var n = getTiles().length;
        var pages = Math.max(1, Math.ceil(n / KPI_TILES_PER_PAGE));
        if (kpiTilesPageIndex >= pages - 1) return;
        beforePageChange();
        kpiTilesPageIndex++;
        updatePagerUI();
      });
    }
  }

  function render(options) {
    mergeContext(options);
    var tiles = getTiles();
    var container = document.getElementById("kpi-container");
    var pendingFocus = getContext().pendingFocus || null;
    var focusApplied = false;
    if (!container) return;

    container.innerHTML = "";
    tiles.forEach(function (tile, i) {
      var el = document.createElement("article");
      var pres = MockData.getKpiTilePresentation(tile);
      var rule = getKpiTileException(tile);
      var frontAccentColor = rule && rule.frontAccentColor ? String(rule.frontAccentColor).trim() : "";
      var hasPf = DashUi.kpiTileHasPlanAndFact(tile);
      var planFactShown =
        typeof DashUi.formatKpiTilePlanFactPair === "function"
          ? DashUi.formatKpiTilePlanFactPair(tile.plan, tile.fact, tile.units)
          : DashUi.formatKpiTilePlanFactValue(tile.plan) + "/" + DashUi.formatKpiTilePlanFactValue(tile.fact);
      var factShown =
        typeof DashUi.formatKpiTileFactValueWithUnits === "function"
          ? DashUi.formatKpiTileFactValueWithUnits(tile.fact, tile.units)
          : DashUi.formatKpiTilePlanFactValue(tile.fact);
      var pfPeriod =
        tile.plan_fact_period_label != null
          ? String(tile.plan_fact_period_label).trim()
          : "";

      el.className = "kpi-tile";
      el.style.setProperty("--tile-rag-color", pres.fillColor);
      el.style.setProperty("--tile-front-accent-color", frontAccentColor || pres.fillColor);
      el.style.setProperty(
        "--tile-top-border-color",
        frontAccentColor || (rule && rule.headerColor === "dashboard" ? "var(--navy)" : pres.fillColor)
      );
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-expanded", "false");
      el.setAttribute("data-kpi-tile-index", String(i));
      if (!shouldRenderKpiTileBack(tile)) {
        el.setAttribute("data-no-flip", "1");
      }
      if (!hasPf) {
        el.classList.add("kpi-tile--pct-only");
      }
      if (pendingFocus && !focusApplied && shouldMatchFocus(tile, pendingFocus)) {
        el.classList.add("kpi-tile--focus");
        el.setAttribute("aria-current", "true");
        focusApplied = true;
      }
      el.innerHTML =
        '<div class="kpi-tile-inner">' +
        buildKpiTileFrontFaceHtml(tile, hasPf, planFactShown, factShown, pfPeriod) +
        '<section class="kpi-tile-face kpi-tile-face--back"></section>' +
        "</div>";
      container.appendChild(el);
    });

    if (pendingFocus) {
      clearPendingFocus();
      if (focusApplied) {
        var focusedEl = container.querySelector("article.kpi-tile--focus");
        DashUi.scrollElementIntoViewCentered(focusedEl);
        if (focusedEl) {
          setTimeout(function () {
            focusedEl.classList.remove("kpi-tile--focus");
            focusedEl.removeAttribute("aria-current");
          }, 4000);
        }
      }
    }

    kpiTilesPageIndex = 0;
    updatePagerUI();
  }

  function init(options) {
    mergeContext(options);
    ensurePagerBound();
    updatePagerUI();
  }

  global.DashboardKpiTiles = {
    init: init,
    render: render,
    renderBackFace: renderBackFace,
    syncFlipState: syncFlipState,
    updatePagerUI: updatePagerUI,
    getKpiTileException: getKpiTileException,
    buildKpiTileChildrenHtml: buildKpiTileChildrenHtml,
    buildKpiTileBackFaceHtml: buildKpiTileBackFaceHtml,
    shouldShowKpiTileHelp: shouldShowKpiTileHelp,
    shouldRenderKpiTileBack: shouldRenderKpiTileBack,
    shouldRenderKpiTileBackDepartmentsOnly: shouldRenderKpiTileBackDepartmentsOnly,
  };
})(typeof window !== "undefined" ? window : globalThis);
