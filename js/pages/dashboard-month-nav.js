(function (global) {
  var MONTH_NAMES_RU = [
    "", "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
  ];

  var currentPeriodMonth = null;
  var currentPeriodYear = null;
  var availableMonths = [];
  var availableMonthsContextKey = "";
  var availableMonthsByContext = Object.create(null);
  var aggregationMode = "current";
  var selectedQuarters = [1];
  var latestContext = {};
  var bound = false;
  var currentModePeriodByContext = Object.create(null);

  function mergeContext(nextContext) {
    latestContext = Object.assign({}, latestContext || {}, nextContext || {});
    return latestContext;
  }

  function getContext() {
    return latestContext || {};
  }

  function getSelectedViewId() {
    var fn = getContext().getSelectedViewId;
    return typeof fn === "function" ? fn() : "self";
  }

  function getDepartmentForCurrentKpiContext() {
    var fn = getContext().getDepartmentForCurrentKpiContext;
    return typeof fn === "function" ? fn() : "";
  }

  function getViewContextUser() {
    var fn = getContext().getViewContextUser;
    return typeof fn === "function" ? fn() : null;
  }

  function getSessionUser() {
    var fn = getContext().getSessionUser;
    return typeof fn === "function" ? fn() : null;
  }

  function onPeriodChange(month, year) {
    var fn = getContext().onPeriodChange;
    if (typeof fn === "function") fn(month, year);
  }

  function onAggregationModeChange(mode) {
    var fn = getContext().onAggregationModeChange;
    if (typeof fn === "function") fn(mode);
  }

  function normalizeRole(value) {
    return value == null ? "" : String(value).trim().toLocaleLowerCase("ru-RU");
  }

  function shouldShowAggregationModeSelect() {
    return true;
  }

  function computeQuarterFromMonth(month) {
    var m = parseInt(String(month), 10);
    if (isNaN(m) || m < 1 || m > 12) return null;
    return Math.ceil(m / 3);
  }

  function quarterLabelRu(q) {
    if (q === 1) return "I кв.";
    if (q === 2) return "II кв.";
    if (q === 3) return "III кв.";
    if (q === 4) return "IV кв.";
    return String(q) + " кв.";
  }

  function normalizeQuarterList(value) {
    var list = Array.isArray(value) ? value : [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var q = parseInt(String(list[i]), 10);
      if (isNaN(q) || q < 1 || q > 4) continue;
      if (seen[q]) continue;
      seen[q] = true;
      out.push(q);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function getDefaultSelectedQuarter() {
    var q = computeQuarterFromMonth(currentPeriodMonth);
    return q != null ? q : 1;
  }

  function quarterHasAnyMonthData(q, year) {
    if (!availableMonths || !availableMonths.length) return false;
    var qq = parseInt(String(q), 10);
    var yy = parseInt(String(year), 10);
    if (isNaN(qq) || qq < 1 || qq > 4 || isNaN(yy)) return false;
    var start = (qq - 1) * 3 + 1;
    var end = qq * 3;
    for (var i = 0; i < availableMonths.length; i++) {
      var slot = availableMonths[i];
      if (!slot) continue;
      if (Number(slot.year) !== yy) continue;
      var m = Number(slot.month);
      if (m >= start && m <= end) return true;
    }
    return false;
  }

  function pickBestMonthForQuarter(q, year) {
    var qq = parseInt(String(q), 10);
    var yy = parseInt(String(year), 10);
    if (isNaN(qq) || qq < 1 || qq > 4 || isNaN(yy)) return null;
    var start = (qq - 1) * 3 + 1;
    var end = qq * 3;
    var best = null;
    for (var i = 0; i < availableMonths.length; i++) {
      var slot = availableMonths[i];
      if (!slot) continue;
      if (Number(slot.year) !== yy) continue;
      var m = Number(slot.month);
      if (m < start || m > end) continue;
      if (!best || m > best) best = m;
    }
    if (best != null) return { month: best, year: yy };
    return null;
  }

  function pickBestMonthForSelectedQuarters(quarters, year) {
    var qs = normalizeQuarterList(quarters);
    if (!qs.length) return null;
    var yy = parseInt(String(year), 10);
    if (isNaN(yy)) return null;
    var best = null;
    for (var i = 0; i < qs.length; i++) {
      var picked = pickBestMonthForQuarter(qs[i], yy);
      if (picked && (!best || picked.month > best.month)) {
        best = picked;
      }
    }
    return best;
  }

  function openQuarterPopover() {
    var wrap = document.getElementById("month-nav-quarter-wrap");
    var trigger = document.getElementById("month-nav-quarter-trigger");
    var pop = document.getElementById("month-nav-quarter-popover");
    if (!wrap || !trigger || !pop) return;
    if (wrap.hidden) return;
    pop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    renderQuarterOptionsIntoPopover();
  }

  function closeQuarterPopover() {
    var trigger = document.getElementById("month-nav-quarter-trigger");
    var pop = document.getElementById("month-nav-quarter-popover");
    if (pop) pop.hidden = true;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }

  function getQuarterSelectionDraftFromDom() {
    var opts = document.getElementById("month-nav-quarter-options");
    if (!opts) return normalizeQuarterList(selectedQuarters);
    var inputs = opts.querySelectorAll('input[type="checkbox"][data-quarter]');
    var picked = [];
    inputs.forEach(function (input) {
      if (!input || input.disabled) return;
      if (input.checked) {
        picked.push(parseInt(String(input.getAttribute("data-quarter")), 10));
      }
    });
    return normalizeQuarterList(picked);
  }

  function renderQuarterOptionsIntoPopover() {
    var opts = document.getElementById("month-nav-quarter-options");
    var trigger = document.getElementById("month-nav-quarter-trigger");
    if (!opts) return;
    var y = currentPeriodYear;
    var effective = normalizeQuarterList(selectedQuarters);
    if (!effective.length) effective = [getDefaultSelectedQuarter()];

    opts.innerHTML = "";
    for (var q = 1; q <= 4; q++) {
      var enabled = quarterHasAnyMonthData(q, y);
      var row = document.createElement("label");
      row.className = "month-nav-quarter-option" + (enabled ? "" : " is-disabled");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-quarter", String(q));
      input.disabled = !enabled;
      input.checked = enabled && effective.indexOf(q) !== -1;
      var span = document.createElement("span");
      span.className = "month-nav-quarter-option-label";
      span.textContent = quarterLabelRu(q);
      row.appendChild(input);
      row.appendChild(span);
      opts.appendChild(row);
    }

    if (trigger) {
      var label = effective.map(quarterLabelRu).join(", ");
      trigger.textContent = label || "Кварталы";
    }
  }

  function navPlanFactValuePresent(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === "number") return !isNaN(v);
    if (typeof v === "string") return String(v).trim() !== "";
    return true;
  }

  function monthYearKey(year, month) {
    var y = parseInt(String(year), 10);
    var m = parseInt(String(month), 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return -1;
    return y * 100 + m;
  }

  function navPointHasPeriodValue(pt) {
    if (!pt) return false;
    var key = monthYearKey(pt.year, pt.month);
    if (key < 0) return false;
    return navPlanFactValuePresent(pt.fact) || navPlanFactValuePresent(pt.plan);
  }

  function tileMonthlyPointHasPeriodValue(pt) {
    if (!pt) return false;
    var key = monthYearKey(pt.year, pt.month);
    if (key < 0) return false;
    return (
      pt.has_data === true ||
      navPlanFactValuePresent(pt.fact) ||
      navPlanFactValuePresent(pt.plan) ||
      navPlanFactValuePresent(pt.kpi_pct)
    );
  }

  function collectMonthsFromTiles(tiles) {
    var nextMonths = [];
    if (!Array.isArray(tiles)) return nextMonths;
    for (var ti = 0; ti < tiles.length; ti++) {
      var tile = tiles[ti];
      var monthlyData = tile && Array.isArray(tile.monthly_data) ? tile.monthly_data : [];
      for (var mi = 0; mi < monthlyData.length; mi++) {
        var pt = monthlyData[mi];
        if (!tileMonthlyPointHasPeriodValue(pt)) continue;
        var key = monthYearKey(pt.year, pt.month);
        if (key < 0) continue;
        var exists = false;
        for (var ei = 0; ei < nextMonths.length; ei++) {
          if (nextMonths[ei] && nextMonths[ei].key === key) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          nextMonths.push({
            month: parseInt(String(pt.month), 10),
            year: parseInt(String(pt.year), 10),
            key: key,
          });
        }
      }
    }
    return nextMonths;
  }

  function periodKeyInAvailableMonths(y, m, slots) {
    var k = monthYearKey(y, m);
    if (k < 0) return false;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].key === k) return true;
    }
    return false;
  }

  function mergeAvailableMonthSlots(baseSlots, nextSlots) {
    var merged = [];
    var seen = Object.create(null);

    function pushSlot(slot) {
      if (!slot || slot.key == null || seen[slot.key]) return;
      seen[slot.key] = true;
      merged.push({
        month: slot.month,
        year: slot.year,
        key: slot.key,
      });
    }

    (baseSlots || []).forEach(pushSlot);
    (nextSlots || []).forEach(pushSlot);
    merged.sort(function (a, b) {
      return a.key - b.key;
    });
    return merged;
  }

  function ensureCurrentCalendarMonthSlot(slots) {
    var now = new Date();
    var month = now.getMonth() + 1;
    var year = now.getFullYear();
    var key = monthYearKey(year, month);
    if (key < 0) return slots;
    return mergeAvailableMonthSlots(slots, [{
      month: month,
      year: year,
      key: key,
    }]);
  }

  function getMonthNavigatorContextKey() {
    var viewId = getSelectedViewId() != null ? String(getSelectedViewId()) : "";
    var dept = getDepartmentForCurrentKpiContext();
    var viewContextUser = getViewContextUser();
    var nick =
      viewContextUser && viewContextUser.nickname != null
        ? String(viewContextUser.nickname).trim()
        : "";
    return [viewId, dept, nick].join("|");
  }

  function rememberCurrentModePeriod() {
    var key = getMonthNavigatorContextKey();
    if (!key) return;
    if (
      currentPeriodMonth == null ||
      currentPeriodYear == null ||
      isNaN(Number(currentPeriodMonth)) ||
      isNaN(Number(currentPeriodYear))
    ) {
      return;
    }
    currentModePeriodByContext[key] = {
      month: Number(currentPeriodMonth),
      year: Number(currentPeriodYear),
    };
  }

  function restoreCurrentModePeriod() {
    var key = getMonthNavigatorContextKey();
    if (!key) return false;
    var snapshot = currentModePeriodByContext[key];
    if (!snapshot || snapshot.month == null || snapshot.year == null) return false;
    currentPeriodMonth = snapshot.month;
    currentPeriodYear = snapshot.year;
    return true;
  }

  function setAvailableMonthsFromChartPoints(chartIndicators, options) {
    options = options || {};
    var nextContextKey =
      options.contextKey != null ? String(options.contextKey) : availableMonthsContextKey;
    var nextMonths = [];
    if (chartIndicators) {
      var lines = chartIndicators.line || [];
      for (var li = 0; li < lines.length; li++) {
        var pts = lines[li].points;
        if (!pts) continue;
        for (var pi = 0; pi < pts.length; pi++) {
          var pt = pts[pi];
          if (!navPointHasPeriodValue(pt)) continue;
          var key = monthYearKey(pt.year, pt.month);
          if (key < 0) continue;
          var exists = false;
          for (var ei = 0; ei < nextMonths.length; ei++) {
            if (nextMonths[ei] && nextMonths[ei].key === key) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            nextMonths.push({
              month: parseInt(String(pt.month), 10),
              year: parseInt(String(pt.year), 10),
              key: key,
            });
          }
        }
      }
    }
    if (!nextMonths.length && Array.isArray(options.fallbackTiles)) {
      nextMonths = collectMonthsFromTiles(options.fallbackTiles);
    }
    var cachedMonths =
      nextContextKey && Array.isArray(availableMonthsByContext[nextContextKey])
        ? availableMonthsByContext[nextContextKey]
        : [];
    var baseMonths = options.preserveExisting
      ? mergeAvailableMonthSlots(cachedMonths, availableMonths)
      : cachedMonths;
    availableMonths = mergeAvailableMonthSlots(baseMonths, nextMonths);
    availableMonths = ensureCurrentCalendarMonthSlot(availableMonths);
    availableMonthsContextKey = nextContextKey;
    if (nextContextKey) {
      availableMonthsByContext[nextContextKey] = mergeAvailableMonthSlots([], availableMonths);
    }
  }

  function getCurrentMonthIndex() {
    if (currentPeriodMonth == null || currentPeriodYear == null) return -1;
    var key = currentPeriodYear * 100 + currentPeriodMonth;
    for (var i = 0; i < availableMonths.length; i++) {
      if (availableMonths[i].key === key) return i;
    }
    return -1;
  }

  function isIncompleteCurrentMonth(month, year) {
    var m = parseInt(String(month), 10);
    var y = parseInt(String(year), 10);
    if (isNaN(m) || isNaN(y) || m < 1 || m > 12) return false;
    var now = new Date();
    var nowMonth = now.getMonth() + 1;
    var nowYear = now.getFullYear();
    if (m !== nowMonth || y !== nowYear) return false;
    var lastDayOfMonth = new Date(y, m, 0).getDate();
    return now.getDate() < lastDayOfMonth;
  }

  function updateMonthNavigatorUI() {
    var nav = document.getElementById("month-navigator");
    var label = document.getElementById("month-nav-label");
    var prevBtn = document.getElementById("month-nav-prev");
    var nextBtn = document.getElementById("month-nav-next");
    var warning = document.getElementById("month-nav-warning");
    var aggregationSelect = document.getElementById("month-nav-aggregation");
    var quarterWrap = document.getElementById("month-nav-quarter-wrap");
    if (!nav) return;

    if (currentPeriodMonth == null || currentPeriodYear == null) {
      nav.hidden = true;
      if (warning) warning.hidden = true;
      if (aggregationSelect) aggregationSelect.hidden = true;
      if (quarterWrap) quarterWrap.hidden = true;
      closeQuarterPopover();
      return;
    }

    nav.hidden = false;
    var monthName = MONTH_NAMES_RU[currentPeriodMonth] || String(currentPeriodMonth);
    if (label) label.textContent = monthName + " " + currentPeriodYear;
    if (aggregationSelect) {
      aggregationSelect.hidden = !shouldShowAggregationModeSelect();
      aggregationSelect.value = aggregationMode || "current";
    }
    if (quarterWrap) {
      var showQuarter = (aggregationMode || "current") === "quarter";
      quarterWrap.hidden = !showQuarter;
      if (!showQuarter) {
        closeQuarterPopover();
      } else {
        var effective = normalizeQuarterList(selectedQuarters);
        if (!effective.length) {
          effective = [getDefaultSelectedQuarter()];
          selectedQuarters = effective.slice();
        }
        renderQuarterOptionsIntoPopover();
      }
    }
    if (warning) {
      warning.hidden = !isIncompleteCurrentMonth(currentPeriodMonth, currentPeriodYear);
    }

    var idx = getCurrentMonthIndex();
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx < 0 || idx >= availableMonths.length - 1;
  }

  function navigateToMonth(month, year, options) {
    options = options || {};
    currentPeriodMonth = month;
    currentPeriodYear = year;
    var agg = aggregationMode || "current";
    if ((agg === "current" || agg === "month") && !options.preserveCurrentModeSnapshot) {
      rememberCurrentModePeriod();
    }
    updateMonthNavigatorUI();
    onPeriodChange(month, year);
  }

  function navigateToQuarter(quarter, year) {
    var lastMonth = quarter * 3;
    navigateToMonth(lastMonth, year);
  }

  function getPeriodState() {
    return {
      currentPeriodMonth: currentPeriodMonth,
      currentPeriodYear: currentPeriodYear,
      availableMonths: availableMonths,
      availableMonthsContextKey: availableMonthsContextKey,
      aggregationMode: aggregationMode,
      selectedQuarters: selectedQuarters.slice(),
    };
  }

  function setPeriodState(nextState) {
    if (!nextState || typeof nextState !== "object") return;
    if (Object.prototype.hasOwnProperty.call(nextState, "currentPeriodMonth")) {
      currentPeriodMonth = nextState.currentPeriodMonth;
    }
    if (Object.prototype.hasOwnProperty.call(nextState, "currentPeriodYear")) {
      currentPeriodYear = nextState.currentPeriodYear;
    }
    var aggOnSet = aggregationMode || "current";
    if (
      (aggOnSet === "current" || aggOnSet === "month") &&
      currentPeriodMonth != null &&
      currentPeriodYear != null &&
      !isNaN(Number(currentPeriodMonth)) &&
      !isNaN(Number(currentPeriodYear))
    ) {
      rememberCurrentModePeriod();
    }
    if (Object.prototype.hasOwnProperty.call(nextState, "availableMonths")) {
      availableMonths = Array.isArray(nextState.availableMonths) ? nextState.availableMonths : [];
    }
    if (Object.prototype.hasOwnProperty.call(nextState, "availableMonthsContextKey")) {
      availableMonthsContextKey =
        nextState.availableMonthsContextKey != null ? String(nextState.availableMonthsContextKey) : "";
    }
    if (Object.prototype.hasOwnProperty.call(nextState, "aggregationMode")) {
      aggregationMode =
        nextState.aggregationMode != null && String(nextState.aggregationMode).trim()
          ? String(nextState.aggregationMode).trim()
          : "current";
    }
    if (Object.prototype.hasOwnProperty.call(nextState, "selectedQuarters")) {
      selectedQuarters = normalizeQuarterList(nextState.selectedQuarters);
    }
    if (availableMonthsContextKey) {
      availableMonthsByContext[availableMonthsContextKey] = mergeAvailableMonthSlots([], availableMonths);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    var prevBtn = document.getElementById("month-nav-prev");
    var nextBtn = document.getElementById("month-nav-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        var idx = getCurrentMonthIndex();
        if (idx > 0) {
          var prev = availableMonths[idx - 1];
          navigateToMonth(prev.month, prev.year);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var idx = getCurrentMonthIndex();
        if (idx >= 0 && idx < availableMonths.length - 1) {
          var next = availableMonths[idx + 1];
          navigateToMonth(next.month, next.year);
        }
      });
    }
    var aggregationSelect = document.getElementById("month-nav-aggregation");
    if (aggregationSelect) {
      aggregationSelect.addEventListener("change", function () {
        var prevMode = aggregationMode || "current";
        var nextMode = aggregationSelect.value || "current";
        if (nextMode !== "quarter" && nextMode !== "ytd" && nextMode !== "month") nextMode = "current";
        if ((prevMode === "quarter" || prevMode === "ytd") && (nextMode === "current" || nextMode === "month")) {
          restoreCurrentModePeriod();
        }
        aggregationMode = nextMode;
        updateMonthNavigatorUI();
        onAggregationModeChange(nextMode);
        if (nextMode === "quarter") {
          openQuarterPopover();
        } else {
          closeQuarterPopover();
        }
      });
    }

    var quarterTrigger = document.getElementById("month-nav-quarter-trigger");
    if (quarterTrigger) {
      quarterTrigger.addEventListener("click", function (e) {
        e.preventDefault();
        var expanded = quarterTrigger.getAttribute("aria-expanded") === "true";
        if (expanded) closeQuarterPopover();
        else openQuarterPopover();
      });
    }

    var applyBtn = document.getElementById("month-nav-quarter-apply");
    if (applyBtn) {
      applyBtn.addEventListener("click", function () {
        var picked = getQuarterSelectionDraftFromDom();
        if (!picked.length) picked = [getDefaultSelectedQuarter()];
        selectedQuarters = picked.slice();
        renderQuarterOptionsIntoPopover();
        closeQuarterPopover();
        var best = pickBestMonthForSelectedQuarters(selectedQuarters, currentPeriodYear);
        if (best) navigateToMonth(best.month, best.year, { preserveCurrentModeSnapshot: true });
        onAggregationModeChange("quarter");
      });
    }

    var cancelBtn = document.getElementById("month-nav-quarter-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        closeQuarterPopover();
        renderQuarterOptionsIntoPopover();
      });
    }

    document.addEventListener("click", function (e) {
      var wrap = document.getElementById("month-nav-quarter-wrap");
      var pop = document.getElementById("month-nav-quarter-popover");
      if (!wrap || !pop || pop.hidden) return;
      if (wrap.contains(e.target)) return;
      closeQuarterPopover();
      renderQuarterOptionsIntoPopover();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var pop = document.getElementById("month-nav-quarter-popover");
      if (!pop || pop.hidden) return;
      closeQuarterPopover();
      renderQuarterOptionsIntoPopover();
    });
  }

  function init(options) {
    mergeContext(options);
    bind();
  }

  global.DashboardMonthNav = {
    getMonthNavigatorContextKey: getMonthNavigatorContextKey,
    getPeriodState: getPeriodState,
    init: init,
    navigateToMonth: navigateToMonth,
    navigateToQuarter: navigateToQuarter,
    periodKeyInAvailableMonths: periodKeyInAvailableMonths,
    setAvailableMonthsFromChartPoints: setAvailableMonthsFromChartPoints,
    setPeriodState: setPeriodState,
    updateMonthNavigatorUI: updateMonthNavigatorUI,
  };
})(typeof window !== "undefined" ? window : globalThis);
