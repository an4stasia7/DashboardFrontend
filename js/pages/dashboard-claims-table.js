(function (global) {
  function tableTextOrDash(v) {
    if (v == null) return "—";
    var s = String(v).trim();
    return s ? s : "—";
  }

  function formatClaimsOrderSum(v) {
    if (v == null || v === "") return "—";
    var n = Number(v);
    if (isNaN(n)) return tableTextOrDash(v);
    return n.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatLogisticsClaimNumber(v, fractionDigits) {
    if (v == null || v === "") return "—";
    var n = Number(v);
    if (isNaN(n)) return tableTextOrDash(v);
    return n.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits == null ? 3 : fractionDigits,
    });
  }

  function appendClampedCell(row, value, className) {
    var td = document.createElement("td");
    if (className) td.className = className;
    var text = tableTextOrDash(value);
    var span = document.createElement("span");
    span.className = "dashboard-table-cell-text";
    span.textContent = text;
    td.title = text;
    td.appendChild(span);
    row.appendChild(td);
  }

  function getClaimsOrderSumSortValue(v) {
    if (v == null || v === "") return "";
    var n = Number(v);
    return isNaN(n) ? "" : String(n);
  }

  function updateClaimsTotalRow(dataTableApi) {
    if (!dataTableApi || typeof dataTableApi.column !== "function") return;
    var total = 0;
    dataTableApi
      .column(10, { search: "applied" })
      .nodes()
      .each(function (cell) {
        if (!cell || typeof cell.getAttribute !== "function") return;
        var rawValue = cell.getAttribute("data-order");
        var n = Number(rawValue);
        if (!isNaN(n)) total += n;
      });

    var footerCell = document.getElementById("claims-table-total-sum");
    if (footerCell) {
      footerCell.textContent = total.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }

  function updateLawsuitsTotalRow(dataTableApi) {
    if (!dataTableApi || typeof dataTableApi.column !== "function") return;
    var total = 0;
    dataTableApi
      .column(6, { search: "applied" })
      .nodes()
      .each(function (cell) {
        if (!cell || typeof cell.getAttribute !== "function") return;
        var rawValue = cell.getAttribute("data-order");
        var n = Number(rawValue);
        if (!isNaN(n)) total += n;
      });

    var footerCell = document.getElementById("lawsuits-table-total-sum");
    if (footerCell) {
      footerCell.textContent = total.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }

  function updateOverdueDebtTotalRow(dataTableApi) {
    var total = 0;
    var amountCellIndex = logisticsSupplierDebtTableMode ? 4 : 6;
    if (dataTableApi && typeof dataTableApi.rows === "function") {
      dataTableApi
        .rows({ search: "applied" })
        .nodes()
        .each(function (row) {
          var cell = row && row.cells && row.cells.length > amountCellIndex ? row.cells[amountCellIndex] : null;
          if (!cell || typeof cell.getAttribute !== "function") return;
          var rawValue = cell.getAttribute("data-order");
          var n = Number(rawValue);
          if (!isNaN(n)) total += n;
        });
    } else {
      var rows = document.querySelectorAll("#table-overdue-debt tbody tr");
      rows.forEach(function (row) {
        var cell = row && row.cells && row.cells.length > amountCellIndex ? row.cells[amountCellIndex] : null;
        if (!cell || typeof cell.getAttribute !== "function") return;
        var rawValue = cell.getAttribute("data-order");
        var n = Number(rawValue);
        if (!isNaN(n)) total += n;
      });
    }

    var footerCell = document.getElementById("overdue-debt-table-total-sum");
    if (footerCell) {
      footerCell.textContent = total.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }

  function escapeRegexForDataTable(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeClaimsSearchText(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("ru-RU");
  }

  function normalizeClaimsSearchDate(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s || s === "—") return "";

    var match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[1] + "-" + match[2] + "-" + match[3];

    match = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
    if (match) return match[3] + "-" + match[2] + "-" + match[1];

    match = s.match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/);
    if (match) return match[1] + "-" + match[2] + "-" + match[3];

    var parsed = new Date(s);
    if (isNaN(parsed.getTime())) return "";

    var year = parsed.getFullYear();
    var month = String(parsed.getMonth() + 1).padStart(2, "0");
    var day = String(parsed.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  var DEFAULT_TOP_DEVIATIONS_HEADERS = [
    "Код",
    "Наименование",
    "Партнер/Клиент",
    "Дата обращения",
    "Дата окончания (план)",
    "Заказ клиента",
    "Подразделение заказа",
    "Номенклатура",
    "Описание претензии",
    "Статус",
    "Сумма документа заказа, руб.",
  ];
  var LOGISTICS_CLAIMS_HEADERS = [
    "Номер",
    "Дата",
    "Поставщик",
    "Номер заказа поставщика",
    "Статус",
    "Состояние проведения",
    "Номенклатура",
    "Категория по причине",
    "Возможность устранения",
    "Расчетное кол-во брака",
  ];
  var DEFAULT_OVERDUE_DEBT_HEADERS = [
    "№ Заказа клиента",
    "Контрагент",
    "Просрочка, дн.",
    "Ликвидированное подразделение",
    "Причина",
    "Действие",
    "Сумма, руб",
  ];
  var LOGISTICS_SUPPLIER_DZ_HEADERS = ["№ объекта расчетов", "Дата", "Объект расчетов", "Поставщик", "Сумма"];
  var EXECUTIVE_DEVIATIONS_HEADERS = ["Показатель", "Факт", "План", "RAG", "Комментарий"];
  var EXECUTIVE_DECISIONS_HEADERS = ["Вопрос", "Факт", "План", "RAG", "Решение"];
  var TECHNICAL_TABLE_HEADERS = [
    "№",
    "Название",
    "РП",
    "Сроки",
    "Отклонение",
    "Статус",
    "Прогресс",
  ];
  var OPDIR_PROJECT_TABLE_HEADERS = ["№ 1С", "Название", "РП", "Сроки", "Отклонение", "Статус", "Прогресс"];
  var CONSTRUCTOR_PROJECT_TABLE_HEADERS = ["№ 1С", "Название", "РП", "Сроки", "Отклонение", "Статус", "Прогресс"];
  var PRODUCTION_IMPROVEMENT_TABLE_HEADERS = ["№ 1С", "Название", "РП", "Куратор", "Сроки", "Статус", "Прогресс"];
  var PRODUCTION_CLAIMS_HEADERS = ["Номер", "Дата", "Подразделение-виновник", "Статус", "Номенклатура", "Описание", "Расчетное кол-во брака"];
  var TECHNICAL_EXTERNAL_TABLE_KEY = "TD-T-M1-DEVIATIONS";
  var TECHNICAL_DEVELOPMENT_TABLE_KEY = "TD-T-Q1-DEVIATIONS";
  var activeTechnicalExternalTableKey = TECHNICAL_EXTERNAL_TABLE_KEY;
  var activeTechnicalDevelopmentTableKey = TECHNICAL_DEVELOPMENT_TABLE_KEY;
  var OPDIR_PROJECT_TABLE_KEY = "OD-T-Q1-DEVIATIONS";
  var HRD_LATE_VACANCIES_TABLE_KEY = "HRD-T-M1-LATE-VACANCIES";
  var HRD_LATE_VACANCIES_HEADERS = [
    "Компания",
    "Подразделение",
    "Вакансия",
    "Дата закрытия плановая",
    "Дата закрытия факт",
  ];
  var PROTOCOL_OVERDUE_TABLE_KEY_SUFFIX = "PROTOCOL-OVERDUE";
  var PROTOCOL_OVERDUE_HEADERS = ["Протокол", "Срок", "Постановка", "Задача", "Исполнитель", "Автор"];
  var PRODUCTION_DEPUTY_PROJECT_TABLE_KEY = "PD-T-Q1-DEVIATIONS";
  var DEVDIR_PROJECTS_DEVIATIONS_TABLE_KEY = "DEVDIR-T-PROJECTS-DEVIATIONS";
  var PRODUCTION_DEPUTY_IMPROVEMENT_TABLE_KEY = "PD-T-Q3-IMPROVEMENTS";
  var PRODUCTION_CLAIMS_TABLE_KEY = "PD-T-PROD-CLAIMS";
  var CONSTRUCTOR_PROJECT_TABLE_KEY = "GK-T-M1-DEVIATIONS";
  var METROLOG_PROJECT_TABLE_KEY = "METD-T-Q1-DEVIATIONS";
  var LOGISTICS_CLAIMS_TABLE_KEY = "LOG-T-CLAIMS";
  var LOGISTICS_SUPPLIER_DZ_TABLE_KEY = "LOG-T-SUPPLIER-DZ";
  var technicalTablesMode = false;
  var opdirProjectTableMode = false;
  var opdirProjectSecondTableDisabled = false;
  var productionClaimsTableMode = false;
  var productionClaimsShop = "pc1";
  var constructorProjectTableMode = false;
  var hrdLateVacanciesTableMode = false;
  var protocolOverdueTableMode = false;
  var logisticsSupplierDebtTableMode = false;

  function pickTableField(raw, keys) {
    if (!raw || typeof raw !== "object") return null;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (raw[key] != null && String(raw[key]).trim() !== "") return raw[key];
    }
    return null;
  }

  function protocolOverdueTableKey(item) {
    return item && item.tableKey != null ? String(item.tableKey).trim().toUpperCase() : "";
  }

  function rawLooksLikeProtocolOverdueRow(raw) {
    if (!raw || typeof raw !== "object") return false;
    return (
      pickTableField(raw, ["\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b", "protocol", "protocol_name"]) != null ||
      pickTableField(raw, ["\u0417\u0430\u0434\u0430\u0447\u0430", "task", "task_text"]) != null
    );
  }

  function isProtocolOverdueRow(item) {
    var key = protocolOverdueTableKey(item);
    if (key.indexOf(PROTOCOL_OVERDUE_TABLE_KEY_SUFFIX) !== -1) return true;
    var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
    return rawLooksLikeProtocolOverdueRow(raw);
  }

  function hasProtocolOverdueTableRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    for (var i = 0; i < rows.length; i++) {
      if (isProtocolOverdueRow(rows[i])) return true;
    }
    return false;
  }

  function setProtocolOverduePanelVisible(visible) {
    var panel = document.getElementById("protocol-overdue-table-panel");
    if (!panel) return;
    if (visible) {
      panel.hidden = false;
      panel.removeAttribute("hidden");
    } else {
      panel.hidden = true;
      panel.setAttribute("hidden", "");
    }
  }

  function setTableHeaders(tableId, headers) {
    var table = document.getElementById(tableId);
    var headRow = table ? table.querySelector("thead tr") : null;
    if (!headRow) return;
    headRow.innerHTML = headers
      .map(function (header) {
        var normalizedHeader = tableTextOrDash(header);
        if (normalizedHeader === "№ 1С") normalizedHeader = "№";
        if (normalizedHeader === "№ в 1С") normalizedHeader = "№";
        return "<th>" + normalizedHeader + "</th>";
      })
      .join("");
  }

  function setTopDeviationsTableMode(executiveMode) {
    var table = document.getElementById("table-top-deviations");
    if (!table) return;
    table.classList.toggle("dashboard-table--executive", !!executiveMode);
    if (table.tFoot) {
      table.tFoot.hidden = !!executiveMode;
    }
  }

  function setOverdueDebtTableMode(executiveMode) {
    var table = document.getElementById("table-overdue-debt");
    if (!table) return;
    table.classList.toggle("dashboard-table--executive", !!executiveMode);
    if (table.tFoot) {
      table.tFoot.hidden = !!executiveMode;
    }
  }

  function setTechnicalTableMode(technicalMode) {
    var topTable = document.getElementById("table-top-deviations");
    var secondTable = document.getElementById("table-lawsuits");
    if (topTable) topTable.classList.toggle("dashboard-table--compact-by-content", !!technicalMode);
    if (secondTable) secondTable.classList.toggle("dashboard-table--compact-by-content", !!technicalMode);
    applyTechnicalCompactSizing(topTable, !!technicalMode);
    applyTechnicalCompactSizing(secondTable, !!technicalMode);
    if (topTable && topTable.tFoot) {
      topTable.tFoot.hidden = !!technicalMode;
      if (technicalMode) {
        topTable.tFoot.innerHTML =
          '<tr><th colspan="6">Итого</th><th id="claims-table-total-sum">—</th></tr>';
      } else {
        topTable.tFoot.innerHTML =
          '<tr><th colspan="10">Итого</th><th id="claims-table-total-sum">0,00</th></tr>';
      }
    }
    if (secondTable && secondTable.tFoot) {
      secondTable.tFoot.hidden = !!technicalMode;
      if (technicalMode) {
        secondTable.tFoot.innerHTML =
          '<tr><th colspan="6">Итого</th><th id="lawsuits-table-total-sum">—</th></tr>';
      } else {
        secondTable.tFoot.innerHTML =
          '<tr><th colspan="6">Итого</th><th id="lawsuits-table-total-sum">0,00</th></tr>';
      }
    }
  }

  function applyTechnicalCompactSizing(table, enabled) {
    if (!table) return;
    var headerCells = table.querySelectorAll("thead th");
    var bodyCells = table.querySelectorAll("tbody td");
    var i;
    if (enabled) {
      table.style.tableLayout = "fixed";
      table.style.width = "100%";
      table.style.minWidth = "0";
    } else {
      table.style.tableLayout = "";
      table.style.width = "";
      table.style.minWidth = "";
    }
    var widths = enabled
      ? [
          { width: "124px", minWidth: "112px", maxWidth: "156px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" },
          { width: "260px", minWidth: "220px", maxWidth: "340px", whiteSpace: "normal", overflowWrap: "break-word", wordBreak: "break-word" },
          {
            width: "84px",
            minWidth: "80px",
            maxWidth: "116px",
            whiteSpace: "normal",
            overflowWrap: "break-word",
            wordBreak: "break-word",
            hyphens: "auto",
          },
          {
            width: "92px",
            minWidth: "84px",
            maxWidth: "112px",
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          },
          { width: "72px", minWidth: "70px", maxWidth: "92px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" },
          { width: "60px", minWidth: "60px", maxWidth: "76px", whiteSpace: "nowrap" },
          { width: "60px", minWidth: "60px", maxWidth: "76px", whiteSpace: "nowrap" },
        ]
      : [];
    for (i = 0; i < headerCells.length; i++) {
      var th = headerCells[i];
      if (!th) continue;
      if (enabled && widths[i]) {
        th.style.width = widths[i].width;
        th.style.minWidth = widths[i].minWidth;
        th.style.maxWidth = widths[i].maxWidth;
        th.style.whiteSpace = widths[i].whiteSpace;
        th.style.overflowWrap = widths[i].overflowWrap || "";
        th.style.wordBreak = widths[i].wordBreak || "";
        th.style.hyphens = widths[i].hyphens || "";
      } else {
        th.style.width = "";
        th.style.minWidth = "";
        th.style.maxWidth = "";
        th.style.whiteSpace = "";
        th.style.overflowWrap = "";
        th.style.wordBreak = "";
        th.style.hyphens = "";
      }
    }
    for (i = 0; i < bodyCells.length; i++) {
      var td = bodyCells[i];
      if (!td) continue;
      var cellIndex = i % 7;
      if (enabled && widths[cellIndex]) {
        td.style.width = widths[cellIndex].width;
        td.style.minWidth = widths[cellIndex].minWidth;
        td.style.maxWidth = widths[cellIndex].maxWidth;
        td.style.whiteSpace = widths[cellIndex].whiteSpace;
        td.style.overflowWrap = widths[cellIndex].overflowWrap || "";
        td.style.wordBreak = widths[cellIndex].wordBreak || "";
        td.style.hyphens = widths[cellIndex].hyphens || "";
      } else {
        td.style.width = "";
        td.style.minWidth = "";
        td.style.maxWidth = "";
        td.style.whiteSpace = "";
        td.style.overflowWrap = "";
        td.style.wordBreak = "";
        td.style.hyphens = "";
      }
    }
  }

  function getTechnicalTableHeadersFromRows(rows, tableKey) {
    if (!Array.isArray(rows) || !rows.length) return TECHNICAL_TABLE_HEADERS.slice();
    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      if (!item || String(item.tableKey || "").trim() !== String(tableKey || "").trim()) continue;
      if (Array.isArray(item.tableColumns) && item.tableColumns.length) {
        return item.tableColumns.map(function (header) {
          var normalizedHeader = tableTextOrDash(header);
          if (normalizedHeader === "№ в 1С") return "№";
          return normalizedHeader;
        });
      }
    }
    return TECHNICAL_TABLE_HEADERS.slice();
  }

  function setOpdirProjectTableMode(enabled) {
    var topTable = document.getElementById("table-top-deviations");
    var secondTable = document.getElementById("table-lawsuits");
    if (topTable) topTable.classList.toggle("dashboard-table--compact-by-content", !!enabled);
    if (secondTable) secondTable.classList.toggle("dashboard-table--compact-by-content", !!enabled);
    if (topTable && topTable.tFoot) {
      topTable.tFoot.hidden = !!enabled;
      if (enabled) {
        topTable.tFoot.innerHTML =
          '<tr><th colspan="6">Итого</th><th id="claims-table-total-sum">—</th></tr>';
      }
    }
    if (secondTable && secondTable.tFoot) {
      secondTable.tFoot.hidden = !!enabled;
      if (enabled) {
        secondTable.tFoot.innerHTML =
          '<tr><th colspan="6">Итого</th><th id="lawsuits-table-total-sum">—</th></tr>';
      }
    }
  }

  function formatTechnicalDate(value) {
    if (value == null || value === "") return "—";
    var s = String(value).trim();
    if (!s) return "—";
    var match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[3] + "." + match[2] + "." + match[1];
    var parsed = new Date(s);
    if (isNaN(parsed.getTime())) return tableTextOrDash(s);
    var day = String(parsed.getDate()).padStart(2, "0");
    var month = String(parsed.getMonth() + 1).padStart(2, "0");
    return day + "." + month + "." + parsed.getFullYear();
  }

  function formatTechnicalPercentComplete(value) {
    if (value == null || value === "") return "—";
    var n = Number(value);
    if (isNaN(n)) return tableTextOrDash(value);
    var pct = Math.abs(n) <= 1 ? n * 100 : n;
    return pct.toLocaleString("ru-RU", {
      maximumFractionDigits: 1,
    }) + "%";
  }

  function formatTechnicalDeviation(value) {
    if (value == null || value === "") return "—";
    return tableTextOrDash(value);
  }

  function getTechnicalDeviationSortValue(value) {
    if (value == null || value === "") return "";
    if (typeof value === "number" && isFinite(value)) return String(value);
    var s = String(value).trim();
    if (!s) return "";
    var match = s.match(/[+-]?\d+(?:[.,]\d+)?/);
    if (!match) return "";
    var n = Number(match[0].replace(",", "."));
    return isNaN(n) ? "" : String(n);
  }

  function pickTechnicalField(raw, fields) {
    if (!raw || typeof raw !== "object") return null;
    for (var i = 0; i < fields.length; i++) {
      var key = fields[i];
      if (key in raw && raw[key] != null && String(raw[key]).trim() !== "") return raw[key];
    }
    return null;
  }

  function isTechnicalExternalOrderRow(item) {
    return item && String(item.tableKey || "").trim() === activeTechnicalExternalTableKey;
  }

  function isTechnicalImprovementRow(item) {
    return item && String(item.tableKey || "").trim() === activeTechnicalDevelopmentTableKey;
  }

  function isOpdirProjectRow(item) {
    var key = item && String(item.tableKey || "").trim();
    return (
      key === OPDIR_PROJECT_TABLE_KEY ||
      key === PRODUCTION_DEPUTY_PROJECT_TABLE_KEY ||
      key === DEVDIR_PROJECTS_DEVIATIONS_TABLE_KEY
    );
  }

  function isConstructorProjectRow(item) {
    var key = item && String(item.tableKey || "").trim();
    return key === CONSTRUCTOR_PROJECT_TABLE_KEY || key === METROLOG_PROJECT_TABLE_KEY;
  }

  function isProjectDeviationLikeRow(item) {
    var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
    if (!raw) return false;
    return (
      raw.project_name != null &&
      (raw.project_manager != null ||
        raw.timeline != null ||
        raw.deviation != null ||
        raw.delay_days != null ||
        Array.isArray(raw.milestone_deviations))
    );
  }

  function isProductionImprovementProjectRow(item) {
    var key = item && String(item.tableKey || "").trim();
    return key === PRODUCTION_DEPUTY_IMPROVEMENT_TABLE_KEY;
  }

  function normalizeProductionClaimsShop(value) {
    return value === "pc2" ? "pc2" : "pc1";
  }

  function productionClaimsCulpritLabel(shop) {
    return normalizeProductionClaimsShop(shop) === "pc2" ? "Алмаз" : "ТурбулентностьДОНПроизводство1";
  }

  function productionClaimsRowMatchesShop(raw, shop) {
    if (!raw || typeof raw !== "object") return false;
    var selected = normalizeProductionClaimsShop(shop);
    var key = String(raw.culprit_dept_key || "").trim().toLowerCase();
    var text = String(raw.order_dept || "").trim().toLocaleLowerCase("ru-RU");
    if (selected === "pc2") {
      return key === "3a9ac2f2-214f-11e0-b91c-00248c26ee57" || text.indexOf("алмаз") !== -1 || text === "пц2";
    }
    return key === "f12f2fca-d5d2-11e7-8267-ac1f6b05524d" || text.indexOf("турбулентность") !== -1 || text === "пц1";
  }

  function appendTechnicalTableRow(tbody, raw) {
    var compactLayout = false;
    if (arguments.length > 2) compactLayout = !!arguments[2];
    var tr = document.createElement("tr");
    var projectCode = pickTechnicalField(raw, ["project_code", "nomer_proekta", "number", "order_number", "code"]);
    var title = pickTechnicalField(raw, ["name", "project_name", "title"]);
    var owner = pickTechnicalField(raw, ["rp", "project_manager", "manager"]);
    var dates = pickTechnicalField(raw, ["timeline", "sroki", "period", "date_range"]);
    var deviation = pickTechnicalField(raw, [
      "otklonenie_summarnoe",
      "deviation",
      "delay_days",
      "deviation_text",
      "otklonenie",
    ]);
    var status = pickTechnicalField(raw, ["status", "state", "stage"]);
    var progress = pickTechnicalField(raw, ["progress_pct", "progress", "percent_complete", "kpi_pct"]);
    var values = [
      tableTextOrDash(projectCode),
      tableTextOrDash(title),
      tableTextOrDash(owner),
      tableTextOrDash(dates),
      null,
      tableTextOrDash(status),
      formatTechnicalPercentComplete(progress),
    ];
    values.forEach(function (value, cellIndex) {
      var td = document.createElement("td");
      if (compactLayout) {
        if (cellIndex === 2) td.className = "technical-table-col-rp";
        if (cellIndex === 5) td.className = "technical-table-col-status";
        if (cellIndex === 6) td.className = "technical-table-col-progress";
      }
      if (compactLayout) {
        if (cellIndex === 0) {
          td.style.width = "124px";
          td.style.minWidth = "112px";
          td.style.maxWidth = "156px";
          td.style.whiteSpace = "normal";
          td.style.overflowWrap = "anywhere";
          td.style.wordBreak = "break-word";
        } else if (cellIndex === 1) {
          td.style.width = "260px";
          td.style.minWidth = "220px";
          td.style.maxWidth = "340px";
          td.style.whiteSpace = "normal";
          td.style.overflowWrap = "break-word";
          td.style.wordBreak = "break-word";
        } else if (cellIndex === 2) {
          td.style.width = "84px";
          td.style.minWidth = "80px";
          td.style.maxWidth = "116px";
          td.style.whiteSpace = "normal";
          td.style.overflowWrap = "break-word";
          td.style.wordBreak = "break-word";
          td.style.hyphens = "auto";
        } else if (cellIndex === 3) {
          td.style.width = "92px";
          td.style.minWidth = "84px";
          td.style.maxWidth = "112px";
          td.style.whiteSpace = "normal";
          td.style.overflowWrap = "anywhere";
          td.style.wordBreak = "break-word";
        } else if (cellIndex === 4) {
          td.style.width = "72px";
          td.style.minWidth = "70px";
          td.style.maxWidth = "92px";
          td.style.whiteSpace = "normal";
          td.style.overflowWrap = "anywhere";
          td.style.wordBreak = "break-word";
        } else if (cellIndex === 5 || cellIndex === 6) {
          td.style.width = "60px";
          td.style.minWidth = "60px";
          td.style.maxWidth = "76px";
          td.style.whiteSpace = "nowrap";
        }
      }
      if (cellIndex === 4) {
        buildTechnicalDeviationCell(td, raw);
      } else {
        td.textContent = value;
      }
      if (cellIndex === 3) {
        td.setAttribute("data-order", normalizeClaimsSearchText(dates));
      } else if (cellIndex === 4) {
        td.setAttribute("data-order", getTechnicalDeviationSortValue(deviation));
      } else if (cellIndex === 6) {
        var pct = Number(progress);
        td.setAttribute(
          "data-order",
          isNaN(pct) ? normalizeClaimsSearchText(progress) : String(Math.abs(pct) <= 1 ? pct * 100 : pct)
        );
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  function formatOpdirProjectPercent(value) {
    if (value == null || value === "") return "—";
    var n = Number(value);
    if (isNaN(n)) return tableTextOrDash(value);
    return n.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** API: в вехах может быть `delay_days` или `delay_workdays`. */
  function milestoneRowDelayDays(item) {
    if (!item || typeof item !== "object") return null;
    if (item.delay_days != null && item.delay_days !== "") return item.delay_days;
    if (item.delay_workdays != null && item.delay_workdays !== "") return item.delay_workdays;
    return null;
  }

  function milestoneRowDelayDaysText(item) {
    var v = milestoneRowDelayDays(item);
    return v != null ? String(v) : "0";
  }

  function formatOpdirMilestoneDetails(raw) {
    var milestones = Array.isArray(raw && raw.milestone_deviations) ? raw.milestone_deviations : [];
    if (!milestones.length) return "";
    return milestones
      .map(function (item, index) {
        var title = escapeHtml(tableTextOrDash(item.name));
        var startDate = escapeHtml(formatTechnicalDate(item.start_date));
        var finishDate = escapeHtml(formatTechnicalDate(item.finish_date));
        var delayDays = escapeHtml(milestoneRowDelayDaysText(item));
        var progress = escapeHtml(formatTechnicalPercentComplete(item.percent_complete));
        return (
          '<li><strong>' +
          (index + 1) +
          ".</strong> " +
          title +
          '<br><span>Начало: ' +
          startDate +
          "; окончание: " +
          finishDate +
          "; отклонение: " +
          delayDays +
          " дн.; выполнение: " +
          progress +
          "</span></li>"
        );
      })
      .join("");
  }

  function ensureOpdirMilestonesDialog() {
    var existing = document.getElementById("opdir-milestones-dialog");
    if (existing) return existing;
    var dlg = document.createElement("dialog");
    dlg.id = "opdir-milestones-dialog";
    dlg.className = "opdir-milestones-dialog";
    dlg.innerHTML =
      '<div class="opdir-milestones-dialog-panel">' +
      '<div class="opdir-milestones-dialog-head">' +
      '<div>' +
      '<h2 id="opdir-milestones-dialog-title" class="opdir-milestones-dialog-title">Отклонения по вехам</h2>' +
      '<p id="opdir-milestones-dialog-subtitle" class="opdir-milestones-dialog-subtitle"></p>' +
      "</div>" +
      '<form method="dialog"><button type="submit" class="btn-dialog-close">Закрыть</button></form>' +
      "</div>" +
      '<div id="opdir-milestones-dialog-body" class="opdir-milestones-dialog-body"></div>' +
      "</div>";
    dlg.addEventListener("click", function (event) {
      if (event.target === dlg && typeof dlg.close === "function") dlg.close();
    });
    document.body.appendChild(dlg);
    return dlg;
  }

  function openOpdirMilestonesDialog(raw) {
    var milestones = Array.isArray(raw && raw.milestone_deviations) ? raw.milestone_deviations : [];
    if (!milestones.length) return;
    var dlg = ensureOpdirMilestonesDialog();
    var title = dlg.querySelector("#opdir-milestones-dialog-title");
    var subtitle = dlg.querySelector("#opdir-milestones-dialog-subtitle");
    var body = dlg.querySelector("#opdir-milestones-dialog-body");
    if (title) title.textContent = "Отклонения по вехам: " + tableTextOrDash(raw.project_code || raw.number);
    if (subtitle) {
      subtitle.textContent =
        tableTextOrDash(raw.project_name) +
        " | РП: " +
        tableTextOrDash(raw.project_manager) +
        " | Прогресс проекта: " +
        formatOpdirProjectPercent(raw.progress_pct);
    }
    if (body) {
      body.innerHTML =
        '<table class="opdir-milestones-dialog-table">' +
        "<thead><tr><th>№</th><th>Веха</th><th>Начало</th><th>Окончание</th><th>Отклонение, дн.</th><th>Выполнение, %</th></tr></thead>" +
        "<tbody>" +
        milestones
          .map(function (item, index) {
            return (
              '<tr class="opdir-milestones-row--overdue"><td>' +
              (index + 1) +
              "</td><td>" +
              escapeHtml(tableTextOrDash(item.name)) +
              "</td><td>" +
              escapeHtml(formatTechnicalDate(item.start_date)) +
              "</td><td>" +
              escapeHtml(formatTechnicalDate(item.finish_date)) +
              "</td><td>" +
              escapeHtml(milestoneRowDelayDaysText(item)) +
              "</td><td>" +
              escapeHtml(formatTechnicalPercentComplete(item.percent_complete)) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table>";
    }
    if (typeof dlg.showModal === "function") {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute("open", "open");
    }
  }

  function ensureTechnicalMilestonesDialog() {
    var existing = document.getElementById("technical-milestones-dialog");
    if (existing) return existing;
    var dlg = document.createElement("dialog");
    dlg.id = "technical-milestones-dialog";
    dlg.className = "opdir-milestones-dialog";
    dlg.innerHTML =
      '<div class="opdir-milestones-dialog-panel">' +
      '<div class="opdir-milestones-dialog-head">' +
      '<div>' +
      '<h2 id="technical-milestones-dialog-title" class="opdir-milestones-dialog-title">Отклонения по вехам</h2>' +
      '<p id="technical-milestones-dialog-subtitle" class="opdir-milestones-dialog-subtitle"></p>' +
      "</div>" +
      '<form method="dialog"><button type="submit" class="btn-dialog-close">Закрыть</button></form>' +
      "</div>" +
      '<div id="technical-milestones-dialog-body" class="opdir-milestones-dialog-body"></div>' +
      "</div>";
    dlg.addEventListener("click", function (event) {
      if (event.target === dlg && typeof dlg.close === "function") dlg.close();
    });
    document.body.appendChild(dlg);
    return dlg;
  }

  function openTechnicalMilestonesDialog(raw) {
    var milestones = Array.isArray(raw && raw.milestone_deviations) ? raw.milestone_deviations : [];
    if (!milestones.length) return;
    var dlg = ensureTechnicalMilestonesDialog();
    var title = dlg.querySelector("#technical-milestones-dialog-title");
    var subtitle = dlg.querySelector("#technical-milestones-dialog-subtitle");
    var body = dlg.querySelector("#technical-milestones-dialog-body");
    if (title) title.textContent = "Отклонения по вехам: " + tableTextOrDash(raw.project_code || raw.number);
    if (subtitle) {
      subtitle.textContent =
        tableTextOrDash(raw.project_name) +
        " | РП: " +
        tableTextOrDash(raw.project_manager) +
        " | Прогресс проекта: " +
        formatOpdirProjectPercent(raw.progress_pct);
    }
    if (body) {
      body.innerHTML =
        '<table class="opdir-milestones-dialog-table">' +
        "<thead><tr><th>№</th><th>Веха</th><th>Начало</th><th>Окончание</th><th>Отклонение, дн.</th><th>Выполнение, %</th></tr></thead>" +
        "<tbody>" +
        milestones
          .map(function (item, index) {
            return (
              '<tr class="opdir-milestones-row--overdue"><td>' +
              (index + 1) +
              "</td><td>" +
              escapeHtml(tableTextOrDash(item.name)) +
              "</td><td>" +
              escapeHtml(formatTechnicalDate(item.start_date)) +
              "</td><td>" +
              escapeHtml(formatTechnicalDate(item.finish_date)) +
              "</td><td>" +
              escapeHtml(milestoneRowDelayDaysText(item)) +
              "</td><td>" +
              escapeHtml(formatTechnicalPercentComplete(item.percent_complete)) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table>";
    }
    if (typeof dlg.showModal === "function") {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute("open", "open");
    }
  }

  function buildTechnicalDeviationCell(td, raw) {
    var milestones = Array.isArray(raw && raw.milestone_deviations) ? raw.milestone_deviations : [];
    td.setAttribute(
      "data-order",
      String(
        raw && raw.delay_days != null
          ? raw.delay_days
          : raw && raw.delay_workdays != null
            ? raw.delay_workdays
            : ""
      )
    );
    if (!milestones.length) {
      td.textContent = tableTextOrDash(raw && raw.deviation);
      return;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opdir-milestones-toggle";
    btn.textContent = tableTextOrDash(raw.deviation);
    btn.setAttribute("aria-haspopup", "dialog");

    function openDetails(event) {
      event.preventDefault();
      event.stopPropagation();
      openTechnicalMilestonesDialog(raw);
    }

    td.className = "opdir-milestones-cell";
    td.style.whiteSpace = "normal";
    td.style.overflowWrap = "anywhere";
    td.style.wordBreak = "break-word";
    td.addEventListener("click", openDetails);
    btn.addEventListener("click", openDetails);

    td.appendChild(btn);
  }

  function buildOpdirDeviationCell(td, raw) {
    var milestones = Array.isArray(raw && raw.milestone_deviations) ? raw.milestone_deviations : [];
    td.setAttribute(
      "data-order",
      String(
        raw && raw.delay_days != null
          ? raw.delay_days
          : raw && raw.delay_workdays != null
            ? raw.delay_workdays
            : ""
      )
    );
    if (!milestones.length) {
      td.textContent = tableTextOrDash(raw && raw.deviation);
      return;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opdir-milestones-toggle";
    btn.textContent = tableTextOrDash(raw.deviation);
    btn.setAttribute("aria-haspopup", "dialog");

    function openDetails(event) {
      event.preventDefault();
      event.stopPropagation();
      openOpdirMilestonesDialog(raw);
    }

    td.className = "opdir-milestones-cell";
    td.addEventListener("click", openDetails);
    btn.addEventListener("click", openDetails);

    td.appendChild(btn);
  }

  function appendOpdirProjectTableRow(tbody, raw) {
    var tr = document.createElement("tr");
    var values = [
      tableTextOrDash(raw.project_code || raw.number),
      tableTextOrDash(raw.project_name),
      tableTextOrDash(raw.project_manager),
      tableTextOrDash(raw.timeline),
      null,
      tableTextOrDash(raw.status),
      formatOpdirProjectPercent(raw.progress_pct),
    ];
    values.forEach(function (value, cellIndex) {
      var td = document.createElement("td");
      if (cellIndex === 2) td.className = "technical-table-col-rp";
      if (cellIndex === 5) td.className = "technical-table-col-status";
      if (cellIndex === 6) td.className = "technical-table-col-progress";
      if (cellIndex === 4) {
        buildOpdirDeviationCell(td, raw);
      } else {
        td.textContent = value;
      }
      if (cellIndex === 0) {
        td.setAttribute("data-order", String(raw.project_code || raw.number || ""));
      } else if (cellIndex === 6) {
        var pct = Number(raw.progress_pct);
        td.setAttribute("data-order", isNaN(pct) ? "" : String(pct));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  function appendProductionImprovementProjectTableRow(tbody, raw) {
    var tr = document.createElement("tr");
    var values = [
      tableTextOrDash(raw.project_code || raw.number),
      tableTextOrDash(raw.project_name),
      tableTextOrDash(raw.project_manager),
      tableTextOrDash(raw.kurator),
      tableTextOrDash(raw.timeline),
      tableTextOrDash(raw.status),
      formatOpdirProjectPercent(raw.progress_pct),
    ];
    values.forEach(function (value, cellIndex) {
      var td = document.createElement("td");
      td.textContent = value;
      if (cellIndex === 0) {
        td.setAttribute("data-order", String(raw.project_code || raw.number || ""));
      } else if (cellIndex === 6) {
        var pct = Number(raw.progress_pct);
        td.setAttribute("data-order", isNaN(pct) ? "" : String(pct));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  function formatExecutiveTableValue(value) {
    if (value == null || value === "") return "—";
    if (typeof DashUi !== "undefined" && DashUi && typeof DashUi.formatKpiTilePlanFactValue === "function") {
      return DashUi.formatKpiTilePlanFactValue(value);
    }
    return tableTextOrDash(value);
  }

  function buildExecutiveRagHtml(rag) {
    var key = tableTextOrDash(rag).toLocaleLowerCase("ru-RU");
    var normalized = key === "green" || key === "yellow" || key === "red" || key === "blue" ? key : "blue";
    if (typeof DashUi !== "undefined" && DashUi && typeof DashUi.ragCell === "function") {
      return DashUi.ragCell(normalized);
    }
    return '<span class="rag-dot rag-' + normalized + '" title="' + normalized + '"></span>';
  }

  function appendExecutiveTableRow(tbody, titleValue, factValue, planValue, ragValue, tailValue) {
    var tr = document.createElement("tr");
    var titleTd = document.createElement("td");
    titleTd.textContent = tableTextOrDash(titleValue);
    tr.appendChild(titleTd);

    var factTd = document.createElement("td");
    factTd.textContent = formatExecutiveTableValue(factValue);
    tr.appendChild(factTd);

    var planTd = document.createElement("td");
    planTd.textContent = formatExecutiveTableValue(planValue);
    tr.appendChild(planTd);

    var ragTd = document.createElement("td");
    ragTd.className = "dashboard-table-rag-cell";
    ragTd.innerHTML = buildExecutiveRagHtml(ragValue);
    tr.appendChild(ragTd);

    var tailTd = document.createElement("td");
    tailTd.textContent = tableTextOrDash(tailValue);
    tr.appendChild(tailTd);

    tbody.appendChild(tr);
  }

  function isExecutiveDecisionRow(row) {
    var key = row && row.tableKey != null ? String(row.tableKey).trim().toLocaleLowerCase("ru-RU") : "";
    if (!key) return false;
    return /реш|эскал|escal|decision|solution|question|issue/.test(key);
  }

  function splitExecutiveRows(rows) {
    var sourceRows = Array.isArray(rows) ? rows : [];
    var decisionRows = sourceRows.filter(isExecutiveDecisionRow);
    var deviationRows = sourceRows.filter(function (row) {
      return !isExecutiveDecisionRow(row);
    });
    if (!deviationRows.length) deviationRows = sourceRows.slice();
    return {
      deviations: deviationRows.slice(0, 10),
      decisions: decisionRows.slice(0, 10),
    };
  }

  function renderExecutiveTables(rows) {
    var topBody = document.querySelector("#table-top-deviations tbody");
    var debtBody = document.querySelector("#table-overdue-debt tbody");
    if (!topBody || !debtBody) return;

    setTableHeaders("table-top-deviations", EXECUTIVE_DEVIATIONS_HEADERS);
    setTableHeaders("table-overdue-debt", EXECUTIVE_DECISIONS_HEADERS);
    setTopDeviationsTableMode(true);
    setOverdueDebtTableMode(true);

    topBody.innerHTML = "";
    debtBody.innerHTML = "";

    var groups = splitExecutiveRows(rows);
    groups.deviations.forEach(function (row) {
      appendExecutiveTableRow(topBody, row.kpi, row.fact, row.plan, row.rag, row.comment);
    });
    groups.decisions.forEach(function (row) {
      appendExecutiveTableRow(debtBody, row.kpi, row.fact, row.plan, row.rag, row.comment);
    });
  }

  function resetDefaultTables(rows) {
    var topTable = document.getElementById("table-top-deviations");
    if (topTable) {
      topTable.classList.remove("dashboard-table--logistics-claims");
      topTable.classList.remove("dashboard-table--hrd-late-vacancies");
    }
    if (hrdLateVacanciesTableMode) {
      setTableHeaders("table-top-deviations", HRD_LATE_VACANCIES_HEADERS);
    } else if (productionClaimsTableMode) {
      setTableHeaders("table-top-deviations", PRODUCTION_CLAIMS_HEADERS);
      setTableHeaders("table-lawsuits", OPDIR_PROJECT_TABLE_HEADERS);
    } else if (opdirProjectTableMode) {
      setTableHeaders("table-top-deviations", OPDIR_PROJECT_TABLE_HEADERS);
      setTableHeaders("table-lawsuits", OPDIR_PROJECT_TABLE_HEADERS);
    } else if (technicalTablesMode) {
      setTableHeaders("table-top-deviations", getTechnicalTableHeadersFromRows(rows, activeTechnicalExternalTableKey));
      setTableHeaders("table-lawsuits", getTechnicalTableHeadersFromRows(rows, activeTechnicalDevelopmentTableKey));
    } else {
      setTableHeaders("table-top-deviations", DEFAULT_TOP_DEVIATIONS_HEADERS);
      setTableHeaders("table-lawsuits", ["Тип документа", "Контрагент", "Предмет спора", "Роль ГК в споре", "Юр. лицо", "Подразделение", "Сумма требований, руб."]);
    }
    setTableHeaders("table-overdue-debt", DEFAULT_OVERDUE_DEBT_HEADERS);
    setTopDeviationsTableMode(false);
    setOverdueDebtTableMode(false);
  }

  function isHrdLateVacancyRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toUpperCase() : "";
    return key === HRD_LATE_VACANCIES_TABLE_KEY;
  }

  function renderProtocolOverdueTableRows(rows) {
    var table = document.getElementById("table-protocol-overdue");
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";
    setTableHeaders("table-protocol-overdue", PROTOCOL_OVERDUE_HEADERS);
    table.setAttribute("aria-label", "Отклонения по протоколам");
    table.classList.add("dashboard-table--protocol-overdue");

    var protocolRows = rows.filter(isProtocolOverdueRow);

    protocolRows.forEach(function (item) {
      var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      if (!raw) return;
      var tr = document.createElement("tr");
      var cells = [
        {
          value: pickTableField(raw, ["\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b", "protocol", "protocol_name"]),
          className: "dashboard-table-cell--medium-text",
        },
        {
          value: pickTableField(raw, ["\u0421\u0440\u043e\u043a\u0418\u0441\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f", "due_date", "deadline"]),
          className: "dashboard-table-cell--date",
        },
        {
          value: pickTableField(raw, [
            "\u0414\u0430\u0442\u0430\u041f\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0438\u0417\u0430\u0434\u0430\u0447\u0438",
            "task_assigned_date",
            "assigned_date",
          ]),
          className: "dashboard-table-cell--date",
        },
        {
          value: pickTableField(raw, ["\u0417\u0430\u0434\u0430\u0447\u0430", "task", "task_text"]),
          className: "dashboard-table-cell--wide-text",
        },
        {
          value: pickTableField(raw, ["\u041e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439", "responsible", "executor"]),
          className: "dashboard-table-cell--medium-text",
        },
        {
          value: pickTableField(raw, ["\u0410\u0432\u0442\u043e\u0440", "author"]),
          className: "dashboard-table-cell--medium-text",
        },
      ];
      cells.forEach(function (cell) {
        appendClampedCell(tr, cell.value, cell.className);
      });
      tbody.appendChild(tr);
    });
  }

  function renderHrdLateVacanciesTableRows(rows) {
    var table = document.getElementById("table-top-deviations");
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";
    table.classList.add("dashboard-table--hrd-late-vacancies");
    setTableHeaders("table-top-deviations", HRD_LATE_VACANCIES_HEADERS);
    if (table.tFoot) {
      table.tFoot.hidden = true;
      table.tFoot.innerHTML =
        '<tr><th colspan="' + String(HRD_LATE_VACANCIES_HEADERS.length) + '"></th></tr>';
    }

    rows.filter(isHrdLateVacancyRow).forEach(function (item) {
      var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      if (!raw) return;
      var tr = document.createElement("tr");
      [
        raw.company,
        raw.department,
        raw.vacancy,
        raw.plan_close_date,
        raw.fact_close_date,
      ].forEach(function (value, cellIndex) {
        appendClampedCell(tr, value, cellIndex === 2 ? "dashboard-table-cell--wide-text" : "");
      });
      tbody.appendChild(tr);
    });
  }

  function renderClaimsTableRows(rows) {
    var table = document.getElementById("table-top-deviations");
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";

    if (!Array.isArray(rows) || !rows.length) return;

    if (productionClaimsTableMode) {
      setTableHeaders("table-top-deviations", PRODUCTION_CLAIMS_HEADERS);
      rows.filter(isProductionClaimsRow).forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        if (!productionClaimsRowMatchesShop(raw, productionClaimsShop)) return;
        var tr = document.createElement("tr");
        appendClampedCell(tr, raw.code, "dashboard-table-cell--compact");
        appendClampedCell(tr, raw.date_reg, "dashboard-table-cell--date");
        appendClampedCell(tr, productionClaimsCulpritLabel(productionClaimsShop), "dashboard-table-cell--medium-text");
        appendClampedCell(tr, raw.status, "dashboard-table-cell--status");
        appendClampedCell(tr, raw.nomenclature, "dashboard-table-cell--wide-text");
        appendClampedCell(tr, raw.description, "dashboard-table-cell--wide-text");
        appendClampedCell(tr, formatLogisticsClaimNumber(raw.calculated_defect_qty), "dashboard-table-cell--number");
        tbody.appendChild(tr);
      });
      return;
    }

    if (opdirProjectTableMode) {
      setTableHeaders("table-top-deviations", OPDIR_PROJECT_TABLE_HEADERS);
      rows.filter(isOpdirProjectRow).forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        appendOpdirProjectTableRow(tbody, raw);
      });
      return;
    }

    if (constructorProjectTableMode) {
      setTableHeaders("table-top-deviations", CONSTRUCTOR_PROJECT_TABLE_HEADERS);
      rows.filter(function (item) {
        return isConstructorProjectRow(item) || isProjectDeviationLikeRow(item);
      }).forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        appendOpdirProjectTableRow(tbody, raw);
      });
      return;
    }

    if (technicalTablesMode) {
      rows.filter(isTechnicalExternalOrderRow).forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        appendTechnicalTableRow(tbody, raw, true);
      });
      return;
    }

    var logisticsRows = rows.filter(isLogisticsClaimsRow);
    if (logisticsRows.length) {
      setTableHeaders("table-top-deviations", LOGISTICS_CLAIMS_HEADERS);
      table.classList.add("dashboard-table--logistics-claims");
      if (table.tFoot) {
        table.tFoot.hidden = true;
        table.tFoot.innerHTML =
          '<tr><th colspan="9">Итого</th><th id="claims-table-total-sum">—</th></tr>';
      }
      logisticsRows.forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        var tr = document.createElement("tr");
        appendClampedCell(tr, raw.code, "dashboard-table-cell--compact");
        appendClampedCell(tr, raw.date_reg, "dashboard-table-cell--date");
        appendClampedCell(tr, raw.supplier, "dashboard-table-cell--wide-text");
        appendClampedCell(tr, raw.supplier_order_number || raw.order_num, "dashboard-table-cell--compact");
        appendClampedCell(tr, raw.status, "dashboard-table-cell--status");
        appendClampedCell(tr, raw.posted === true ? "Проведен" : "Не проведен", "dashboard-table-cell--status");
        appendClampedCell(tr, raw.nomenclature, "dashboard-table-cell--wide-text");
        appendClampedCell(tr, raw.reason_category, "dashboard-table-cell--medium-text");
        appendClampedCell(tr, raw.resolution, "dashboard-table-cell--medium-text");
        appendClampedCell(tr, formatLogisticsClaimNumber(raw.calculated_defect_qty), "dashboard-table-cell--number");
        tbody.appendChild(tr);
      });
      return;
    }

    rows.filter(isClaimsTableRow).forEach(function (item) {
      var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      if (!raw) return;
      var tr = document.createElement("tr");
      [
        tableTextOrDash(raw.code),
        tableTextOrDash(raw.name),
        tableTextOrDash(raw.partner),
        tableTextOrDash(raw.date_reg),
        tableTextOrDash(raw.date_plan),
        tableTextOrDash(raw.order_num),
        tableTextOrDash(raw.order_dept),
        tableTextOrDash(raw.nomenclature),
        tableTextOrDash(raw.description),
        tableTextOrDash(raw.status),
        formatClaimsOrderSum(raw.order_sum),
      ].forEach(function (value, cellIndex) {
        var td = document.createElement("td");
        td.textContent = value;
        if (cellIndex === 10) {
          td.setAttribute("data-order", getClaimsOrderSumSortValue(raw.order_sum));
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function isClaimsTableRow(item) {
    var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
    if (!raw || isOverdueDebtRow(item) || isLawsuitsRow(item) || isProtocolOverdueRow(item)) return false;
    return (
      raw.code != null ||
      raw.name != null ||
      raw.partner != null ||
      raw.date_reg != null ||
      raw.date_plan != null ||
      raw.order_num != null ||
      raw.order_dept != null ||
      raw.nomenclature != null ||
      raw.description != null ||
      raw.status != null ||
      raw.order_sum != null
    );
  }

  function isLogisticsClaimsRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toLocaleUpperCase("ru-RU") : "";
    return key === LOGISTICS_CLAIMS_TABLE_KEY;
  }

  function isLogisticsSupplierDzRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toLocaleUpperCase("ru-RU") : "";
    return key === LOGISTICS_SUPPLIER_DZ_TABLE_KEY;
  }

  function isProductionClaimsRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toLocaleUpperCase("ru-RU") : "";
    return key === PRODUCTION_CLAIMS_TABLE_KEY;
  }

  function isOverdueDebtRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toLocaleLowerCase("ru-RU") : "";
    return key === "kd-t-overdue";
  }

  function isLawsuitsRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toLocaleLowerCase("ru-RU") : "";
    if (!key) return false;
    return (
      key === "kd-t-lawsuits" ||
      key === "kd-t-courts" ||
      key === "kd-t-suits" ||
      key === "суды" ||
      key === "lawsuits" ||
      key === "courts"
    );
  }

  function pickLawsuitsField(raw, fields) {
    for (var i = 0; i < fields.length; i++) {
      var key = fields[i];
      if (key in raw && raw[key] != null && raw[key] !== "") return raw[key];
    }
    return null;
  }

  function renderLawsuitsTableRows(rows) {
    var table = document.getElementById("table-lawsuits");
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";

    if (!Array.isArray(rows) || !rows.length) return;

    if (opdirProjectTableMode) {
      var improvementRows = rows.filter(isProductionImprovementProjectRow);
      setTableHeaders(
        "table-lawsuits",
        improvementRows.length ? PRODUCTION_IMPROVEMENT_TABLE_HEADERS : OPDIR_PROJECT_TABLE_HEADERS
      );
      improvementRows.forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        appendProductionImprovementProjectTableRow(tbody, raw);
      });
      return;
    }

    if (technicalTablesMode) {
      rows.filter(isTechnicalImprovementRow).forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        appendTechnicalTableRow(tbody, raw, true);
      });
      return;
    }

    rows
      .filter(isLawsuitsRow)
      .forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        var amount = pickLawsuitsField(raw, ["claim_amount", "amount", "sum", "requirement_sum", "requirements_sum"]);
        var tr = document.createElement("tr");
        [
          tableTextOrDash(pickLawsuitsField(raw, ["doc_type", "document_type", "documentType"])),
          tableTextOrDash(pickLawsuitsField(raw, ["counterparty", "partner", "contragent"])),
          tableTextOrDash(pickLawsuitsField(raw, ["subject", "dispute_subject", "dispute", "topic"])),
          tableTextOrDash(pickLawsuitsField(raw, ["gc_role", "gk_role", "role", "company_role"])),
          tableTextOrDash(pickLawsuitsField(raw, ["gc_entity", "legal_entity", "entity", "company", "jur_entity", "ur_entity"])),
          tableTextOrDash(pickLawsuitsField(raw, ["initiator_dept", "department", "subdivision", "unit", "division"])),
          formatClaimsOrderSum(amount),
        ].forEach(function (value, cellIndex) {
          var td = document.createElement("td");
          td.textContent = value;
          if (cellIndex === 6) {
            td.setAttribute("data-order", getClaimsOrderSumSortValue(amount));
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
  }

  function renderOverdueDebtTableRows(rows) {
    var table = document.getElementById("table-overdue-debt");
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";

    if (logisticsSupplierDebtTableMode) {
      var supplierDzRows = Array.isArray(rows) ? rows.filter(isLogisticsSupplierDzRow) : [];
      logisticsSupplierDebtTableMode = true;
      setTableHeaders("table-overdue-debt", LOGISTICS_SUPPLIER_DZ_HEADERS);
      if (table.tFoot) {
        table.tFoot.hidden = false;
        table.tFoot.innerHTML =
          '<tr><th colspan="4">Итого</th><th id="overdue-debt-table-total-sum">0,00</th></tr>';
      }
      supplierDzRows.forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        var tr = document.createElement("tr");
        appendClampedCell(tr, raw.order_num || raw.order_key, "dashboard-table-cell--compact");
        appendClampedCell(tr, raw.order_date, "dashboard-table-cell--date");
        appendClampedCell(tr, raw.object_name, "dashboard-table-cell--wide-text");
        appendClampedCell(tr, raw.supplier, "dashboard-table-cell--wide-text");
        var amountTd = document.createElement("td");
        amountTd.textContent = formatClaimsOrderSum(raw.amount);
        amountTd.setAttribute("data-order", getClaimsOrderSumSortValue(raw.amount));
        amountTd.className = "dashboard-table-cell--number";
        tr.appendChild(amountTd);
        tbody.appendChild(tr);
      });
      updateOverdueDebtTotalRow(null);
      return;
    }

    if (!Array.isArray(rows) || !rows.length) return;

    rows
      .filter(isOverdueDebtRow)
      .forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        var counterparty = raw.counterparty != null && String(raw.counterparty).trim() !== ""
          ? raw.counterparty
          : raw.partner_name;
        var orderNum = raw.order_num != null && String(raw.order_num).trim() !== ""
          ? raw.order_num
          : raw.order_number;
        var tr = document.createElement("tr");
        [
          tableTextOrDash(orderNum),
          tableTextOrDash(counterparty),
          raw.days_overdue != null && raw.days_overdue !== "" ? tableTextOrDash(raw.days_overdue) : "—",
          tableTextOrDash(raw.liquidated_dept_name || raw["Ликвидированное подразделение"]),
          tableTextOrDash(raw.reason),
          tableTextOrDash(raw.action),
          formatClaimsOrderSum(raw.amount),
        ].forEach(function (value, cellIndex) {
          var td = document.createElement("td");
          td.textContent = value;
          if (cellIndex === 6) {
            td.setAttribute("data-order", getClaimsOrderSumSortValue(raw.amount));
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
  }

  function initInteractiveDashboardTable(options) {
    if (typeof $ === "undefined" || !$.fn || !$.fn.DataTable) return null;
    options = options || {};
    var tableSelector = options.tableSelector;
    var wrapperSelector = options.wrapperSelector || ".dashboard-table-wrap--claims";
    var columnConfigs = Array.isArray(options.columnConfigs) ? options.columnConfigs : [];
    var initialOrder = Array.isArray(options.initialOrder) ? options.initialOrder : [];
    var columnDefs = Array.isArray(options.columnDefs) ? options.columnDefs : [];
    var advancedSearchKey = options.advancedSearchKey || String(tableSelector || "dashboard-table");
    var footerCallback = typeof options.footerCallback === "function" ? options.footerCallback : null;
    var afterInit = typeof options.afterInit === "function" ? options.afterInit : null;

    var table = $(tableSelector);
    if (!table.length) return null;

    var wrapper = table.closest(wrapperSelector);
    if (wrapper.length) {
      wrapper.find(".claims-column-filter-menu").remove();
    }
    if ($.fn.DataTable.isDataTable(table)) {
      table.DataTable().destroy();
    }

    var dataTable = table.DataTable({
      order: initialOrder,
      paging: true,
      pageLength: 10,
      lengthMenu: [10, 25, 50],
      autoWidth: false,
      deferRender: true,
      language: {
        search: "Поиск:",
        lengthMenu: "Показать _MENU_ записей",
        info: "Показаны _START_–_END_ из _TOTAL_",
        infoEmpty: "Нет записей",
        infoFiltered: "(отфильтровано из _MAX_)",
        zeroRecords: "Ничего не найдено",
        emptyTable: "Нет данных для отображения",
        paginate: {
          first: "Первая",
          previous: "Назад",
          next: "Вперед",
          last: "Последняя",
        },
      },
      columnDefs: columnDefs,
      dom: '<"claims-table-top"lf><"claims-table-scroll"rt><"claims-table-bottom"ip>',
      footerCallback: footerCallback || undefined,
    });

    if (afterInit) {
      afterInit(dataTable);
    }

    var searchFieldConfigs = columnConfigs.filter(function (config) {
      return !!config.searchType;
    });
    var claimsSearchState = {
      fields: [],
      text: "",
      date: "",
    };
    if ($.fn.dataTable && $.fn.dataTable.ext && Array.isArray($.fn.dataTable.ext.search)) {
      for (var extIdx = $.fn.dataTable.ext.search.length - 1; extIdx >= 0; extIdx--) {
        var extSearchFn = $.fn.dataTable.ext.search[extIdx];
        if (extSearchFn && extSearchFn._claimsAdvancedSearchKey === advancedSearchKey) {
          $.fn.dataTable.ext.search.splice(extIdx, 1);
        }
      }
    }

    function getClaimsSearchFieldsByType(type) {
      return searchFieldConfigs.filter(function (config) {
        return claimsSearchState.fields.indexOf(config.index) !== -1 && config.searchType === type;
      });
    }

    function rowMatchesClaimsSearchText(rowData, fields, query, searchAllColumns) {
      if (!query) return true;
      if (searchAllColumns) {
        for (var rowIndex = 0; rowIndex < rowData.length; rowIndex++) {
          var rowValue = normalizeClaimsSearchText(rowData[rowIndex]);
          if (rowValue && rowValue.indexOf(query) !== -1) return true;
        }
        return false;
      }
      if (!fields.length) return true;
      for (var fieldIdx = 0; fieldIdx < fields.length; fieldIdx++) {
        var field = fields[fieldIdx];
        var value = normalizeClaimsSearchText(rowData[field.index]);
        if (value && value.indexOf(query) !== -1) return true;
      }
      return false;
    }

    function rowMatchesClaimsSearchDate(rowData, fields, dateValue) {
      if (!fields.length || !dateValue) return true;
      for (var fieldIdx = 0; fieldIdx < fields.length; fieldIdx++) {
        var field = fields[fieldIdx];
        if (normalizeClaimsSearchDate(rowData[field.index]) === dateValue) return true;
      }
      return false;
    }

    var claimsAdvancedSearchFn = function (settings, data) {
      if (!settings || settings.nTable !== table[0]) return true;
      var activeTextFields = getClaimsSearchFieldsByType("text");
      var activeDateFields = getClaimsSearchFieldsByType("date");
      var textQuery = normalizeClaimsSearchText(claimsSearchState.text);
      var dateQuery = claimsSearchState.date;
      return rowMatchesClaimsSearchText(data, activeTextFields, textQuery, !claimsSearchState.fields.length) &&
        rowMatchesClaimsSearchDate(data, activeDateFields, dateQuery);
    };
    claimsAdvancedSearchFn._claimsAdvancedSearchKey = advancedSearchKey;
    $.fn.dataTable.ext.search.push(claimsAdvancedSearchFn);

    function buildClaimsAdvancedSearch() {
      if (!wrapper.length) return;
      var topBar = wrapper.find(".claims-table-top");
      if (!topBar.length) return;
      var filterHost = topBar.find(".dataTables_filter");
      if (!filterHost.length) return;

      filterHost.empty();
      filterHost.attr("role", "search");
      filterHost.addClass("claims-table-search-host");

      var searchWrap = document.createElement("div");
      searchWrap.className = "claims-table-search";

      var fieldsWrap = document.createElement("div");
      fieldsWrap.className = "claims-table-search-fields";

      var fieldsToggle = document.createElement("button");
      fieldsToggle.type = "button";
      fieldsToggle.className = "claims-table-search-fields-toggle";
      fieldsToggle.setAttribute("aria-expanded", "false");
      fieldsToggle.innerHTML =
        '<span class="claims-table-search-fields-toggle-text">Выберите поля</span>' +
        '<span class="claims-table-search-fields-toggle-icon" aria-hidden="true">▾</span>';

      var fieldsMenu = document.createElement("div");
      fieldsMenu.className = "claims-table-search-fields-menu";
      fieldsMenu.hidden = true;

      var fieldsTitle = document.createElement("p");
      fieldsTitle.className = "claims-table-search-fields-title";
      fieldsTitle.textContent = "Поля для поиска";
      fieldsMenu.appendChild(fieldsTitle);

      var fieldsOptions = document.createElement("div");
      fieldsOptions.className = "claims-table-search-fields-options";
      searchFieldConfigs.forEach(function (config) {
        var optionLabel = document.createElement("label");
        optionLabel.className = "claims-table-search-field-check";

        var checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(config.index);
        checkbox.addEventListener("change", function () {
          claimsSearchState.fields = Array.from(fieldsOptions.querySelectorAll('input[type="checkbox"]:checked')).map(
            function (input) {
              return Number(input.value);
            }
          );
          if (claimsSearchState.fields.length && !getClaimsSearchFieldsByType("text").length) claimsSearchState.text = "";
          if (claimsSearchState.fields.length && !getClaimsSearchFieldsByType("date").length) claimsSearchState.date = "";
          updateClaimsAdvancedSearchUi();
          dataTable.draw();
        });

        var textSpan = document.createElement("span");
        textSpan.textContent = config.label;

        optionLabel.appendChild(checkbox);
        optionLabel.appendChild(textSpan);
        fieldsOptions.appendChild(optionLabel);
      });
      fieldsMenu.appendChild(fieldsOptions);
      fieldsWrap.appendChild(fieldsToggle);
      fieldsWrap.appendChild(fieldsMenu);

      var controlsWrap = document.createElement("div");
      controlsWrap.className = "claims-table-search-inputs";

      var textInput = document.createElement("input");
      textInput.type = "search";
      textInput.className = "claims-table-search-text";
      textInput.placeholder = "Поиск по всем полям";
      textInput.addEventListener("input", function () {
        claimsSearchState.text = textInput.value;
        dataTable.draw();
      });

      var dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.className = "claims-table-search-date";
      dateInput.hidden = true;
      dateInput.disabled = true;
      dateInput.addEventListener("change", function () {
        claimsSearchState.date = dateInput.value;
        dataTable.draw();
      });

      var resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "claims-table-search-reset";
      resetBtn.textContent = "Сбросить";
      resetBtn.addEventListener("click", function () {
        claimsSearchState.fields = [];
        claimsSearchState.text = "";
        claimsSearchState.date = "";
        fieldsOptions.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
          input.checked = false;
        });
        updateClaimsAdvancedSearchUi();
        dataTable.draw();
      });

      controlsWrap.appendChild(textInput);
      controlsWrap.appendChild(dateInput);
      controlsWrap.appendChild(resetBtn);

      searchWrap.appendChild(fieldsWrap);
      searchWrap.appendChild(controlsWrap);
      filterHost[0].appendChild(searchWrap);

      function closeClaimsAdvancedSearchMenu() {
        fieldsMenu.hidden = true;
        fieldsToggle.setAttribute("aria-expanded", "false");
      }

      function updateClaimsAdvancedSearchUi() {
        var activeTextFields = getClaimsSearchFieldsByType("text");
        var activeDateFields = getClaimsSearchFieldsByType("date");
        var buttonText = "Выберите поля";
        if (claimsSearchState.fields.length === 1) {
          var selectedConfig = searchFieldConfigs.find(function (config) {
            return config.index === claimsSearchState.fields[0];
          });
          buttonText = selectedConfig ? selectedConfig.label : buttonText;
        } else if (claimsSearchState.fields.length > 1) {
          buttonText = "Выбрано полей: " + claimsSearchState.fields.length;
        }

        fieldsToggle.querySelector(".claims-table-search-fields-toggle-text").textContent = buttonText;
        fieldsToggle.title = claimsSearchState.fields
          .map(function (fieldIndex) {
            var config = searchFieldConfigs.find(function (fieldConfig) {
              return fieldConfig.index === fieldIndex;
            });
            return config ? config.label : "";
          })
          .filter(Boolean)
          .join(", ");

        textInput.value = claimsSearchState.text;
        textInput.hidden = false;
        textInput.disabled = claimsSearchState.fields.length > 0 && !activeTextFields.length;
        textInput.placeholder = "Поиск";

        dateInput.value = claimsSearchState.date;
        dateInput.hidden = !activeDateFields.length;
        dateInput.disabled = !activeDateFields.length;
        dateInput.setAttribute(
          "aria-label",
          activeDateFields.length === 1
            ? "Дата для поиска по полю " + activeDateFields[0].label
            : "Дата для поиска по выбранным полям"
        );

        resetBtn.disabled = !claimsSearchState.fields.length && !claimsSearchState.text && !claimsSearchState.date;
      }

      fieldsToggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var shouldOpen = fieldsMenu.hidden;
        closeClaimsAdvancedSearchMenu();
        fieldsMenu.hidden = !shouldOpen;
        fieldsToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      });

      $(document)
        .off("click.claimsAdvancedSearchMenu")
        .on("click.claimsAdvancedSearchMenu", function (event) {
          if (!searchWrap.contains(event.target)) closeClaimsAdvancedSearchMenu();
        });

      updateClaimsAdvancedSearchUi();
    }

    buildClaimsAdvancedSearch();

    var activeFilters = {};
    var activeSortColumn = null;
    var activeSortDir = "";
    var menus = [];

    function collectColumnValues(columnIndex) {
      var seen = [];
      dataTable
        .column(columnIndex)
        .data()
        .each(function (value) {
          var text = value != null ? String(value).trim() : "";
          if (!text || seen.indexOf(text) !== -1) return;
          seen.push(text);
        });
      return seen.sort(function (a, b) {
        return a.localeCompare(b, "ru");
      });
    }

    function closeAllClaimsMenus() {
      menus.forEach(function (menu) {
        menu.hidden = true;
      });
    }

    function applyClaimsColumnState() {
      Object.keys(activeFilters).forEach(function (key) {
        var values = activeFilters[key];
        var columnIndex = Number(key);
        if (Array.isArray(values) && values.length) {
          var pattern = values
            .map(function (value) {
              return escapeRegexForDataTable(value);
            })
            .join("|");
          dataTable.column(columnIndex).search("^(" + pattern + ")$", true, false);
        } else {
          dataTable.column(columnIndex).search("", true, false);
        }
      });
      if (activeSortColumn != null && activeSortDir) {
        dataTable.order([[activeSortColumn, activeSortDir]]);
      } else {
        dataTable.order([]);
      }
      dataTable.draw();
    }

    function isClaimsColumnResetVisible(config) {
      if (config.type === "sort") {
        return activeSortColumn === config.index && !!activeSortDir;
      }
      return Array.isArray(activeFilters[config.index]) && activeFilters[config.index].length > 0;
    }

    table.find("thead th").each(function (idx) {
      var th = this;
      var config = null;
      for (var i = 0; i < columnConfigs.length; i++) {
        if (columnConfigs[i].index === idx) {
          config = columnConfigs[i];
          break;
        }
      }
      if (!config) return;
      if (config.type === "none") return;
      if (th.querySelector(".claims-column-filter-trigger") || th.querySelector(".claims-column-sort-btn")) return;

      th.classList.add("claims-column-head");
      var titleText = th.textContent;
      th.textContent = "";

      var titleSpan = document.createElement("span");
      titleSpan.className = "claims-column-head-text";
      titleSpan.textContent = titleText;

      if (config.type === "sort") {
        var svgArrowUp = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2L2 7h8L6 2z" fill="currentColor"/></svg>';
        var svgArrowDown = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 10L2 5h8L6 10z" fill="currentColor"/></svg>';
        var svgArrowBoth = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 1L3 4.5h6L6 1z" fill="currentColor"/><path d="M6 11L3 7.5h6L6 11z" fill="currentColor"/></svg>';

        var sortBtn = document.createElement("button");
        sortBtn.type = "button";
        sortBtn.className = "claims-column-sort-btn";
        sortBtn.setAttribute("aria-label", "Сортировка " + config.label);
        sortBtn.innerHTML = svgArrowBoth;

        (function (colIndex, btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (activeSortColumn === colIndex && activeSortDir === "asc") {
              activeSortDir = "desc";
              btn.innerHTML = svgArrowDown;
              btn.style.color = "var(--accent-blue)";
            } else if (activeSortColumn === colIndex && activeSortDir === "desc") {
              activeSortColumn = null;
              activeSortDir = "";
              btn.innerHTML = svgArrowBoth;
              btn.style.color = "";
            } else {
              activeSortColumn = colIndex;
              activeSortDir = "asc";
              btn.innerHTML = svgArrowUp;
              btn.style.color = "var(--accent-blue)";
            }
            table.find(".claims-column-sort-btn").not(btn).each(function () {
              this.innerHTML = svgArrowBoth;
              this.style.color = "";
            });
            applyClaimsColumnState();
          });
        })(config.index, sortBtn);

        th.appendChild(titleSpan);
        th.appendChild(sortBtn);
        return;
      }

      var trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "claims-column-filter-trigger";
      trigger.setAttribute("aria-label", "Фильтр по колонке " + config.label);
      trigger.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<path d="M2 3h12l-4.8 5.3v3.2l-2.4 1.5V8.3L2 3z" fill="currentColor"/></svg>';

      var resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "claims-column-filter-reset";
      resetBtn.setAttribute("aria-label", "Сбросить фильтр по колонке " + config.label);
      resetBtn.textContent = "×";
      resetBtn.hidden = true;

      var menu = document.createElement("div");
      menu.className = "claims-column-filter-menu";
      menu.hidden = true;

      var filterTitle = document.createElement("p");
      filterTitle.className = "claims-column-filter-title";
      filterTitle.textContent = config.label;
      menu.appendChild(filterTitle);

      var optionsWrap = document.createElement("div");
      optionsWrap.className = "claims-column-filter-options";
      collectColumnValues(config.index).forEach(function (value) {
        var optionLabel = document.createElement("label");
        optionLabel.className = "claims-column-filter-check";
        var checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = value;
        checkbox.addEventListener("change", function () {
          var selected = [];
          optionsWrap.querySelectorAll('input[type="checkbox"]:checked').forEach(function (input) {
            selected.push(input.value);
          });
          activeFilters[config.index] = selected;
          resetBtn.hidden = !isClaimsColumnResetVisible(config);
          applyClaimsColumnState();
        });
        var textSpan = document.createElement("span");
        textSpan.textContent = value;
        optionLabel.appendChild(checkbox);
        optionLabel.appendChild(textSpan);
        optionsWrap.appendChild(optionLabel);
      });
      menu.appendChild(optionsWrap);

      resetBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        activeFilters[config.index] = [];
        menu.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
          input.checked = false;
        });
        resetBtn.hidden = true;
        applyClaimsColumnState();
        closeAllClaimsMenus();
      });

      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var shouldOpen = menu.hidden;
        closeAllClaimsMenus();
        menu.hidden = !shouldOpen;
      });

      th.appendChild(titleSpan);
      th.appendChild(resetBtn);
      th.appendChild(trigger);
      th.appendChild(menu);
      menus.push(menu);
    });

    document.addEventListener("click", function (event) {
      if (!table[0].contains(event.target)) closeAllClaimsMenus();
    });

    return dataTable;
  }

  function syncProtocolOverduePanel(rows, options) {
    options = options || {};
    protocolOverdueTableMode =
      !!options.protocolOverdueTableInBody || hasProtocolOverdueTableRows(rows);
    if (!protocolOverdueTableMode) {
      setProtocolOverduePanelVisible(false);
      if (typeof $ !== "undefined" && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable("#table-protocol-overdue")) {
        $("#table-protocol-overdue").DataTable().destroy();
      }
      return;
    }
    setProtocolOverduePanelVisible(true);
    renderProtocolOverdueTableRows(rows);
    initProtocolOverdueDataTable();
  }

  function initProtocolOverdueDataTable() {
    return initInteractiveDashboardTable({
      tableSelector: "#table-protocol-overdue",
      wrapperSelector: ".dashboard-table-wrap--protocol-overdue",
      advancedSearchKey: "protocol-overdue-table-advanced",
      columnConfigs: [
        { index: 0, label: "Протокол", type: "filter", searchType: "text" },
        { index: 1, label: "Срок", type: "sort", searchType: "date" },
        { index: 2, label: "Постановка", type: "sort", searchType: "date" },
        { index: 3, label: "Задача", type: "filter", searchType: "text" },
        { index: 4, label: "Исполнитель", type: "filter", searchType: "text" },
        { index: 5, label: "Автор", type: "filter", searchType: "text" },
      ],
      initialOrder: [[1, "desc"], [2, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [1, 2], orderable: true },
      ],
    });
  }

  function initClaimsDataTable() {
    if (hrdLateVacanciesTableMode) {
      return initInteractiveDashboardTable({
        tableSelector: "#table-top-deviations",
        wrapperSelector: ".dashboard-table-wrap--claims",
        advancedSearchKey: "hrd-late-vacancies-table-advanced",
        columnConfigs: [
          { index: 0, label: "Компания", type: "filter", searchType: "text" },
          { index: 1, label: "Подразделение", type: "filter", searchType: "text" },
          { index: 2, label: "Вакансия", type: "filter", searchType: "text" },
          { index: 3, label: "Дата закрытия плановая", type: "sort", searchType: "date" },
          { index: 4, label: "Дата закрытия факт", type: "sort", searchType: "date" },
        ],
        initialOrder: [[4, "desc"]],
        columnDefs: [
          { targets: "_all", orderable: false },
          { targets: [3, 4], orderable: true },
        ],
      });
    }
    var topTable = document.getElementById("table-top-deviations");
    if (topTable && topTable.classList.contains("dashboard-table--logistics-claims")) {
      return initInteractiveDashboardTable({
        tableSelector: "#table-top-deviations",
        wrapperSelector: ".dashboard-table-wrap--claims",
        advancedSearchKey: "logistics-claims-table-advanced",
        columnConfigs: [
          { index: 0, label: "Номер", type: "filter", searchType: "text" },
          { index: 1, label: "Дата", type: "filter", searchType: "date" },
          { index: 2, label: "Поставщик", type: "filter", searchType: "text" },
          { index: 3, label: "Номер заказа поставщика", type: "filter", searchType: "text" },
          { index: 4, label: "Статус", type: "filter", searchType: "text" },
          { index: 5, label: "Состояние проведения", type: "filter", searchType: "text" },
          { index: 6, label: "Номенклатура", type: "filter", searchType: "text" },
          { index: 7, label: "Категория по причине", type: "filter", searchType: "text" },
          { index: 8, label: "Возможность устранения", type: "filter", searchType: "text" },
          { index: 9, label: "Расчетное кол-во брака", type: "sort", searchType: "number" },
        ],
        initialOrder: [[1, "desc"], [0, "desc"]],
        columnDefs: [
          { targets: [0, 1, 4, 5, 9], className: "dt-center" },
          { targets: [2, 3, 6, 7, 8], className: "dt-left" },
          { targets: [9], orderable: true },
        ],
      });
    }
    return initInteractiveDashboardTable({
      tableSelector: "#table-top-deviations",
      wrapperSelector: ".dashboard-table-wrap--claims",
      advancedSearchKey: "claims-table-advanced",
      columnConfigs: [
        { index: 0, label: "Код", type: "filter", searchType: "text" },
        { index: 1, label: "Наименование", type: "filter", searchType: "text" },
        { index: 2, label: "Партнер/Клиент", type: "filter", searchType: "text" },
        { index: 3, label: "Дата обращения", type: "sort", searchType: "date" },
        { index: 4, label: "Дата окончания", type: "sort", searchType: "date" },
        { index: 5, label: "Заказ клиента", type: "filter", searchType: "text" },
        { index: 6, label: "Подразделение заказа", type: "filter", searchType: "text" },
        { index: 7, label: "Номенклатура", type: "filter", searchType: "text" },
        { index: 8, label: "Описание претензии", type: "none", searchType: "text" },
        { index: 9, label: "Статус", type: "filter", searchType: "text" },
        { index: 10, label: "Сумма документа заказа, руб.", type: "sort", searchType: "text" },
      ],
      initialOrder: [[10, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [3, 4], orderable: true },
        { targets: [10], type: "num-fmt", orderable: true },
      ],
      footerCallback: function () {
        updateClaimsTotalRow(this.api());
      },
      afterInit: function (dataTable) {
        updateClaimsTotalRow(dataTable);
      },
    });
  }

  function initProductionClaimsDataTable() {
    return initInteractiveDashboardTable({
      tableSelector: "#table-top-deviations",
      wrapperSelector: ".dashboard-table-wrap--claims",
      advancedSearchKey: "production-claims-table-advanced",
      columnConfigs: [
        { index: 0, label: "Номер", type: "filter", searchType: "text" },
        { index: 1, label: "Дата", type: "filter", searchType: "date" },
        { index: 2, label: "Подразделение-виновник", type: "filter", searchType: "text" },
        { index: 3, label: "Статус", type: "filter", searchType: "text" },
        { index: 4, label: "Номенклатура", type: "filter", searchType: "text" },
        { index: 5, label: "Описание", type: "filter", searchType: "text" },
        { index: 6, label: "Расчетное кол-во брака", type: "sort", searchType: "number" },
      ],
      initialOrder: [[1, "desc"], [0, "desc"]],
      columnDefs: [
        { targets: [0, 1, 3, 6], className: "dt-center" },
        { targets: [2, 4, 5], className: "dt-left" },
        { targets: [6], orderable: true },
      ],
    });
  }

  function initLawsuitsDataTable() {
    return initInteractiveDashboardTable({
      tableSelector: "#table-lawsuits",
      wrapperSelector: ".dashboard-table-wrap--lawsuits",
      advancedSearchKey: "lawsuits-table-advanced",
      columnConfigs: [
        { index: 0, label: "Тип документа", type: "filter", searchType: "text" },
        { index: 1, label: "Контрагент", type: "filter", searchType: "text" },
        { index: 2, label: "Предмет спора", type: "filter", searchType: "text" },
        { index: 3, label: "Роль ГК в споре", type: "filter", searchType: "text" },
        { index: 4, label: "Юр. лицо", type: "filter", searchType: "text" },
        { index: 5, label: "Подразделение", type: "filter", searchType: "text" },
        { index: 6, label: "Сумма требований, руб.", type: "sort", searchType: "text" },
      ],
      initialOrder: [[6, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [6], type: "num-fmt", orderable: true },
      ],
      footerCallback: function () {
        updateLawsuitsTotalRow(this.api());
      },
      afterInit: function (dataTable) {
        updateLawsuitsTotalRow(dataTable);
      },
    });
  }

  function initTechnicalClaimsDataTable() {
    return initInteractiveDashboardTable({
      tableSelector: "#table-top-deviations",
      wrapperSelector: ".dashboard-table-wrap--claims",
      advancedSearchKey: "technical-external-order-table-advanced",
      columnConfigs: [
        { index: 0, label: "№", type: "filter", searchType: "text" },
        { index: 1, label: "Название", type: "filter", searchType: "text" },
        { index: 2, label: "РП", type: "filter", searchType: "text" },
        { index: 3, label: "Сроки", type: "filter", searchType: "text" },
        { index: 4, label: "Отклонение", type: "filter", searchType: "text" },
        { index: 5, label: "Статус", type: "filter", searchType: "text" },
        { index: 6, label: "Прогресс", type: "filter", searchType: "text" },
      ],
      initialOrder: [[4, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [2], className: "technical-table-col-rp", width: "96px" },
        { targets: [5], className: "technical-table-col-status", width: "72px" },
        { targets: [6], className: "technical-table-col-progress", width: "72px" },
        { targets: [4], type: "num", orderable: true },
        { targets: [6], type: "num-fmt", orderable: true },
      ],
    });
  }

  function initTechnicalLawsuitsDataTable() {
    return initInteractiveDashboardTable({
      tableSelector: "#table-lawsuits",
      wrapperSelector: ".dashboard-table-wrap--lawsuits",
      advancedSearchKey: "technical-development-table-advanced",
      columnConfigs: [
        { index: 0, label: "№", type: "filter", searchType: "text" },
        { index: 1, label: "Название", type: "filter", searchType: "text" },
        { index: 2, label: "РП", type: "filter", searchType: "text" },
        { index: 3, label: "Сроки", type: "filter", searchType: "text" },
        { index: 4, label: "Отклонение", type: "filter", searchType: "text" },
        { index: 5, label: "Статус", type: "filter", searchType: "text" },
        { index: 6, label: "Прогресс", type: "filter", searchType: "text" },
      ],
      initialOrder: [[4, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [2], className: "technical-table-col-rp", width: "96px" },
        { targets: [5], className: "technical-table-col-status", width: "72px" },
        { targets: [6], className: "technical-table-col-progress", width: "72px" },
        { targets: [4], type: "num", orderable: true },
        { targets: [6], type: "num-fmt", orderable: true },
      ],
    });
  }

  function initOpdirProjectDataTable(tableSelector, wrapperSelector, advancedSearchKey) {
    return initInteractiveDashboardTable({
      tableSelector: tableSelector,
      wrapperSelector: wrapperSelector,
      advancedSearchKey: advancedSearchKey,
      columnConfigs: [
        { index: 0, label: "№", type: "sort", searchType: "text" },
        { index: 1, label: "Название", type: "filter", searchType: "text" },
        { index: 2, label: "РП", type: "filter", searchType: "text" },
        { index: 3, label: "Сроки", type: "filter", searchType: "text" },
        { index: 4, label: "Отклонение", type: "filter", searchType: "text" },
        { index: 5, label: "Статус", type: "filter", searchType: "text" },
        { index: 6, label: "Прогресс", type: "sort", searchType: "text" },
      ],
      initialOrder: [[0, "asc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [2], className: "technical-table-col-rp", width: "96px" },
        { targets: [5], className: "technical-table-col-status", width: "72px" },
        { targets: [6], className: "technical-table-col-progress", width: "72px" },
        { targets: [0, 6], type: "num-fmt", orderable: true },
      ],
    });
  }

  function initOverdueDebtDataTable() {
    if (logisticsSupplierDebtTableMode) {
      return initInteractiveDashboardTable({
        tableSelector: "#table-overdue-debt",
        wrapperSelector: ".dashboard-table-wrap--overdue-debt",
        advancedSearchKey: "supplier-dz-table-advanced",
        columnConfigs: [
          { index: 0, label: "№ объекта расчетов", type: "filter", searchType: "text" },
          { index: 1, label: "Дата", type: "date", searchType: "date" },
          { index: 2, label: "Объект расчетов", type: "filter", searchType: "text" },
          { index: 3, label: "Поставщик", type: "filter", searchType: "text" },
          { index: 4, label: "Сумма", type: "sort", searchType: "text" },
        ],
        initialOrder: [[4, "desc"]],
        columnDefs: [
          { targets: "_all", orderable: false },
          { targets: [1], type: "date", orderable: true },
          { targets: [4], type: "num-fmt", orderable: true },
        ],
        footerCallback: function () {
          updateOverdueDebtTotalRow(this.api());
        },
        afterInit: function (dataTable) {
          updateOverdueDebtTotalRow(dataTable);
        },
      });
    }
    return initInteractiveDashboardTable({
      tableSelector: "#table-overdue-debt",
      wrapperSelector: ".dashboard-table-wrap--overdue-debt",
      advancedSearchKey: "overdue-debt-table-advanced",
      columnConfigs: [
        { index: 0, label: "№ Заказа клиента", type: "filter", searchType: "text" },
        { index: 1, label: "Контрагент", type: "filter", searchType: "text" },
        { index: 2, label: "Просрочка, дн.", type: "sort", searchType: "text" },
        { index: 3, label: "Ликвидированное подразделение", type: "filter", searchType: "text" },
        { index: 4, label: "Причина", type: "filter", searchType: "text" },
        { index: 5, label: "Действие", type: "none", searchType: "text" },
        { index: 6, label: "Сумма, руб", type: "sort", searchType: "text" },
      ],
      initialOrder: [[6, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [2], type: "num", orderable: true },
        { targets: [6], type: "num-fmt", orderable: true },
      ],
      footerCallback: function () {
        updateOverdueDebtTotalRow(this.api());
      },
      afterInit: function (dataTable) {
        updateOverdueDebtTotalRow(dataTable);
      },
    });
  }

  function destroyClaimsTables() {
    ["#table-plan-fact", "#table-top-deviations", "#table-overdue-debt", "#table-lawsuits", "#table-protocol-overdue"].forEach(
      function (selector) {
        if (typeof $ !== "undefined" && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable(selector)) {
          $(selector).DataTable().destroy();
        }
      }
    );
  }

  function parseTableRublesAmount(value) {
    if (value == null || value === "") return NaN;
    if (typeof value === "number") return isFinite(value) ? value : NaN;
    var s = String(value)
      .replace(/\u00a0/g, " ")
      .replace(/\s/g, "")
      .replace(",", ".");
    if (!s) return NaN;
    var n = Number(s);
    return isNaN(n) ? NaN : n;
  }

  function getMonetaryRubForPsdRowFilter(item) {
    if (isOverdueDebtRow(item)) {
      var r0 = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      return r0 ? parseTableRublesAmount(r0.amount) : NaN;
    }
    if (isLawsuitsRow(item)) {
      var r1 = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      if (!r1) return NaN;
      return parseTableRublesAmount(
        pickLawsuitsField(r1, ["claim_amount", "amount", "sum", "requirement_sum", "requirements_sum"])
      );
    }
    if (isClaimsTableRow(item)) {
      var r2 = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      return r2 ? parseTableRublesAmount(r2.order_sum) : NaN;
    }
    return null;
  }

  function filterRowsByMinAmountRub(rows, minRub) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      if (!item) continue;
      var rub = getMonetaryRubForPsdRowFilter(item);
      if (rub === null) {
        out.push(item);
        continue;
      }
      if (!isNaN(rub) && rub >= minRub) out.push(item);
    }
    return out;
  }

  function init(options) {
    options = options || {};
    var rows = Array.isArray(options.rows) ? options.rows.slice() : [];
    var minRub = options.filterRowsMinAmountRub;
    if (typeof minRub === "number" && minRub > 0 && !isNaN(minRub)) {
      rows = filterRowsByMinAmountRub(rows, minRub);
    }
    var executiveMode = !!options.executiveMode;
    var enhanceOverdueDebtTable = !!options.enhanceOverdueDebtTable;
    var enableLawsuitsTable = !!options.enableLawsuitsTable;
    technicalTablesMode = !!options.technicalTablesMode;
    opdirProjectTableMode = !!options.opdirProjectTableMode;
    opdirProjectSecondTableDisabled = !!options.opdirProjectSecondTableDisabled;
    productionClaimsTableMode = !!options.productionClaimsTableMode;
    productionClaimsShop = normalizeProductionClaimsShop(options.productionClaimsShop);
    constructorProjectTableMode = !!options.constructorProjectTableMode;
    hrdLateVacanciesTableMode = !!options.hrdLateVacanciesTableMode;
    protocolOverdueTableMode =
      !!options.protocolOverdueTableMode ||
      !!options.protocolOverdueTableInBody ||
      hasProtocolOverdueTableRows(rows);
    logisticsSupplierDebtTableMode = !!options.logisticsSupplierDebtTableMode;
    if (technicalTablesMode) {
      activeTechnicalExternalTableKey =
        options.technicalExternalTableKey != null && String(options.technicalExternalTableKey).trim() !== ""
          ? String(options.technicalExternalTableKey).trim()
          : TECHNICAL_EXTERNAL_TABLE_KEY;
      activeTechnicalDevelopmentTableKey =
        options.technicalDevelopmentTableKey != null && String(options.technicalDevelopmentTableKey).trim() !== ""
          ? String(options.technicalDevelopmentTableKey).trim()
          : TECHNICAL_DEVELOPMENT_TABLE_KEY;
    } else {
      activeTechnicalExternalTableKey = TECHNICAL_EXTERNAL_TABLE_KEY;
      activeTechnicalDevelopmentTableKey = TECHNICAL_DEVELOPMENT_TABLE_KEY;
    }
    destroyClaimsTables();

    var topBody = document.querySelector("#table-top-deviations tbody");
    var debtBody = document.querySelector("#table-overdue-debt tbody");
    var lawsuitsBody = document.querySelector("#table-lawsuits tbody");
    if (topBody) topBody.innerHTML = "";
    if (debtBody) debtBody.innerHTML = "";
    if (lawsuitsBody) lawsuitsBody.innerHTML = "";

    if (executiveMode) {
      renderExecutiveTables(rows);
      setProtocolOverduePanelVisible(false);
      return;
    }

    resetDefaultTables(rows);
    setTechnicalTableMode(technicalTablesMode);
    setOpdirProjectTableMode(opdirProjectTableMode || constructorProjectTableMode);
    if (hrdLateVacanciesTableMode) {
      renderHrdLateVacanciesTableRows(rows);
      initClaimsDataTable();
      syncProtocolOverduePanel(rows, options);
      return;
    }
    if (productionClaimsTableMode) {
      renderClaimsTableRows(rows);
      initProductionClaimsDataTable();
      syncProtocolOverduePanel(rows, options);
      return;
    }
    if (constructorProjectTableMode) {
      renderClaimsTableRows(rows);
      initOpdirProjectDataTable(
        "#table-top-deviations",
        ".dashboard-table-wrap--claims",
        "constructor-project-table-advanced"
      );
      syncProtocolOverduePanel(rows, options);
      return;
    }
    if (opdirProjectTableMode) {
      renderClaimsTableRows(rows);
      if (!opdirProjectSecondTableDisabled) {
        renderLawsuitsTableRows(rows);
      }
      initOpdirProjectDataTable(
        "#table-top-deviations",
        ".dashboard-table-wrap--claims",
        "opdir-project-top-table-advanced"
      );
      if (!opdirProjectSecondTableDisabled) {
        initOpdirProjectDataTable(
          "#table-lawsuits",
          ".dashboard-table-wrap--lawsuits",
          "opdir-project-second-table-advanced"
        );
      }
      syncProtocolOverduePanel(rows, options);
      return;
    }
    if (technicalTablesMode) {
      var singleTechnicalPanel = !!options.technicalDeviationsSinglePanel;
      renderClaimsTableRows(rows);
      if (!singleTechnicalPanel) {
        renderLawsuitsTableRows(rows);
      }
      initTechnicalClaimsDataTable();
      if (!singleTechnicalPanel) {
        initTechnicalLawsuitsDataTable();
      }
      syncProtocolOverduePanel(rows, options);
      return;
    }
    renderClaimsTableRows(rows);
    renderOverdueDebtTableRows(rows);
    initClaimsDataTable();
    if (enhanceOverdueDebtTable || logisticsSupplierDebtTableMode) {
      initOverdueDebtDataTable();
    }
    if (enableLawsuitsTable) {
      renderLawsuitsTableRows(rows);
      initLawsuitsDataTable();
    }
    syncProtocolOverduePanel(rows, options);
  }

  global.DashboardClaimsTable = {
    init: init,
    hasProtocolOverdueTableRows: hasProtocolOverdueTableRows,
  };
})(typeof window !== "undefined" ? window : globalThis);
