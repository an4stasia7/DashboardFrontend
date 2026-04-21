(function (global) {
  function getPeriodState() {
    if (
      typeof DashboardMonthNav !== "undefined" &&
      DashboardMonthNav &&
      typeof DashboardMonthNav.getPeriodState === "function"
    ) {
      return DashboardMonthNav.getPeriodState();
    }
    return null;
  }

  function getActiveCatalogId() {
    var nav = global.DashboardHierarchyNav;
    if (!nav) return "";
    if (typeof nav.getActiveCatalogId === "function") return nav.getActiveCatalogId();
    return "";
  }

  function attachPeriodOptions(opts, periodState) {
    var nextOpts = Object.assign({}, opts || {});
    if (nextOpts.month != null && nextOpts.year != null) {
      return nextOpts;
    }
    var ps = periodState || getPeriodState();
    if (!ps) return nextOpts;
    var month = ps.currentPeriodMonth != null ? Number(ps.currentPeriodMonth) : null;
    var year = ps.currentPeriodYear != null ? Number(ps.currentPeriodYear) : null;
    if ((month == null || isNaN(month) || year == null || isNaN(year)) && Array.isArray(ps.availableMonths) && ps.availableMonths.length) {
      var lastSlot = ps.availableMonths[ps.availableMonths.length - 1];
      month = lastSlot && lastSlot.month != null ? Number(lastSlot.month) : month;
      year = lastSlot && lastSlot.year != null ? Number(lastSlot.year) : year;
    }
    if (nextOpts.month == null && month != null && !isNaN(month)) {
      nextOpts.month = month;
    }
    if (nextOpts.year == null && year != null && !isNaN(year)) {
      nextOpts.year = year;
    }
    return nextOpts;
  }

  function attachScopeForOptions(opts) {
    var nextOpts = Object.assign({}, opts || {});
    if (nextOpts.for != null && String(nextOpts.for).trim() !== "") {
      nextOpts.for = String(nextOpts.for).trim();
      return nextOpts;
    }
    var catalogId = getActiveCatalogId();
    if (catalogId) {
      nextOpts.for = catalogId;
    }
    return nextOpts;
  }

  function buildRequestContext(opts, periodState) {
    return attachScopeForOptions(attachPeriodOptions(opts, periodState));
  }

  function buildKpiRequestOptions(opts, periodState) {
    return buildRequestContext(opts, periodState);
  }

  function buildKpiAllRequestOptions(opts, periodState) {
    return buildRequestContext(opts, periodState);
  }

  function buildImmediateSubordinatesRequestOptions(department) {
    return attachScopeForOptions({ department: department });
  }

  global.DashboardRequestBuilder = {
    buildRequestContext: buildRequestContext,
    buildImmediateSubordinatesRequestOptions: buildImmediateSubordinatesRequestOptions,
    buildKpiAllRequestOptions: buildKpiAllRequestOptions,
    buildKpiRequestOptions: buildKpiRequestOptions,
  };
})(typeof window !== "undefined" ? window : globalThis);
