/**
 * @fileoverview KaTeX: разбор обрамления формулы и рендер в DOM-элемент.
 * Подключать после `katex.min.js` на страницах с диалогом порогов. Экспорт: `global.DashLatex`.
 */
(function (global) {
  function stripLatexDelimitersForKatex(s) {
    var t = String(s).trim();
    var m = t.match(/^\$\$([\s\S]*)\$\$/);
    if (m) return m[1].trim();
    m = t.match(/^\\\(([\s\S]*)\\\)$/);
    if (m) return m[1].trim();
    m = t.match(/^\$([^$\n]+)\$$/);
    if (m) return m[1].trim();
    return t;
  }

  function looksLikeKatexLatex(s) {
    var inner = stripLatexDelimitersForKatex(s);
    if (/\\[a-zA-Z]+/.test(inner)) return true;
    if (/\\[{}%^_]/.test(inner)) return true;
    return false;
  }

  function renderKpiThresholdsDialogFormula(formulaEl, raw) {
    formulaEl.className = "kpi-thresholds-dialog-formula";
    formulaEl.innerHTML = "";
    var inner = stripLatexDelimitersForKatex(raw);
    var katexGlobal =
      typeof globalThis !== "undefined" && globalThis.katex
        ? globalThis.katex
        : typeof global !== "undefined" && global.katex
          ? global.katex
          : typeof window !== "undefined"
            ? window.katex
            : undefined;
    if (katexGlobal && typeof katexGlobal.render === "function" && looksLikeKatexLatex(raw)) {
      try {
        katexGlobal.render(inner, formulaEl, { throwOnError: false, displayMode: true });
        return;
      } catch (e) {
        /* оставляем текстовый вид */
      }
    }
    formulaEl.classList.add("kpi-thresholds-dialog-formula--plain");
    formulaEl.textContent = raw;
  }

  global.DashLatex = {
    stripLatexDelimitersForKatex: stripLatexDelimitersForKatex,
    looksLikeKatexLatex: looksLikeKatexLatex,
    renderKpiThresholdsDialogFormula: renderKpiThresholdsDialogFormula,
  };
})(typeof window !== "undefined" ? window : globalThis);
