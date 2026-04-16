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

  global.DashUi = {
    escapeHtml: escapeHtml,
    formatNumber: formatNumber,
    formatCompactNumber: formatCompactNumber,
    calcDeviation: calcDeviation,
    ragCell: ragCell,
    capitalizeHeaderTitle: capitalizeHeaderTitle,
    formatKpiTilePlanFactValue: formatKpiTilePlanFactValue,
    formatKpiTileUpdatedAt: formatKpiTileUpdatedAt,
    kpiTilePlanFactValuePresent: kpiTilePlanFactValuePresent,
    kpiTileHasPlanAndFact: kpiTileHasPlanAndFact,
    scrollElementIntoViewCentered: scrollElementIntoViewCentered,
  };
})(typeof window !== "undefined" ? window : globalThis);
