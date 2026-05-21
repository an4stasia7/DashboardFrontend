(function (global) {
  var KPI_TILES_PER_PAGE = 6;
  var kpiTilesPageIndex = 0;
  var pagerBound = false;
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

  function isKpiPctOnlyTile(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.kpiPctOnly);
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
    return !!(rule && rule.hidePlanDelta);
  }

  function shouldRenderKpiTileBackDeptAmounts(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backDeptAmounts);
  }

  function shouldRenderKpiTileBackArticlesPlanFact(tile) {
    var rule = getKpiTileException(tile);
    return !!(rule && rule.backArticlesPlanFact);
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
    var isKpiPctOnly = !!(rule && rule.kpiPctOnly);
    var generatedFlag = tile.has_data === false ? buildKpiTileGeneratedFlagHtml() : "";
    var periodExtra =
      (hasPf || isFactOnly || isKpiPctOnly) && pfPeriod
        ? '<span class="kpi-tile-plan-fact-period" title="' +
          DashUi.escapeHtml(
            isFactOnly ? "Период факта" : isKpiPctOnly ? "Период показателя KPI" : KPI_TILE_TITLE_PLAN_FACT_PERIOD
          ) +
          '">' +
          (isFactOnly ? "Факт: " : isKpiPctOnly ? "KPI: " : "План/факт: ") +
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
          ? readFiniteTileNumber(point.display_fact)
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
    if (units === "%" && factNum != null && planNum != null) {
      var pp = factNum - planNum;
      var signPp = pp > 0 ? "+" : "";
      text = signPp + (Math.round(pp * 100) / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " п.п.";
    } else if (kpiPct != null) {
      var delta = kpiPct - 100;
      var sign = delta > 0 ? "+" : "";
      text = sign + Math.round(delta) + "%";
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
    var fact = normalizeKpiTileMetricValueForDisplay(tile, tile && tile.fact);
    var plan = normalizeKpiTileMetricValueForDisplay(tile, tile && tile.plan);
    var expected = normalizeKpiTileMetricValueForDisplay(tile, tile && tile.expected_plan);
    var units = tile && tile.units;
    var factHtml = formatKpiTileMetricValue(fact, units);
    var planHtml = formatKpiTileMetricValue(plan, units);
    var expectedHtml = formatKpiTileMetricValue(expected, units);
    var factParts = splitKpiTileValueAndUnit(factHtml, units);
    var planParts = splitKpiTileValueAndUnit(planHtml, units);
    var expectedParts = splitKpiTileValueAndUnit(expectedHtml, units);
    var factNum = readFiniteTileNumber(fact);
    var planNum = readFiniteTileNumber(plan);
    var deltaHtml = buildKpiTilePlanDeltaHtml(tile, factNum, planNum);
    var hasExpected =
      typeof DashUi !== "undefined" && DashUi && typeof DashUi.kpiTilePlanFactValuePresent === "function"
        ? DashUi.kpiTilePlanFactValuePresent(expected)
        : expected != null;
    return (
      '<div class="kpi-tile-modern-metrics">' +
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
      '<div class="kpi-tile-modern-numbers">' +
      '<div class="kpi-tile-modern-number-row"><span>План</span><strong>' +
      DashUi.escapeHtml(planParts.value + (planParts.unit ? " " + planParts.unit : "")) +
      "</strong></div>" +
      (hasExpected
        ? '<div class="kpi-tile-modern-number-row"><span>Ожидаемо</span><strong>' +
          DashUi.escapeHtml(expectedParts.value + (expectedParts.unit ? " " + expectedParts.unit : "")) +
          "</strong></div>"
        : "") +
      "</div>" +
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
          return (
            '<div class="kpi-tile-pf-value-row kpi-tile-pf-value-row--split">' +
            '<span class="kpi-tile-pf-value-label">' +
            DashUi.escapeHtml(row && row.label != null ? String(row.label) : "") +
            '</span><span class="kpi-tile-pf-value-number kpi-tile-pf-value-number--split' +
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
    if (rule && rule.factOnly) {
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
      if (tile && tile.has_data === false) {
        return (
          '<div class="kpi-tile-metrics kpi-tile-metrics--pf-only kpi-tile-metrics--no-data" aria-label="Нет данных">' +
          buildKpiTileNoDataHtml(tile) +
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
          var pair = formatKpiTileMillionsPlanFactPair(row.plan, row.fact);
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

  function buildKpiTileBackFaceHtml(tile, tileIndex) {
    var state = getTileDetailsState(tileIndex);
    var pres = MockData.getKpiTilePresentation(tile);
    var percentLabel = MockData.formatKpiPercentLabel(pres.percent) + "%";
    var hint = tile && tile.hint != null ? String(tile.hint).trim() : "";
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
        '<div class="kpi-tile-back-section-title">Проекты КБ за период</div>' +
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
      '<div class="kpi-tile-back-summary">' +
      (showPercent
        ? '<div class="kpi-tile-back-summary-item kpi-tile-back-summary-item--kpi">' +
          (showHelp ? buildKpiTileHelpButtonHtml() : "") +
          '<span class="kpi-tile-back-summary-label">KPI</span>' +
          '<strong class="kpi-tile-back-kpi-pct">' +
          DashUi.escapeHtml(percentLabel) +
          "</strong></div>"
        : "") +
      (hasPf && shouldRenderKpiTileBack(tile) && forceBackPlanOnly
        ? '<div class="kpi-tile-back-summary-item"><span class="kpi-tile-back-summary-label">План</span><strong>' +
          DashUi.escapeHtml(planShown) +
          "</strong></div>"
        : "") +
      (hasPf && shouldRenderKpiTileBack(tile) && !forceBackPlanOnly && (!isKpiPctOnlyTile(tile) || forceBackPlanFact)
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
