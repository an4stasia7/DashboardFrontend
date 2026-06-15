/**
 * @fileoverview Мелкие чистые утилиты дашборда (форматирование, escape, DOM).
 * Подключать до `dashboard.js`. Экспорт: `global.DashUi`.
 */
(function (global) {
  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function formatNumber(v) {
    if (v == null || v === "—") return "—";
    var n = Number(v);
    if (isNaN(n)) return String(v);
    return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  }

  function calcDeviation(factStr, planStr) {
    var f = parseFloat(String(factStr || "").replace(/[^\d.,\-]/g, "").replace(",", "."));
    var p = parseFloat(String(planStr || "").replace(/[^\d.,\-]/g, "").replace(",", "."));
    if (isNaN(f) || isNaN(p) || p === 0) return "—";
    var dev = ((f - p) / Math.abs(p)) * 100;
    var sign = dev > 0 ? "+" : "";
    return sign + (Math.round(dev * 10) / 10).toString().replace(".", ",") + "%";
  }

  function ragCell(kind) {
    return '<span class="rag-dot rag-' + kind + '" title="' + kind + '"></span>';
  }

  function capitalizeHeaderTitle(text) {
    if (text == null) return "—";
    var s = String(text).trim();
    if (!s || s === "—") return s || "—";
    var first = s.charAt(0);
    var upper =
      typeof first.toLocaleUpperCase === "function"
        ? first.toLocaleUpperCase("ru-RU")
        : first.toUpperCase();
    return upper + s.slice(1);
  }

  function formatCompactNumber(v) {
    if (v == null || v === "" || v === "—") return "—";
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    if (isNaN(n)) return String(v);
    var abs = Math.abs(n);
    if (abs >= 1e9) {
      var b = n / 1e9;
      return (Math.round(b * 10) / 10).toString().replace(".", ",") + " млрд";
    }
    if (abs >= 1e6) {
      var m = n / 1e6;
      return (Math.round(m * 10) / 10).toString().replace(".", ",") + " млн";
    }
    return formatNumber(v);
  }

  function formatKpiTilePlanFactValue(v) {
    if (v == null || v === "") return "—";
    if (typeof v === "number" && !isNaN(v)) return formatCompactNumber(v);
    var tryNum = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    if (!isNaN(tryNum) && Math.abs(tryNum) >= 1e6) return formatCompactNumber(tryNum);
    return String(v);
  }

  function formatKpiTileUnits(units) {
    return units == null ? "" : String(units).trim();
  }

  function formatKpiTileFactValueWithUnits(fact, units) {
    var factText = formatKpiTilePlanFactValue(fact);
    var unitsText = formatKpiTileUnits(units);
    if (!unitsText || factText === "—") return factText;
    return factText + " " + unitsText;
  }

  function splitCompactScaleSuffix(text) {
    var match = String(text || "").trim().match(/^(.+?)\s+(млн|млрд)$/i);
    if (!match) return { value: String(text || ""), scale: "" };
    return { value: match[1], scale: match[2] };
  }

  function formatKpiTilePlanFactPair(plan, fact, units) {
    var planText = formatKpiTilePlanFactValue(plan);
    var factText = formatKpiTilePlanFactValue(fact);
    var unitsText = formatKpiTileUnits(units);
    var planParts = splitCompactScaleSuffix(planText);
    var factParts = splitCompactScaleSuffix(factText);
    var sharedScale =
      planParts.scale &&
      factParts.scale &&
      planParts.scale.toLowerCase() === factParts.scale.toLowerCase()
        ? planParts.scale
        : "";
    if (sharedScale) {
      var scaledPairText = planParts.value + "/" + factParts.value + " " + sharedScale;
      if (!unitsText) return scaledPairText;
      return scaledPairText + " " + unitsText;
    }
    var pairText = planText + "/" + factText;
    if (!unitsText) return pairText;
    return pairText + " " + unitsText;
  }

  function formatKpiTilePlanFactExpectedTriple(plan, fact, expected, units) {
    var planText = formatKpiTilePlanFactValue(plan);
    var factText = formatKpiTilePlanFactValue(fact);
    var expectedText = formatKpiTilePlanFactValue(expected);
    var unitsText = formatKpiTileUnits(units);
    var planParts = splitCompactScaleSuffix(planText);
    var factParts = splitCompactScaleSuffix(factText);
    var expectedParts = splitCompactScaleSuffix(expectedText);
    var sharedScale =
      planParts.scale &&
      factParts.scale &&
      expectedParts.scale &&
      planParts.scale.toLowerCase() === factParts.scale.toLowerCase() &&
      planParts.scale.toLowerCase() === expectedParts.scale.toLowerCase()
        ? planParts.scale
        : "";
    if (sharedScale) {
      var scaledTripleText = planParts.value + "/" + factParts.value + "/" + expectedParts.value + " " + sharedScale;
      if (!unitsText) return scaledTripleText;
      return scaledTripleText + " " + unitsText;
    }
    var tripleText = planText + "/" + factText + "/" + expectedText;
    if (!unitsText) return tripleText;
    return tripleText + " " + unitsText;
  }

  function formatKpiTileUpdatedAt(value) {
    if (value == null) return "";
    var text = String(value).trim();
    if (!text) return "";
    var normalized = text.replace(" ", "T");
    var match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      return match[3] + "." + match[2] + "." + match[1] + " " + match[4] + ":" + match[5];
    }
    var parsed = new Date(normalized);
    if (isNaN(parsed.getTime())) return "";
    var day = String(parsed.getDate()).padStart(2, "0");
    var month = String(parsed.getMonth() + 1).padStart(2, "0");
    var year = String(parsed.getFullYear());
    var hours = String(parsed.getHours()).padStart(2, "0");
    var minutes = String(parsed.getMinutes()).padStart(2, "0");
    return day + "." + month + "." + year + " " + hours + ":" + minutes;
  }

  function kpiTilePlanFactValuePresent(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === "number") return !isNaN(v);
    if (typeof v === "string") return String(v).trim() !== "";
    return true;
  }

  function kpiTileHasPlanAndFact(tile) {
    return kpiTilePlanFactValuePresent(tile && tile.plan) && kpiTilePlanFactValuePresent(tile && tile.fact);
  }

  function scrollElementIntoViewCentered(el) {
    if (!el) return;
    requestAnimationFrame(function () {
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (e) {
        try {
          el.scrollIntoView();
        } catch (e2) {
          /* ignore */
        }
      }
    });
  }

  function getKpiTileHintSource(tile) {
    if (!tile || typeof tile !== "object") return "";
    var keys = ["source", "data_source", "kpi_source", "info_source", "hint_source"];
    for (var i = 0; i < keys.length; i++) {
      var value = tile[keys[i]];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return "";
  }

  function firstNonEmptyStringValue(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    for (var i = 0; i < keys.length; i++) {
      var value = obj[keys[i]];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return "";
  }

  var KPI_HINT_SOURCE_KEYS = ["source", "data_source", "kpi_source", "info_source", "hint_source", "источник"];
  var KPI_HINT_PLAN_KEYS = [
    "plan_description",
    "description_plan",
    "hint_plan",
    "plan_hint",
    "plan_info",
    "plan_text",
    "plan_definition",
    "plan_desc",
    "plan_source_text",
    "описание_плана",
  ];
  var KPI_HINT_FACT_KEYS = [
    "fact_description",
    "description_fact",
    "hint_fact",
    "fact_hint",
    "fact_info",
    "fact_text",
    "fact_definition",
    "fact_desc",
    "fact_source_text",
    "описание_факта",
  ];

  function readHintStringField(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    for (var i = 0; i < keys.length; i++) {
      var value = obj[keys[i]];
      if (value == null) continue;
      if (typeof value === "object") continue;
      var text = String(value).trim();
      if (text && text !== "[object Object]") return text;
    }
    return "";
  }

  function findHintLabel(text, label) {
    var re = new RegExp("(?:^|\\s)(" + label + "\\s*:)", "i");
    var match = re.exec(text);
    if (!match) return null;
    var labelStart = match.index + match[0].indexOf(match[1]);
    return {
      index: labelStart,
      length: match[1].length,
    };
  }

  function parseKpiTileHintDescription(raw) {
    var text = raw != null ? String(raw).trim() : "";
    var result = { source: "", plan: "", fact: "", plain: "" };
    if (!text || text === "[object Object]") return result;

    var sourceMatch = findHintLabel(text, "Источник");
    var planMatch = findHintLabel(text, "План");
    var factMatch = findHintLabel(text, "Факт");

    if (planMatch && factMatch && factMatch.index > planMatch.index) {
      var prefixEnd = planMatch.index;
      if (sourceMatch && sourceMatch.index < planMatch.index) {
        result.source = text.slice(sourceMatch.index + sourceMatch.length, planMatch.index).trim();
      } else {
        var prefix = text.slice(0, prefixEnd).trim();
        prefix = prefix.replace(/^Источник\s*:\s*/i, "").trim();
        result.source = prefix;
      }
      result.plan = text.slice(planMatch.index + planMatch.length, factMatch.index).trim();
      result.fact = text.slice(factMatch.index + factMatch.length).trim();
      return result;
    }

    if (planMatch && !factMatch) {
      var prefixOnlyPlan = text.slice(0, planMatch.index).trim();
      prefixOnlyPlan = prefixOnlyPlan.replace(/^Источник\s*:\s*/i, "").trim();
      result.source = prefixOnlyPlan;
      result.plan = text.slice(planMatch.index + planMatch.length).trim();
      return result;
    }

    if (sourceMatch) {
      var sourceEnd = planMatch ? planMatch.index : text.length;
      result.source = text.slice(sourceMatch.index + sourceMatch.length, sourceEnd).trim();
      if (planMatch || factMatch) return result;
    }

    var sourceOnlyMatch = text.match(/^Источник\s*:\s*([\s\S]+)$/i);
    if (sourceOnlyMatch) {
      result.source = sourceOnlyMatch[1].trim();
      return result;
    }

    result.plain = text;
    return result;
  }

  function getKpiTileDescriptionText(raw) {
    if (!raw || typeof raw !== "object") return "";
    var desc = raw.description;
    if (desc && typeof desc === "object") {
      var objectText = readHintStringField(desc, ["text", "value", "hint", "description"]);
      if (objectText) return objectText;
      return "";
    }
    if (desc != null) {
      var descText = String(desc).trim();
      if (descText && descText !== "[object Object]") return descText;
    }
    return "";
  }

  function normalizeKpiTileHintFields(raw) {
    var result = {
      description: "",
      hint: "",
      source: "",
      plan_description: "",
      fact_description: "",
    };
    if (!raw || typeof raw !== "object") return result;

    result.source = readHintStringField(raw, KPI_HINT_SOURCE_KEYS);
    result.plan_description = readHintStringField(raw, KPI_HINT_PLAN_KEYS);
    result.fact_description = readHintStringField(raw, KPI_HINT_FACT_KEYS);
    result.description = getKpiTileDescriptionText(raw);

    var desc = raw.description;
    if (desc && typeof desc === "object") {
      if (!result.source) result.source = readHintStringField(desc, KPI_HINT_SOURCE_KEYS);
      if (!result.plan_description) {
        result.plan_description = readHintStringField(desc, KPI_HINT_PLAN_KEYS.concat(["plan", "план"]));
      }
      if (!result.fact_description) {
        result.fact_description = readHintStringField(desc, KPI_HINT_FACT_KEYS.concat(["fact", "факт"]));
      }
    }

    if (result.description) {
      var parsed = parseKpiTileHintDescription(result.description);
      if (!result.plan_description && parsed.plan) result.plan_description = parsed.plan;
      if (!result.fact_description && parsed.fact) result.fact_description = parsed.fact;
      if (!result.source && parsed.source) result.source = parsed.source;
    }

    result.hint = result.description;
    return result;
  }

  function extractKpiTileHintParts(tile) {
    if (!tile || typeof tile !== "object") {
      return { source: "", plan: "", fact: "", plain: "" };
    }

    var source = getKpiTileHintSource(tile);
    var plan = firstNonEmptyStringValue(tile, KPI_HINT_PLAN_KEYS) || (tile.plan_description != null ? String(tile.plan_description).trim() : "");
    var fact = firstNonEmptyStringValue(tile, KPI_HINT_FACT_KEYS) || (tile.fact_description != null ? String(tile.fact_description).trim() : "");
    var descriptionText = getKpiTileDescriptionText(tile);

    if (tile.description && typeof tile.description === "object") {
      if (!plan) {
        plan = readHintStringField(tile.description, KPI_HINT_PLAN_KEYS.concat(["plan", "план"]));
      }
      if (!fact) {
        fact = readHintStringField(tile.description, KPI_HINT_FACT_KEYS.concat(["fact", "факт"]));
      }
    }

    if (descriptionText) {
      var parsed = parseKpiTileHintDescription(descriptionText);
      if (!plan && parsed.plan) plan = parsed.plan;
      if (!fact && parsed.fact) fact = parsed.fact;
      if (!source && parsed.source) source = parsed.source;
      if (!source && !plan && !fact && parsed.plain) {
        return { source: "", plan: "", fact: "", plain: parsed.plain };
      }
    }

    return { source: source, plan: plan, fact: fact, plain: "" };
  }

  function buildKpiTileHintHtml(tile) {
    if (!tile || typeof tile !== "object") return "";

    var partsData = extractKpiTileHintParts(tile);
    if (partsData.plain) return escapeHtml(partsData.plain);

    var source = partsData.source;
    var plan = partsData.plan;
    var fact = partsData.fact;

    if (!source && !plan && !fact) return "";

    var parts = [];
    if (source) {
      parts.push(
        '<span class="kpi-tile-hint-block">' +
          '<strong class="kpi-tile-hint-label">Источник:</strong><br>' +
          escapeHtml(source) +
          "</span>"
      );
    }
    if (plan) {
      parts.push(
        '<span class="kpi-tile-hint-block">' +
          '<strong class="kpi-tile-hint-label">План:</strong><br>' +
          escapeHtml(plan) +
          "</span>"
      );
    }
    if (fact) {
      parts.push(
        '<span class="kpi-tile-hint-block">' +
          '<strong class="kpi-tile-hint-label">Факт:</strong><br>' +
          escapeHtml(fact) +
          "</span>"
      );
    }
    return parts.join("");
  }

  global.DashUi = {
    escapeHtml: escapeHtml,
    formatNumber: formatNumber,
    formatCompactNumber: formatCompactNumber,
    calcDeviation: calcDeviation,
    ragCell: ragCell,
    capitalizeHeaderTitle: capitalizeHeaderTitle,
    formatKpiTilePlanFactValue: formatKpiTilePlanFactValue,
    formatKpiTileUnits: formatKpiTileUnits,
    formatKpiTileFactValueWithUnits: formatKpiTileFactValueWithUnits,
    formatKpiTilePlanFactPair: formatKpiTilePlanFactPair,
    formatKpiTilePlanFactExpectedTriple: formatKpiTilePlanFactExpectedTriple,
    formatKpiTileUpdatedAt: formatKpiTileUpdatedAt,
    kpiTilePlanFactValuePresent: kpiTilePlanFactValuePresent,
    kpiTileHasPlanAndFact: kpiTileHasPlanAndFact,
    scrollElementIntoViewCentered: scrollElementIntoViewCentered,
    getKpiTileHintSource: getKpiTileHintSource,
    getKpiTileDescriptionText: getKpiTileDescriptionText,
    parseKpiTileHintDescription: parseKpiTileHintDescription,
    normalizeKpiTileHintFields: normalizeKpiTileHintFields,
    extractKpiTileHintParts: extractKpiTileHintParts,
    buildKpiTileHintHtml: buildKpiTileHintHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
