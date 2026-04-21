(function (global) {
  function parseNumberLoose(value) {
    if (typeof value === "number" && !isNaN(value)) return value;
    if (value == null || value === "") return null;
    var normalized = parseFloat(String(value).replace(/[^\d.,\-]/g, "").replace(",", "."));
    return isNaN(normalized) ? null : normalized;
  }

  function getMonthShortRu(month) {
    var names = ["янв.", "фев.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."];
    var index = Number(month) - 1;
    return index >= 0 && index < names.length ? names[index] : "";
  }

  function getPeriodState(options) {
    if (!options) {
      if (typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function") {
        return DashboardMonthNav.getPeriodState();
      }
      return null;
    }
    if (options.periodState && typeof options.periodState === "object") return options.periodState;
    if (
      options.currentPeriodMonth != null ||
      options.currentPeriodYear != null ||
      options.aggregationMode != null ||
      options.selectedQuarters != null
    ) {
      return options;
    }
    if (typeof DashboardMonthNav !== "undefined" && DashboardMonthNav && typeof DashboardMonthNav.getPeriodState === "function") {
      return DashboardMonthNav.getPeriodState();
    }
    return null;
  }

  function getAggregationMode(options) {
    var mode = "";
    if (typeof options === "string") {
      mode = String(options).trim();
    } else if (options && typeof options === "object") {
      if (options.mode != null) {
        mode = String(options.mode).trim();
      } else {
        var ps = getPeriodState(options);
        if (ps && ps.aggregationMode != null) {
          mode = String(ps.aggregationMode).trim();
        }
      }
    }
    if (!mode) {
      var psFallback = getPeriodState();
      if (psFallback && psFallback.aggregationMode != null) {
        mode = String(psFallback.aggregationMode).trim();
      }
    }
    return mode || "current";
  }

  function aggregationModeLabel(mode) {
    if (mode === "quarter") return "За квартал";
    if (mode === "ytd") return "С начала года";
    return "На текущий момент";
  }

  function isSelectedPeriodCurrentCalendarMonth(selectedYear, selectedMonth) {
    var now = new Date();
    return Number(selectedYear) === now.getFullYear() && Number(selectedMonth) === now.getMonth() + 1;
  }

  function buildAggregationPeriodLabel(mode, year, month, points, selectedQuarters) {
    var y = Number(year);
    var m = Number(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return "";
    if (mode === "quarter") {
      var qs = Array.isArray(selectedQuarters) ? selectedQuarters.slice() : [];
      qs = qs
        .map(function (v) {
          return parseInt(String(v), 10);
        })
        .filter(function (q) {
          return !isNaN(q) && q >= 1 && q <= 4;
        })
        .sort(function (a, b) {
          return a - b;
        });
      if (!qs.length) {
        qs = [Math.ceil(m / 3)];
      }
      var roman = ["I", "II", "III", "IV"];
      var label = qs.map(function (q) {
        return (roman[q - 1] || String(q)) + " кв.";
      }).join(", ");
      var minQ = qs[0];
      var maxQ = qs[qs.length - 1];
      var startMonth = (minQ - 1) * 3 + 1;
      var endMonth = maxQ * 3;
      return "Накопительно за " + label + " " + y + " (" + getMonthShortRu(startMonth) + "–" + getMonthShortRu(endMonth) + ")";
    }
    if (mode === "ytd") {
      return "Накопительно с начала " + y + " г. (янв.–" + getMonthShortRu(m) + ")";
    }
    if (Array.isArray(points)) {
      for (var i = 0; i < points.length; i++) {
        var point = points[i];
        if (!point) continue;
        if (Number(point.year) === y && Number(point.month) === m) {
          var monthName = point.month_name != null ? String(point.month_name).trim() : "";
          if (monthName) {
            return monthName.charAt(0).toUpperCase() + monthName.slice(1) + " " + y;
          }
        }
      }
    }
    return getMonthShortRu(m) + " " + y;
  }

  function computeAggregatedPoint(item, year, month, mode, selectedQuarters) {
    if (!item || typeof item !== "object") return null;
    var points = Array.isArray(item.monthly_data) ? item.monthly_data.slice() : [];
    if (!points.length) return null;
    var y = Number(year);
    var m = Number(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return null;

    var filtered = points
      .filter(function (point) {
        return point && Number(point.year) === y && Number(point.month) >= 1 && Number(point.month) <= 12;
      })
      .sort(function (a, b) {
        return Number(a.month) - Number(b.month);
      });
    if (!filtered.length) return null;

    function hasCashGapFields(point) {
      return (
        point &&
        (parseNumberLoose(point.money_fact) != null || parseNumberLoose(point.shipments_fact) != null)
      );
    }

    function hasRatioFields(point) {
      return (
        point &&
        (parseNumberLoose(point.numerator_fact) != null ||
          parseNumberLoose(point.denominator_fact) != null ||
          parseNumberLoose(point.ytd_numerator_fact) != null ||
          parseNumberLoose(point.ytd_denominator_fact) != null)
      );
    }

    function buildCashGapPoint(rows) {
      var money = 0;
      var shipments = 0;
      var hasMoney = false;
      var hasShipments = false;
      var hasData = false;
      for (var i = 0; i < rows.length; i++) {
        var point = rows[i];
        if (!point) continue;
        var moneyValue = parseNumberLoose(point.money_fact);
        var shipmentsValue = parseNumberLoose(point.shipments_fact);
        if (moneyValue != null) {
          money += moneyValue;
          hasMoney = true;
        }
        if (shipmentsValue != null) {
          shipments += shipmentsValue;
          hasShipments = true;
        }
        if (point.has_data === true) hasData = true;
      }
      if (!hasMoney && !hasShipments) return null;
      return {
        year: y,
        month: m,
        month_name: null,
        plan: null,
        fact: money - shipments,
        kpi_pct: null,
        has_data: hasData || hasMoney || hasShipments,
      };
    }

    function buildRatioPoint(rows) {
      var numerator = 0;
      var denominator = 0;
      var hasNumerator = false;
      var hasDenominator = false;
      var hasData = false;
      var lastPct = null;
      var lastRow = rows.length ? rows[rows.length - 1] : null;
      for (var i = 0; i < rows.length; i++) {
        var point = rows[i];
        if (!point) continue;
        var numeratorValue = parseNumberLoose(point.numerator_fact);
        var denominatorValue = parseNumberLoose(point.denominator_fact);
        var pctValue = parseNumberLoose(point.kpi_pct);
        if (numeratorValue != null) {
          numerator += numeratorValue;
          hasNumerator = true;
        }
        if (denominatorValue != null) {
          denominator += denominatorValue;
          hasDenominator = true;
        }
        if (pctValue != null) lastPct = pctValue;
        if (point.has_data === true) hasData = true;
      }

      var kpiPct = null;
      if (hasNumerator && hasDenominator && Math.abs(denominator) > 0.000001) {
        kpiPct = (numerator / denominator) * 100;
      } else if (lastPct != null) {
        kpiPct = lastPct;
      } else if (lastRow) {
        var ytdNumerator = parseNumberLoose(lastRow.ytd_numerator_fact);
        var ytdDenominator = parseNumberLoose(lastRow.ytd_denominator_fact);
        if (ytdNumerator != null && ytdDenominator != null && Math.abs(ytdDenominator) > 0.000001) {
          kpiPct = (ytdNumerator / ytdDenominator) * 100;
        }
      }

      if (kpiPct == null && !hasNumerator && !hasDenominator) return null;
      return {
        year: y,
        month: m,
        month_name: null,
        plan: null,
        fact: null,
        kpi_pct: kpiPct,
        has_data: hasData || hasNumerator || hasDenominator || kpiPct != null,
      };
    }

    var hasCashGapSeries = false;
    var hasRatioSeries = false;
    for (var si = 0; si < filtered.length; si++) {
      if (!hasCashGapSeries && hasCashGapFields(filtered[si])) hasCashGapSeries = true;
      if (!hasRatioSeries && hasRatioFields(filtered[si])) hasRatioSeries = true;
      if (hasCashGapSeries && hasRatioSeries) break;
    }

    if (mode !== "quarter" && mode !== "ytd") {
      for (var ci = 0; ci < filtered.length; ci++) {
        if (Number(filtered[ci].month) !== m) continue;
        if (hasCashGapSeries) {
          var currentCashGap = buildCashGapPoint([filtered[ci]]);
          if (currentCashGap) return currentCashGap;
        }
        if (hasRatioSeries) {
          var currentRatio = Object.assign({}, filtered[ci]);
          if (currentRatio.kpi_pct == null) {
            var ytdNumerator = parseNumberLoose(currentRatio.ytd_numerator_fact);
            var ytdDenominator = parseNumberLoose(currentRatio.ytd_denominator_fact);
            if (ytdNumerator != null && ytdDenominator != null && Math.abs(ytdDenominator) > 0.000001) {
              currentRatio.kpi_pct = (ytdNumerator / ytdDenominator) * 100;
            } else {
              var numerator = parseNumberLoose(currentRatio.numerator_fact);
              var denominator = parseNumberLoose(currentRatio.denominator_fact);
              if (numerator != null && denominator != null && Math.abs(denominator) > 0.000001) {
                currentRatio.kpi_pct = (numerator / denominator) * 100;
              }
            }
          }
          currentRatio.has_data =
            currentRatio.has_data === true || currentRatio.kpi_pct != null || hasRatioFields(currentRatio);
          return currentRatio;
        }
        return filtered[ci];
      }
      return null;
    }

    var bucket = [];
    if (mode === "quarter") {
      var qs = Array.isArray(selectedQuarters) ? selectedQuarters.slice() : [];
      qs = qs
        .map(function (v) {
          return parseInt(String(v), 10);
        })
        .filter(function (q) {
          return !isNaN(q) && q >= 1 && q <= 4;
        })
        .sort(function (a, b) {
          return a - b;
        });
      if (!qs.length) qs = [Math.ceil(m / 3)];
      var ranges = qs.map(function (q) {
        return { start: (q - 1) * 3 + 1, end: q * 3 };
      });
      bucket = filtered.filter(function (point) {
        var pointMonth = Number(point.month);
        for (var i = 0; i < ranges.length; i++) {
          if (pointMonth >= ranges[i].start && pointMonth <= ranges[i].end) return true;
        }
        return false;
      });
    } else {
      bucket = filtered.filter(function (point) {
        var pointMonth = Number(point.month);
        return pointMonth >= 1 && pointMonth <= m;
      });
    }
    if (!bucket.length) return null;

    if (hasCashGapSeries) {
      return buildCashGapPoint(bucket);
    }
    if (hasRatioSeries) {
      return buildRatioPoint(bucket);
    }

    var plan = 0;
    var fact = 0;
    var kpiPct = null;
    var hasPlan = false;
    var hasFact = false;
    var lastPct = null;
    var hasData = false;

    bucket.forEach(function (point) {
      var planValue = parseNumberLoose(point.plan);
      var factValue = parseNumberLoose(point.fact);
      var pctValue = parseNumberLoose(point.kpi_pct);
      if (planValue != null) {
        plan += planValue;
        hasPlan = true;
      }
      if (factValue != null) {
        fact += factValue;
        hasFact = true;
      }
      if (pctValue != null) lastPct = pctValue;
      if (point.has_data === true) hasData = true;
    });

    if (hasPlan && Math.abs(plan) > 0.000001 && hasFact) {
      kpiPct = (fact / plan) * 100;
    } else if (lastPct != null) {
      kpiPct = lastPct;
    }

    return {
      year: y,
      month: m,
      month_name: null,
      plan: hasPlan ? plan : null,
      fact: hasFact ? fact : null,
      kpi_pct: kpiPct,
      has_data: hasData || hasPlan || hasFact,
    };
  }

  function normalizeAggregatedTile(rawItem, point, mode, options) {
    if (!rawItem || typeof rawItem !== "object") return null;
    var title = rawItem.name != null ? String(rawItem.name) : "";
    if (!title && rawItem.kpi_id != null) title = String(rawItem.kpi_id);
    if (!title) return null;

    options = options || {};
    var periodState = getPeriodState(options);
    var year =
      periodState && periodState.currentPeriodYear != null
        ? periodState.currentPeriodYear
        : options.year != null
          ? options.year
          : null;
    var month =
      periodState && periodState.currentPeriodMonth != null
        ? periodState.currentPeriodMonth
        : options.month != null
          ? options.month
          : null;
    var selectedQuarters =
      periodState && Array.isArray(periodState.selectedQuarters)
        ? periodState.selectedQuarters
        : Array.isArray(options.selectedQuarters)
          ? options.selectedQuarters
          : [];
    var thresholds = rawItem.thresholds && typeof rawItem.thresholds === "object" ? rawItem.thresholds : {};
    var pointPct = point && typeof point.kpi_pct === "number" && !isNaN(point.kpi_pct) ? point.kpi_pct : null;
    var itemPct =
      typeof rawItem.kpi_pst === "number" && !isNaN(rawItem.kpi_pst)
        ? rawItem.kpi_pst
        : typeof rawItem.kpi_pct === "number" && !isNaN(rawItem.kpi_pct)
          ? rawItem.kpi_pct
          : null;
    var label =
      point && year != null && month != null
        ? buildAggregationPeriodLabel(mode, year, month, rawItem.monthly_data, selectedQuarters)
        : rawItem.plan_fact_period_label != null
          ? String(rawItem.plan_fact_period_label)
          : null;

    function thStr(obj, key, flatKey) {
      if (obj[key] != null) return String(obj[key]);
      if (flatKey != null && rawItem[flatKey] != null) return String(rawItem[flatKey]);
      return null;
    }

    function firstStringValue(keys) {
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (rawItem[key] == null) continue;
        var value = String(rawItem[key]).trim();
        if (value) return value;
      }
      return "";
    }

    return {
      kpi_id: rawItem.kpi_id != null ? String(rawItem.kpi_id) : "",
      title: title,
      badge: rawItem.kpi_id != null ? String(rawItem.kpi_id) : "KPI",
      period:
        rawItem.period != null && String(rawItem.period).trim()
          ? String(rawItem.period)
          : aggregationModeLabel(mode),
      units: firstStringValue(["units", "unit", "uom", "measure_unit", "measurement_unit"]),
      frequency: firstStringValue(["frequency", "periodicity", "update_frequency", "frequency_label"]),
      cache_updated_at: firstStringValue(["cache_updated_at"]),
      formula: rawItem.formula != null ? String(rawItem.formula) : null,
      plan_fact_period_label: label,
      percent: pointPct != null ? pointPct : itemPct,
      kpi_pst: typeof rawItem.kpi_pst === "number" && !isNaN(rawItem.kpi_pst) ? rawItem.kpi_pst : null,
      kpi_pct: pointPct != null ? pointPct : itemPct,
      plan: point ? point.plan : rawItem.plan,
      fact: point ? point.fact : rawItem.fact,
      has_data:
        point && typeof point.has_data === "boolean"
          ? point.has_data
          : typeof rawItem.has_data === "boolean"
            ? rawItem.has_data
            : undefined,
      hint:
        rawItem.description != null
          ? String(rawItem.description)
          : rawItem.hint != null
            ? String(rawItem.hint)
            : rawItem.comment != null
              ? String(rawItem.comment)
              : "",
      rag: rawItem.color != null ? String(rawItem.color).toLowerCase().trim() : null,
      green_threshold: thStr(thresholds, "green", "green_threshold"),
      yellow_threshold: thStr(thresholds, "yellow", "yellow_threshold"),
      red_threshold: thStr(thresholds, "red", "red_threshold"),
      blue_threshold: thStr(thresholds, "blue", "blue_threshold"),
      monthly_data: Array.isArray(rawItem.monthly_data) ? rawItem.monthly_data : [],
    };
  }

  function getAggregatedTilesFromRaw(rawBody, options) {
    if (!rawBody || typeof rawBody !== "object") return null;
    options = options || {};
    var periodState = getPeriodState(options);
    var year =
      options.year != null
        ? Number(options.year)
        : periodState && periodState.currentPeriodYear != null
          ? Number(periodState.currentPeriodYear)
          : null;
    var month =
      options.month != null
        ? Number(options.month)
        : periodState && periodState.currentPeriodMonth != null
          ? Number(periodState.currentPeriodMonth)
          : null;
    if (year == null || month == null || isNaN(year) || isNaN(month)) return null;

    var tilesBlock = rawBody["Плитки"];
    var items = tilesBlock && Array.isArray(tilesBlock.items) ? tilesBlock.items : [];
    if (!items.length) return null;

    var selectedQuarters =
      Array.isArray(options.selectedQuarters) && options.selectedQuarters.length
        ? options.selectedQuarters
        : periodState && Array.isArray(periodState.selectedQuarters)
          ? periodState.selectedQuarters
          : [];
    var mode = getAggregationMode(options);

    return items
      .map(function (item) {
        var point = computeAggregatedPoint(item, year, month, mode, selectedQuarters);
        return normalizeAggregatedTile(item, point, mode, {
          periodState: periodState,
          year: year,
          month: month,
          selectedQuarters: selectedQuarters,
        });
      })
      .filter(Boolean);
  }

  global.DashboardAggregation = {
    aggregationModeLabel: aggregationModeLabel,
    buildAggregationPeriodLabel: buildAggregationPeriodLabel,
    computeAggregatedPoint: computeAggregatedPoint,
    getAggregationMode: getAggregationMode,
    getAggregatedTilesFromRaw: getAggregatedTilesFromRaw,
    getMonthShortRu: getMonthShortRu,
    isSelectedPeriodCurrentCalendarMonth: isSelectedPeriodCurrentCalendarMonth,
    normalizeAggregatedTile: normalizeAggregatedTile,
    parseNumberLoose: parseNumberLoose,
  };
})(typeof window !== "undefined" ? window : globalThis);
