(function (global) {
  var KPI_TILES_PER_PAGE = 6;
  var kpiTilesPageIndex = 0;
  var pagerBound = false;
  var dragBound = false;
  var dragFromIndex = null;
  var reorderModeActive = false;
  var pageFlipTimer = null;
  var pageFlipDirection = 0;
  var PAGE_FLIP_EDGE_MS = 420;
  var PAGE_FLIP_PAGER_MS = 220;
  var latestContext = {};

  var KPI_TILE_MSG_GENERATED_DATA = "Данные были сгенерированы";
  var KPI_TILE_TITLE_PLAN_FACT_PERIOD = "Период, за который показаны план и факт";
  var KPI_TILE_ARIA_METRICS_PF = "План, факт и ожидаемый план";

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

  function getTileCacheRefreshState(tile) {
    var fn = getContext().getTileCacheRefreshState;
    var state = typeof fn === "function" ? fn(tile) : null;
    if (state) return state;
    if (tile && tile.cache_refresh_status) {
      return { status: String(tile.cache_refresh_status) };
    }
    return null;
  }

  function formatCacheCooldownRemaining(nextAllowedAt) {
    if (!nextAllowedAt) return "";
    var ts = Date.parse(String(nextAllowedAt));
    if (!isFinite(ts) || isNaN(ts)) return "";
    var remainingMs = ts - Date.now();
    if (remainingMs <= 0) return "";
    var totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return hours + " ч " + minutes + " мин";
    if (hours > 0) return hours + " ч";
    return minutes + " мин";
  }

  function isCacheRefreshCooldownState(state) {
    if (!state || state.status === "running" || state.status === "failed") return false;
    if (String(state.status || "") === "cooldown") return true;
    return !!formatCacheCooldownRemaining(state.next_allowed_at);
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

  function resetKpiTilesPager() {
    kpiTilesPageIndex = 0;
    dragFromIndex = null;
    clearPageFlipTimer();
    setKpiTilesReorderMode(false);
    var container = document.getElementById("kpi-container");
    if (container) {
      finishDragVisuals(container);
    }
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

  function isKpiPctOnlyTile(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.kpiPctOnly);
  }

  function shouldShowKpiTileHelp(tile) {
    return !!tile;
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

  function shouldShowKpiTileBackPlanFact(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.showBackPlanFact);
  }

  function shouldShowKpiTileBackPlanOnly(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backPlanOnly);
  }

  function shouldAllowPartialPlanFact(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.allowPartialPlanFact);
  }

  function shouldHideKpiTilePlanDelta(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && (rule.hidePlanDelta || rule.hidePlanOnTile));
  }

  function shouldHidePlanOnTile(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.hidePlanOnTile);
  }

  function kpiTilePlanFactValuePresent(value) {
    if (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function") {
      return DashUi.kpiTilePlanFactValuePresent(value);
    }
    return value != null && value !== "";
  }

  function getKpiTileHeroPrimaryValue(tile) {
    if (!tile) return null;
    if (!shouldHidePlanOnTile(tile)) return tile.fact;
    if (kpiTilePlanFactValuePresent(tile.fact)) return tile.fact;
    if (kpiTilePlanFactValuePresent(tile.plan)) return tile.plan;
    return tile.fact;
  }

  function resolveKpiTileDisplayUnits(tile) {
    var kid = tile && tile.kpi_id != null ? String(tile.kpi_id).trim().toUpperCase() : "";
    if (kid === "LOG-M2") return "руб.";
    var rule = getKpiTileException(tile);
    var usesPieceCount =
      !!(
        rule &&
        (rule.hidePlanOnTile ||
          rule.defectDirectionsOverview ||
          (rule.qualdirControlOverview && !rule.qualdirControlOverviewOnBack) ||
          rule.backArticlesDeptCount)
      );
    var raw = tile && (tile.units != null ? tile.units : tile.unit);
    var unitText = raw != null ? String(raw).trim() : "";
    if (usesPieceCount) {
      if (!unitText || unitText === "%") return "шт.";
      return unitText;
    }
    return unitText;
  }

  function shouldRenderKpiTileBackDeptAmounts(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backDeptAmounts);
  }

  function shouldRenderKpiTileBackArticlesPlanFact(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backArticlesPlanFact);
  }

  function shouldRenderKpiTileBackArticlesDeptCount(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backArticlesDeptCount);
  }

  function shouldRenderKpiTileBackDefectDirections(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backDefectDirections);
  }

  function shouldRenderQualdirControlOverviewOnBack(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.qualdirControlOverviewOnBack && rule.qualdirControlOverview);
  }

  function buildKpiTileBackQualdirControlSectionHtml(tile) {
    var rule = getKpiTileException(tile);
    if (!shouldRenderQualdirControlOverviewOnBack(tile)) return "";
    var overview = rule.qualdirControlOverview;
    var sectionTitle =
      overview.ariaLabel != null && String(overview.ariaLabel).trim()
        ? String(overview.ariaLabel).trim()
        : "Показатель контроля";
    return (
      '<div class="kpi-tile-back-section kpi-tile-back-section--dual kpi-tile-back-section--qualdir">' +
      '<div class="kpi-tile-back-section-title">' +
      DashUi.escapeHtml(sectionTitle) +
      "</div>" +
      '<div class="kpi-tile-metrics kpi-tile-metrics--tender kpi-tile-metrics--back-overview">' +
      buildKpiTileQualdirControlOverviewHtml(tile, overview) +
      "</div></div>"
    );
  }

  function buildKpiTileBackHeadHtml(tile, code, period) {
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
      "</div></div>"
    );
  }

  function buildKpiTileBackKpiPctSummaryHtml(tile, pres, showHelp, showPercent) {
    if (!showPercent) return "";
    var percentLabel = MockData.formatKpiPercentLabel(pres && pres.percent != null ? pres.percent : null) + "%";
    return (
      '<div class="kpi-tile-back-summary">' +
      '<div class="kpi-tile-back-summary-item kpi-tile-back-summary-item--kpi">' +
      (showHelp ? buildKpiTileHelpButtonHtml() : "") +
      '<span class="kpi-tile-back-summary-label">KPI</span>' +
      '<strong class="kpi-tile-back-kpi-pct">' +
      DashUi.escapeHtml(percentLabel) +
      "</strong></div></div>"
    );
  }

  function buildKpiTileDragHandleHtml() {
    return (
      '<span role="button" tabindex="0" class="kpi-tile-drag-handle" draggable="true" aria-label="Перетащите для изменения порядка плиток" title="Перетащите для изменения порядка">' +
      '<svg class="kpi-tile-drag-handle-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<circle cx="5.5" cy="4" r="1.15" fill="currentColor"/>' +
      '<circle cx="10.5" cy="4" r="1.15" fill="currentColor"/>' +
      '<circle cx="5.5" cy="8" r="1.15" fill="currentColor"/>' +
      '<circle cx="10.5" cy="8" r="1.15" fill="currentColor"/>' +
      '<circle cx="5.5" cy="12" r="1.15" fill="currentColor"/>' +
      '<circle cx="10.5" cy="12" r="1.15" fill="currentColor"/>' +
      "</svg>" +
      "</span>"
    );
  }

  function buildKpiTileHelpButtonHtml() {
    return (
      '<button type="button" class="kpi-tile-help" aria-label="Справка: формула и цветовые пороги показателя" aria-haspopup="dialog" aria-controls="kpi-thresholds-dialog">' +
      '<span class="kpi-tile-help-icon" aria-hidden="true">?</span>' +
      "</button>"
    );
  }

  function buildKpiTileRefreshButtonHtml(tile) {
    var state = getTileCacheRefreshState(tile) || {};
    var status = state.status != null ? String(state.status) : "";
    var isRunning = status === "running";
    var isCooldown = isCacheRefreshCooldownState(state);
    var isFailed = status === "failed";
    var cooldownRemaining = isCooldown ? formatCacheCooldownRemaining(state.next_allowed_at) : "";
    var disabled = isRunning || isCooldown;
    var title = isRunning
      ? "Кэш этой плитки пересчитывается"
      : isCooldown
        ? cooldownRemaining
          ? "Повторный пересчёт будет доступен через " + cooldownRemaining
          : "Повторный пересчёт доступен раз в 6 часов"
        : isFailed
          ? "Повторить пересчёт кэша плитки"
          : "Пересчитать кэш этой плитки";
    return (
      '<button type="button" class="kpi-tile-cache-refresh' +
      (isRunning ? " is-running" : "") +
      (isCooldown ? " is-cooldown" : "") +
      (isFailed ? " is-failed" : "") +
      '" aria-label="' +
      DashUi.escapeHtml(title) +
      '" title="' +
      DashUi.escapeHtml(title) +
      '"' +
      (disabled ? ' disabled aria-disabled="true"' : "") +
      ">" +
      '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
      '<path d="M20 6v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M4 18v-5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M19 11a7 7 0 0 0-12.1-4.8L4 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M5 13a7 7 0 0 0 12.1 4.8L20 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
      "</button>"
    );
  }

  function buildKpiTileCooldownHtml(tile) {
    var state = getTileCacheRefreshState(tile) || {};
    if (!isCacheRefreshCooldownState(state)) return "";
    var remaining = formatCacheCooldownRemaining(state.next_allowed_at);
    if (!remaining) return "";
    return (
      '<p class="kpi-tile-cache-cooldown">' +
      DashUi.escapeHtml("Перекэширование через " + remaining) +
      "</p>"
    );
  }

  function buildKpiTileBadgeRowHtml(tile) {
    var helpHtml = shouldShowKpiTileHelp(tile) ? buildKpiTileHelpButtonHtml() : "";
    return (
      '<div class="kpi-tile-badge-row">' +
      '<span class="badge">' +
      DashUi.escapeHtml(tile.badge) +
      "</span>" +
      '<div class="kpi-tile-badge-controls">' +
      '<div class="kpi-tile-badge-actions">' +
      buildKpiTileRefreshButtonHtml(tile) +
      helpHtml +
      "</div>" +
      buildKpiTileDragHandleHtml() +
      "</div>" +
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

  function hasKpiTileDisplayableMetricValue(tile) {
    if (!tile) return false;
    var keys = ["fact", "plan", "kpi_pct", "kpi_pst", "percent"];
    for (var i = 0; i < keys.length; i++) {
      var value = tile[keys[i]];
      if (value === null || value === undefined || value === "") continue;
      if (typeof value === "number") {
        if (!isNaN(value) && isFinite(value)) return true;
        continue;
      }
      var text = String(value).trim();
      if (text && text !== "—" && text.toLowerCase() !== "nan") return true;
    }
    return false;
  }

  function isKpiTileGeneratedData(tile) {
    if (!tile) return false;
    return tile.generated_data === true || tile.is_generated === true || tile.synthetic_data === true;
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

  function normalizeKpiTileLabelForCompare(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("ru-RU");
  }

  function kpiTileLabelsMatch(left, right) {
    var a = normalizeKpiTileLabelForCompare(left);
    var b = normalizeKpiTileLabelForCompare(right);
    return !!(a && b && a === b);
  }

  function shouldShowKpiTilePlanFactPeriodLabel(tile, pfPeriod) {
    if (!pfPeriod || !String(pfPeriod).trim()) return false;
    if (kpiTileLabelsMatch(pfPeriod, tile && tile.title)) return false;
    if (tile && Array.isArray(tile.plan_fact_rows) && tile.plan_fact_rows.length) {
      for (var i = 0; i < tile.plan_fact_rows.length; i++) {
        var row = tile.plan_fact_rows[i];
        if (row && kpiTileLabelsMatch(pfPeriod, row.label)) return false;
      }
    }
    return true;
  }

  function shouldShowKpiTileGeneratedFlag(tile) {
    if (!tile) return false;
    if (isKpiTileGeneratedData(tile)) return true;
    // has_data: false на бэке = сгенерированные/заглушечные данные, даже если plan/fact заполнены.
    return tile.has_data === false;
  }

  function buildKpiTileBodyHtml(tile, hasPf, pfPeriod) {
    var rule = getKpiTileException(tile);
    var isFactOnly = !!(rule && rule.factOnly);
    var hidePlanOnTile = shouldHidePlanOnTile(tile);
    var isKpiPctOnly = !!(rule && rule.kpiPctOnly);
    var generatedFlag = shouldShowKpiTileGeneratedFlag(tile) ? buildKpiTileGeneratedFlagHtml() : "";
    var periodPrefix =
      rule && rule.periodLabelPrefix != null && String(rule.periodLabelPrefix).trim()
        ? String(rule.periodLabelPrefix).trim() + ": "
        : isFactOnly || hidePlanOnTile
          ? "Факт: "
          : isKpiPctOnly
            ? "KPI: "
            : "План/факт: ";
    var periodTitle =
      rule && rule.periodLabelPrefix != null && String(rule.periodLabelPrefix).trim()
        ? "Период показателя"
        : isFactOnly || hidePlanOnTile
          ? "Период факта"
          : isKpiPctOnly
            ? "Период показателя KPI"
            : KPI_TILE_TITLE_PLAN_FACT_PERIOD;
    var showPfPeriod =
      (hasPf || isFactOnly || hidePlanOnTile || isKpiPctOnly) &&
      shouldShowKpiTilePlanFactPeriodLabel(tile, pfPeriod);
    var periodExtra = showPfPeriod
      ? '<span class="kpi-tile-plan-fact-period" title="' +
        DashUi.escapeHtml(periodTitle) +
        '">' +
        DashUi.escapeHtml(periodPrefix) +
        DashUi.escapeHtml(pfPeriod) +
        "</span>"
      : "";
    var titleText = String(tile.title || "");
    var longTitleClass = titleText.length > 24 ? " is-long-title" : "";
    return (
      '<div class="tile-body">' +
      '<div class="kpi-tile-title-row">' +
      '<h3 class="kpi-tile-title' + longTitleClass + '">' +
      DashUi.escapeHtml(titleText) +
      "</h3>" +
      generatedFlag +
      "</div>" +
      '<p class="period">' +
      DashUi.escapeHtml(tile.period) +
      periodExtra +
      "</p>" +
      buildKpiTileUpdatedAtHtml(tile) +
      buildKpiTileCooldownHtml(tile) +
      "</div>"
    );
  }

  function formatKpiTileMetricValue(value, units) {
    if (typeof DashUi !== "undefined" && DashUi && typeof DashUi.formatKpiTileFactValueWithUnits === "function") {
      return DashUi.formatKpiTileFactValueWithUnits(value, units);
    }
    return DashUi.formatKpiTilePlanFactValue(value);
  }

  function normalizeKpiTileMetricValueForDisplay(tile, value) {
    var rule = getKpiTileException(tile);
    if (rule && rule.zeroGeneratedPlanFact && tile && tile.has_data === false) {
      return 0;
    }
    if (rule && rule.zeroEmptyPlanFact && (value === undefined || value === null || value === "")) {
      return 0;
    }
    return value;
  }

  function readFiniteTileNumber(value) {
    if (value == null || value === "") return null;
    var n = Number(value);
    return isFinite(n) && !isNaN(n) ? n : null;
  }

  function getTileSparklinePoints(tile) {
    var monthly = tile && Array.isArray(tile.monthly_data) ? tile.monthly_data : [];
    if (!monthly.length) return [];
    var points = monthly
      .map(function (point) {
        if (!point || typeof point !== "object") return null;
        var value = point.aggregation === "weighted_delta_amount_div_project_amount"
          ? readFiniteTileNumber(point.kpi_pct != null ? point.kpi_pct : point.display_fact)
          : null;
        if (value == null) value = readFiniteTileNumber(point.fact);
        if (value == null) value = readFiniteTileNumber(point.kpi_pct);
        if (value == null) value = readFiniteTileNumber(point.plan);
        if (value == null) return null;
        return {
          value: value,
          month: readFiniteTileNumber(point.month),
          year: readFiniteTileNumber(point.year),
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        var ay = a.year || 0;
        var by = b.year || 0;
        if (ay !== by) return ay - by;
        return (a.month || 0) - (b.month || 0);
      });
    var latestYear = null;
    for (var i = points.length - 1; i >= 0; i--) {
      if (points[i].year) {
        latestYear = points[i].year;
        break;
      }
    }
    if (latestYear != null) {
      points = points.filter(function (point) { return point.year === latestYear; });
    }
    return points.slice(-12);
  }

  function shouldRenderTileSparkBars(tile, points) {
    if (!points || !points.length) return false;
    var units = String((tile && tile.units) || "").toLowerCase();
    if (units.indexOf("%") !== -1) return false;
    return points.every(function (point) {
      return point.value >= 0;
    });
  }

  function buildKpiTileSparklineHtml(tile) {
    var points = getTileSparklinePoints(tile);
    if (points.length < 2) return "";
    var values = points.map(function (point) { return point.value; });
    var min = Math.min.apply(Math, values);
    var max = Math.max.apply(Math, values);
    var range = max - min || 1;
    if (shouldRenderTileSparkBars(tile, points)) {
      var maxAbs = Math.max.apply(Math, values.map(function (value) { return Math.abs(value); })) || 1;
      return (
        '<div class="kpi-tile-spark kpi-tile-spark--bars" aria-hidden="true">' +
        points
          .map(function (point) {
            var h = Math.max(12, Math.round((Math.abs(point.value) / maxAbs) * 100));
            return '<span class="kpi-tile-spark-bar" style="height:' + h + '%"></span>';
          })
          .join("") +
        "</div>"
      );
    }
    var width = 126;
    var height = 32;
    var step = points.length > 1 ? width / (points.length - 1) : width;
    var d = points
      .map(function (point, index) {
        var x = Math.round(index * step * 10) / 10;
        var y = Math.round((height - ((point.value - min) / range) * (height - 4) - 2) * 10) / 10;
        return (index === 0 ? "M" : "L") + x + " " + y;
      })
      .join(" ");
    return (
      '<svg class="kpi-tile-spark kpi-tile-spark--line" viewBox="0 0 ' +
      width +
      " " +
      height +
      '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="kpi-tile-spark-line-path" d="' +
      DashUi.escapeHtml(d) +
      '"></path></svg>'
    );
  }

  function splitKpiTileValueAndUnit(text, fallbackUnits) {
    var raw = String(text == null ? "" : text).trim();
    if (!raw || raw === "—") return { value: "—", unit: "" };
    var units = String(fallbackUnits || "").trim();
    if (units && raw.toLowerCase().endsWith(units.toLowerCase())) {
      return {
        value: raw.slice(0, raw.length - units.length).trim(),
        unit: units,
      };
    }
    var match = raw.match(/^(.+?)\s+(млн\.?\s*руб\.?|млрд\.?\s*руб\.?|тыс\.?\s*руб\.?|руб\.?|поставок|шт\.?|%|чел\.)$/i);
    if (match) return { value: match[1].trim(), unit: match[2].trim() };
    return { value: raw, unit: "" };
  }

  function buildKpiTilePlanDeltaHtml(tile, factNum, planNum) {
    if (shouldHideKpiTilePlanDelta(tile)) return "";
    var units = String((tile && tile.units) || "").trim();
    var kpiPct = readFiniteTileNumber(tile && (tile.kpi_pct != null ? tile.kpi_pct : tile.percent));
    var text = "";
    // Отклонение KPI (LOG-M2 и др.): всегда (факт−план)/план в %, не «п.п.» от сырых сумм.
    if (tile && tile.kpi_pct_is_deviation && kpiPct != null) {
      var signDev = kpiPct > 0 ? "+" : "";
      text =
        signDev +
        (Math.round(kpiPct * 100) / 100).toLocaleString("ru-RU", {
          maximumFractionDigits: 2,
        }) +
        "%";
    } else if (units === "%" && factNum != null && planNum != null) {
      var pp = factNum - planNum;
      var signPp = pp > 0 ? "+" : "";
      text = signPp + (Math.round(pp * 100) / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " п.п.";
    } else if (kpiPct != null) {
      var delta = kpiPct - 100;
      var sign = delta > 0 ? "+" : "";
      text =
        sign +
        (Math.round(delta * 100) / 100).toLocaleString("ru-RU", {
          maximumFractionDigits: 2,
        }) +
        "%";
    } else if (factNum != null && planNum != null && Math.abs(planNum) > 0) {
      var deltaPct = ((factNum - planNum) / Math.abs(planNum)) * 100;
      var signPct = deltaPct > 0 ? "+" : "";
      text = signPct + Math.round(deltaPct) + "%";
    }
    if (!text) return "";
    return (
      '<span class="kpi-tile-plan-delta">' +
      '<span class="kpi-tile-plan-delta-main">' +
      DashUi.escapeHtml(text) +
      '</span><span class="kpi-tile-plan-delta-sub">к плану</span></span>'
    );
  }

  function buildKpiTilePlanFactHeroHtml(tile) {
    var hidePlanOnTile = shouldHidePlanOnTile(tile);
    var heroValue = hidePlanOnTile ? getKpiTileHeroPrimaryValue(tile) : tile && tile.fact;
    var fact = normalizeKpiTileMetricValueForDisplay(tile, heroValue);
    var plan = normalizeKpiTileMetricValueForDisplay(tile, tile && tile.plan);
    var expected = normalizeKpiTileMetricValueForDisplay(tile, tile && tile.expected_plan);
    var units = resolveKpiTileDisplayUnits(tile);
    var factHtml = formatKpiTileMetricValue(fact, units);
    var planHtml = formatKpiTileMetricValue(plan, units);
    var expectedHtml = formatKpiTileMetricValue(expected, units);
    var factParts = splitKpiTileValueAndUnit(factHtml, units);
    var planParts = splitKpiTileValueAndUnit(planHtml, units);
    var expectedParts = splitKpiTileValueAndUnit(expectedHtml, units);
    var factNum = readFiniteTileNumber(fact);
    var planNum = readFiniteTileNumber(plan);
    var deltaHtml = hidePlanOnTile ? "" : buildKpiTilePlanDeltaHtml(tile, factNum, planNum);
    var hasExpected =
      !hidePlanOnTile &&
      (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
        ? DashUi.kpiTilePlanFactValuePresent(expected)
        : expected != null);
    var bottomNumbersHtml = "";
    if (!hidePlanOnTile) {
      bottomNumbersHtml =
        '<div class="kpi-tile-modern-numbers">' +
        '<div class="kpi-tile-modern-number-row"><span>План</span><strong>' +
        DashUi.escapeHtml(planParts.value + (planParts.unit ? " " + planParts.unit : "")) +
        "</strong></div>" +
        (hasExpected
          ? '<div class="kpi-tile-modern-number-row"><span>Ожидаемо</span><strong>' +
            DashUi.escapeHtml(expectedParts.value + (expectedParts.unit ? " " + expectedParts.unit : "")) +
            "</strong></div>"
          : "") +
        "</div>";
    }
    return (
      '<div class="kpi-tile-modern-metrics' +
      (hidePlanOnTile ? " kpi-tile-modern-metrics--fact-only" : "") +
      '">' +
      '<div class="kpi-tile-modern-value-row">' +
      '<strong class="kpi-tile-modern-value">' +
      '<span class="kpi-tile-modern-value-number">' +
      DashUi.escapeHtml(factParts.value) +
      '</span>' +
      (factParts.unit ? '<span class="kpi-tile-modern-value-unit">' + DashUi.escapeHtml(factParts.unit) + "</span>" : "") +
      "</strong>" +
      deltaHtml +
      "</div>" +
      buildKpiTileSparklineHtml(tile) +
      bottomNumbersHtml +
      "</div>"
    );
  }

  function buildKpiTileSplitMetricHtml(label, value, unit) {
    return (
      '<span class="kpi-tile-pf-mini">' +
      '<span>' +
      DashUi.escapeHtml(label) +
      '</span><strong>' +
      DashUi.escapeHtml(formatKpiTileMetricValue(value, unit)) +
      "</strong></span>"
    );
  }

  function getKpiTileSplitRowMetrics(row, unit, tile) {
    var metrics = [];
    if (row && Array.isArray(row.metrics)) metrics = row.metrics;
    if (!metrics.length && row && Array.isArray(row.values)) metrics = row.values;
    if (metrics.length) {
      return metrics
        .filter(function (item) { return item && typeof item === "object"; })
        .map(function (item) {
          return {
            label: item.label != null ? String(item.label) : "",
            value: normalizeKpiTileMetricValueForDisplay(tile, item.value),
            unit: item.unit || item.units || unit,
          };
        })
        .filter(function (item) { return item.label || item.value != null; })
        .slice(0, 3);
    }

    var result = [
      { label: "План", value: normalizeKpiTileMetricValueForDisplay(tile, row && row.plan), unit: unit },
      { label: "Факт", value: normalizeKpiTileMetricValueForDisplay(tile, row && row.fact), unit: unit },
    ];
    if (row && row.expected_plan != null) {
      result.push({ label: "Ожид.", value: normalizeKpiTileMetricValueForDisplay(tile, row.expected_plan), unit: unit });
    } else if (row && row.forecast != null) {
      result.push({ label: "Прогноз", value: normalizeKpiTileMetricValueForDisplay(tile, row.forecast), unit: unit });
    } else if (row && row.third_value != null) {
      result.push({
        label: row.third_label != null ? String(row.third_label) : "Доп.",
        value: normalizeKpiTileMetricValueForDisplay(tile, row.third_value),
        unit: unit,
      });
    }
    return result.filter(function (item) { return item.value != null && item.value !== ""; }).slice(0, 3);
  }

  function buildKpiTilePlanFactStackHtml(tile) {
    if (tile && Array.isArray(tile.plan_fact_rows) && tile.plan_fact_rows.length) {
      var customRows = tile.plan_fact_rows
        .map(function (row) {
          var unit = row && (row.unit || row.units) ? String(row.unit || row.units) : tile.units;
          var metrics = getKpiTileSplitRowMetrics(row, unit, tile);
          var metricsClass = metrics.length >= 3 ? " kpi-tile-pf-value-number--triple" : "";
          var rowLabel = row && row.label != null ? String(row.label) : "";
          var rowLabelHtml = kpiTileLabelsMatch(rowLabel, tile && tile.title)
            ? ""
            : '<span class="kpi-tile-pf-value-label">' + DashUi.escapeHtml(rowLabel) + "</span>";
          return (
            '<div class="kpi-tile-pf-value-row kpi-tile-pf-value-row--split">' +
            rowLabelHtml +
            '<span class="kpi-tile-pf-value-number kpi-tile-pf-value-number--split' +
            metricsClass +
            '">' +
            metrics
              .map(function (metric) {
                return buildKpiTileSplitMetricHtml(metric.label, metric.value, metric.unit || unit);
              })
              .join("") +
            "</span></div>"
          );
        })
        .join("");
      return (
        '<div class="kpi-tile-pf-stack kpi-tile-pf-stack--split">' +
        '<div class="kpi-tile-pf-list kpi-tile-pf-list--split">' +
        customRows +
        "</div></div>"
      );
    }
    return buildKpiTilePlanFactHeroHtml(tile);
  }

  function buildKpiTilePlanFactStackRowsHtml(tile) {
    var rows = [
      { label: "План", value: tile && tile.plan },
      { label: "Факт", value: tile && tile.fact },
    ];
    var hasExpected =
      typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
        ? DashUi.kpiTilePlanFactValuePresent(tile && tile.expected_plan)
        : tile && tile.expected_plan != null;
    if (hasExpected) {
      rows.push({ label: "Ожидаемо", value: tile.expected_plan });
    }
    var html = rows
      .map(function (row) {
        return (
          '<div class="kpi-tile-pf-value-row">' +
          '<span class="kpi-tile-pf-value-label">' +
          DashUi.escapeHtml(row.label) +
          '</span><span class="kpi-tile-pf-value-number">' +
          DashUi.escapeHtml(formatKpiTileMetricValue(normalizeKpiTileMetricValueForDisplay(tile, row.value), tile && tile.units)) +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<div class="kpi-tile-pf-stack">' +
      '<div class="kpi-tile-pf-list">' +
      html +
      "</div></div>"
    );
  }

  function buildKpiTileFactOnlyHtml(factShown) {
    var parts = splitKpiTileValueAndUnit(factShown, "");
    return (
      '<div class="kpi-tile-fact-only">' +
      '<strong><span class="kpi-tile-fact-only-number">' +
      DashUi.escapeHtml(parts.value) +
      '</span>' +
      (parts.unit ? '<span class="kpi-tile-fact-only-unit">' + DashUi.escapeHtml(parts.unit) + '</span>' : '') +
      '</strong><span>Факт</span></div>'
    );
  }

  function buildKpiTileFactOnlyRowHtml(tile) {
    return (
      '<div class="kpi-tile-pf-stack">' +
      '<div class="kpi-tile-pf-list">' +
      '<div class="kpi-tile-pf-value-row">' +
      '<span class="kpi-tile-pf-value-label">Факт</span>' +
      '<span class="kpi-tile-pf-value-number">' +
      DashUi.escapeHtml(formatKpiTileMetricValue(tile && tile.fact, tile && tile.units)) +
      "</span></div></div></div>"
    );
  }

  function buildKpiTileKpiPctOnlyHtml(pctShown, normLabel) {
    var normHtml = normLabel
      ? '<span class="kpi-tile-pf-norm">' + DashUi.escapeHtml(normLabel) + '</span>'
      : '';
    return (
      '<div class="kpi-tile-pf-stack">' +
      '<div class="kpi-tile-pf-inline">' +
      '<div class="kpi-tile-pf-inline-row">' +
      '<span class="kpi-tile-pf-pill">' +
      DashUi.escapeHtml(pctShown) +
      '</span><span class="kpi-tile-pf-inline-label">KPI</span>' +
      normHtml +
      '</div></div></div>'
    );
  }

  function buildKpiTileNoDataHtml(tile) {
    var message = tile && tile.has_data === false
      ? "Нет данных из источника"
      : "Нет данных";
    return (
      '<div class="kpi-tile-no-data">' +
      '<span class="kpi-tile-no-data-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" focusable="false">' +
      '<path d="M5 19V9m5 10V5m5 14v-7m5 7V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M3.5 21h17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      "</svg></span>" +
      '<strong>Нет данных</strong>' +
      '<span>' +
      DashUi.escapeHtml(message === "Нет данных из источника" ? "Нет данных из источника" : "Данные появятся после обновления источника") +
      "</span></div>"
    );
  }

  function formatKpiTileMoneyShort(value) {
    var n = Number(value);
    if (!isFinite(n) || isNaN(n)) return "—";
    if (typeof DashUi !== "undefined" && DashUi && typeof DashUi.formatKpiTilePlanFactValue === "function") {
      return DashUi.formatKpiTilePlanFactValue(n);
    }
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + " млрд";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + " млн";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + " тыс";
    return String(Math.round(n));
  }

  function formatKpiTileMoneyShortWithUnits(value, units) {
    var text = formatKpiTileMoneyShort(value);
    var unitsText = units != null ? String(units).trim() : "";
    if (!unitsText || text === "—") return text;
    return text + " " + unitsText;
  }

  function formatKpiTileMillionsNumber(value) {
    var n = Number(value);
    if (!isFinite(n) || isNaN(n)) return "—";
    return (Math.round((n / 1e6) * 10) / 10).toString().replace(".", ",");
  }

  function formatKpiTileMillionsPlanFactPair(plan, fact) {
    return (
      formatKpiTileMillionsNumber(plan) +
      " / " +
      formatKpiTileMillionsNumber(fact) +
      " млн. руб."
    );
  }

  function formatKpiTilePlainNumber(value) {
    if (value == null || value === "") return "—";
    var n = Number(value);
    if (!isFinite(n) || isNaN(n)) return "—";
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: Math.abs(n - Math.round(n)) < 0.000001 ? 0 : 2,
    }).format(n);
  }

  function formatKpiTilePlanFactPairByUnit(plan, fact, unit) {
    var normalizedUnit = String(unit || "").trim().toLowerCase();
    if (normalizedUnit === "шт." || normalizedUnit === "шт") {
      return formatKpiTilePlainNumber(plan) + " / " + formatKpiTilePlainNumber(fact) + " шт.";
    }
    return formatKpiTileMillionsPlanFactPair(plan, fact);
  }

  function formatKpiTileProductionMoney(value) {
    var text = formatKpiTileMoneyShort(value);
    return text === "—" ? text : text + " руб.";
  }

  function formatKpiTileProductionQty(value) {
    var text = formatKpiTilePlainNumber(value);
    return text === "—" ? text : text + " шт.";
  }

  function formatKpiTileRatioPercent(value) {
    if (value == null || value === "") return "—";
    var n = Number(value);
    if (!isFinite(n) || isNaN(n)) return "—";
    var abs = Math.abs(n);
    var digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return n.toFixed(digits) + "%";
  }

  function computeKpiTileRatioPercent(numerator, denominator) {
    var num = Number(numerator);
    var den = Number(denominator);
    if (!isFinite(num) || isNaN(num) || !isFinite(den) || isNaN(den) || den <= 0) return null;
    return (num / den) * 100;
  }

  function readKpiTileRatioNumber(tile, key) {
    if (!tile || tile[key] == null || tile[key] === "") return 0;
    var n = Number(tile[key]);
    return isFinite(n) && !isNaN(n) ? n : 0;
  }

  function buildKpiTileDualRatioOverviewHtml(tile) {
    var dzClient = readKpiTileRatioNumber(tile, "dz_client");
    var kzClient = readKpiTileRatioNumber(tile, "kz_client");
    var dzSupplier = readKpiTileRatioNumber(tile, "dz_supplier");
    var kzSupplier = readKpiTileRatioNumber(tile, "kz_supplier");
    var dzTotal = readKpiTileRatioNumber(tile, "dz_total");
    var kzTotal = readKpiTileRatioNumber(tile, "kz_total");
    if (!dzTotal && !kzTotal) {
      dzTotal = dzClient + dzSupplier;
      kzTotal = kzClient + kzSupplier;
    }

    var pctClient =
      tile && tile.pct_client != null && !isNaN(Number(tile.pct_client))
        ? Number(tile.pct_client)
        : computeKpiTileRatioPercent(dzClient, kzClient);
    var pctSupplier =
      tile && tile.pct_supplier != null && !isNaN(Number(tile.pct_supplier))
        ? Number(tile.pct_supplier)
        : computeKpiTileRatioPercent(dzSupplier, kzSupplier);
    var pctTotal =
      tile && tile.pct_total != null && !isNaN(Number(tile.pct_total))
        ? Number(tile.pct_total)
        : computeKpiTileRatioPercent(dzTotal, kzTotal);

    function cell(label, pct) {
      return (
        '<div class="kpi-tile-dual-ratio-cell">' +
        '<span class="kpi-tile-dual-ratio-label">' + DashUi.escapeHtml(label) + "</span>" +
        '<span class="kpi-tile-dual-ratio-value">' +
        DashUi.escapeHtml(formatKpiTileRatioPercent(pct)) +
        "</span></div>"
      );
    }

    return (
      '<div class="kpi-tile-dual-ratio" role="group" aria-label="Соотношение ДЗ и КЗ">' +
      cell("Общее", pctTotal) +
      cell("Клиенты", pctClient) +
      cell("Поставщики", pctSupplier) +
      "</div>"
    );
  }

  function buildKpiTileDualRatioAmountsHtml(tile) {
    var dzClient = readKpiTileRatioNumber(tile, "dz_client");
    var kzClient = readKpiTileRatioNumber(tile, "kz_client");
    var dzSupplier = readKpiTileRatioNumber(tile, "dz_supplier");
    var kzSupplier = readKpiTileRatioNumber(tile, "kz_supplier");
    var dzTotal = readKpiTileRatioNumber(tile, "dz_total");
    var kzTotal = readKpiTileRatioNumber(tile, "kz_total");
    if (!dzTotal && !kzTotal) {
      dzTotal = dzClient + dzSupplier;
      kzTotal = kzClient + kzSupplier;
    }

    function cell(label, value) {
      return (
        '<div class="kpi-tile-dual-amounts-cell">' +
        '<span class="kpi-tile-dual-amounts-label">' + DashUi.escapeHtml(label) + "</span>" +
        '<span class="kpi-tile-dual-amounts-value">' +
        DashUi.escapeHtml(formatKpiTileMoneyShort(value)) +
        "</span></div>"
      );
    }

    return (
      '<div class="kpi-tile-dual-amounts" role="group" aria-label="ДЗ и КЗ: суммы">' +
      '<div class="kpi-tile-dual-amounts-group">' +
      '<div class="kpi-tile-dual-amounts-group-title">Клиенты</div>' +
      cell("ДЗ", dzClient) +
      cell("КЗ", kzClient) +
      "</div>" +
      '<div class="kpi-tile-dual-amounts-group">' +
      '<div class="kpi-tile-dual-amounts-group-title">Поставщики</div>' +
      cell("ДЗ", dzSupplier) +
      cell("КЗ", kzSupplier) +
      "</div>" +
      '<div class="kpi-tile-dual-amounts-group">' +
      '<div class="kpi-tile-dual-amounts-group-title">Общее</div>' +
      cell("ДЗ", dzTotal) +
      cell("КЗ", kzTotal) +
      "</div>" +
      "</div>"
    );
  }

  function buildKpiTilePortfolioAmountsHtml(tile) {
    var plan =
      tile && tile.portfolio_count != null
        ? readKpiTileRatioNumber(tile, "portfolio_count")
        : readKpiTileRatioNumber(tile, "plan");
    var deviation =
      tile && tile.deviation_count != null
        ? readKpiTileRatioNumber(tile, "deviation_count")
        : readKpiTileRatioNumber(tile, "fact");

    function cell(label, value) {
      return (
        '<div class="kpi-tile-dual-amounts-cell">' +
        '<span class="kpi-tile-dual-amounts-label">' + DashUi.escapeHtml(label) + "</span>" +
        '<span class="kpi-tile-dual-amounts-value">' +
        DashUi.escapeHtml(DashUi.formatKpiTilePlanFactValue(value)) +
        "</span></div>"
      );
    }

    return (
      '<div class="kpi-tile-dual-amounts" role="group" aria-label="Портфель проектов: план и отклонения">' +
      '<div class="kpi-tile-dual-amounts-group">' +
      '<div class="kpi-tile-dual-amounts-group-title">Портфель за период</div>' +
      cell("План", plan) +
      cell("Отклонения по вехам", deviation) +
      "</div>" +
      "</div>"
    );
  }

  function buildKpiTileYearCompareAmountsHtml(tile) {
    var previousYearValue = readKpiTileRatioNumber(tile, "plan");
    var currentYearValue = readKpiTileRatioNumber(tile, "fact");
    var unitsText =
      typeof formatKpiTileMoneyShortWithUnits === "function"
        ? function (value) { return formatKpiTileMoneyShortWithUnits(value, "руб."); }
        : function (value) { return DashUi.formatKpiTilePlanFactValue(value) + " руб."; };

    function cell(label, value) {
      return (
        '<div class="kpi-tile-dual-amounts-cell">' +
        '<span class="kpi-tile-dual-amounts-label">' + DashUi.escapeHtml(label) + "</span>" +
        '<span class="kpi-tile-dual-amounts-value">' +
        DashUi.escapeHtml(unitsText(value)) +
        "</span></div>"
      );
    }

    return (
      '<div class="kpi-tile-dual-amounts kpi-tile-dual-amounts--single kpi-tile-dual-amounts--year-compare" role="group" aria-label="Рост отгрузок: текущий и прошлый год">' +
      '<div class="kpi-tile-dual-amounts-group">' +
      cell("Текущий год", currentYearValue) +
      cell("Прошлый год", previousYearValue) +
      "</div>" +
      "</div>"
    );
  }

  function buildKpiTileBreakdownRows(tile) {
    var rows = [];
    var departments =
      tile && Array.isArray(tile.defect_direction_departments) ? tile.defect_direction_departments : [];
    if (departments.length) {
      departments.forEach(function (item) {
        if (!item || typeof item !== "object") return;
        var label =
          item.name != null && String(item.name).trim() !== ""
            ? String(item.name).trim()
            : item.direction_label != null && String(item.direction_label).trim() !== ""
              ? String(item.direction_label).trim()
              : "—";
        var count = Number(item.count);
        rows.push({
          label: label,
          value: isFinite(count) && !isNaN(count) ? Math.round(count) : 0,
        });
      });
      return rows;
    }
    return rows;
  }

  function resolveQualdirControlFieldForTile(tile, fieldName, lastFullMonthOnly) {
    if (!tile || !fieldName) return undefined;
    if (Object.prototype.hasOwnProperty.call(tile, fieldName)) {
      return tile[fieldName];
    }
    if (!lastFullMonthOnly) return undefined;
    var periodState =
      typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function"
        ? DashboardMonthNav.getPeriodState()
        : null;
    var year =
      periodState && periodState.currentPeriodYear != null ? Number(periodState.currentPeriodYear) : null;
    var month =
      periodState && periodState.currentPeriodMonth != null ? Number(periodState.currentPeriodMonth) : null;
    var lfm = tile.last_full_month_row;
    if (!lfm || typeof lfm !== "object" || year == null || month == null || isNaN(year) || isNaN(month)) {
      return undefined;
    }
    if (
      Number(lfm.year) === year &&
      Number(lfm.month) === month &&
      Object.prototype.hasOwnProperty.call(lfm, fieldName)
    ) {
      return lfm[fieldName];
    }
    return undefined;
  }

  function buildKpiTileQualdirControlOverviewHtml(tile, overviewRule) {
    function readCount(value) {
      if (value == null || value === "") return 0;
      var n = Number(value);
      return isNaN(n) ? 0 : Math.round(n);
    }
    function cell(label, value, unit) {
      var shown =
        unit != null && String(unit).trim()
          ? formatKpiTileMetricValue(value, unit)
          : String(readCount(value));
      return (
        '<div class="kpi-tile-tender-cell">' +
        '<span class="kpi-tile-tender-label">' + DashUi.escapeHtml(label) + "</span>" +
        '<span class="kpi-tile-tender-value">' + DashUi.escapeHtml(shown) + "</span>" +
        "</div>"
      );
    }

    if (!overviewRule || !Array.isArray(overviewRule.rows) || !overviewRule.rows.length) {
      return "";
    }

    var units = tile && tile.units != null ? String(tile.units).trim() : "шт.";
    var ariaLabel =
      overviewRule.ariaLabel != null && String(overviewRule.ariaLabel).trim()
        ? String(overviewRule.ariaLabel).trim()
        : "Показатель контроля";
    var html =
      '<div class="kpi-tile-tender-grid" role="group" aria-label="' + DashUi.escapeHtml(ariaLabel) + '">';

    overviewRule.rows.forEach(function (row) {
      if (!row || !row.field) return;
      var value;
      if (row.lastFullMonthOnly) {
        value = resolveQualdirControlFieldForTile(tile, row.field, true);
        if (value === undefined) return;
      } else if (row.field === "fact") {
        value = tile && tile.fact;
      } else if (row.field === "plan") {
        value = tile && tile.plan;
      } else {
        value = tile && tile[row.field];
      }
      html += cell(row.label || row.field, readCount(value), row.useUnits ? units : null);
    });

    return html + "</div>";
  }

  function buildKpiTileDefectDirectionsOverviewHtml(tile) {
    function readCount(value) {
      if (value == null || value === "") return 0;
      var n = Number(value);
      return isNaN(n) ? 0 : Math.round(n);
    }
    function cell(label, value) {
      return (
        '<div class="kpi-tile-tender-cell">' +
        '<span class="kpi-tile-tender-label">' + DashUi.escapeHtml(label) + "</span>" +
        '<span class="kpi-tile-tender-value">' + DashUi.escapeHtml(String(value)) + "</span>" +
        "</div>"
      );
    }

    var total = readCount(tile && tile.fact);
    var breakdown = buildKpiTileBreakdownRows(tile);
    var units = resolveKpiTileDisplayUnits(tile) || "шт.";
    var ariaLabel =
      tile && String(tile.kpi_id || "").trim().toUpperCase() === "QD-M1"
        ? "Показатель по подразделениям"
        : "Брак и рекламации по направлениям";
    var html =
      '<div class="kpi-tile-tender-grid" role="group" aria-label="' + DashUi.escapeHtml(ariaLabel) + '">' +
      cell("Всего", formatKpiTileMetricValue(total, units));

    breakdown.forEach(function (item) {
      html += cell(item.label, formatKpiTileMetricValue(item.value, units));
    });
    return html + "</div>";
  }

  function buildKpiTileTenderStatusOverviewHtml(tile) {
    function readCount(key) {
      var v = tile && tile[key];
      if (v == null || v === "") return 0;
      var n = Number(v);
      return isNaN(n) ? 0 : Math.round(n);
    }
    var foundN = readCount("found");
    if (!foundN && tile && tile.plan != null) foundN = readCount("plan");
    var notPartN = readCount("not_participating");
    var wonN = readCount("won");
    if (!wonN && tile && tile.fact != null) wonN = readCount("fact");
    function cell(label, value) {
      return (
        '<div class="kpi-tile-tender-cell">' +
        '<span class="kpi-tile-tender-label">' + DashUi.escapeHtml(label) + '</span>' +
        '<span class="kpi-tile-tender-value">' + DashUi.escapeHtml(String(value)) + '</span>' +
        '</div>'
      );
    }
    return (
      '<div class="kpi-tile-tender-grid" role="group" aria-label="Статусы тендеров">' +
      cell("Найдено", foundN) +
      cell("Не участвуем", notPartN) +
      cell("Выиграно", wonN) +
      '</div>'
    );
  }

  function buildKpiTileTenderDepartmentsHtml(tile) {
    var rows = tile && Array.isArray(tile.tender_departments) ? tile.tender_departments : [];
    if (!rows.length) {
      return '<div class="kpi-tile-back-message">Нет данных по отделам.</div>';
    }

    function num(value) {
      var n = Number(value);
      return isNaN(n) ? null : n;
    }
    function ragFromPct(value) {
      if (value == null) return "red";
      if (value < 90) return "red";
      if (value <= 100) return "yellow";
      return "green";
    }
    function count(value) {
      var n = num(value);
      return n == null ? 0 : Math.round(n);
    }
    function metric(label, value) {
      return (
        '<span class="kpi-tile-tender-dept-status">' +
        '<small>' + DashUi.escapeHtml(label) + "</small>" +
        '<strong>' + DashUi.escapeHtml(String(value)) + "</strong>" +
        "</span>"
      );
    }

    return (
      '<div class="kpi-tile-children-list kpi-tile-children-list--tenders">' +
      rows
        .map(function (row) {
          var name = row && (row.department || row.name || row.dept_name) ? String(row.department || row.name || row.dept_name) : "Отдел";
          var plan = count(row && (row.plan != null ? row.plan : row.found));
          var fact = count(row && (row.fact != null ? row.fact : row.won));
          var notParticipating = count(row && row.not_participating);
          var pct = num(row && row.pct);
          var pctText = pct == null ? "—" : DashUi.formatKpiTilePlanFactValue(pct) + "%";
          var rag = ragFromPct(pct);
          var progress = pct == null ? 0 : Math.max(0, Math.min(100, pct));
          return (
            '<div class="kpi-tile-child-item kpi-tile-child-item--static kpi-tile-tender-dept kpi-tile-tender-dept--' + rag + '">' +
            '<span class="kpi-tile-child-dot rag-dot rag-' + rag + '"></span>' +
            '<span class="kpi-tile-child-name">' + DashUi.escapeHtml(name) + "</span>" +
            '<span class="kpi-tile-tender-dept-metrics">' +
            '<strong class="kpi-tile-tender-dept-pct">' + DashUi.escapeHtml(pctText) + "</strong>" +
            '<small class="kpi-tile-tender-dept-count">выиграно / всего</small>' +
            "</span>" +
            '<span class="kpi-tile-tender-dept-statuses">' +
            metric("Найдено", plan) +
            metric("Не участвуем", notParticipating) +
            metric("Выиграно", fact) +
            "</span>" +
            '<span class="kpi-tile-tender-dept-bar" aria-hidden="true"><span style="width: ' + progress + '%"></span></span>' +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function buildKpiTileProjectDeviationsHtml(tile) {
    var rows = tile && Array.isArray(tile.project_deviation_rows) ? tile.project_deviation_rows : [];
    if (!rows.length && tile && Array.isArray(tile.monthly_data) && tile.monthly_data.length) {
      var periodState =
        typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function"
          ? DashboardMonthNav.getPeriodState()
          : null;
      var targetYear = periodState && periodState.currentPeriodYear != null ? Number(periodState.currentPeriodYear) : null;
      var targetMonth = periodState && periodState.currentPeriodMonth != null ? Number(periodState.currentPeriodMonth) : null;
      var point = null;
      if (targetYear != null && targetMonth != null && !isNaN(targetYear) && !isNaN(targetMonth)) {
        for (var p = 0; p < tile.monthly_data.length; p++) {
          var candidate = tile.monthly_data[p];
          if (!candidate) continue;
          if (Number(candidate.year) === targetYear && Number(candidate.month) === targetMonth) {
            point = candidate;
            break;
          }
        }
      }
      if (!point) point = tile.monthly_data[tile.monthly_data.length - 1];
      rows = point && Array.isArray(point.project_deviation_rows) ? point.project_deviation_rows : [];
    }
    if (!rows.length) {
      return '<div class="kpi-tile-back-message">Нет данных по проектам.</div>';
    }
    var threshold = readFiniteTileNumber(tile && tile.max_allowed_delay_workdays);
    if (threshold == null) threshold = 10;
    return (
      '<div class="kpi-tile-project-list">' +
      rows
        .map(function (row) {
          var delay = readFiniteTileNumber(row && row.delay_workdays);
          if (delay == null) delay = 0;
          var isDelayed = !!(row && row.is_deviated) || delay >= threshold;
          var projectName = row && row.project_name != null && String(row.project_name).trim()
            ? String(row.project_name).trim()
            : "Без названия";
          var manager = row && row.project_manager != null && String(row.project_manager).trim()
            ? String(row.project_manager).trim()
            : "РП не указан";
          return (
            '<article class="kpi-tile-project-row' + (isDelayed ? " is-delayed" : "") + '">' +
            '<div class="kpi-tile-project-main">' +
            '<strong>' + DashUi.escapeHtml(projectName) + "</strong>" +
            '<span>РП: ' + DashUi.escapeHtml(manager) + "</span>" +
            "</div>" +
            '<div class="kpi-tile-project-delay">' +
            "<span>Отклонение</span>" +
            '<strong>' + DashUi.escapeHtml(String(Math.round(delay)) + " р.д.") + "</strong>" +
            "</div>" +
            "</article>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function buildKpiTileMetricsSectionHtml(tile, hasPf, planFactShown, factShown, planFactLabel) {
    var rule = getKpiTileException(tile);
    var hasPartialPf =
      !!(rule && rule.allowPartialPlanFact) &&
      (
        (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
          ? DashUi.kpiTilePlanFactValuePresent(tile && tile.plan)
          : tile && tile.plan != null) ||
        (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
          ? DashUi.kpiTilePlanFactValuePresent(tile && tile.fact)
          : tile && tile.fact != null)
      );
    var hasCustomPlanFactRows = !!(tile && Array.isArray(tile.plan_fact_rows) && tile.plan_fact_rows.length);
    if (rule && rule.dualRatioOverview) {
      return (
        '<div class="kpi-tile-metrics kpi-tile-metrics--dual-ratio" aria-label="Соотношение ДЗ и КЗ">' +
        buildKpiTileDualRatioOverviewHtml(tile) +
        "</div>"
      );
    }
    if (rule && rule.tenderStatusOverview) {
      return (
        '<div class="kpi-tile-metrics kpi-tile-metrics--tender" aria-label="Сводка тендеров">' +
        buildKpiTileTenderStatusOverviewHtml(tile) +
        "</div>"
      );
    }
    if (rule && rule.defectDirectionsOverview) {
      return (
        '<div class="kpi-tile-metrics kpi-tile-metrics--tender" aria-label="Брак и рекламации по направлениям">' +
        buildKpiTileDefectDirectionsOverviewHtml(tile) +
        "</div>"
      );
    }
    if (rule && rule.qualdirControlOverview && !rule.qualdirControlOverviewOnBack) {
      return (
        '<div class="kpi-tile-metrics kpi-tile-metrics--tender" aria-label="' +
        DashUi.escapeHtml(
          rule.qualdirControlOverview.ariaLabel != null
            ? String(rule.qualdirControlOverview.ariaLabel)
            : "Показатель контроля"
        ) +
        '">' +
        buildKpiTileQualdirControlOverviewHtml(tile, rule.qualdirControlOverview) +
        "</div>"
      );
    }
    if (rule && rule.kpiPctOnly) {
      var pres = MockData.getKpiTilePresentation(tile);
      var pctLabel = MockData.formatKpiPercentLabel(pres.percent) + "%";
      var normLabel = rule && rule.normLabel ? String(rule.normLabel) : "";
      return (
        '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="KPI">' +
        buildKpiTileKpiPctOnlyHtml(pctLabel, normLabel) +
        "</div>"
      );
    }
    if (rule && rule.factOnly && !shouldHidePlanOnTile(tile)) {
      return (
        '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="Факт">' +
        (rule.factOnlyRow ? buildKpiTileFactOnlyRowHtml(tile) : buildKpiTileFactOnlyHtml(factShown)) +
        "</div>"
      );
    }
    if (!hasPf && !hasPartialPf && !hasCustomPlanFactRows) {
      if (rule && rule.showEmptyPlanFact) {
        return (
          '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="' +
          DashUi.escapeHtml(KPI_TILE_ARIA_METRICS_PF) +
          '">' +
          buildKpiTilePlanFactStackHtml(tile) +
          "</div>"
        );
      }
      if (tile && tile.has_data === false && !hasKpiTileDisplayableMetricValue(tile)) {
        return (
          '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only kpi-tile-metrics--no-data" aria-label="Нет данных">' +
          buildKpiTileNoDataHtml(tile) +
          "</div>"
        );
      }
      var hasPrimaryMetric =
        (typeof DashUi !== "undefined" &&
          DashUi &&
          typeof DashUi.kpiTilePlanFactValuePresent === "function" &&
          (DashUi.kpiTilePlanFactValuePresent(tile && tile.plan) ||
            DashUi.kpiTilePlanFactValuePresent(tile && tile.fact))) ||
        (tile && typeof tile.kpi_pct === "number" && !isNaN(tile.kpi_pct)) ||
        (tile && typeof tile.percent === "number" && !isNaN(tile.percent));
      if (hasPrimaryMetric) {
        return (
          '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="' +
          DashUi.escapeHtml(KPI_TILE_ARIA_METRICS_PF) +
          '">' +
          buildKpiTilePlanFactStackHtml(tile) +
          "</div>"
        );
      }
      return "";
    }
    return (
      '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only" aria-label="' +
      DashUi.escapeHtml(KPI_TILE_ARIA_METRICS_PF) +
      '">' +
      buildKpiTilePlanFactStackHtml(tile) +
      "</div>"
    );
  }

  function buildKpiTileFrontFaceHtml(tile, hasPf, planFactShown, factShown, pfPeriod, planFactLabel) {
    return (
      '<section class="kpi-tile-face kpi-tile-face--front">' +
      buildKpiTileBadgeRowHtml(tile) +
      buildKpiTileBodyHtml(tile, hasPf, pfPeriod) +
      buildKpiTileMetricsSectionHtml(tile, hasPf, planFactShown, factShown, planFactLabel) +
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

  function articleRowHasPlanFact(row) {
    if (!row || typeof row !== "object") return false;
    if (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function") {
      return (
        DashUi.kpiTilePlanFactValuePresent(row.plan) ||
        DashUi.kpiTilePlanFactValuePresent(row.fact)
      );
    }
    return row.plan != null || row.fact != null;
  }

  /** Оборот QD-M5: ОТК-1 / ОТК-2 из `defect_direction_departments`. */
  function buildKpiTileDefectDirectionsBackHtml(tile) {
    var breakdown = buildKpiTileBreakdownRows(tile);
    var units = resolveKpiTileDisplayUnits(tile) || "шт.";
    if (!breakdown.length) {
      return '<div class="kpi-tile-back-message">Нет данных по направлениям ОТК.</div>';
    }
    return (
      '<div class="kpi-tile-articles-list kpi-tile-articles-list--dept-count" role="list">' +
      breakdown
        .map(function (item) {
          var line = item.label + " - " + formatKpiTileMetricValue(item.value, units);
          return (
            '<div class="kpi-tile-article-row kpi-tile-article-row--dept-count" role="listitem">' +
            '<span class="kpi-tile-article-row-line">' +
            DashUi.escapeHtml(line) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /** Оборот QD-M1: «Подразделение - кол-во» из API `departments`. */
  function buildKpiTileArticlesDeptCountHtml(tile) {
    var list = tile && Array.isArray(tile.departments) ? tile.departments : [];
    var units = tile && tile.units != null ? String(tile.units).trim() : "";
    var rows = list.filter(function (row) {
      return row && typeof row === "object" && row.name != null && String(row.name).trim() !== "";
    });
    if (!rows.length) {
      return '<div class="kpi-tile-back-message">Нет данных по подразделениям.</div>';
    }
    return (
      '<div class="kpi-tile-articles-list kpi-tile-articles-list--dept-count" role="list">' +
      rows
        .map(function (row) {
          var name = String(row.name).trim();
          var count = Number(row.count);
          var line =
            name +
            " - " +
            formatKpiTileMetricValue(isFinite(count) && !isNaN(count) ? Math.round(count) : 0, units);
          return (
            '<div class="kpi-tile-article-row kpi-tile-article-row--dept-count" role="listitem">' +
            '<span class="kpi-tile-article-row-line">' +
            DashUi.escapeHtml(line) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /** Оборот: подразделения из API `articles: [{ name, plan, fact }]`. */
  function buildKpiTileArticlesPlanFactHtml(tile) {
    var list = tile && Array.isArray(tile.articles) ? tile.articles : [];
    var units = tile && tile.units != null ? tile.units : null;
    var rule = getKpiTileException(tile);
    var hidePlan = !!(rule && rule.hideArticlesPlan);
    var rows = list
      .map(function (row) {
        var name = row && row.name != null ? String(row.name).trim() : "";
        if (!name || !articleRowHasPlanFact(row)) return null;
        return {
          name: name,
          planText: formatKpiTileMetricValue(row.plan, units),
          factText: formatKpiTileMetricValue(row.fact, units),
        };
      })
      .filter(Boolean);
    if (!rows.length) {
      return '<div class="kpi-tile-back-message">Нет данных по подразделениям.</div>';
    }
    return (
      '<div class="kpi-tile-articles-list" role="list">' +
      rows
        .map(function (row) {
          if (hidePlan) {
            return (
              '<div class="kpi-tile-article-row kpi-tile-article-row--fact-only" role="listitem">' +
              '<span class="kpi-tile-article-row-name">' +
              DashUi.escapeHtml(row.name) +
              "</span>" +
              '<span class="kpi-tile-article-row-fact">' +
              DashUi.escapeHtml(row.factText) +
              "</span>" +
              "</div>"
            );
          }
          return (
            '<div class="kpi-tile-article-row" role="listitem">' +
            '<span class="kpi-tile-article-row-name">' +
            DashUi.escapeHtml(row.name) +
            "</span>" +
            '<div class="kpi-tile-article-row-pf">' +
            '<span class="kpi-tile-pf-mini">' +
            "<span>План</span>" +
            "<strong>" +
            DashUi.escapeHtml(row.planText) +
            "</strong>" +
            "</span>" +
            '<span class="kpi-tile-pf-mini">' +
            "<span>Факт</span>" +
            "<strong>" +
            DashUi.escapeHtml(row.factText) +
            "</strong>" +
            "</span>" +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function buildKpiTileDepartmentAmountsHtml(tile) {
    if (tile && Array.isArray(tile.production_plan_rows)) {
      return buildKpiTileProductionPlanRowsHtml(tile);
    }
    var planByDept = tile && tile.plan_by_dept && typeof tile.plan_by_dept === "object" ? tile.plan_by_dept : null;
    var factByDept = tile && tile.fact_by_dept && typeof tile.fact_by_dept === "object" ? tile.fact_by_dept : null;
    var names = Object.create(null);
    if (planByDept) {
      Object.keys(planByDept).forEach(function (name) {
        names[name] = true;
      });
    }
    if (factByDept) {
      Object.keys(factByDept).forEach(function (name) {
        names[name] = true;
      });
    }
    var rows = Object.keys(names)
      .map(function (name) {
        var planValue = planByDept && Object.prototype.hasOwnProperty.call(planByDept, name) ? Number(planByDept[name]) : null;
        var factValue = factByDept && Object.prototype.hasOwnProperty.call(factByDept, name) ? Number(factByDept[name]) : null;
        return {
          name: name,
          plan: isFinite(planValue) && !isNaN(planValue) ? planValue : null,
          fact: isFinite(factValue) && !isNaN(factValue) ? factValue : null,
        };
      })
      .filter(function (row) {
        return row.plan != null || row.fact != null;
      })
      .sort(function (a, b) {
        var aMax = Math.max(Math.abs(a.plan || 0), Math.abs(a.fact || 0));
        var bMax = Math.max(Math.abs(b.plan || 0), Math.abs(b.fact || 0));
        if (bMax !== aMax) return bMax - aMax;
        return String(a.name || "").localeCompare(String(b.name || ""), "ru");
      });
    if (!rows.length) {
      return '<div class="kpi-tile-back-message">Нет данных по подразделениям.</div>';
    }
    return (
      '<div class="kpi-tile-children-list">' +
      rows
        .map(function (row) {
          var pair = formatKpiTilePlanFactPairByUnit(row.plan, row.fact, tile && tile.unit);
          var canNavigate = String(row.name || "").trim() !== "Прочие подразделения";
          var tagName = canNavigate ? "a" : "div";
          var extraClass = canNavigate ? " kpi-tile-child-link" : " kpi-tile-child-item--static";
          var attrs = canNavigate
            ? ' tabindex="0" data-department="' + DashUi.escapeHtml(row.name) + '"'
            : "";
          var chevron = canNavigate
            ? '<svg class="kpi-tile-child-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : "";
          return (
            "<" +
            tagName +
            ' class="kpi-tile-child-item' +
            extraClass +
            '"' +
            attrs +
            ">" +
            '<span class="kpi-tile-child-name">' +
            DashUi.escapeHtml(row.name) +
            "</span>" +
            '<span class="kpi-tile-child-value">' +
            DashUi.escapeHtml(pair) +
            "</span>" +
            chevron +
            "</" +
            tagName +
            ">"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function buildKpiTileProductionPlanRowsHtml(tile) {
    var rows = tile && Array.isArray(tile.production_plan_rows) ? tile.production_plan_rows : [];
    var unit = String((tile && tile.unit) || "").trim().toLowerCase();
    var isMoneyTile = unit !== "шт." && unit !== "шт";
    rows = rows
      .map(function (row) {
        var name = row && row.name != null ? String(row.name).trim() : "";
        var plan = isMoneyTile ? row && row.plan_rub : row && row.plan_qty;
        var fact = isMoneyTile ? row && row.fact_rub : row && row.fact_qty;
        var planNum = Number(plan);
        var factNum = Number(fact);
        var qtyNum = Number(row && row.plan_qty);
        return {
          name: name || "Прибор",
          plan: isFinite(planNum) && !isNaN(planNum) ? planNum : null,
          fact: isFinite(factNum) && !isNaN(factNum) ? factNum : null,
          planQty: isFinite(qtyNum) && !isNaN(qtyNum) ? qtyNum : null,
        };
      })
      .filter(function (row) {
        return row.plan != null || row.fact != null || row.planQty != null;
      })
      .sort(function (a, b) {
        var aMax = Math.max(Math.abs(a.plan || 0), Math.abs(a.fact || 0));
        var bMax = Math.max(Math.abs(b.plan || 0), Math.abs(b.fact || 0));
        if (bMax !== aMax) return bMax - aMax;
        return String(a.name || "").localeCompare(String(b.name || ""), "ru");
      });
    if (!rows.length) {
      return '<div class="kpi-tile-back-message">Нет данных по приборам.</div>';
    }
    return (
      '<div class="kpi-tile-children-list">' +
      rows
        .map(function (row) {
          var valueText = isMoneyTile
            ? "План (" + formatKpiTileProductionQty(row.planQty) + ") - " + formatKpiTileProductionMoney(row.plan) +
              " | Факт - " + formatKpiTileProductionMoney(row.fact)
            : "План - " + formatKpiTileProductionQty(row.plan) + " | Факт - " + formatKpiTileProductionQty(row.fact);
          return (
            '<div class="kpi-tile-child-item kpi-tile-child-item--static">' +
            '<span class="kpi-tile-child-name">' +
            DashUi.escapeHtml(row.name) +
            "</span>" +
            '<span class="kpi-tile-child-value">' +
            DashUi.escapeHtml(valueText) +
            "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function buildKpiTileBackFaceHtml(tile, tileIndex) {
    var state = getTileDetailsState(tileIndex);
    var pres = MockData.getKpiTilePresentation(tile);
    var hint = "";
    var period = tile && tile.period != null ? String(tile.period).trim() : "";
    var code = tile && (tile.badge || tile.kpi_id) ? String(tile.badge || tile.kpi_id).trim() : "";
    var rule = getKpiTileException(tile);
    // Если плитка kpiPctOnly, но явно помечена showBackPlanFact — показываем План/Факт.
    var forceBackPlanFact = shouldShowKpiTileBackPlanFact(tile);
    var forceBackPlanOnly = shouldShowKpiTileBackPlanOnly(tile);
    var allowPartialPlanFact = shouldAllowPartialPlanFact(tile);
    var hasAnyPlanFactValue =
      (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
        ? DashUi.kpiTilePlanFactValuePresent(tile && tile.plan)
        : tile && tile.plan != null) ||
      (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
        ? DashUi.kpiTilePlanFactValuePresent(tile && tile.fact)
        : tile && tile.fact != null);
    var hasPf =
      (DashUi.kpiTileHasPlanAndFact(tile) || (allowPartialPlanFact && hasAnyPlanFactValue)) &&
      (!isKpiPctOnlyTile(tile) || forceBackPlanFact || forceBackPlanOnly);
    var planFactShown =
      typeof DashUi.formatKpiTilePlanFactPair === "function"
        ? DashUi.formatKpiTilePlanFactPair(tile.plan, tile.fact, tile.units)
        : DashUi.formatKpiTilePlanFactValue(tile.plan) + "/" + DashUi.formatKpiTilePlanFactValue(tile.fact);
    var planShown =
      typeof DashUi.formatKpiTileFactValueWithUnits === "function"
        ? DashUi.formatKpiTileFactValueWithUnits(tile.plan, tile.units)
        : DashUi.formatKpiTilePlanFactValue(tile.plan);
    var showHelp = shouldShowKpiTileHelp(tile);
    var showPercent = shouldShowKpiTilePercent(tile);
    if (rule && rule.backProjectDeviations) {
      var projectListTitle =
        rule.backProjectDeviationsTitle != null && String(rule.backProjectDeviationsTitle).trim()
          ? String(rule.backProjectDeviationsTitle).trim()
          : "Проекты КБ за период";
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
        '<div class="kpi-tile-back-section">' +
        '<div class="kpi-tile-back-section-title">' + DashUi.escapeHtml(projectListTitle) + "</div>" +
        buildKpiTileProjectDeviationsHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (rule && rule.backDualRatioAmounts) {
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
        '<div class="kpi-tile-back-section kpi-tile-back-section--dual">' +
        '<div class="kpi-tile-back-section-title">ДЗ и КЗ за период</div>' +
        buildKpiTileDualRatioAmountsHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (rule && rule.backPortfolioAmounts) {
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
        '<div class="kpi-tile-back-section kpi-tile-back-section--dual">' +
        '<div class="kpi-tile-back-section-title">Портфель проектов за период</div>' +
        buildKpiTilePortfolioAmountsHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (rule && rule.backYearCompareAmounts) {
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
        '<div class="kpi-tile-back-section kpi-tile-back-section--dual">' +
        '<div class="kpi-tile-back-section-title">Отгрузки за период</div>' +
        buildKpiTileYearCompareAmountsHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (shouldRenderKpiTileBackDefectDirections(tile)) {
      return (
        buildKpiTileBackHeadHtml(tile, code, period) +
        buildKpiTileBackKpiPctSummaryHtml(tile, pres, showHelp, showPercent) +
        buildKpiTileBackQualdirControlSectionHtml(tile) +
        '<div class="kpi-tile-back-section kpi-tile-back-section--dual">' +
        '<div class="kpi-tile-back-section-title">По направлениям ОТК</div>' +
        buildKpiTileDefectDirectionsBackHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (shouldRenderKpiTileBackArticlesDeptCount(tile)) {
      return (
        buildKpiTileBackHeadHtml(tile, code, period) +
        buildKpiTileBackKpiPctSummaryHtml(tile, pres, showHelp, showPercent) +
        buildKpiTileBackQualdirControlSectionHtml(tile) +
        '<div class="kpi-tile-back-section kpi-tile-back-section--dual">' +
        '<div class="kpi-tile-back-section-title">По подразделениям</div>' +
        buildKpiTileArticlesDeptCountHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (shouldRenderQualdirControlOverviewOnBack(tile)) {
      return (
        buildKpiTileBackHeadHtml(tile, code, period) +
        buildKpiTileBackKpiPctSummaryHtml(tile, pres, showHelp, showPercent) +
        buildKpiTileBackQualdirControlSectionHtml(tile) +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (shouldRenderKpiTileBackArticlesPlanFact(tile)) {
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
        '<div class="kpi-tile-back-section kpi-tile-back-section--dual">' +
        '<div class="kpi-tile-back-section-title">Подразделения за период</div>' +
        buildKpiTileArticlesPlanFactHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (rule && rule.tenderDepartmentsBreakdown) {
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
        '<div class="kpi-tile-back-section kpi-tile-back-section--dual">' +
        '<div class="kpi-tile-back-section-title">Тендеры по отделам</div>' +
        buildKpiTileTenderDepartmentsHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
    if (shouldRenderKpiTileBackDeptAmounts(tile)) {
      var deptAmountsTitle = tile && Array.isArray(tile.production_plan_rows)
        ? "Приборы за период"
        : "Подразделения за период";
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
        '<div class="kpi-tile-back-section kpi-tile-back-section--dual">' +
        '<div class="kpi-tile-back-section-title">' + DashUi.escapeHtml(deptAmountsTitle) + "</div>" +
        buildKpiTileDepartmentAmountsHtml(tile) +
        "</div>" +
        (hint ? '<p class="kpi-tile-back-hint">' + DashUi.escapeHtml(hint) + "</p>" : "")
      );
    }
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
      buildKpiTileBackKpiPctSummaryHtml(tile, pres, showHelp, showPercent) +
      (hasPf && shouldRenderKpiTileBack(tile) && forceBackPlanOnly
        ? '<div class="kpi-tile-back-summary">' +
          '<div class="kpi-tile-back-summary-item"><span class="kpi-tile-back-summary-label">План</span><strong>' +
          DashUi.escapeHtml(planShown) +
          "</strong></div></div>"
        : "") +
      (hasPf && shouldRenderKpiTileBack(tile) && !forceBackPlanOnly && (!isKpiPctOnlyTile(tile) || forceBackPlanFact)
        ? '<div class="kpi-tile-back-summary">' +
          '<div class="kpi-tile-back-summary-item"><span class="kpi-tile-back-summary-label">План / факт</span><strong>' +
          DashUi.escapeHtml(planFactShown) +
          "</strong></div></div>"
        : "") +
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

  function isKpiTilesReorderMode() {
    return reorderModeActive;
  }

  function getKpiTilesPageCount() {
    return Math.max(1, Math.ceil(getKpiTilesCount() / KPI_TILES_PER_PAGE));
  }

  function getTilePageIndex(tileIndex) {
    return Math.floor(Number(tileIndex) / KPI_TILES_PER_PAGE);
  }

  function clearPageFlipTimer() {
    if (pageFlipTimer) {
      clearTimeout(pageFlipTimer);
      pageFlipTimer = null;
    }
    pageFlipDirection = 0;
    var block = document.querySelector(".dash-kpi-tiles-block");
    if (block) {
      block.classList.remove("kpi-tiles-block--flip-hint-prev");
      block.classList.remove("kpi-tiles-block--flip-hint-next");
    }
  }

  function setPageFlipHint(direction) {
    var block = document.querySelector(".dash-kpi-tiles-block");
    if (!block) return;
    block.classList.toggle("kpi-tiles-block--flip-hint-prev", direction < 0);
    block.classList.toggle("kpi-tiles-block--flip-hint-next", direction > 0);
  }

  function flipPageWhileDragging(direction) {
    if (dragFromIndex == null || !direction) return;
    var pages = getKpiTilesPageCount();
    var nextPage = kpiTilesPageIndex + direction;
    if (nextPage < 0 || nextPage >= pages) return;
    kpiTilesPageIndex = nextPage;
    applyKpiTilesPageVisibility();
    updatePagerUI();
  }

  function schedulePageFlipWhileDragging(direction, delayMs) {
    if (dragFromIndex == null || !direction) {
      clearPageFlipTimer();
      return;
    }
    var pages = getKpiTilesPageCount();
    var nextPage = kpiTilesPageIndex + direction;
    if (nextPage < 0 || nextPage >= pages) {
      clearPageFlipTimer();
      return;
    }
    if (pageFlipDirection === direction && pageFlipTimer) return;
    clearPageFlipTimer();
    pageFlipDirection = direction;
    setPageFlipHint(direction);
    pageFlipTimer = setTimeout(function () {
      pageFlipTimer = null;
      pageFlipDirection = 0;
      flipPageWhileDragging(direction);
      clearPageFlipTimer();
    }, delayMs);
  }

  function handleDragAutoPageFlip(e) {
    if (dragFromIndex == null) return;
    var block = document.querySelector(".dash-kpi-tiles-block");
    if (!block) return;
    var rect = block.getBoundingClientRect();
    var edge = 88;
    if (e.clientX >= rect.right - edge) {
      schedulePageFlipWhileDragging(1, PAGE_FLIP_EDGE_MS);
      return;
    }
    if (e.clientX <= rect.left + edge) {
      schedulePageFlipWhileDragging(-1, PAGE_FLIP_EDGE_MS);
      return;
    }
    clearPageFlipTimer();
  }

  function updateReorderBanner() {
    var hint = document.getElementById("kpi-tiles-reorder-banner-hint");
    var text = document.querySelector(".kpi-tiles-reorder-banner-text");
    var hasMultiplePages = getKpiTilesCount() > KPI_TILES_PER_PAGE;
    if (text) text.textContent = "Потяните плитку за ⋮⋮ и отпустите на нужном месте";
    if (hint) {
      hint.textContent = hasMultiplePages
        ? "У края экрана страница перелистнётся автоматически · между страницами плитки меняются местами"
        : "Порядок сохранится автоматически";
    }
  }

  function setKpiTilesReorderMode(active) {
    reorderModeActive = !!active;
    var block = document.querySelector(".dash-kpi-tiles-block");
    var hasMultiplePages = getKpiTilesCount() > KPI_TILES_PER_PAGE;
    if (!active) clearPageFlipTimer();
    if (block) block.classList.toggle("kpi-tiles-block--reorder", reorderModeActive);
    if (block) block.classList.toggle("kpi-tiles-block--reorder-multipage", reorderModeActive && hasMultiplePages);
    updateReorderBanner();
    applyKpiTilesPageVisibility();
  }

  function getKpiTilesCount() {
    var container = document.getElementById("kpi-container");
    var nDom = container ? container.querySelectorAll("article.kpi-tile").length : 0;
    var tiles = getTiles();
    return nDom > 0 ? nDom : tiles.length;
  }

  function applyKpiTilesPageVisibility() {
    var container = document.getElementById("kpi-container");
    if (!container) return;
    var articles = container.querySelectorAll("article.kpi-tile");
    var n = articles.length;
    if (n <= KPI_TILES_PER_PAGE) {
      articles.forEach(function (art) {
        art.classList.remove("kpi-tile--page-hidden");
        art.classList.remove("kpi-tile--source-reserved");
      });
      return;
    }

    var start = kpiTilesPageIndex * KPI_TILES_PER_PAGE;
    var end = Math.min(n, start + KPI_TILES_PER_PAGE);
    var dragging = dragFromIndex != null ? dragFromIndex : -1;

    articles.forEach(function (art, idx) {
      var onPage = idx >= start && idx < end;
      var isDragging = idx === dragging;
      art.classList.toggle("kpi-tile--page-hidden", !onPage && !isDragging);
    });
  }

  function updatePagerUI(options) {
    mergeContext(options);
    if (options && options.resetPage) {
      kpiTilesPageIndex = 0;
    }
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

  function clearDropTargetMarks(container) {
    if (!container) return;
    container.querySelectorAll("article.kpi-tile.kpi-tile--drop-target").forEach(function (art) {
      art.classList.remove("kpi-tile--drop-target");
    });
  }

  function clearPagerDropTargetMarks() {
    ["kpi-tiles-page-prev", "kpi-tiles-page-next"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.classList.remove("kpi-tiles-pager-btn--drop-target");
    });
  }

  function finishDragVisuals(container) {
    if (container) {
      container.querySelectorAll("article.kpi-tile.kpi-tile--dragging").forEach(function (art) {
        art.classList.remove("kpi-tile--dragging");
      });
      clearDropTargetMarks(container);
    }
    clearPagerDropTargetMarks();
    clearPageFlipTimer();
    dragFromIndex = null;
  }

  function finishKpiTileDrag(container) {
    finishDragVisuals(container);
    setKpiTilesReorderMode(false);
  }

  function commitKpiTileReorder(fromIndex, toIndex) {
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) return;
    var swap = getTilePageIndex(fromIndex) !== getTilePageIndex(toIndex);
    var fn = getContext().onTilesReordered;
    if (typeof fn === "function") fn(fromIndex, toIndex, { swap: swap });
  }

  function bindPagerAutoFlipWhileDragging(btn, direction) {
    if (!btn) return;
    btn.addEventListener("dragover", function (e) {
      if (dragFromIndex == null || btn.disabled) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      clearPagerDropTargetMarks();
      btn.classList.add("kpi-tiles-pager-btn--drop-target");
      schedulePageFlipWhileDragging(direction, PAGE_FLIP_PAGER_MS);
    });
    btn.addEventListener("dragleave", function (e) {
      if (btn.contains(e.relatedTarget)) return;
      btn.classList.remove("kpi-tiles-pager-btn--drop-target");
    });
  }

  function ensureDragBound() {
    if (dragBound) return;
    var container = document.getElementById("kpi-container");
    if (!container) return;
    dragBound = true;

    bindPagerAutoFlipWhileDragging(document.getElementById("kpi-tiles-page-prev"), -1);
    bindPagerAutoFlipWhileDragging(document.getElementById("kpi-tiles-page-next"), 1);

    container.addEventListener("dragstart", function (e) {
      var handle = e.target.closest(".kpi-tile-drag-handle");
      if (!handle || !container.contains(handle)) return;
      var article = handle.closest("article.kpi-tile");
      if (!article || article.classList.contains("kpi-tile--page-hidden")) {
        e.preventDefault();
        return;
      }
      var from = article.getAttribute("data-kpi-tile-index");
      if (from == null) {
        e.preventDefault();
        return;
      }
      dragFromIndex = +from;
      kpiTilesPageIndex = getTilePageIndex(dragFromIndex);
      setKpiTilesReorderMode(true);
      updatePagerUI();
      article.classList.add("kpi-tile--dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", String(from));
        } catch (err) {
          /* ignore */
        }
      }
      e.stopPropagation();
    });

    container.addEventListener("mousedown", function (e) {
      if (e.target.closest(".kpi-tile-drag-handle")) {
        e.stopPropagation();
      }
    });

    container.addEventListener("dragend", function () {
      if (dragFromIndex == null) return;
      finishKpiTileDrag(container);
    });

    container.addEventListener("dragover", function (e) {
      if (dragFromIndex == null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      handleDragAutoPageFlip(e);
      var article = e.target.closest("article.kpi-tile");
      clearDropTargetMarks(container);
      clearPagerDropTargetMarks();
      if (!article || !container.contains(article) || article.classList.contains("kpi-tile--page-hidden")) {
        return;
      }
      if (+article.getAttribute("data-kpi-tile-index") === dragFromIndex) return;
      article.classList.add("kpi-tile--drop-target");
    });

    container.addEventListener("dragleave", function (e) {
      var article = e.target.closest("article.kpi-tile");
      if (!article || !container.contains(article)) return;
      if (!article.contains(e.relatedTarget)) {
        article.classList.remove("kpi-tile--drop-target");
      }
    });

    container.addEventListener("drop", function (e) {
      if (dragFromIndex == null) return;
      var article = e.target.closest("article.kpi-tile");
      if (!article || !container.contains(article) || article.classList.contains("kpi-tile--page-hidden")) return;
      e.preventDefault();
      e.stopPropagation();
      var toIndex = article.getAttribute("data-kpi-tile-index");
      if (toIndex == null) return;
      var fromIndex = dragFromIndex;
      if (+toIndex === fromIndex) {
        finishKpiTileDrag(container);
        return;
      }
      finishKpiTileDrag(container);
      commitKpiTileReorder(fromIndex, +toIndex);
    });
  }

  function ensurePagerBound() {
    if (pagerBound) return;
    pagerBound = true;
    var prevBtn = document.getElementById("kpi-tiles-page-prev");
    var nextBtn = document.getElementById("kpi-tiles-page-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function (e) {
        if (reorderModeActive) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (kpiTilesPageIndex <= 0) return;
        beforePageChange();
        kpiTilesPageIndex--;
        updatePagerUI();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function (e) {
        if (reorderModeActive) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        var n = getKpiTilesCount();
        var pages = Math.max(1, Math.ceil(n / KPI_TILES_PER_PAGE));
        if (kpiTilesPageIndex >= pages - 1) return;
        beforePageChange();
        kpiTilesPageIndex++;
        updatePagerUI();
      });
    }
  }

  function render(options) {
    var preservePage = !!(options && options.preservePage);
    mergeContext(options);
    if (!preservePage) {
      resetKpiTilesPager();
    }
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
      var hasAnyPlanFactValue =
        (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
          ? DashUi.kpiTilePlanFactValuePresent(tile && tile.plan)
          : tile && tile.plan != null) ||
        (typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
          ? DashUi.kpiTilePlanFactValuePresent(tile && tile.fact)
          : tile && tile.fact != null);
      var hasExpectedPlan =
        typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
          ? DashUi.kpiTilePlanFactValuePresent(tile && tile.expected_plan)
          : tile && tile.expected_plan != null;
      var hasPf =
        (DashUi.kpiTileHasPlanAndFact(tile) || (rule && rule.allowPartialPlanFact && hasAnyPlanFactValue)) &&
        !isKpiPctOnlyTile(tile);
      var planFactShown =
        hasExpectedPlan && typeof DashUi.formatKpiTilePlanFactExpectedTriple === "function"
          ? DashUi.formatKpiTilePlanFactExpectedTriple(tile.plan, tile.fact, tile.expected_plan, tile.units)
          : typeof DashUi.formatKpiTilePlanFactPair === "function"
          ? DashUi.formatKpiTilePlanFactPair(tile.plan, tile.fact, tile.units)
          : DashUi.formatKpiTilePlanFactValue(tile.plan) + "/" + DashUi.formatKpiTilePlanFactValue(tile.fact);
      var planFactLabel = hasExpectedPlan ? "План / факт / ожидаемо" : "План / факт";
      var factShown =
        typeof DashUi.formatKpiTileFactValueWithUnits === "function"
          ? DashUi.formatKpiTileFactValueWithUnits(tile.fact, tile.units)
          : DashUi.formatKpiTilePlanFactValue(tile.fact);
      var pfPeriod =
        tile.plan_fact_period_label != null
          ? String(tile.plan_fact_period_label).trim()
          : "";
      var hasCustomPlanFactRows = !!(tile && Array.isArray(tile.plan_fact_rows) && tile.plan_fact_rows.length);

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
      if (hasCustomPlanFactRows) {
        el.classList.add("kpi-tile--split-plan-fact");
        if (tile.plan_fact_rows.length >= 3) {
          el.classList.add("kpi-tile--split-plan-fact-many");
        }
      }
      if (pendingFocus && !focusApplied && shouldMatchFocus(tile, pendingFocus)) {
        el.classList.add("kpi-tile--focus");
        el.setAttribute("aria-current", "true");
        focusApplied = true;
      }
      el.innerHTML =
        '<div class="kpi-tile-inner">' +
        buildKpiTileFrontFaceHtml(tile, hasPf, planFactShown, factShown, pfPeriod, planFactLabel) +
        '<section class="kpi-tile-face kpi-tile-face--back"></section>' +
        "</div>";
      container.appendChild(el);
    });

    ensureDragBound();

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

    if (!preservePage) {
      updatePagerUI({ resetPage: true });
    } else {
      updatePagerUI();
    }
  }

  function init(options) {
    mergeContext(options);
    ensurePagerBound();
    updatePagerUI();
  }

  global.DashboardKpiTiles = {
    init: init,
    render: render,
    resetPager: resetKpiTilesPager,
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
