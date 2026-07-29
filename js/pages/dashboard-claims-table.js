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

  function removeClaimsTableExtSearchByKey(key) {
    if (
      typeof $ === "undefined" ||
      !$.fn ||
      !$.fn.dataTable ||
      !$.fn.dataTable.ext ||
      !Array.isArray($.fn.dataTable.ext.search)
    ) {
      return;
    }
    for (var i = $.fn.dataTable.ext.search.length - 1; i >= 0; i--) {
      var fn = $.fn.dataTable.ext.search[i];
      if (fn && fn._claimsTableSearchKey === key) {
        $.fn.dataTable.ext.search.splice(i, 1);
      }
    }
  }

  function getPlainTextFromDataTableValue(value) {
    if (value == null) return "";
    var raw = String(value);
    if (raw.indexOf("<") === -1) return raw.trim();
    var el = document.createElement("div");
    el.innerHTML = raw;
    return String(el.textContent || el.innerText || "").trim();
  }

  function getPlainTextFromDataTableCell(cell) {
    if (!cell) return "";
    return String(cell.textContent || "").trim();
  }

  function syncDashboardTableCellDataOrder(tableNode) {
    if (!tableNode) return;
    tableNode.querySelectorAll("tbody td").forEach(function (td) {
      if (!td.hasAttribute("data-order")) {
        td.setAttribute("data-order", getPlainTextFromDataTableCell(td));
      }
    });
  }

  function getTableHeaderLabels(tableNode) {
    if (!tableNode) return [];
    var headers = [];
    tableNode.querySelectorAll("thead tr:first-child th").forEach(function (th) {
      headers.push(String(th.textContent || "").trim());
    });
    return headers;
  }

  function inferColumnSearchType(label) {
    var lower = String(label || "").trim().toLocaleLowerCase("ru-RU");
    if (/дата|срок|начало|окончан|date/.test(lower)) return "date";
    if (
      /сумм|просроч|отклон|прогресс|руб\.?|кол-?во|расчетное|всего обращ|в срок|не в срок|№ пункта/.test(lower)
    ) {
      return "text";
    }
    return "text";
  }

  function inferColumnControlType(label, searchType) {
    var lower = String(label || "").trim().toLocaleLowerCase("ru-RU");
    if (/описание|действие|примечание/.test(lower)) return "none";
    if (searchType === "date") return "sort";
    if (/сумм|просроч|отклон|прогресс|расчетное|всего обращ|в срок|не в срок/.test(lower)) return "sort";
    if (/^№$|^код$|^номер$/.test(lower)) return "sort";
    return "filter";
  }

  function buildDefaultColumnConfigs(tableNode, fallbackConfigs) {
    var labels = getTableHeaderLabels(tableNode);
    if (!labels.length && Array.isArray(fallbackConfigs) && fallbackConfigs.length) {
      return fallbackConfigs.slice();
    }
    return labels.map(function (label, index) {
      var searchType = inferColumnSearchType(label);
      return {
        index: index,
        label: label || "Колонка " + String(index + 1),
        type: inferColumnControlType(label, searchType),
        searchType: searchType,
      };
    });
  }

  function resolveInteractiveTableColumnConfigs(tableNode, fallbackConfigs) {
    var labels = getTableHeaderLabels(tableNode);
    if (labels.length) {
      return buildDefaultColumnConfigs(tableNode, null);
    }
    return Array.isArray(fallbackConfigs) ? fallbackConfigs.slice() : [];
  }

  function buildSortableColumnDefs(columnConfigs, extraDefs) {
    var sortTargets = (Array.isArray(columnConfigs) ? columnConfigs : [])
      .filter(function (config) {
        return config && config.type === "sort";
      })
      .map(function (config) {
        return config.index;
      });
    var defs = [{ targets: "_all", orderDataType: "dom-text", orderable: false }];
    if (sortTargets.length) {
      defs.push({ targets: sortTargets, orderable: true, orderDataType: "dom-text" });
    }
    if (Array.isArray(extraDefs) && extraDefs.length) {
      defs = defs.concat(extraDefs);
    }
    return defs;
  }

  function tableHasBodyRows(tableSelector) {
    var tableNode =
      typeof tableSelector === "string" ? document.querySelector(tableSelector) : tableSelector;
    return !!(tableNode && tableNode.querySelector("tbody tr"));
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
    "Подразделение",
    "Причина",
    "Действие",
    "Сумма, руб",
  ];
  var DEPT_PROTOCOL_OVERDUE_HEADERS = [
    "Протокол",
    "№ пункта",
    "Задача",
    "Срок исполнения",
    "Дата постановки",
    "Ответственный",
    "Автор",
    "Руководитель протокола",
    "Тема совещания",
    "Выполнена",
    "Подтверждена",
    "Примечание",
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
  var METROLOG_LATE_STAGE_HEADERS = [
    "Этап",
    "Начало",
    "Окончание",
    "Фактическое окончание",
    "Опросный лист",
  ];
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
  var METROLOG_LATE_STAGE_TABLE_KEY = "METD-T-M1-LATE-STAGES";
  var LOGISTICS_CLAIMS_TABLE_KEY = "LOG-T-CLAIMS";
  var LOGISTICS_SUPPLIER_DZ_TABLE_KEY = "LOG-T-SUPPLIER-DZ";
  var SERVHEAD_CLIENTS_TABLE_KEY = "SH-T1";
  var SERVHEAD_SURVEYS_TABLE_KEY = "SH-T2";
  var SERVHEAD_SURVEYS_DEFAULT_HEADERS = [
    "\u041f\u0435\u0440\u0438\u043e\u0434",
    "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0438\u043b\u0438 \u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a",
    "\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f",
    "\u041e\u0446\u0435\u043d\u043a\u0430 \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c\u044b\u0445 \u0443\u0441\u043b\u0443\u0433",
    "\u041e\u0446\u0435\u043d\u043a\u0430 \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u043e\u0431\u043e\u0440\u0443\u0434\u043e\u0432\u0430\u043d\u0438\u044f",
    "\u0423\u0434\u043e\u0432\u043b\u0435\u0442\u0432\u043e\u0440\u0435\u043d\u0438\u0435 \u043f\u043e\u0442\u0440\u0435\u0431\u043d\u043e\u0441\u0442\u0435\u0439",
    "\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u043a \u0443\u0434\u043e\u0432\u043b\u0435\u0442\u0432\u043e\u0440\u0435\u043d\u0438\u044e \u043f\u043e\u0442\u0440\u0435\u0431\u043d\u043e\u0441\u0442\u0435\u0439",
    "\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c \u043a \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0435\u043c\u0443 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u0447\u0435\u0441\u0442\u0432\u0443",
  ];
  var SERVHEAD_CLIENTS_TABLE_KEYS = [
    "SH-T1",
    "SERV-T-CLIENTS",
    "SERVHEAD-T-CLIENTS",
    "SERV-T-CUSTOMER-SITUATION",
  ];
  var SERVHEAD_CLIENTS_HEADERS = [
    "Клиент",
    "Всего обращений",
    "В срок",
    "Не в срок",
  ];
  var activeServheadClientsTableKey = SERVHEAD_CLIENTS_TABLE_KEY;
  var QUALDIR_EXTERNAL_DEFECT_TABLE_KEY = "QD-T-M5";
  var QUALDIR_INTERNAL_DEFECT_TABLE_KEY = "QD-T-M1";
  var QUALDIR_PROCESS_DEFECT_TABLE_KEY = "QD-T-M8";
  var QUALDIR_DEFECT_TABLE_HEADERS = [
    "Документ",
    "Объект несоответствия",
    "Вид несоответствия",
    "Подразделение",
    "Статус",
    "Значимость",
  ];
  var QUALDIR_SIGNIFICANCE_RAW_KEYS = [
    "\u0417\u043d\u0430\u0447\u0438\u043c\u043e\u0441\u0442\u044c",
    "\u0417\u043d\u0430\u0447\u0438\u043c\u0430\u044f \u0444\u043e\u0440\u043c\u0430",
    "significant_form",
    "is_significant_form",
    "significance",
  ];
  var activeQualdirExternalTableKey = QUALDIR_EXTERNAL_DEFECT_TABLE_KEY;
  var activeQualdirInternalTableKey = QUALDIR_INTERNAL_DEFECT_TABLE_KEY;
  var activeQualdirProcessTableKey = QUALDIR_PROCESS_DEFECT_TABLE_KEY;
  var DEPT_PROTOCOL_OVERDUE_TABLE_KEY = "DEPT-T-PROTOCOL-OVERDUE";
  var technicalTablesMode = false;
  var qualdirDefectTablesMode = false;
  var opdirProjectTableMode = false;
  var opdirProjectSecondTableDisabled = false;
  var productionClaimsTableMode = false;
  var productionClaimsShop = "pc1";
  var constructorProjectTableMode = false;
  var hrdLateVacanciesTableMode = false;
  var protocolOverdueTableMode = false;
  var metrologLateStagesTableMode = false;
  var logisticsSupplierDebtTableMode = false;
  var servheadClientsTableMode = false;
  var servheadSurveysTableState = Object.create(null);

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
    if (qualdirDefectTablesMode || technicalTablesMode) return;
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
    if (qualdirDefectTablesMode) return;
    var topTable = document.getElementById("table-top-deviations");
    var secondTable = document.getElementById("table-lawsuits");
    if (topTable) topTable.classList.toggle("dashboard-table--compact-by-content", !!technicalMode);
    if (secondTable) secondTable.classList.toggle("dashboard-table--compact-by-content", !!technicalMode);
    applyTechnicalCompactSizing(topTable, !!technicalMode);
    applyTechnicalCompactSizing(secondTable, !!technicalMode);
    if (technicalMode) {
      removeQualdirTableFooter(topTable);
      removeQualdirTableFooter(secondTable);
    } else {
      restoreQualdirClaimsTableFooters();
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

  function normalizeQualdirTableHeaders(columns) {
    var headers = Array.isArray(columns)
      ? columns.map(function (header) {
          return tableTextOrDash(header);
        })
      : [];
    if (!headers.length) return QUALDIR_DEFECT_TABLE_HEADERS.slice();
    var hasStatus = headers.some(function (header) {
      return /статус/i.test(String(header || ""));
    });
    if (!hasStatus) {
      var significanceIndex = headers.findIndex(function (header) {
        return /значим/i.test(String(header || ""));
      });
      if (significanceIndex >= 0) {
        headers.splice(significanceIndex, 0, "Статус");
      } else {
        headers.push("Статус");
      }
    }
    var hasSignificance = headers.some(function (header) {
      return /значим/i.test(String(header || ""));
    });
    if (!hasSignificance) {
      headers.push("Значимость");
    }
    if (headers.length > QUALDIR_DEFECT_TABLE_HEADERS.length) {
      return headers.slice(0, QUALDIR_DEFECT_TABLE_HEADERS.length);
    }
    if (headers.length < QUALDIR_DEFECT_TABLE_HEADERS.length) {
      return QUALDIR_DEFECT_TABLE_HEADERS.slice();
    }
    return headers;
  }

  function getQualdirTableHeadersFromRows(rows, tableKey) {
    if (!Array.isArray(rows) || !rows.length) return QUALDIR_DEFECT_TABLE_HEADERS.slice();
    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      if (!item || String(item.tableKey || "").trim().toUpperCase() !== String(tableKey || "").trim().toUpperCase()) {
        continue;
      }
      if (Array.isArray(item.tableColumns) && item.tableColumns.length) {
        return normalizeQualdirTableHeaders(item.tableColumns);
      }
    }
    return QUALDIR_DEFECT_TABLE_HEADERS.slice();
  }

  function formatQualdirSignificanceValue(raw) {
    var value = pickTableField(raw, QUALDIR_SIGNIFICANCE_RAW_KEYS);
    if (value == null || value === "") return "нет";
    if (typeof value === "boolean") return value ? "да" : "нет";
    var text = String(value).trim();
    if (!text) return "нет";
    var lower = text.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes" || lower === "да") return "да";
    if (lower === "false" || lower === "0" || lower === "no" || lower === "нет") return "нет";
    return tableTextOrDash(text);
  }

  function qualdirDefectTableKey(item) {
    return item && item.tableKey != null ? String(item.tableKey).trim().toUpperCase() : "";
  }

  function isQualdirExternalDefectRow(item) {
    return qualdirDefectTableKey(item) === String(activeQualdirExternalTableKey || QUALDIR_EXTERNAL_DEFECT_TABLE_KEY).trim().toUpperCase();
  }

  function isQualdirInternalDefectRow(item) {
    return qualdirDefectTableKey(item) === String(activeQualdirInternalTableKey || QUALDIR_INTERNAL_DEFECT_TABLE_KEY).trim().toUpperCase();
  }

  function isQualdirProcessDefectRow(item) {
    return qualdirDefectTableKey(item) === String(activeQualdirProcessTableKey || QUALDIR_PROCESS_DEFECT_TABLE_KEY).trim().toUpperCase();
  }

  function isQualdirDefectRow(item) {
    return isQualdirExternalDefectRow(item) || isQualdirInternalDefectRow(item) || isQualdirProcessDefectRow(item);
  }

  function removeQualdirTableFooter(table) {
    if (!table) return;
    var tfoot = table.querySelector("tfoot");
    if (tfoot) tfoot.remove();
  }

  function restoreQualdirClaimsTableFooters() {
    var topTable = document.getElementById("table-top-deviations");
    var secondTable = document.getElementById("table-lawsuits");
    if (topTable && !topTable.querySelector("tfoot")) {
      topTable.insertAdjacentHTML(
        "beforeend",
        '<tfoot><tr><th colspan="10">Итого</th><th id="claims-table-total-sum">0,00</th></tr></tfoot>'
      );
    }
    if (secondTable && !secondTable.querySelector("tfoot")) {
      secondTable.insertAdjacentHTML(
        "beforeend",
        '<tfoot><tr><th colspan="6">Итого</th><th id="lawsuits-table-total-sum">0,00</th></tr></tfoot>'
      );
    }
  }

  function normalizeTableFooterForDataTables(tableNode) {
    if (!tableNode) return;
    var tfoot = tableNode.querySelector("tfoot");
    if (!tfoot) return;
    var headerCount = tableNode.querySelectorAll("thead tr:first-child th").length;
    if (!headerCount) {
      tfoot.remove();
      return;
    }
    var footerRow = tfoot.querySelector("tr");
    if (!footerRow || !footerRow.cells.length) {
      tfoot.remove();
      return;
    }
    var spanTotal = 0;
    for (var i = 0; i < footerRow.cells.length; i++) {
      spanTotal += footerRow.cells[i].colSpan || 1;
    }
    if (spanTotal !== headerCount) {
      tfoot.remove();
    }
  }

  function prepareQualdirTableForDataTables(tableSelector) {
    var table =
      typeof tableSelector === "string"
        ? document.querySelector(tableSelector)
        : tableSelector;
    if (!table) return;
    removeQualdirTableFooter(table);
    var headerCount = table.querySelectorAll("thead tr th").length;
    if (!headerCount) return;
    var bodyRows = table.querySelectorAll("tbody tr");
    for (var i = 0; i < bodyRows.length; i++) {
      if (bodyRows[i].cells.length !== headerCount) {
        bodyRows[i].remove();
      }
    }
  }

  function setQualdirDefectTableMode(enabled) {
    var topTable = document.getElementById("table-top-deviations");
    var secondTable = document.getElementById("table-lawsuits");
    var processTable = document.getElementById("table-qualdir-process");
    if (topTable) topTable.classList.toggle("dashboard-table--qualdir-defects", !!enabled);
    if (secondTable) secondTable.classList.toggle("dashboard-table--qualdir-defects", !!enabled);
    if (processTable) processTable.classList.toggle("dashboard-table--qualdir-defects", !!enabled);
    if (enabled) {
      removeQualdirTableFooter(topTable);
      removeQualdirTableFooter(secondTable);
      removeQualdirTableFooter(processTable);
    } else {
      restoreQualdirClaimsTableFooters();
      if (topTable && topTable.tFoot) {
        topTable.tFoot.hidden = false;
        topTable.tFoot.innerHTML =
          '<tr><th colspan="10">Итого</th><th id="claims-table-total-sum">0,00</th></tr>';
      }
      if (secondTable && secondTable.tFoot) {
        secondTable.tFoot.hidden = false;
        secondTable.tFoot.innerHTML =
          '<tr><th colspan="6">Итого</th><th id="lawsuits-table-total-sum">0,00</th></tr>';
      }
    }
  }

  function getQualdirHeaderCellMeta(header) {
    var text = String(header || "").trim();
    var lower = text.toLowerCase();
    if (/документ/i.test(lower)) {
      return {
        value: function (raw) {
          return pickTableField(raw, ["\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442", "document"]);
        },
        className: "dashboard-table-cell--medium-text",
      };
    }
    if (/объект/i.test(lower)) {
      return {
        value: function (raw) {
          return pickTableField(raw, [
            "\u041e\u0431\u044a\u0435\u043a\u0442 \u043d\u0435\u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044f",
            "object",
          ]);
        },
        className: "dashboard-table-cell--medium-text",
      };
    }
    if (/вид/i.test(lower)) {
      return {
        value: function (raw) {
          return pickTableField(raw, [
            "\u0412\u0438\u0434 \u043d\u0435\u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044f",
            "defect_type",
            "violation_type",
          ]);
        },
        className: "dashboard-table-cell--wide-text",
      };
    }
    if (/подраздел/i.test(lower)) {
      return {
        value: function (raw) {
          return pickTableField(raw, ["\u041f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u0435", "department", "dept"]);
        },
        className: "dashboard-table-cell--medium-text",
      };
    }
    if (/статус/i.test(lower)) {
      return {
        value: function (raw) {
          return pickTableField(raw, ["\u0421\u0442\u0430\u0442\u0443\u0441", "status", "state", "stage"]);
        },
        className: "dashboard-table-cell--status",
      };
    }
    if (/значим/i.test(lower)) {
      return {
        value: function (raw) {
          return formatQualdirSignificanceValue(raw);
        },
        className: "dashboard-table-cell--short-text",
      };
    }
    return {
      value: function (raw) {
        return pickTableField(raw, [text]) || tableTextOrDash(raw[text]);
      },
      className: "dashboard-table-cell--medium-text",
    };
  }

  function appendQualdirDefectTableRow(tbody, raw, headers) {
    var tr = document.createElement("tr");
    var columnHeaders = Array.isArray(headers) && headers.length ? headers : QUALDIR_DEFECT_TABLE_HEADERS;
    columnHeaders.forEach(function (header) {
      var meta = getQualdirHeaderCellMeta(header);
      appendClampedCell(tr, meta.value(raw), meta.className);
    });
    tbody.appendChild(tr);
  }

  function replaceQualdirDefectTable(tableId, headers, rows, tableKey) {
    var prev = document.getElementById(tableId);
    if (!prev || !prev.parentNode) return null;
    var wanted = String(tableKey || "").trim().toUpperCase();
    var table = document.createElement("table");
    table.id = tableId;
    table.className = prev.className;
    var aria = prev.getAttribute("aria-label");
    if (aria) table.setAttribute("aria-label", aria);

    var thead = document.createElement("thead");
    var headerRow = document.createElement("tr");
    headers.forEach(function (header) {
      var th = document.createElement("th");
      th.textContent = tableTextOrDash(header);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    if (Array.isArray(rows)) {
      rows.forEach(function (item) {
        if (qualdirDefectTableKey(item) !== wanted) return;
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        appendQualdirDefectTableRow(tbody, raw, headers);
      });
    }
    table.appendChild(tbody);

    prev.parentNode.replaceChild(table, prev);
    return table;
  }

  function renderQualdirDefectTableRows(rows, tableKey, tableId) {
    var headers = getQualdirTableHeadersFromRows(rows, tableKey);
    replaceQualdirDefectTable(tableId, headers, rows, tableKey);
  }

  function applyQualdirTableFullWidth(tableSelector) {
    var table =
      typeof tableSelector === "string"
        ? document.querySelector(tableSelector)
        : tableSelector;
    if (!table) return;
    table.style.width = "100%";
    table.style.minWidth = "100%";
    table.style.maxWidth = "100%";
    var cells = table.querySelectorAll("thead th, tbody td");
    for (var i = 0; i < cells.length; i++) {
      cells[i].style.width = "";
      cells[i].style.minWidth = "";
      cells[i].style.maxWidth = "";
    }
  }

  function initQualdirDefectDataTable(tableSelector, wrapperSelector, advancedSearchKey) {
    prepareQualdirTableForDataTables(tableSelector);
    if (!tableHasBodyRows(tableSelector)) return null;
    return initInteractiveDashboardTable({
      tableSelector: tableSelector,
      wrapperSelector: wrapperSelector,
      advancedSearchKey: advancedSearchKey,
      omitFooter: true,
      columnConfigs: [],
      initialOrder: [[0, "desc"]],
      columnDefs: [
        { targets: 0, width: "22%" },
        { targets: 1, width: "14%" },
        { targets: 2, width: "28%" },
        { targets: 3, width: "14%" },
        { targets: 4, width: "12%" },
        { targets: 5, width: "10%" },
        { targets: "_all", orderable: false },
      ],
      afterInit: function (api) {
        applyQualdirTableFullWidth(tableSelector);
        window.setTimeout(function () {
          applyQualdirTableFullWidth(tableSelector);
          if (api && typeof api.columns === "function") {
            try {
              api.columns.adjust();
            } catch (e) {}
          }
        }, 0);
      },
    });
  }

  function setOpdirProjectTableMode(enabled) {
    var topTable = document.getElementById("table-top-deviations");
    var secondTable = document.getElementById("table-lawsuits");
    if (topTable) topTable.classList.toggle("dashboard-table--compact-by-content", !!enabled);
    if (secondTable) secondTable.classList.toggle("dashboard-table--compact-by-content", !!enabled);
    if (qualdirDefectTablesMode || technicalTablesMode) return;
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

  function setMetrologLateStagesTableMode(enabled) {
    var topTable = document.getElementById("table-top-deviations");
    if (topTable && topTable.tFoot) {
      topTable.tFoot.hidden = !!enabled;
      if (enabled) {
        topTable.tFoot.innerHTML =
          '<tr><th colspan="5">Итого</th></tr>';
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

  function formatServheadSurveyPeriod(value) {
    if (value == null || value === "") return "—";
    var s = String(value).trim();
    if (!s) return "—";
    var isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2})?)?/);
    if (isoMatch) {
      var formatted = isoMatch[3] + "." + isoMatch[2] + "." + isoMatch[1];
      if (isoMatch[4] != null && isoMatch[5] != null) {
        formatted += " " + isoMatch[4] + ":" + isoMatch[5];
      }
      return formatted;
    }
    var parsed = new Date(s);
    if (isNaN(parsed.getTime())) return tableTextOrDash(s);
    var day = String(parsed.getDate()).padStart(2, "0");
    var month = String(parsed.getMonth() + 1).padStart(2, "0");
    var year = parsed.getFullYear();
    var hours = String(parsed.getHours()).padStart(2, "0");
    var minutes = String(parsed.getMinutes()).padStart(2, "0");
    if (/T|\d{1,2}:\d{2}/.test(s)) {
      return day + "." + month + "." + year + " " + hours + ":" + minutes;
    }
    return day + "." + month + "." + year;
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
      topTable.classList.remove("dashboard-table--servhead-clients");
      topTable.classList.remove("dashboard-table--servhead-surveys");
    }
    var overdueTable = document.getElementById("table-overdue-debt");
    if (overdueTable) {
      overdueTable.classList.remove("dashboard-table--servhead-surveys");
    }
    if (qualdirDefectTablesMode) {
      setTableHeaders(
        "table-top-deviations",
        getQualdirTableHeadersFromRows(rows, activeQualdirExternalTableKey)
      );
      setTableHeaders(
        "table-lawsuits",
        getQualdirTableHeadersFromRows(rows, activeQualdirInternalTableKey)
      );
      setTableHeaders(
        "table-qualdir-process",
        getQualdirTableHeadersFromRows(rows, activeQualdirProcessTableKey)
      );
    } else if (hrdLateVacanciesTableMode) {
      setTableHeaders("table-top-deviations", HRD_LATE_VACANCIES_HEADERS);
    } else if (servheadClientsTableMode) {
      setTableHeaders("table-top-deviations", getServheadClientsHeadersFromRows(rows));
    } else if (metrologLateStagesTableMode) {
      setTableHeaders("table-top-deviations", METROLOG_LATE_STAGE_HEADERS);
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
    if (!qualdirDefectTablesMode && !technicalTablesMode) {
      setTopDeviationsTableMode(false);
    }
    setOverdueDebtTableMode(false);
  }

  function isHrdLateVacancyRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toUpperCase() : "";
    return key === HRD_LATE_VACANCIES_TABLE_KEY;
  }

  function resolveServheadClientsTableKey(rows) {
    if (!Array.isArray(rows)) return SERVHEAD_CLIENTS_TABLE_KEY;
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i] && rows[i].tableKey != null ? String(rows[i].tableKey).trim().toUpperCase() : "";
      if (!key || key === SERVHEAD_SURVEYS_TABLE_KEY) continue;
      for (var j = 0; j < SERVHEAD_CLIENTS_TABLE_KEYS.length; j++) {
        if (key === SERVHEAD_CLIENTS_TABLE_KEYS[j]) return key;
      }
      if (key.indexOf("SERV") !== -1 && (key.indexOf("CLIENT") !== -1 || key.indexOf("CUSTOMER") !== -1)) {
        return key;
      }
      if (key.indexOf("SH-T") === 0) return key;
    }
    return SERVHEAD_CLIENTS_TABLE_KEY;
  }

  function servheadClientsTableKey(item) {
    return item && item.tableKey != null ? String(item.tableKey).trim().toUpperCase() : "";
  }

  function isServheadSurveysRow(item) {
    return servheadClientsTableKey(item) === SERVHEAD_SURVEYS_TABLE_KEY;
  }

  function isServheadSurveysDataRow(item) {
    return isServheadSurveysRow(item) && !(item && item.__tableEmptyMarker);
  }

  function isServheadClientsRow(item) {
    if (isServheadSurveysRow(item)) return false;
    var key = servheadClientsTableKey(item);
    var wanted = String(activeServheadClientsTableKey || SERVHEAD_CLIENTS_TABLE_KEY).trim().toUpperCase();
    if (key === wanted) return true;
    for (var i = 0; i < SERVHEAD_CLIENTS_TABLE_KEYS.length; i++) {
      if (key === SERVHEAD_CLIENTS_TABLE_KEYS[i]) return true;
    }
    return key.indexOf("SERV") !== -1 && (key.indexOf("CLIENT") !== -1 || key.indexOf("CUSTOMER") !== -1)
      ? true
      : key.indexOf("SH-T") === 0;
  }

  function getServheadSurveysHeadersFromRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return SERVHEAD_SURVEYS_DEFAULT_HEADERS.slice();
    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      if (!item || !isServheadSurveysRow(item)) continue;
      if (Array.isArray(item.tableColumns) && item.tableColumns.length) {
        return item.tableColumns.map(function (header) {
          return tableTextOrDash(header);
        });
      }
    }
    return SERVHEAD_SURVEYS_DEFAULT_HEADERS.slice();
  }

  function getServheadClientsHeadersFromRows(rows) {
    var wanted = resolveServheadClientsTableKey(rows);
    if (!Array.isArray(rows) || !rows.length) return SERVHEAD_CLIENTS_HEADERS.slice();
    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      if (!item || servheadClientsTableKey(item) !== wanted) continue;
      if (Array.isArray(item.tableColumns) && item.tableColumns.length) {
        return item.tableColumns.map(function (header) {
          return tableTextOrDash(header);
        });
      }
    }
    return SERVHEAD_CLIENTS_HEADERS.slice();
  }

  function getServheadHeaderCellMeta(header) {
    var h = String(header || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    if (/клиент|контрагент|partner|counterparty/.test(h)) {
      return {
        className: "dashboard-table-cell--medium-text",
        value: function (raw) {
          return pickTableField(raw, [
            "client",
            "client_name",
            "Клиент",
            "клиент",
            "partner",
            "partner_name",
            "counterparty",
            "контрагент",
          ]);
        },
      };
    }
    if (/всего.*обращ|количество.*обращ|обращений|appeals|requests/.test(h)) {
      return {
        className: "dt-center",
        value: function (raw) {
          return pickTableField(raw, [
            "Всего обращений",
            "requests_count",
            "appeals_count",
            "total_requests",
            "appeals_total",
            "КоличествоОбращений",
            "количество_обращений",
            "count",
          ]);
        },
      };
    }
    if (/^в\s*срок$|on.?time|in_time/.test(h) || (/в\s*срок/.test(h) && !/не\s*в\s*срок|not/.test(h))) {
      return {
        className: "dt-center",
        value: function (raw) {
          return pickTableField(raw, [
            "В срок",
            "processed_on_time",
            "on_time_count",
            "in_time",
            "on_time",
            "ОбработаноВСрок",
            "processed_in_time",
            "in_time_count",
          ]);
        },
      };
    }
    if (/^не\s*в\s*срок$|не\s*в\s*срок|просроч|late|overdue/.test(h)) {
      return {
        className: "dt-center",
        value: function (raw) {
          return pickTableField(raw, [
            "Не в срок",
            "processed_late",
            "not_in_time_count",
            "overdue",
            "late_count",
            "ОбработаноНеВСрок",
            "processed_not_in_time",
            "not_in_time",
          ]);
        },
      };
    }
    return {
      className: "",
      value: function (raw) {
        if (raw && header in raw) return raw[header];
        return pickTableField(raw, [header]);
      },
    };
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

  function getServheadSurveyHeaderCellMeta(header) {
    var h = String(header || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    if (/период|period|date/.test(h)) {
      return {
        className: "dashboard-table-cell--date",
        value: function (raw) {
          return formatServheadSurveyPeriod(
            pickTableField(raw, ["\u041f\u0435\u0440\u0438\u043e\u0434", "period", "date", "month"])
          );
        },
      };
    }
    if (/компан|company|организац/.test(h)) {
      return {
        className: "dashboard-table-cell--medium-text",
        value: function (raw) {
          return pickTableField(raw, ["\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f", "company", "organization"]);
        },
      };
    }
    if (/пользовател|заказчик|customer|client|контрагент/.test(h)) {
      return {
        className: "dashboard-table-cell--medium-text",
        value: function (raw) {
          return pickTableField(raw, [
            "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0438\u043b\u0438 \u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a",
            "customer",
            "client",
            "user",
            "counterparty",
          ]);
        },
      };
    }
    if (/удовлетвор|оценк|балл|rating|score|nps/.test(h)) {
      return {
        className: "dt-center",
        value: function (raw) {
          if (raw && header in raw) return raw[header];
          return pickTableField(raw, [header, "rating", "score", "nps"]);
        },
      };
    }
    if (/коммент|comment|отзыв|feedback|готовност/.test(h)) {
      return {
        className: "dashboard-table-cell--wide-text",
        value: function (raw) {
          if (raw && header in raw) return raw[header];
          return pickTableField(raw, [header, "comment", "feedback"]);
        },
      };
    }
    return getServheadHeaderCellMeta(header);
  }

  function getServheadSurveysTitleFromRows(rows) {
    if (!Array.isArray(rows)) return "";
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i] || !isServheadSurveysRow(rows[i])) continue;
      if (rows[i].tableName != null && String(rows[i].tableName).trim() !== "") {
        return String(rows[i].tableName).trim();
      }
    }
    return "";
  }

  function getServheadSurveyRawPeriodValue(raw) {
    return pickTableField(raw, ["\u041f\u0435\u0440\u0438\u043e\u0434", "period", "date", "month"]);
  }

  function parseServheadSurveyPeriodParts(value) {
    if (value == null || value === "") return null;
    var s = String(value).trim();
    if (!s) return null;
    var isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
      };
    }
    var parsed = new Date(s);
    if (isNaN(parsed.getTime())) return null;
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
    };
  }

  function servheadSurveyRowDateKey(item) {
    var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
    if (!raw) return "";
    var parts = parseServheadSurveyPeriodParts(getServheadSurveyRawPeriodValue(raw));
    if (!parts || !parts.year || !parts.month || !parts.day) return "";
    return (
      String(parts.year) +
      "-" +
      String(parts.month).padStart(2, "0") +
      "-" +
      String(parts.day).padStart(2, "0")
    );
  }

  function normalizeServheadSurveysDateInputValue(value) {
    var match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    return match[1] + "-" + match[2] + "-" + match[3];
  }

  function collectServheadSurveysDateBounds(allRows) {
    var min = "";
    var max = "";
    if (!Array.isArray(allRows)) return { min: min, max: max };
    allRows.forEach(function (item) {
      var key = servheadSurveyRowDateKey(item);
      if (!key) return;
      if (!min || key < min) min = key;
      if (!max || key > max) max = key;
    });
    return { min: min, max: max };
  }

  function filterServheadSurveysRowsByDateRange(allRows, dateFrom, dateTo) {
    if (!Array.isArray(allRows)) return [];
    var fromKey = normalizeServheadSurveysDateInputValue(dateFrom);
    var toKey = normalizeServheadSurveysDateInputValue(dateTo);
    if (!fromKey && !toKey) return allRows.slice();
    return allRows.filter(function (item) {
      var rowDateKey = servheadSurveyRowDateKey(item);
      if (!rowDateKey) return false;
      if (fromKey && rowDateKey < fromKey) return false;
      if (toKey && rowDateKey > toKey) return false;
      return true;
    });
  }

  function filterServheadSurveysRows(allRows, dateFrom, dateTo) {
    return filterServheadSurveysRowsByDateRange(allRows, dateFrom, dateTo);
  }

  function syncServheadSurveysDateRangeInputs(fromInput, toInput) {
    if (!fromInput || !toInput) return;
    var fromKey = normalizeServheadSurveysDateInputValue(fromInput.value);
    var toKey = normalizeServheadSurveysDateInputValue(toInput.value);
    if (fromKey && toKey && fromKey > toKey) {
      toInput.value = fromKey;
    }
  }

  function renderServheadSurveysTableBody(tableId, dataRows, headers) {
    var table = document.getElementById(tableId);
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody || !Array.isArray(headers) || !headers.length) return;
    tbody.innerHTML = "";
    dataRows.forEach(function (item) {
      var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      if (!raw) return;
      var tr = document.createElement("tr");
      headers.forEach(function (header) {
        var meta = getServheadSurveyHeaderCellMeta(header);
        appendClampedCell(tr, meta.value(raw), meta.className);
      });
      tbody.appendChild(tr);
    });
  }

  function buildServheadSurveysColumnConfigs(headers) {
    return (Array.isArray(headers) ? headers : []).map(function (header, index) {
      var label = String(header || "Колонка " + String(index + 1));
      var lower = label.toLocaleLowerCase("ru-RU");
      return {
        index: index,
        label: label,
        type: /период|period/.test(lower) ? "sort" : "none",
        searchType: /период|date|дата/.test(lower) ? "date" : "text",
      };
    });
  }

  function restoreServheadSurveysTableShell(tableId, headers, wrapperSelector, advancedSearchKey) {
    var tableNode = document.getElementById(tableId);
    if (!tableNode) return;
    setTableHeaders(tableId, headers);
    var tbody = tableNode.querySelector("tbody");
    if (tbody) tbody.innerHTML = "";

    if (typeof $ === "undefined" || !$.fn) return;
    var table = $("#" + tableId);
    if (!table.length) return;

    var wrapper = table.closest(wrapperSelector || ".dashboard-table-wrap--claims");
    if (wrapper.length) {
      wrapper.find(".claims-column-filter-menu").remove();
    }
    if (advancedSearchKey) {
      removeClaimsTableExtSearchByKey(advancedSearchKey);
    }

    if ($.fn.DataTable && $.fn.DataTable.isDataTable(table)) {
      try {
        table.DataTable().destroy();
      } catch (e) {
        /* ignore */
      }
    }

    var staleWrapper = table.closest(".dataTables_wrapper");
    if (staleWrapper.length) {
      table.detach();
      staleWrapper.replaceWith(table);
    }
  }

  function destroyServheadSurveysDataTable(tableId) {
    var state = servheadSurveysTableState[tableId];
    restoreServheadSurveysTableShell(
      tableId,
      state && state.headers ? state.headers : [],
      state && state.wrapperSelector ? state.wrapperSelector : ".dashboard-table-wrap--claims",
      state && state.advancedSearchKey ? state.advancedSearchKey : ""
    );
  }

  function refreshServheadSurveysTable(tableId) {
    var state = servheadSurveysTableState[tableId];
    if (!state) return;
    restoreServheadSurveysTableShell(
      tableId,
      state.headers,
      state.wrapperSelector,
      state.advancedSearchKey
    );
    var filtered = filterServheadSurveysRows(
      state.allRows,
      state.dateFrom || "",
      state.dateTo || ""
    );
    renderServheadSurveysTableBody(tableId, filtered, state.headers);
    initServheadSurveysDataTable(
      "#" + tableId,
      state.wrapperSelector,
      state.advancedSearchKey,
      state.headers
    );
  }

  function setupServheadSurveysDateRangeFilter(
    tableId,
    filterWrapId,
    dateFromId,
    dateToId,
    dateResetId
  ) {
    var wrap = document.getElementById(filterWrapId);
    var dateFromInput = document.getElementById(dateFromId);
    var dateToInput = document.getElementById(dateToId);
    var dateResetBtn = dateResetId ? document.getElementById(dateResetId) : null;
    var state = servheadSurveysTableState[tableId];
    if (!wrap || !dateFromInput || !dateToInput || !state) return;

    var bounds = collectServheadSurveysDateBounds(state.allRows);
    if (bounds.min) {
      dateFromInput.min = bounds.min;
      dateToInput.min = bounds.min;
    } else {
      dateFromInput.removeAttribute("min");
      dateToInput.removeAttribute("min");
    }
    if (bounds.max) {
      dateFromInput.max = bounds.max;
      dateToInput.max = bounds.max;
    } else {
      dateFromInput.removeAttribute("max");
      dateToInput.removeAttribute("max");
    }

    dateFromInput.value = normalizeServheadSurveysDateInputValue(state.dateFrom);
    dateToInput.value = normalizeServheadSurveysDateInputValue(state.dateTo);
    syncServheadSurveysDateRangeInputs(dateFromInput, dateToInput);
    state.dateFrom = dateFromInput.value;
    state.dateTo = dateToInput.value;

    if (!dateFromInput.dataset.servheadSurveysBound) {
      dateFromInput.dataset.servheadSurveysBound = "1";
      dateFromInput.addEventListener("change", function () {
        var boundTableId = dateFromInput.getAttribute("data-table-id");
        if (!boundTableId) return;
        var tableState = servheadSurveysTableState[boundTableId];
        if (!tableState) return;
        var boundToInput = document.getElementById(
          dateFromInput.getAttribute("data-date-to-id") || ""
        );
        syncServheadSurveysDateRangeInputs(dateFromInput, boundToInput);
        tableState.dateFrom = dateFromInput.value || "";
        tableState.dateTo = boundToInput ? boundToInput.value || "" : tableState.dateTo;
        refreshServheadSurveysTable(boundTableId);
      });
    }

    if (!dateToInput.dataset.servheadSurveysBound) {
      dateToInput.dataset.servheadSurveysBound = "1";
      dateToInput.addEventListener("change", function () {
        var boundTableId = dateToInput.getAttribute("data-table-id");
        if (!boundTableId) return;
        var tableState = servheadSurveysTableState[boundTableId];
        if (!tableState) return;
        var boundFromInput = document.getElementById(
          dateToInput.getAttribute("data-date-from-id") || ""
        );
        syncServheadSurveysDateRangeInputs(boundFromInput, dateToInput);
        tableState.dateFrom = boundFromInput ? boundFromInput.value || "" : tableState.dateFrom;
        tableState.dateTo = dateToInput.value || "";
        refreshServheadSurveysTable(boundTableId);
      });
    }

    if (dateResetBtn && !dateResetBtn.dataset.servheadSurveysBound) {
      dateResetBtn.dataset.servheadSurveysBound = "1";
      dateResetBtn.addEventListener("click", function () {
        var boundTableId = dateResetBtn.getAttribute("data-table-id");
        if (!boundTableId) return;
        var tableState = servheadSurveysTableState[boundTableId];
        if (!tableState) return;
        var boundFromInput = document.getElementById(
          dateResetBtn.getAttribute("data-date-from-id") || ""
        );
        var boundToInput = document.getElementById(
          dateResetBtn.getAttribute("data-date-to-id") || ""
        );
        if (boundFromInput) boundFromInput.value = "";
        if (boundToInput) boundToInput.value = "";
        tableState.dateFrom = "";
        tableState.dateTo = "";
        refreshServheadSurveysTable(boundTableId);
      });
    }

    dateFromInput.setAttribute("data-table-id", tableId);
    dateFromInput.setAttribute("data-date-to-id", dateToId);
    dateToInput.setAttribute("data-table-id", tableId);
    dateToInput.setAttribute("data-date-from-id", dateFromId);
    if (dateResetBtn) {
      dateResetBtn.setAttribute("data-table-id", tableId);
      dateResetBtn.setAttribute("data-date-from-id", dateFromId);
      dateResetBtn.setAttribute("data-date-to-id", dateToId);
    }
  }

  function renderServheadSurveysTableRows(rows, tableId, ariaLabel, renderOptions) {
    renderOptions = renderOptions || {};
    var table = document.getElementById(tableId);
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";
    table.classList.add("dashboard-table--servhead-surveys");
    var headers = getServheadSurveysHeadersFromRows(rows);
    setTableHeaders(tableId, headers);
    if (table.tFoot) {
      table.tFoot.hidden = true;
      table.tFoot.innerHTML = '<tr><th colspan="' + String(headers.length) + '"></th></tr>';
    }
    table.setAttribute(
      "aria-label",
      ariaLabel || getServheadSurveysTitleFromRows(rows) || "Анкеты удовлетворённости клиентов"
    );

    var allRows = rows.filter(isServheadSurveysDataRow);
    servheadSurveysTableState[tableId] = {
      allRows: allRows,
      headers: headers,
      ariaLabel: ariaLabel || getServheadSurveysTitleFromRows(rows) || "Анкеты удовлетворённости клиентов",
      wrapperSelector: renderOptions.wrapperSelector || ".dashboard-table-wrap--claims",
      advancedSearchKey: renderOptions.advancedSearchKey || "servhead-surveys-table-advanced",
      dateFrom: servheadSurveysTableState[tableId] && servheadSurveysTableState[tableId].dateFrom
        ? servheadSurveysTableState[tableId].dateFrom
        : "",
      dateTo: servheadSurveysTableState[tableId] && servheadSurveysTableState[tableId].dateTo
        ? servheadSurveysTableState[tableId].dateTo
        : "",
    };

    var filteredRows = filterServheadSurveysRows(
      allRows,
      servheadSurveysTableState[tableId].dateFrom,
      servheadSurveysTableState[tableId].dateTo
    );
    renderServheadSurveysTableBody(tableId, filteredRows, headers);

    if (renderOptions.filterWrapId && renderOptions.dateFromId && renderOptions.dateToId) {
      setupServheadSurveysDateRangeFilter(
        tableId,
        renderOptions.filterWrapId,
        renderOptions.dateFromId,
        renderOptions.dateToId,
        renderOptions.dateResetId
      );
    }
  }

  function initServheadSurveysDataTable(tableSelector, wrapperSelector, advancedSearchKey, headers) {
    var tableId = String(tableSelector || "").replace(/^#/, "");
    var resolvedHeaders =
      Array.isArray(headers) && headers.length
        ? headers
        : servheadSurveysTableState[tableId] && servheadSurveysTableState[tableId].headers
          ? servheadSurveysTableState[tableId].headers
          : [];
    var columnConfigs = buildServheadSurveysColumnConfigs(resolvedHeaders);
    return initInteractiveDashboardTable({
      tableSelector: tableSelector,
      wrapperSelector: wrapperSelector,
      advancedSearchKey: advancedSearchKey,
      omitFooter: true,
      useExplicitColumnConfigs: true,
      columnConfigs: columnConfigs,
      initialOrder: [[0, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: 0, orderable: true, className: "dt-left dashboard-table-cell--date" },
      ],
    });
  }

  function renderServheadClientsTableRows(rows) {
    activeServheadClientsTableKey = resolveServheadClientsTableKey(rows);
    var table = document.getElementById("table-top-deviations");
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";
    table.classList.add("dashboard-table--servhead-clients");
    var headers = getServheadClientsHeadersFromRows(rows);
    setTableHeaders("table-top-deviations", headers);
    if (table.tFoot) {
      table.tFoot.hidden = true;
      table.tFoot.innerHTML = '<tr><th colspan="' + String(headers.length) + '"></th></tr>';
    }
    table.setAttribute("aria-label", "Ситуация по клиентам");

    rows.filter(isServheadClientsRow).forEach(function (item) {
      var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
      if (!raw) return;
      var tr = document.createElement("tr");
      headers.forEach(function (header) {
        var meta = getServheadHeaderCellMeta(header);
        appendClampedCell(tr, meta.value(raw), meta.className);
      });
      tbody.appendChild(tr);
    });
  }

  function initServheadClientsDataTable() {
    return initInteractiveDashboardTable({
      tableSelector: "#table-top-deviations",
      wrapperSelector: ".dashboard-table-wrap--claims",
      advancedSearchKey: "servhead-clients-table-advanced",
      columnConfigs: [
        { index: 0, label: "Клиент", type: "filter", searchType: "text" },
        { index: 1, label: "Всего обращений", type: "sort", searchType: "number" },
        { index: 2, label: "В срок", type: "sort", searchType: "number" },
        { index: 3, label: "Не в срок", type: "sort", searchType: "number" },
      ],
      initialOrder: [[3, "desc"], [1, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: 0, className: "dt-left" },
        { targets: 1, width: "10%", orderable: true, className: "dt-center" },
        { targets: 2, width: "10%", orderable: true, className: "dt-center" },
        { targets: 3, width: "10%", orderable: true, className: "dt-center" },
      ],
    });
  }

  function renderClaimsTableRows(rows) {
    var table = document.getElementById("table-top-deviations");
    var tbody = table ? table.querySelector("tbody") : null;
    if (!table || !tbody) return;
    tbody.innerHTML = "";

    if (!Array.isArray(rows) || !rows.length) return;

    if (metrologLateStagesTableMode) {
      setTableHeaders("table-top-deviations", METROLOG_LATE_STAGE_HEADERS);
      rows.filter(isMetrologLateStageRow).forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        var tr = document.createElement("tr");
        appendClampedCell(tr, raw["Этап"], "dashboard-table-cell--compact");
        appendClampedCell(tr, raw["Начало"], "dashboard-table-cell--date");
        appendClampedCell(tr, raw["Окончание"], "dashboard-table-cell--date");
        appendClampedCell(tr, raw["ЭтапФактическоеОкончание"], "dashboard-table-cell--date");
        appendClampedCell(tr, raw["ЗаказНаПроизводствоТД_ОпросныйЛист"], "dashboard-table-cell--wide-text");
        tbody.appendChild(tr);
      });
      return;
    }

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
    if (!raw || isOverdueDebtRow(item) || isLawsuitsRow(item) || isProtocolOverdueRow(item) || isQualdirDefectRow(item) || isServheadClientsRow(item) || isServheadSurveysRow(item) || isHrdLateVacancyRow(item)) {
      return false;
    }
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

  function isMetrologLateStageRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toLocaleUpperCase("ru-RU") : "";
    return key === METROLOG_LATE_STAGE_TABLE_KEY;
  }

  function isOverdueDebtRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toLocaleLowerCase("ru-RU") : "";
    return key === "kd-t-overdue";
  }

  function isDepartmentProtocolOverdueRow(item) {
    var key = item && item.tableKey != null ? String(item.tableKey).trim().toLocaleUpperCase("ru-RU") : "";
    return key === DEPT_PROTOCOL_OVERDUE_TABLE_KEY;
  }

  function isLawsuitsRow(item) {
    if (isQualdirDefectRow(item)) return false;
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

    var overdueRows = rows.filter(isOverdueDebtRow);
    if (overdueRows.length) {
      setTableHeaders("table-overdue-debt", DEFAULT_OVERDUE_DEBT_HEADERS);
      if (table.tFoot) {
        table.tFoot.hidden = false;
      }
      overdueRows.forEach(function (item) {
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
          tableTextOrDash(
            raw.department ||
              raw["Подразделение"] ||
              raw.dept_name ||
              raw.liquidated_dept_name ||
              raw["Ликвидированное подразделение"]
          ),
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
      return;
    }

    var protocolRows = rows.filter(isDepartmentProtocolOverdueRow);
    if (protocolRows.length) {
      setTableHeaders("table-overdue-debt", DEPT_PROTOCOL_OVERDUE_HEADERS);
      if (table.tFoot) {
        table.tFoot.hidden = true;
      }
      protocolRows.forEach(function (item) {
        var raw = item && item.raw && typeof item.raw === "object" ? item.raw : null;
        if (!raw) return;
        var tr = document.createElement("tr");
        [
          raw["Протокол"],
          raw["НомерПунктаПротокола"],
          raw["Задача"],
          raw["СрокИсполнения"],
          raw["ДатаПостановкиЗадачи"],
          raw["Ответственный"],
          raw["Автор"],
          raw["РуководительПротокола"],
          raw["ТемаСовещания"],
          raw["Выполнена"],
          raw["Подтверждена"],
          raw["Примечание"],
        ].forEach(function (value) {
          appendClampedCell(tr, tableTextOrDash(value), "dashboard-table-cell--wide-text");
        });
        tbody.appendChild(tr);
      });
      return;
    }
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
    var tableNode = table[0];
    if (options.useExplicitColumnConfigs && columnConfigs.length) {
      columnConfigs = columnConfigs.slice();
    } else {
      columnConfigs = resolveInteractiveTableColumnConfigs(
        tableNode,
        columnConfigs.length ? columnConfigs : null
      );
    }
    syncDashboardTableCellDataOrder(tableNode);
    if (!columnDefs.length) {
      columnDefs = buildSortableColumnDefs(columnConfigs);
    } else if (!columnDefs.some(function (def) { return def && def.orderDataType === "dom-text"; })) {
      columnDefs = [{ targets: "_all", orderDataType: "dom-text", orderable: false }].concat(columnDefs);
    }

    var wrapper = table.closest(wrapperSelector);
    if (wrapper.length) {
      wrapper.find(".claims-column-filter-menu").remove();
    }
    if ($.fn.DataTable.isDataTable(table)) {
      try {
        table.DataTable().destroy();
      } catch (e) {}
    }
    var staleWrapper = table.closest(".dataTables_wrapper");
    if (staleWrapper.length) {
      table.detach();
      staleWrapper.replaceWith(table);
    }

    if (tableNode) {
      if (options.omitFooter) {
        var footer = tableNode.querySelector("tfoot");
        if (footer) footer.remove();
      } else {
        normalizeTableFooterForDataTables(tableNode);
      }
      var colgroup = tableNode.querySelector("colgroup");
      if (colgroup) colgroup.remove();
    }

    var headerCount = tableNode ? tableNode.querySelectorAll("thead tr:first-child th").length : 0;
    if (headerCount && table[0]) {
      table[0].querySelectorAll("tbody tr").forEach(function (row) {
        if (row.cells.length !== headerCount) row.remove();
      });
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
      removeClaimsTableExtSearchByKey(advancedSearchKey);
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
    claimsAdvancedSearchFn._claimsTableSearchKey = advancedSearchKey;
    removeClaimsTableExtSearchByKey(advancedSearchKey);
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
        .nodes()
        .to$()
        .each(function () {
          var text = getPlainTextFromDataTableCell(this);
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
      if (activeSortColumn != null && activeSortDir) {
        dataTable.order([[activeSortColumn, activeSortDir]]);
      } else if (initialOrder.length) {
        dataTable.order(initialOrder);
      } else {
        dataTable.order([]);
      }
      dataTable.draw();
    }

    var columnFilterFn = function (settings, data) {
      if (!settings || settings.nTable !== table[0]) return true;
      if (!Array.isArray(data)) return true;
      for (var key in activeFilters) {
        if (!Object.prototype.hasOwnProperty.call(activeFilters, key)) continue;
        var selected = activeFilters[key];
        if (!Array.isArray(selected) || !selected.length) continue;
        var colIdx = Number(key);
        if (isNaN(colIdx)) continue;
        var cellText = getPlainTextFromDataTableValue(data[colIdx]);
        if (selected.indexOf(cellText) === -1) return false;
      }
      return true;
    };
    columnFilterFn._claimsTableSearchKey = advancedSearchKey + ":column-filter";
    removeClaimsTableExtSearchByKey(advancedSearchKey + ":column-filter");
    $.fn.dataTable.ext.search.push(columnFilterFn);

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
      th.classList.remove("claims-column-head");
      th.innerHTML = "";
      th.textContent = config.label || th.textContent || "";
      if (config.type === "none") return;

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
    if (!tableHasBodyRows("#table-protocol-overdue")) return null;
    return initInteractiveDashboardTable({
      tableSelector: "#table-protocol-overdue",
      wrapperSelector: ".dashboard-table-wrap--protocol-overdue",
      advancedSearchKey: "protocol-overdue-table-advanced",
      columnConfigs: [],
      initialOrder: [[1, "desc"], [2, "desc"]],
      columnDefs: [{ targets: [1, 2], orderable: true }],
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

  function initMetrologLateStagesDataTable() {
    return initInteractiveDashboardTable({
      tableSelector: "#table-top-deviations",
      wrapperSelector: ".dashboard-table-wrap--claims",
      advancedSearchKey: "metrolog-late-stages-table-advanced",
      columnConfigs: [
        { index: 0, label: "Этап", type: "filter", searchType: "text" },
        { index: 1, label: "Начало", type: "filter", searchType: "date" },
        { index: 2, label: "Окончание", type: "filter", searchType: "date" },
        { index: 3, label: "Фактическое окончание", type: "filter", searchType: "date" },
        { index: 4, label: "Опросный лист", type: "filter", searchType: "text" },
      ],
      initialOrder: [[2, "asc"], [0, "asc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [1, 2, 3], type: "date", orderable: true },
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
    prepareQualdirTableForDataTables("#table-top-deviations");
    return initInteractiveDashboardTable({
      tableSelector: "#table-top-deviations",
      wrapperSelector: ".dashboard-table-wrap--claims",
      advancedSearchKey: "technical-external-order-table-advanced",
      omitFooter: true,
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
    prepareQualdirTableForDataTables("#table-lawsuits");
    return initInteractiveDashboardTable({
      tableSelector: "#table-lawsuits",
      wrapperSelector: ".dashboard-table-wrap--lawsuits",
      advancedSearchKey: "technical-development-table-advanced",
      omitFooter: true,
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
    if (!tableHasBodyRows("#table-overdue-debt")) return null;
    if (logisticsSupplierDebtTableMode) {
      return initInteractiveDashboardTable({
        tableSelector: "#table-overdue-debt",
        wrapperSelector: ".dashboard-table-wrap--overdue-debt",
        advancedSearchKey: "supplier-dz-table-advanced",
        columnConfigs: [],
        initialOrder: [[4, "desc"]],
        columnDefs: [
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
        { index: 3, label: "Подразделение", type: "filter", searchType: "text" },
        { index: 4, label: "Причина", type: "filter", searchType: "text" },
        { index: 5, label: "Действие", type: "none", searchType: "text" },
        { index: 6, label: "Сумма, руб", type: "sort", searchType: "text" },
      ],
      initialOrder: [[6, "desc"]],
      columnDefs: [
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

  function destroyClaimsTableInstance(selector) {
    if (typeof $ === "undefined" || !$.fn || !$.fn.DataTable) return;
    var $table = $(selector);
    if (!$table.length) return;
    if ($.fn.DataTable.isDataTable($table)) {
      try {
        $table.DataTable().destroy();
      } catch (e) {}
    }
    var $wrapper = $table.closest(".dataTables_wrapper");
    if ($wrapper.length) {
      $table.detach();
      $wrapper.replaceWith($table);
    }
    $table.closest(".dashboard-table-wrap").find(".claims-column-filter-menu").remove();
  }

  function destroyClaimsTables() {
    [
      "#table-plan-fact",
      "#table-top-deviations",
      "#table-overdue-debt",
      "#table-lawsuits",
      "#table-qualdir-process",
      "#table-protocol-overdue",
    ].forEach(destroyClaimsTableInstance);
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

  function isTableCacheStatusMarker(item) {
    return item && item.__tableCacheStatusMarker === true;
  }

  function isTableCacheRunning(item) {
    if (!item) return false;
    var status = item.cache_refresh_status;
    if (!status && item.raw && typeof item.raw === "object") {
      status = item.raw.cache_refresh_status;
    }
    return String(status || "").trim().toLocaleLowerCase("ru-RU") === "running";
  }

  function isOverduePanelCacheRow(item) {
    return (
      isOverdueDebtRow(item) ||
      isDepartmentProtocolOverdueRow(item) ||
      isLogisticsSupplierDzRow(item)
    );
  }

  function isPrimaryPanelCacheRow(item) {
    return !isOverduePanelCacheRow(item);
  }

  function formatTableCacheUpdatedAt(value) {
    if (!value) return "";
    var parsed = new Date(String(value));
    if (isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatCacheCooldownRemaining(nextAllowedAt) {
    if (!nextAllowedAt) return "";
    var ts = Date.parse(String(nextAllowedAt));
    if (!isFinite(ts) || isNaN(ts)) return "";
    var remainingMs = ts - Date.now();
    if (remainingMs <= 0) return "";
    var totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return hours + " ч " + minutes + " мин";
    if (hours > 0) return hours + " ч";
    return minutes + " мин";
  }

  function isCacheRefreshCooldownMeta(meta) {
    if (!meta || meta.running || meta.status === "failed") return false;
    if (meta.status === "cooldown") return true;
    return !!formatCacheCooldownRemaining(meta.nextAllowedAt);
  }

  function tableCacheMetaForRows(rows, predicate, getStateForKpi) {
    var meta = {
      running: false,
      kpiId: "",
      updatedAt: "",
      status: "",
      nextAllowedAt: "",
    };
    rows = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      if (!item || !predicate(item)) continue;
      var kpiId = item.cache_refresh_kpi_id || (item.raw && item.raw.cache_refresh_kpi_id) || "";
      if (!meta.kpiId && kpiId) meta.kpiId = String(kpiId).trim();
      var updatedAt = item.cache_updated_at || (item.raw && item.raw.cache_updated_at) || "";
      if (!meta.updatedAt && updatedAt) meta.updatedAt = String(updatedAt);
      if (isTableCacheRunning(item)) meta.running = true;
    }
    if (meta.kpiId && typeof getStateForKpi === "function") {
      var state = getStateForKpi(meta.kpiId) || {};
      if (state.status) meta.status = String(state.status);
      if (state.status === "running") meta.running = true;
      if (state.next_allowed_at) meta.nextAllowedAt = String(state.next_allowed_at);
    }
    return meta;
  }

  function ensureTableCacheControls(anchorId, group, meta) {
    var anchor = document.getElementById(anchorId);
    var title = anchor && anchor.closest ? anchor.closest(".table-panel-title") : null;
    if (!title) return;
    meta = meta || {};
    var selector = '.table-cache-refresh-controls[data-table-cache-group="' + group + '"]';
    var controls = title.querySelector(selector);
    if (!meta.kpiId && !meta.updatedAt && !meta.running) {
      if (controls) controls.remove();
      return;
    }
    if (!controls) {
      controls = document.createElement("span");
      controls.className = "table-cache-refresh-controls";
      controls.setAttribute("data-table-cache-group", group);
      controls.innerHTML =
        '<span class="table-cache-updated-at"></span>' +
        '<span class="table-cache-cooldown"></span>' +
        '<button type="button" class="table-cache-refresh-button" aria-label="Перекэшировать таблицу">' +
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M20 5v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        "</svg></button>";
      title.appendChild(controls);
    }
    var label = controls.querySelector(".table-cache-updated-at");
    var cooldownLabel = controls.querySelector(".table-cache-cooldown");
    var btn = controls.querySelector(".table-cache-refresh-button");
    var running = !!meta.running;
    var isCooldown = isCacheRefreshCooldownMeta(meta);
    var cooldownRemaining = isCooldown ? formatCacheCooldownRemaining(meta.nextAllowedAt) : "";
    if (label) {
      var formatted = formatTableCacheUpdatedAt(meta.updatedAt);
      label.textContent = formatted ? "Кэш: " + formatted : "";
      label.hidden = !formatted;
    }
    if (cooldownLabel) {
      cooldownLabel.textContent = cooldownRemaining ? "Доступно через " + cooldownRemaining : "";
      cooldownLabel.hidden = !cooldownRemaining;
    }
    if (btn) {
      btn.hidden = !meta.kpiId;
      btn.disabled = running || isCooldown;
      btn.classList.toggle("is-running", running);
      btn.classList.toggle("is-cooldown", isCooldown);
      btn.setAttribute("data-kpi-id", meta.kpiId || "");
      btn.title = running
        ? "Таблица кэшируется"
        : isCooldown
          ? cooldownRemaining
            ? "Повторное обновление будет доступно через " + cooldownRemaining
            : "Повторное обновление будет доступно позже"
          : "Перекэшировать таблицу";
    }
  }

  function updateTableCacheRefreshIndicators(rows, getStateForKpi) {
    rows = Array.isArray(rows) ? rows : [];
    ensureTableCacheControls(
      "claims-table-title-text",
      "primary",
      tableCacheMetaForRows(rows, isPrimaryPanelCacheRow, getStateForKpi)
    );
    ensureTableCacheControls(
      "overdue-debt-table-title",
      "overdue",
      tableCacheMetaForRows(rows, isOverduePanelCacheRow, getStateForKpi)
    );
  }

  function init(options) {
    options = options || {};
    var rows = Array.isArray(options.rows) ? options.rows.slice() : [];
    var minRub = options.filterRowsMinAmountRub;
    if (typeof minRub === "number" && minRub > 0 && !isNaN(minRub)) {
      rows = filterRowsByMinAmountRub(rows, minRub);
    }
    updateTableCacheRefreshIndicators(rows, options.getCacheRefreshStateForKpi);
    rows = rows.filter(function (item) {
      return !isTableCacheStatusMarker(item);
    });
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
    servheadClientsTableMode = !!options.servheadClientsTableMode;
    qualdirDefectTablesMode = !!options.qualdirDefectTablesMode;
    if (qualdirDefectTablesMode) {
      activeQualdirExternalTableKey =
        options.qualdirExternalTableKey != null && String(options.qualdirExternalTableKey).trim() !== ""
          ? String(options.qualdirExternalTableKey).trim().toUpperCase()
          : QUALDIR_EXTERNAL_DEFECT_TABLE_KEY;
      activeQualdirInternalTableKey =
        options.qualdirInternalTableKey != null && String(options.qualdirInternalTableKey).trim() !== ""
          ? String(options.qualdirInternalTableKey).trim().toUpperCase()
          : QUALDIR_INTERNAL_DEFECT_TABLE_KEY;
      activeQualdirProcessTableKey =
        options.qualdirProcessTableKey != null && String(options.qualdirProcessTableKey).trim() !== ""
          ? String(options.qualdirProcessTableKey).trim().toUpperCase()
          : QUALDIR_PROCESS_DEFECT_TABLE_KEY;
    } else {
      activeQualdirExternalTableKey = QUALDIR_EXTERNAL_DEFECT_TABLE_KEY;
      activeQualdirInternalTableKey = QUALDIR_INTERNAL_DEFECT_TABLE_KEY;
      activeQualdirProcessTableKey = QUALDIR_PROCESS_DEFECT_TABLE_KEY;
    }
    protocolOverdueTableMode =
      !!options.protocolOverdueTableMode ||
      !!options.protocolOverdueTableInBody ||
      hasProtocolOverdueTableRows(rows);
    metrologLateStagesTableMode = !!options.metrologLateStagesTableMode;
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

    if (options.hideDefaultCommercialTablesMode) {
      resetDefaultTables(rows);
      syncProtocolOverduePanel(rows, options);
      return;
    }

    resetDefaultTables(rows);
    setTechnicalTableMode(technicalTablesMode);
    setOpdirProjectTableMode(opdirProjectTableMode || constructorProjectTableMode);
    setQualdirDefectTableMode(qualdirDefectTablesMode);
    if (qualdirDefectTablesMode) {
      renderQualdirDefectTableRows(rows, activeQualdirExternalTableKey, "table-top-deviations");
      renderQualdirDefectTableRows(rows, activeQualdirInternalTableKey, "table-lawsuits");
      renderQualdirDefectTableRows(rows, activeQualdirProcessTableKey, "table-qualdir-process");
      initQualdirDefectDataTable(
        "#table-top-deviations",
        ".dashboard-table-wrap--claims",
        "qualdir-external-defect-table-advanced"
      );
      initQualdirDefectDataTable(
        "#table-lawsuits",
        ".dashboard-table-wrap--lawsuits",
        "qualdir-internal-defect-table-advanced"
      );
      initQualdirDefectDataTable(
        "#table-qualdir-process",
        ".dashboard-table-wrap--qualdir-process",
        "qualdir-process-defect-table-advanced"
      );
      syncProtocolOverduePanel(rows, options);
      return;
    }
    if (servheadClientsTableMode) {
      var hasClientsTable = rows.some(isServheadClientsRow);
      var hasSurveysTable =
        rows.some(isServheadSurveysRow) ||
        (typeof Api !== "undefined" &&
          Api &&
          typeof Api.hasServheadSurveysTableInBody === "function" &&
          options.servheadSurveysTableInBody);
      if (hasClientsTable) {
        renderServheadClientsTableRows(rows);
        initServheadClientsDataTable();
      } else if (hasSurveysTable) {
        renderServheadSurveysTableRows(
          rows,
          "table-top-deviations",
          getServheadSurveysTitleFromRows(rows) || "Анкеты удовлетворённости клиентов",
          {
            wrapperSelector: ".dashboard-table-wrap--claims",
            advancedSearchKey: "servhead-surveys-table-advanced",
            filterWrapId: "servhead-surveys-period-filter-wrap",
            dateFromId: "servhead-surveys-date-from",
            dateToId: "servhead-surveys-date-to",
            dateResetId: "servhead-surveys-date-reset",
          }
        );
        initServheadSurveysDataTable(
          "#table-top-deviations",
          ".dashboard-table-wrap--claims",
          "servhead-surveys-table-advanced",
          getServheadSurveysHeadersFromRows(rows)
        );
      }
      if (hasClientsTable && hasSurveysTable) {
        renderServheadSurveysTableRows(
          rows,
          "table-overdue-debt",
          getServheadSurveysTitleFromRows(rows) || "Анкеты удовлетворённости клиентов",
          {
            wrapperSelector: ".dashboard-table-wrap--overdue-debt",
            advancedSearchKey: "servhead-surveys-table-advanced-overdue",
            filterWrapId: "servhead-surveys-period-filter-wrap-overdue",
            dateFromId: "servhead-surveys-date-from-overdue",
            dateToId: "servhead-surveys-date-to-overdue",
            dateResetId: "servhead-surveys-date-reset-overdue",
          }
        );
        initServheadSurveysDataTable(
          "#table-overdue-debt",
          ".dashboard-table-wrap--overdue-debt",
          "servhead-surveys-table-advanced-overdue",
          getServheadSurveysHeadersFromRows(rows)
        );
      }
      syncProtocolOverduePanel(rows, options);
      return;
    }
    if (hrdLateVacanciesTableMode) {
      renderHrdLateVacanciesTableRows(rows);
      initClaimsDataTable();
      syncProtocolOverduePanel(rows, options);
      return;
    }
    setMetrologLateStagesTableMode(metrologLateStagesTableMode);
    if (productionClaimsTableMode) {
      renderClaimsTableRows(rows);
      initProductionClaimsDataTable();
      syncProtocolOverduePanel(rows, options);
      return;
    }
    if (metrologLateStagesTableMode) {
      renderClaimsTableRows(rows);
      renderOverdueDebtTableRows(rows);
      initMetrologLateStagesDataTable();
      initOverdueDebtDataTable();
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
    initOverdueDebtDataTable();
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
