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
  var periodStateByContext = Object.create(null);

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
    if (pt.has_data === false) return false;
    var key = monthYearKey(pt.year, pt.month);
    if (key < 0) return false;
    return navPlanFactValuePresent(pt.fact) || navPlanFactValuePresent(pt.plan);
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

  function capturePeriodStateSnapshot() {
    return {
      currentPeriodMonth: currentPeriodMonth,
      currentPeriodYear: currentPeriodYear,
      aggregationMode: aggregationMode || "current",
      selectedQuarters: normalizeQuarterList(selectedQuarters),
    };
  }

  function rememberPeriodStateForContext(contextKey) {
    var key = contextKey != null ? String(contextKey) : getMonthNavigatorContextKey();
    if (!key) return;
    periodStateByContext[key] = capturePeriodStateSnapshot();
  }

  function restorePeriodStateForContext(contextKey) {
    var key = contextKey != null ? String(contextKey) : getMonthNavigatorContextKey();
    if (!key) return false;
    var snapshot = periodStateByContext[key];
    if (!snapshot) return false;
    if (snapshot.currentPeriodMonth != null) {
      currentPeriodMonth = snapshot.currentPeriodMonth;
    }
    if (snapshot.currentPeriodYear != null) {
      currentPeriodYear = snapshot.currentPeriodYear;
    }
    aggregationMode =
      snapshot.aggregationMode != null && String(snapshot.aggregationMode).trim()
        ? String(snapshot.aggregationMode).trim()
        : "current";
    selectedQuarters = normalizeQuarterList(snapshot.selectedQuarters);
    return true;
  }

  function pushAvailableMonthSlot(slots, month, year) {
    if (!Array.isArray(slots)) return;
    var key = monthYearKey(year, month);
    if (key < 0) return;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] && slots[i].key === key) return;
    }
    slots.push({
      month: parseInt(String(month), 10),
      year: parseInt(String(year), 10),
      key: key,
    });
  }

  function collectAvailableMonthSlotsFromChartIndicators(chartIndicators) {
    var nextMonths = [];
    if (!chartIndicators) return nextMonths;
    var lines = chartIndicators.line || [];
    for (var li = 0; li < lines.length; li++) {
      var pts = lines[li] && lines[li].points;
      if (!pts) continue;
      for (var pi = 0; pi < pts.length; pi++) {
        var pt = pts[pi];
        if (!navPointHasPeriodValue(pt)) continue;
        pushAvailableMonthSlot(nextMonths, pt.month, pt.year);
      }
    }
    return nextMonths;
  }

  function collectAvailableMonthSlotsFromKpiBody(body, nextMonths, depth) {
    nextMonths = Array.isArray(nextMonths) ? nextMonths : [];
    depth = typeof depth === "number" ? depth : 4;
    if (!body || depth < 0) return nextMonths;

    if (Array.isArray(body)) {
      for (var i = 0; i < body.length; i++) {
        collectAvailableMonthSlotsFromKpiBody(body[i], nextMonths, depth - 1);
      }
      return nextMonths;
    }

    if (typeof body !== "object") return nextMonths;

    if (body.has_data !== false) {
      pushAvailableMonthSlot(nextMonths, body.month, body.year);
    }

    if (Array.isArray(body.monthly_data)) {
      for (var mi = 0; mi < body.monthly_data.length; mi++) {
        var point = body.monthly_data[mi];
        if (!point || typeof point !== "object") continue;
        if (point.has_data === false) continue;
        pushAvailableMonthSlot(nextMonths, point.month, point.year);
      }
    }

    var tilesBlock = body["Плитки"];
    if (tilesBlock && Array.isArray(tilesBlock.items)) {
      for (var ti = 0; ti < tilesBlock.items.length; ti++) {
        var tile = tilesBlock.items[ti];
        if (!tile || typeof tile !== "object") continue;
        if (tile.has_data === false) continue;
        pushAvailableMonthSlot(nextMonths, tile.month, tile.year);
        if (Array.isArray(tile.monthly_data)) {
          for (var pi = 0; pi < tile.monthly_data.length; pi++) {
            var tilePoint = tile.monthly_data[pi];
            if (!tilePoint || typeof tilePoint !== "object") continue;
            if (tilePoint.has_data === false) continue;
            pushAvailableMonthSlot(nextMonths, tilePoint.month, tilePoint.year);
          }
        }
      }
    }

    if (Array.isArray(body.departments)) {
      for (var di = 0; di < body.departments.length; di++) {
        collectAvailableMonthSlotsFromKpiBody(body.departments[di], nextMonths, depth - 1);
      }
    }

    return nextMonths;
  }

  function setAvailableMonthsFromChartPoints(chartIndicators, options) {
    options = options || {};
    var nextContextKey =
      options.contextKey != null ? String(options.contextKey) : availableMonthsContextKey;
    if (nextContextKey && nextContextKey !== availableMonthsContextKey) {
      restorePeriodStateForContext(nextContextKey);
    }
    var nextMonths = collectAvailableMonthSlotsFromChartIndicators(chartIndicators);
    var cachedMonths =
      nextContextKey && Array.isArray(availableMonthsByContext[nextContextKey])
        ? availableMonthsByContext[nextContextKey]
        : [];
    var baseMonths = options.preserveExisting
      ? mergeAvailableMonthSlots(cachedMonths, availableMonths)
      : cachedMonths;
    availableMonths = mergeAvailableMonthSlots(baseMonths, nextMonths);
    availableMonthsContextKey = nextContextKey;
    if (nextContextKey) {
      availableMonthsByContext[nextContextKey] = mergeAvailableMonthSlots([], availableMonths);
    }
  }

  function setAvailableMonthsFromKpiResult(result, options) {
    options = options || {};
    var nextContextKey =
      options.contextKey != null ? String(options.contextKey) : availableMonthsContextKey;
    if (nextContextKey && nextContextKey !== availableMonthsContextKey) {
      restorePeriodStateForContext(nextContextKey);
    }
    var nextMonths = collectAvailableMonthSlotsFromChartIndicators(result && result.chartIndicators ? result.chartIndicators : null);
    var body = result && result.data ? result.data : result && result.raw ? result.raw : null;
    var bodyMonths = collectAvailableMonthSlotsFromKpiBody(body, [], 4);
    nextMonths = mergeAvailableMonthSlots(nextMonths, bodyMonths);
    var cachedMonths =
      nextContextKey && Array.isArray(availableMonthsByContext[nextContextKey])
        ? availableMonthsByContext[nextContextKey]
        : [];
    var baseMonths = options.preserveExisting
      ? mergeAvailableMonthSlots(cachedMonths, availableMonths)
      : cachedMonths;
    availableMonths = mergeAvailableMonthSlots(baseMonths, nextMonths);
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
    if ((aggregationMode || "current") === "current" && !options.preserveCurrentModeSnapshot) {
      rememberCurrentModePeriod();
    }
    updateMonthNavigatorUI();
    rememberPeriodStateForContext();
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
    if (
      (aggregationMode || "current") === "current" &&
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
    rememberPeriodStateForContext();
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
        if (nextMode !== "quarter" && nextMode !== "ytd") nextMode = "current";
        if (prevMode !== "current" && nextMode === "current") {
          restoreCurrentModePeriod();
        }
        aggregationMode = nextMode;
        rememberPeriodStateForContext();
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
        rememberPeriodStateForContext();
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
    setAvailableMonthsFromKpiResult: setAvailableMonthsFromKpiResult,
    setAvailableMonthsFromChartPoints: setAvailableMonthsFromChartPoints,
    rememberPeriodStateForContext: rememberPeriodStateForContext,
    restorePeriodStateForContext: restorePeriodStateForContext,
    setPeriodState: setPeriodState,
    updateMonthNavigatorUI: updateMonthNavigatorUI,
  };
})(typeof window !== "undefined" ? window : globalThis);
