(function (global) {
  var lineChartInstance = null;
  var lineChartIndicators = [];
  var waterfallChartInstance = null;
  var waterfallChartIndicators = [];
  var donutChartInstances = [];
  var chartPreviewInstances = [];

  var dashboardChartsResizeObserver = null;
  var dashboardChartsResizeFrame = null;
  var dashboardChartsResizeBound = false;
  var chartPreviewDialogBound = false;
  var latestContext = {};

  function mergeContext(nextContext) {
    latestContext = Object.assign({}, latestContext || {}, nextContext || {});
    return latestContext;
  }

  function getContext() {
    return latestContext || {};
  }

  function getCurrentTiles() {
    return getContext().currentTiles || null;
  }

  function getChartSelectAllValue() {
    var value = getContext().chartSelectAllValue;
    return value != null ? value : "__all__";
  }

  function getVisibleDonutTilesSafe(tiles) {
    var fn = getContext().getVisibleDonutTiles;
    return typeof fn === "function" ? fn(tiles) : tiles || [];
  }

  function updateDonutChartsPagerUISafe(totalCount) {
    var fn = getContext().updateDonutChartsPagerUI;
    if (typeof fn === "function") fn(totalCount);
  }

  function navigateToMonthSafe(month, year) {
    var fn = getContext().onNavigateToMonth;
    if (typeof fn === "function") fn(month, year);
  }

  function navigateToQuarterSafe(quarter, year) {
    var fn = getContext().onNavigateToQuarter;
    if (typeof fn === "function") fn(quarter, year);
  }

  function showChartLoadError() {
    var msg =
      '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Графики недоступны: не загрузилась библиотека Highcharts (проверьте интернет или блокировку CDN).</p>';
    var ids = ["chart-line", "chart-bar", "donuts-grid"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
  }

  function isDashboardChartContainer(renderTo) {
    if (!renderTo) return false;
    if (renderTo.id === "chart-line" || renderTo.id === "chart-bar") return true;
    return !!(renderTo.classList && renderTo.classList.contains("donut-chart-container"));
  }

  function resizeAllDashboardChartsNow() {
    if (typeof Highcharts === "undefined" || !Highcharts.charts) return;
    Highcharts.charts.forEach(function (chart) {
      if (!chart || typeof chart.setSize !== "function" || !isDashboardChartContainer(chart.renderTo)) {
        return;
      }
      var container = chart.renderTo;
      var width = container && container.clientWidth ? container.clientWidth : null;
      chart.setSize(width, null, false);
    });
  }

  function scheduleDashboardChartsResize() {
    if (dashboardChartsResizeFrame != null) {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(dashboardChartsResizeFrame);
      } else {
        clearTimeout(dashboardChartsResizeFrame);
      }
    }
    if (typeof window.requestAnimationFrame === "function") {
      dashboardChartsResizeFrame = window.requestAnimationFrame(function () {
        dashboardChartsResizeFrame = null;
        resizeAllDashboardChartsNow();
      });
      return;
    }
    dashboardChartsResizeFrame = setTimeout(function () {
      dashboardChartsResizeFrame = null;
      resizeAllDashboardChartsNow();
    }, 0);
  }

  function ensureDashboardChartsResizeObserver() {
    if (typeof window === "undefined") return;
    if (!dashboardChartsResizeBound) {
      window.addEventListener("resize", scheduleDashboardChartsResize, { passive: true });
      dashboardChartsResizeBound = true;
    }
    if (typeof window.ResizeObserver !== "function") return;
    if (!dashboardChartsResizeObserver) {
      dashboardChartsResizeObserver = new window.ResizeObserver(function () {
        scheduleDashboardChartsResize();
      });
    }
    ["chart-line", "chart-bar", "donuts-grid"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) dashboardChartsResizeObserver.observe(el);
    });
  }

  function destroyChartPreviewCharts() {
    chartPreviewInstances.forEach(function (chart) {
      if (chart && typeof chart.destroy === "function") chart.destroy();
    });
    chartPreviewInstances = [];
  }

  function getChartPreviewDialogElements() {
    return {
      dialog: document.getElementById("chart-preview-dialog"),
      title: document.getElementById("chart-preview-dialog-title"),
      body: document.getElementById("chart-preview-dialog-body"),
    };
  }

  function closeChartPreviewDialog() {
    var elements = getChartPreviewDialogElements();
    destroyChartPreviewCharts();
    if (elements.body) elements.body.innerHTML = "";
    if (elements.dialog && typeof elements.dialog.close === "function" && elements.dialog.open) {
      elements.dialog.close();
    }
  }

  function ensureChartPreviewDialogBindings() {
    var elements = getChartPreviewDialogElements();
    if (!elements.dialog || chartPreviewDialogBound) return;
    chartPreviewDialogBound = true;
    elements.dialog.addEventListener("click", function (event) {
      if (event.target === elements.dialog) closeChartPreviewDialog();
    });
    elements.dialog.addEventListener("close", function () {
      destroyChartPreviewCharts();
      if (elements.body) elements.body.innerHTML = "";
    });
  }

  function buildPreviewChartOptions(chart, height) {
    if (!chart || typeof Highcharts === "undefined") return null;
    var options = Highcharts.merge({}, chart.userOptions || {}, {
      chart: {
        backgroundColor: "transparent",
        animation: false,
        reflow: true,
        height: height || 520,
      },
      title: { text: null },
    });
    if (options.chart && options.chart.events) {
      delete options.chart.events.click;
    }
    if (options.plotOptions && options.plotOptions.line && options.plotOptions.line.point && options.plotOptions.line.point.events) {
      delete options.plotOptions.line.point.events.click;
    }
    if (options.plotOptions && options.plotOptions.column && options.plotOptions.column.point && options.plotOptions.column.point.events) {
      delete options.plotOptions.column.point.events.click;
    }
    return options;
  }

  function openChartPreviewDialog(title, renderFn) {
    var elements = getChartPreviewDialogElements();
    if (!elements.dialog || !elements.body || typeof renderFn !== "function") return;
    ensureChartPreviewDialogBindings();
    destroyChartPreviewCharts();
    elements.body.innerHTML = "";
    if (elements.title) elements.title.textContent = title || "Просмотр графика";
    if (typeof elements.dialog.showModal === "function") {
      if (!elements.dialog.open) elements.dialog.showModal();
    } else {
      elements.dialog.setAttribute("open", "open");
    }
    renderFn(elements.body);
  }

  function createPreviewChartHost(parent) {
    var host = document.createElement("div");
    host.className = "chart-preview-chart-host";
    parent.appendChild(host);
    return host;
  }

  function openLineChartPreview() {
    if (!lineChartInstance || typeof Highcharts === "undefined") return;
    openChartPreviewDialog(
      document.getElementById("line-chart-title") ? document.getElementById("line-chart-title").textContent : "Тренд",
      function (body) {
        var host = createPreviewChartHost(body);
        var options = buildPreviewChartOptions(lineChartInstance, 540);
        if (!options) return;
        var preview = Highcharts.chart(host, options);
        chartPreviewInstances.push(preview);
        setTimeout(function () {
          if (preview && typeof preview.reflow === "function") preview.reflow();
        }, 0);
      }
    );
  }

  function openBarChartPreview() {
    if (!waterfallChartInstance || typeof Highcharts === "undefined") return;
    openChartPreviewDialog(
      document.getElementById("bar-chart-title") ? document.getElementById("bar-chart-title").textContent : "План / факт",
      function (body) {
        var host = createPreviewChartHost(body);
        var options = buildPreviewChartOptions(waterfallChartInstance, 540);
        if (!options) return;
        var preview = Highcharts.chart(host, options);
        chartPreviewInstances.push(preview);
        setTimeout(function () {
          if (preview && typeof preview.reflow === "function") preview.reflow();
        }, 0);
      }
    );
  }

  function bindChartPreviewTrigger(el, openFn) {
    if (!el || typeof openFn !== "function" || el._chartPreviewBound) return;
    el._chartPreviewBound = true;
    el.classList.add("chart-preview-trigger");
    el.addEventListener("click", function () {
      openFn();
    });
  }

  function bindChartPreviewTriggers() {
    bindChartPreviewTrigger(document.getElementById("chart-line"), openLineChartPreview);
    bindChartPreviewTrigger(document.getElementById("chart-bar"), openBarChartPreview);
    bindChartPreviewTrigger(document.getElementById("donuts-grid"), openDonutChartsPreview);
  }

  function findPlanSeriesIndexForRag(series) {
    for (var i = 0; i < series.length; i++) {
      var n = String(series[i].name || "").toLowerCase();
      if (/план|цель|норма/.test(n)) return i;
    }
    return -1;
  }

  function findFactSeriesIndexForRag(series) {
    for (var i = 0; i < series.length; i++) {
      if (/факт/i.test(String(series[i].name || ""))) return i;
    }
    if (series.length === 1) return 0;
    var planIdx = findPlanSeriesIndexForRag(series);
    for (var j = 0; j < series.length; j++) {
      if (j === planIdx) continue;
      var n2 = String(series[j].name || "").toLowerCase();
      if (!/план|цель|норма/.test(n2)) return j;
    }
    return 0;
  }

  function lineSeriesHasNumericValues(data) {
    if (!Array.isArray(data) || !data.length) return false;
    for (var i = 0; i < data.length; i++) {
      if (data[i] != null && !isNaN(Number(data[i]))) return true;
    }
    return false;
  }

  function getLineIndicatorIndex(indicator) {
    if (!indicator || !lineChartIndicators || !lineChartIndicators.length) return -1;
    var directIndex = lineChartIndicators.indexOf(indicator);
    if (directIndex >= 0) return directIndex;
    if (indicator.id == null) return -1;
    var indicatorId = String(indicator.id);
    for (var i = 0; i < lineChartIndicators.length; i++) {
      var current = lineChartIndicators[i];
      if (!current || current.id == null) continue;
      if (String(current.id) === indicatorId) return i;
    }
    return -1;
  }

  function getLineIndicatorAccentColor(indicator) {
    var index = getLineIndicatorIndex(indicator);
    if (index < 0) return "";
    return getAllChartsPaletteColor(index);
  }

  function buildLineChartSeriesFactOnly(indicator, accentColor) {
    var series = indicator.series;
    if (!series || !series.length) return [];
    var factIdx = findFactSeriesIndexForRag(series);
    if (factIdx < 0 || factIdx >= series.length) factIdx = 0;
    var factSeries = series[factIdx];
    var factColor = accentColor || factSeries.color || "#2563eb";
    var chartSeries = [
      {
        type: "line",
        name: factSeries.name,
        color: factColor,
        data: factSeries.data.slice(),
        marker: {
          enabled: true,
          radius: 4,
          symbol: "circle",
          lineWidth: 2,
          lineColor: "#ffffff",
          fillColor: factColor,
        },
      },
    ];

    var planIdx = findPlanSeriesIndexForRag(series);
    if (planIdx >= 0 && planIdx < series.length) {
      var planSeries = series[planIdx];
      if (lineSeriesHasNumericValues(planSeries.data)) {
        chartSeries.push({
          type: "line",
          name: planSeries.name,
          color: getChartPlanColor(factColor),
          data: planSeries.data.slice(),
          dashStyle: planSeries.dashStyle || "Dash",
          marker: {
            enabled: false,
          },
        });
      }
    }

    return chartSeries;
  }

  var ALL_CHARTS_COLOR_PALETTE = [
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#8b5cf6",
    "#06b6d4",
    "#ef4444",
    "#84cc16",
    "#0f766e",
    "#f97316",
    "#6366f1",
  ];

  function getAllChartsPaletteColor(index) {
    return ALL_CHARTS_COLOR_PALETTE[index % ALL_CHARTS_COLOR_PALETTE.length];
  }

  function getChartColorVariant(baseColor, brightenBy) {
    if (typeof Highcharts !== "undefined" && Highcharts.color) {
      return Highcharts.color(baseColor).brighten(brightenBy).get();
    }
    return baseColor;
  }

  function getChartPlanColor(baseColor) {
    if (typeof Highcharts !== "undefined" && Highcharts.color) {
      return Highcharts.color(baseColor).brighten(0.08).setOpacity(0.45).get();
    }
    return getChartColorVariant(baseColor, 0.08);
  }

  function formatBarChartAxisLabel(value) {
    var text = value == null ? "" : String(value).replace(/\s+/g, " ").trim();
    if (!text) return "";
    var words = text.split(" ");
    if (words.length <= 1 || text.length <= 16) return DashUi.escapeHtml(text);

    var splitIndex = 1;
    var bestDelta = Infinity;
    for (var i = 1; i < words.length; i++) {
      var left = words.slice(0, i).join(" ");
      var right = words.slice(i).join(" ");
      var delta = Math.abs(left.length - right.length);
      if (delta < bestDelta) {
        bestDelta = delta;
        splitIndex = i;
      }
    }

    var firstLine = words.slice(0, splitIndex).join(" ").trim();
    var secondLine = words.slice(splitIndex).join(" ").trim();
    if (!firstLine || !secondLine) return DashUi.escapeHtml(text);
    return (
      '<span style="display:inline-block;white-space:normal;text-align:center;line-height:1.2;">' +
      DashUi.escapeHtml(firstLine) +
      "<br>" +
      DashUi.escapeHtml(secondLine) +
      "</span>"
    );
  }

  function buildBarChartXAxis(categories, title) {
    return {
      categories: categories,
      title: { text: title || "Показатель" },
      lineColor: "#cbd5e1",
      labels: {
        useHTML: true,
        autoRotation: false,
        reserveSpace: true,
        rotation: 0,
        style: {
          whiteSpace: "normal",
          textAlign: "center",
          fontSize: "11px",
        },
        formatter: function () {
          return formatBarChartAxisLabel(this.value);
        },
      },
    };
  }

  function shortenLineLegendLabel(label, suffix) {
    var text = label == null ? "" : String(label).trim();
    if (text.length > 18) text = text.slice(0, 15).trim() + "...";
    return suffix ? text + " · " + suffix : text;
  }

  function pickIndicatorBarValue(values) {
    if (!values || !values.length) return null;
    for (var i = 0; i < values.length; i++) {
      if (values[i] != null && !isNaN(Number(values[i]))) return Number(values[i]);
    }
    return null;
  }

  function buildLineChartSeriesForAllIndicators(indicators) {
    if (!indicators || !indicators.length) return [];
    return indicators.reduce(function (acc, indicator, idx) {
      var accent = getLineIndicatorAccentColor(indicator) || getAllChartsPaletteColor(idx);
      var series = buildLineChartSeriesFactOnly(indicator, accent);
      if (!series.length) return acc;
      var label = indicator.optionLabel || indicator.title || series[0].name;
      var pairKey = "indicator-" + String(idx);

      acc.push({
        type: "line",
        name: label,
        legendLabel: shortenLineLegendLabel(label, "Ф"),
        indicatorLabel: label,
        pairKey: pairKey,
        valueRole: "fact",
        color: accent,
        data: series[0].data.slice(),
        marker: {
          enabled: true,
          radius: 4,
          symbol: "circle",
          lineWidth: 2,
          lineColor: "#ffffff",
          fillColor: accent,
        },
      });

      if (series.length > 1) {
        acc.push({
          type: "line",
          name: label + " (план)",
          legendLabel: shortenLineLegendLabel(label, "П"),
          indicatorLabel: label,
          pairKey: pairKey,
          valueRole: "plan",
          color: getChartPlanColor(accent),
          data: series[1].data.slice(),
          dashStyle: series[1].dashStyle || "Dash",
          marker: {
            enabled: false,
          },
        });
      }

      return acc;
    }, []);
  }

  function findLineSeriesByRole(chart, pairKey, role) {
    if (!chart || !pairKey || !role || !chart.series) return null;
    for (var i = 0; i < chart.series.length; i++) {
      var series = chart.series[i];
      var opts = (series && series.userOptions) || {};
      if (opts.pairKey === pairKey && opts.valueRole === role) return series;
    }
    return null;
  }

  function getSeriesPointValue(series, pointIndex) {
    if (!series || !series.points || pointIndex < 0 || pointIndex >= series.points.length) return null;
    var point = series.points[pointIndex];
    if (!point || point.y == null || isNaN(Number(point.y))) return null;
    return Number(point.y);
  }

  function buildAllIndicatorsLineTooltip() {
    var point = this.point;
    var series = this.series;
    var chart = series && series.chart;
    var opts = (series && series.userOptions) || {};
    var pointIndex = point ? point.index : -1;
    var pairKey = opts.pairKey;
    var factSeries = opts.valueRole === "fact" ? series : findLineSeriesByRole(chart, pairKey, "fact");
    var planSeries = opts.valueRole === "plan" ? series : findLineSeriesByRole(chart, pairKey, "plan");
    var factValue = getSeriesPointValue(factSeries, pointIndex);
    var planValue = getSeriesPointValue(planSeries, pointIndex);
    var indicatorLabel = opts.indicatorLabel || series.name || "Показатель";
    var html = '<span style="font-size:10px">' + DashUi.escapeHtml(String(this.x)) + "</span><br/>";

    html +=
      '<span style="color:#64748b">KPI:</span> <b>' +
      DashUi.escapeHtml(indicatorLabel) +
      "</b><br/>";

    if (planValue != null) {
      html +=
        '<span style="color:' + planSeries.color + '">●</span> План: <b>' +
        DashUi.escapeHtml(DashUi.formatNumber(planValue)) +
        "</b><br/>";
    }

    if (factValue != null) {
      html +=
        '<span style="color:' + factSeries.color + '">●</span> Факт: <b>' +
        DashUi.escapeHtml(DashUi.formatNumber(factValue)) +
        "</b><br/>";
    }

    if (planValue == null && factValue == null && point && point.y != null) {
      html +=
        '<span style="color:' + point.color + '">●</span> ' +
        DashUi.escapeHtml(opts.valueRole === "plan" ? "План" : "Факт") +
        ": <b>" +
        DashUi.escapeHtml(DashUi.formatNumber(point.y)) +
        "</b><br/>";
    }

    return html;
  }

  function buildBarChartSeriesForAllIndicators(indicators) {
    if (!indicators || !indicators.length) return [];
    var planData = [];
    var factData = [];
    indicators.forEach(function (indicator) {
      planData.push(pickIndicatorBarValue(indicator.plan || []));
      factData.push(pickIndicatorBarValue(indicator.fact || []));
    });
    return [
      { name: "План", data: planData, color: "#c8d6ee" },
      { name: "Факт", data: factData, color: "#2b5ca6" },
    ];
  }

  function renderLineChartForIndicator(indicator) {
    var titleEl = document.getElementById("line-chart-title");
    if (titleEl) titleEl.textContent = "Тренд: " + indicator.title;

    var elLine = document.getElementById("chart-line");
    if (!elLine || typeof Highcharts === "undefined") return;

    if (lineChartInstance) {
      lineChartInstance.destroy();
      lineChartInstance = null;
    }

    var chartClickHandler = function (e) {
      if (e && e.originalEvent && typeof e.originalEvent.stopPropagation === "function") {
        e.originalEvent.stopPropagation();
      }
      openLineChartPreview();
    };

    var accentColor = getLineIndicatorAccentColor(indicator);
    lineChartInstance = Highcharts.chart(elLine, {
      chart: { type: "line", backgroundColor: "transparent", height: 300, animation: false, reflow: false },
      title: { text: null },
      credits: { enabled: false },
      xAxis: {
        categories: indicator.categories.slice(),
        title: { text: indicator.xAxisTitle || "Период" },
        lineColor: "#cbd5e1",
      },
      yAxis: {
        title: { text: indicator.yAxisTitle || "Значение" },
        gridLineColor: "#f1f5f9",
      },
      legend: {
        align: "center",
        verticalAlign: "bottom",
        layout: "horizontal",
        alignColumns: false,
        itemDistance: 8,
        symbolWidth: 14,
        symbolPadding: 4,
        itemStyle: { fontSize: "10px", fontWeight: "400", textOverflow: "ellipsis" },
        labelFormatter: function () {
          return this.userOptions && this.userOptions.legendLabel ? this.userOptions.legendLabel : this.name;
        },
      },
      tooltip: { shared: true },
      plotOptions: {
        series: { animation: false },
        line: {
          marker: { enabled: true, radius: 4, symbol: "circle" },
          lineWidth: 2,
          cursor: "pointer",
          point: { events: { click: chartClickHandler } },
        },
      },
      series: buildLineChartSeriesFactOnly(indicator, accentColor),
    });
  }

  function renderLineChartForAllIndicators(indicators) {
    var titleEl = document.getElementById("line-chart-title");
    if (titleEl) titleEl.textContent = "Тренд: все показатели";

    var elLine = document.getElementById("chart-line");
    if (!elLine || typeof Highcharts === "undefined") return;

    if (lineChartInstance) {
      lineChartInstance.destroy();
      lineChartInstance = null;
    }

    if (!indicators || !indicators.length) {
      elLine.innerHTML =
        '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет показателей для графика.</p>';
      return;
    }

    var baseIndicator = indicators[0];
    lineChartInstance = Highcharts.chart(elLine, {
      chart: { type: "line", backgroundColor: "transparent", height: 300, animation: false, reflow: false },
      title: { text: null },
      credits: { enabled: false },
      xAxis: {
        categories: baseIndicator.categories.slice(),
        title: { text: baseIndicator.xAxisTitle || "Период" },
        lineColor: "#cbd5e1",
      },
      yAxis: {
        title: { text: baseIndicator.yAxisTitle || "Значение" },
        gridLineColor: "#f1f5f9",
      },
      legend: {
        align: "center",
        verticalAlign: "bottom",
        layout: "horizontal",
        alignColumns: false,
        itemDistance: 8,
        symbolWidth: 14,
        symbolPadding: 4,
        itemStyle: { fontSize: "10px", fontWeight: "400", textOverflow: "ellipsis" },
        labelFormatter: function () {
          return this.userOptions && this.userOptions.legendLabel ? this.userOptions.legendLabel : this.name;
        },
      },
      tooltip: {
        shared: false,
        useHTML: true,
        formatter: buildAllIndicatorsLineTooltip,
      },
      plotOptions: {
        series: { animation: false, findNearestPointBy: "xy", stickyTracking: false },
        line: { marker: { enabled: true, radius: 4, symbol: "circle" }, lineWidth: 2 },
      },
      series: buildLineChartSeriesForAllIndicators(indicators),
    });
  }

  function initLineChartMetricSelect(elLine) {
    var sel = document.getElementById("line-chart-metric");
    var label = document.querySelector(".line-chart-metric-label");
    if (!sel) return;

    sel.innerHTML = "";
    if (!lineChartIndicators.length) {
      sel.disabled = true;
      if (label) label.style.display = "none";
      if (elLine) {
        elLine.innerHTML =
          '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет показателей для графика.</p>';
      }
      return;
    }

    sel.disabled = false;
    if (label) label.style.display = "";

    var allOpt = document.createElement("option");
    allOpt.value = getChartSelectAllValue();
    allOpt.textContent = "Отобразить все";
    sel.appendChild(allOpt);

    lineChartIndicators.forEach(function (ind, idx) {
      var opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = ind.optionLabel || ind.title;
      sel.appendChild(opt);
    });

    sel.onchange = function () {
      if (sel.value === getChartSelectAllValue()) {
        renderLineChartForAllIndicators(lineChartIndicators);
        return;
      }
      var i = parseInt(sel.value, 10);
      if (!isNaN(i) && lineChartIndicators[i]) renderLineChartForIndicator(lineChartIndicators[i]);
    };

    sel.value = getChartSelectAllValue();
    renderLineChartForAllIndicators(lineChartIndicators);
  }

  function findCurrentTileForIndicator(indicator) {
    var tiles = getCurrentTiles();
    if (!tiles || !indicator || indicator.id == null) return null;
    var id = String(indicator.id);
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (!t || t.kpi_id == null) continue;
      if (String(t.kpi_id) === id) return t;
    }
    return null;
  }

  function getBarChartKpiPctLabel(indicator, pointIndex) {
    var pt =
      indicator &&
      indicator.points &&
      typeof pointIndex === "number" &&
      pointIndex >= 0 &&
      pointIndex < indicator.points.length
        ? indicator.points[pointIndex]
        : null;
    var pct =
      pt && typeof pt.kpi_pct === "number" && !isNaN(pt.kpi_pct)
        ? pt.kpi_pct
        : pt && typeof pt.kpi_pst === "number" && !isNaN(pt.kpi_pst)
          ? pt.kpi_pst
          : null;
    if (pct == null) {
      var tile = findCurrentTileForIndicator(indicator);
      if (tile) {
        var pres = MockData.getKpiTilePresentation(tile);
        pct =
          tile.kpi_pct != null && typeof tile.kpi_pct === "number" && !isNaN(tile.kpi_pct)
            ? tile.kpi_pct
            : tile.kpi_pst != null && typeof tile.kpi_pst === "number" && !isNaN(tile.kpi_pst)
              ? tile.kpi_pst
              : pres.percent;
      }
    }
    return pct == null ? "—" : MockData.formatKpiPercentLabel(pct) + "%";
  }

  function renderBarChartForIndicator(indicator) {
    var titleEl = document.getElementById("bar-chart-title");
    if (titleEl) titleEl.textContent = "План / факт: " + indicator.title;

    var elBar = document.getElementById("chart-bar");
    if (!elBar || typeof Highcharts === "undefined") return;

    var cats = indicator.categories;
    var plan = indicator.plan;
    var fact = indicator.fact;
    var n = cats ? cats.length : 0;
    if (!n || !plan || !fact || plan.length !== n || fact.length !== n) {
      elBar.innerHTML =
        '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Некорректные данные для графика.</p>';
      return;
    }

    if (waterfallChartInstance) {
      waterfallChartInstance.destroy();
      waterfallChartInstance = null;
    }

    var barTooltipFormatter = function () {
      var pts = this.points || [];
      var pointIndex = pts.length && pts[0] && pts[0].point ? pts[0].point.index : -1;
      var html = '<span style="font-size:10px">' + DashUi.escapeHtml(String(this.x)) + "</span><br/>";
      pts.forEach(function (p) {
        html +=
          '<span style="color:' + p.color + '">●</span> ' +
          DashUi.escapeHtml(p.series.name) +
          ": <b>" +
          DashUi.escapeHtml(DashUi.formatNumber(p.y)) +
          "</b><br/>";
      });
      html +=
        '<span style="color:#64748b">●</span> KPI: <b>' +
        DashUi.escapeHtml(getBarChartKpiPctLabel(indicator, pointIndex)) +
        "</b>";
      return html;
    };
    var barClickHandler = function (e) {
      if (e && e.originalEvent && typeof e.originalEvent.stopPropagation === "function") {
        e.originalEvent.stopPropagation();
      }
      openBarChartPreview();
    };

    waterfallChartInstance = Highcharts.chart(elBar, {
      chart: { type: "column", backgroundColor: "transparent", height: 300, animation: false, reflow: false },
      title: { text: null },
      credits: { enabled: false },
      xAxis: buildBarChartXAxis(cats.slice(), indicator.xAxisTitle || "Показатель"),
      yAxis: {
        title: { text: indicator.yAxisTitle || "Значение" },
        gridLineColor: "#f1f5f9",
      },
      legend: { align: "center", verticalAlign: "bottom" },
      tooltip: { shared: true, useHTML: true, formatter: barTooltipFormatter },
      plotOptions: {
        series: { animation: false },
        column: {
          grouping: true,
          borderRadius: 3,
          borderWidth: 0,
          cursor: "pointer",
          point: { events: { click: barClickHandler } },
        },
      },
      series: [
        { name: "План", data: plan.map(Number), color: "#c8d6ee" },
        { name: "Факт", data: fact.map(Number), color: "#2b5ca6" },
      ],
    });
  }

  function renderBarChartForAllIndicators(indicators) {
    var titleEl = document.getElementById("bar-chart-title");
    if (titleEl) titleEl.textContent = "План / факт: все показатели";

    var elBar = document.getElementById("chart-bar");
    if (!elBar || typeof Highcharts === "undefined") return;

    if (waterfallChartInstance) {
      waterfallChartInstance.destroy();
      waterfallChartInstance = null;
    }

    if (!indicators || !indicators.length) {
      elBar.innerHTML =
        '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет показателей для графика.</p>';
      return;
    }

    var categories = indicators.map(function (indicator) {
      return buildBarIndicatorDisplayLabel(indicator);
    });

    waterfallChartInstance = Highcharts.chart(elBar, {
      chart: { type: "column", backgroundColor: "transparent", height: 300, animation: false, reflow: false },
      title: { text: null },
      credits: { enabled: false },
      xAxis: buildBarChartXAxis(categories, "Показатели"),
      yAxis: {
        title: { text: "План / факт" },
        gridLineColor: "#f1f5f9",
      },
      legend: { align: "center", verticalAlign: "bottom" },
      tooltip: {
        shared: true,
        useHTML: true,
        formatter: function () {
          var html = '<span style="font-size:10px">' + DashUi.escapeHtml(String(this.x)) + "</span><br/>";
          (this.points || []).forEach(function (p) {
            html +=
              '<span style="color:' + p.color + '">●</span> ' +
              DashUi.escapeHtml(p.series.name) +
              ": <b>" +
              DashUi.escapeHtml(DashUi.formatNumber(p.y)) +
              "</b><br/>";
          });
          return html;
        },
      },
      plotOptions: {
        series: { animation: false },
        column: {
          grouping: true,
          borderRadius: 3,
          borderWidth: 0,
          groupPadding: 0.12,
          pointPadding: 0.04,
        },
      },
      series: buildBarChartSeriesForAllIndicators(indicators),
    });
  }

  function buildBarIndicatorDisplayLabel(indicator) {
    if (!indicator || typeof indicator !== "object") return "KPI";
    var categoryLabels = Array.isArray(indicator.categories)
      ? indicator.categories
          .map(function (category) {
            return category == null ? "" : String(category).trim();
          })
          .filter(function (category) {
            return !!category;
          })
      : [];
    if (categoryLabels.length) return categoryLabels.join(", ");
    var base = indicator.optionLabel || indicator.title || "KPI";
    return String(base).trim() || "KPI";
  }

  function initBarMetricSelect(elBar) {
    var sel = document.getElementById("waterfall-chart-metric");
    var label = document.querySelector('label[for="waterfall-chart-metric"]');
    if (!sel) return;

    sel.innerHTML = "";
    if (!waterfallChartIndicators.length) {
      sel.disabled = true;
      if (label) label.style.display = "none";
      if (elBar) {
        elBar.innerHTML =
          '<p class="chart-load-error" style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет показателей для графика.</p>';
      }
      return;
    }

    sel.disabled = false;
    if (label) label.style.display = "";

    var allOpt = document.createElement("option");
    allOpt.value = getChartSelectAllValue();
    allOpt.textContent = "Отобразить все";
    sel.appendChild(allOpt);

    waterfallChartIndicators.forEach(function (ind, idx) {
      var opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = buildBarIndicatorDisplayLabel(ind);
      opt.title = String(ind.optionLabel || ind.title || opt.textContent || "KPI").trim();
      sel.appendChild(opt);
    });

    sel.onchange = function () {
      if (sel.value === getChartSelectAllValue()) {
        renderBarChartForAllIndicators(waterfallChartIndicators);
        return;
      }
      var i = parseInt(sel.value, 10);
      if (!isNaN(i) && waterfallChartIndicators[i]) renderBarChartForIndicator(waterfallChartIndicators[i]);
    };

    sel.value = getChartSelectAllValue();
    renderBarChartForAllIndicators(waterfallChartIndicators);
  }

  function destroyDonutCharts() {
    donutChartInstances.forEach(function (c) {
      if (c && typeof c.destroy === "function") c.destroy();
    });
    donutChartInstances = [];
  }

  function buildDonutChartSeriesData(displayPct, fill, track) {
    if (displayPct >= 100) {
      var over = displayPct - 100;
      return [
        { name: "100%", y: 100, color: fill },
        { name: "Сверх 100%", y: over, color: Highcharts.color(fill).brighten(0.25).get() },
      ];
    }
    return [
      { name: "Показатель", y: displayPct, color: fill },
      { name: "До 100%", y: 100 - displayPct, color: track },
    ];
  }

  function buildDonutChartOptions(tile, chartSize) {
    var pres = MockData.getKpiTilePresentation(tile);
    var pct = pres.percent;
    var fill = pres.fillColor;
    var track = "#e2e8f0";
    var displayPct = Math.max(0, pct);
    var pctLabel = MockData.formatKpiPercentLabel(pct) + "%";
    return {
      chart: {
        type: "pie",
        backgroundColor: "transparent",
        height: chartSize,
        margin: [0, 0, 0, 0],
        animation: false,
      },
      title: {
        text: pctLabel,
        align: "center",
        verticalAlign: "middle",
        y: 2,
        style: {
          fontSize: chartSize <= 108 ? "11px" : chartSize >= 200 ? "17px" : "13px",
          fontWeight: "700",
          color: fill,
        },
      },
      credits: { enabled: false },
      tooltip: { enabled: false },
      plotOptions: {
        pie: {
          innerSize: "70%",
          dataLabels: { enabled: false },
          states: { hover: { enabled: false } },
          borderWidth: 0,
          startAngle: 0,
          animation: false,
        },
      },
      series: [{ data: buildDonutChartSeriesData(displayPct, fill, track) }],
    };
  }

  function renderDonutChartIntoContainer(chartDiv, tile, chartSize) {
    return Highcharts.chart(chartDiv, buildDonutChartOptions(tile, chartSize));
  }

  function openDonutChartsPreview() {
    var tiles = getCurrentTiles();
    if (!tiles || !tiles.length || typeof Highcharts === "undefined") return;
    openChartPreviewDialog("Показатели KPI", function (body) {
      var grid = document.createElement("div");
      grid.className = "chart-preview-donuts-grid";
      body.appendChild(grid);

      tiles.forEach(function (tile) {
        var cell = document.createElement("div");
        cell.className = "chart-preview-donut-cell";

        var chartHost = document.createElement("div");
        chartHost.className = "chart-preview-donut-chart";

        var label = document.createElement("div");
        label.className = "chart-preview-donut-label";
        var previewLabelText = String(tile.title || tile.badge || "").trim();
        label.textContent = tile.title || tile.badge || "";
        label.title = tile.title || "";
        if (previewLabelText.length > 0 && previewLabelText.length <= 10) {
          label.classList.add("chart-preview-donut-label--short");
        }

        cell.appendChild(chartHost);
        cell.appendChild(label);
        grid.appendChild(cell);

        var preview = renderDonutChartIntoContainer(chartHost, tile, 220);
        chartPreviewInstances.push(preview);
      });

      setTimeout(function () {
        chartPreviewInstances.forEach(function (chart) {
          if (chart && typeof chart.reflow === "function") chart.reflow();
        });
      }, 0);
    });
  }

  function renderDonutCharts(context) {
    mergeContext(context);

    var grid = document.getElementById("donuts-grid");
    if (!grid) return;
    grid.innerHTML = "";
    destroyDonutCharts();

    var tiles = getCurrentTiles();
    if (!tiles || !tiles.length || typeof Highcharts === "undefined") {
      updateDonutChartsPagerUISafe(0);
      grid.innerHTML =
        '<p style="margin:0;padding:20px;color:#64748b;font-size:14px;">Нет данных для диаграмм.</p>';
      return;
    }

    var visibleTiles = getVisibleDonutTilesSafe(tiles);
    updateDonutChartsPagerUISafe(tiles.length);

    visibleTiles.forEach(function (tile, idx) {
      var cell = document.createElement("div");
      cell.className = "donut-cell";
      var chartDiv = document.createElement("div");
      chartDiv.className = "donut-chart-container";
      chartDiv.id = "donut-chart-" + String(idx);
      var label = document.createElement("div");
      label.className = "donut-label";
      var labelText = String(tile.title || tile.badge || "").trim();
      label.textContent = tile.title || tile.badge || "";
      label.title = tile.title || "";
      if (labelText.length > 0 && labelText.length <= 10) {
        label.classList.add("donut-label--short");
      }
      cell.appendChild(chartDiv);
      cell.appendChild(label);
      grid.appendChild(cell);
      var containerWidth = chartDiv.clientWidth || cell.clientWidth || 120;
      var chartSize = Math.max(96, Math.min(140, containerWidth));
      var chart = renderDonutChartIntoContainer(chartDiv, tile, chartSize);
      donutChartInstances.push(chart);
    });
  }

  function destroyAllDashboardCharts() {
    closeChartPreviewDialog();
    if (lineChartInstance) {
      lineChartInstance.destroy();
      lineChartInstance = null;
    }
    if (waterfallChartInstance) {
      waterfallChartInstance.destroy();
      waterfallChartInstance = null;
    }
    destroyDonutCharts();
  }

  function initCharts(context) {
    var ctx = mergeContext(context);
    destroyAllDashboardCharts();

    if (typeof Highcharts === "undefined") {
      showChartLoadError();
      return;
    }

    ensureDashboardChartsResizeObserver();
    bindChartPreviewTriggers();

    Highcharts.setOptions({
      lang: {
        months: [
          "Январь",
          "Февраль",
          "Март",
          "Апрель",
          "Май",
          "Июнь",
          "Июль",
          "Август",
          "Сентябрь",
          "Октябрь",
          "Ноябрь",
          "Декабрь",
        ],
        shortMonths: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
      },
      chart: {
        style: { fontFamily: "Segoe UI, system-ui, sans-serif" },
        animation: false,
      },
      plotOptions: {
        series: {
          animation: false,
        },
      },
    });

    var elLine = document.getElementById("chart-line");
    var elBar = document.getElementById("chart-bar");
    var ci = ctx.apiChartIndicators;
    var hasApiLine = ci && ci.line && ci.line.length > 0;
    var hasApiBar = ci && ci.bar && ci.bar.length > 0;

    lineChartIndicators = hasApiLine ? ci.line : MockData.getLineChartIndicators(ctx.role);
    initLineChartMetricSelect(elLine);

    waterfallChartIndicators = hasApiBar ? ci.bar : MockData.getWaterfallChartIndicators(ctx.role);
    initBarMetricSelect(elBar);

    renderDonutCharts();

    setTimeout(scheduleDashboardChartsResize, 100);
  }

  global.DashboardCharts = {
    initCharts: initCharts,
    destroyAllDashboardCharts: destroyAllDashboardCharts,
    renderDonutCharts: renderDonutCharts,
  };
})(typeof window !== "undefined" ? window : globalThis);
