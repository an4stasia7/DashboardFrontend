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
    "Название проекта",
    "Руководитель проекта",
    "Название вехи",
    "Плановая дата вехи",
    "Дата отклонения",
    "Дней отклонения",
    "Процент выполнения",
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
  var OPDIR_PROJECT_TABLE_KEY = "OD-T-Q1-DEVIATIONS";
  var PRODUCTION_DEPUTY_PROJECT_TABLE_KEY = "PD-T-Q1-DEVIATIONS";
  var PRODUCTION_DEPUTY_IMPROVEMENT_TABLE_KEY = "PD-T-Q3-IMPROVEMENTS";
  var PRODUCTION_CLAIMS_TABLE_KEY = "PD-T-PROD-CLAIMS";
  var CONSTRUCTOR_PROJECT_TABLE_KEY = "GK-T-M1-DEVIATIONS";
  var METROLOG_PROJECT_TABLE_KEY = "METD-T-Q1-DEVIATIONS";
  var METROLOG_LATE_STAGE_TABLE_KEY = "METD-T-M1-LATE-STAGES";
  var LOGISTICS_CLAIMS_TABLE_KEY = "LOG-T-CLAIMS";
  var LOGISTICS_SUPPLIER_DZ_TABLE_KEY = "LOG-T-SUPPLIER-DZ";
  var DEPT_PROTOCOL_OVERDUE_TABLE_KEY = "DEPT-T-PROTOCOL-OVERDUE";
  var technicalTablesMode = false;
  var opdirProjectTableMode = false;
  var productionClaimsTableMode = false;
  var productionClaimsShop = "pc1";
  var constructorProjectTableMode = false;
  var metrologLateStagesTableMode = false;
  var logisticsSupplierDebtTableMode = false;

  function setTableHeaders(tableId, headers) {
    var table = document.getElementById(tableId);
    var headRow = table ? table.querySelector("thead tr") : null;
    if (!headRow) return;
    headRow.innerHTML = headers
      .map(function (header) {
        return "<th>" + header + "</th>";
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

  function setOpdirProjectTableMode(enabled) {
    var topTable = document.getElementById("table-top-deviations");
    var secondTable = document.getElementById("table-lawsuits");
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

  function formatTechnicalPercentComplete(value) {
    if (value == null || value === "") return "—";
    var n = Number(value);
    if (isNaN(n)) return tableTextOrDash(value);
    var pct = Math.abs(n) <= 1 ? n * 100 : n;
    return pct.toLocaleString("ru-RU", {
      maximumFractionDigits: 1,
    }) + "%";
  }

  function isTechnicalExternalOrderRow(item) {
    return item && String(item.tableKey || "").trim() === TECHNICAL_EXTERNAL_TABLE_KEY;
  }

  function isTechnicalImprovementRow(item) {
    return item && String(item.tableKey || "").trim() === TECHNICAL_DEVELOPMENT_TABLE_KEY;
  }

  function isOpdirProjectRow(item) {
    var key = item && String(item.tableKey || "").trim();
    return key === OPDIR_PROJECT_TABLE_KEY || key === PRODUCTION_DEPUTY_PROJECT_TABLE_KEY;
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
    var tr = document.createElement("tr");
    var plannedDate = formatTechnicalDate(raw.milestone_planned_finish_date);
    var deviationDate = formatTechnicalDate(raw.deviation_date);
    var delayDays = raw.delay_days != null ? raw.delay_days : "—";
    var percentComplete = formatTechnicalPercentComplete(raw.percent_complete);
    var values = [
      tableTextOrDash(raw.project_name),
      tableTextOrDash(raw.project_manager),
      tableTextOrDash(raw.milestone_name),
      plannedDate,
      deviationDate,
      tableTextOrDash(delayDays),
      percentComplete,
    ];
    values.forEach(function (value, cellIndex) {
      var td = document.createElement("td");
      td.textContent = value;
      if (cellIndex === 3) {
        td.setAttribute("data-order", normalizeClaimsSearchDate(raw.milestone_planned_finish_date));
      } else if (cellIndex === 4) {
        td.setAttribute("data-order", normalizeClaimsSearchDate(raw.deviation_date));
      } else if (cellIndex === 5) {
        td.setAttribute("data-order", String(raw.delay_days != null ? raw.delay_days : ""));
      } else if (cellIndex === 6) {
        var pct = Number(raw.percent_complete);
        td.setAttribute("data-order", isNaN(pct) ? "" : String(Math.abs(pct) <= 1 ? pct * 100 : pct));
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

  function formatOpdirMilestoneDetails(raw) {
    var milestones = Array.isArray(raw && raw.milestone_deviations) ? raw.milestone_deviations : [];
    if (!milestones.length) return "";
    return milestones
      .map(function (item, index) {
        var title = escapeHtml(tableTextOrDash(item.name));
        var startDate = escapeHtml(formatTechnicalDate(item.start_date));
        var finishDate = escapeHtml(formatTechnicalDate(item.finish_date));
        var delayDays = escapeHtml(item.delay_days != null ? String(item.delay_days) : "0");
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
              escapeHtml(item.delay_days != null ? String(item.delay_days) : "0") +
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

  function buildOpdirDeviationCell(td, raw) {
    var milestones = Array.isArray(raw && raw.milestone_deviations) ? raw.milestone_deviations : [];
    td.setAttribute("data-order", String(raw && raw.delay_days != null ? raw.delay_days : ""));
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

  function resetDefaultTables() {
    var topTable = document.getElementById("table-top-deviations");
    if (topTable) {
      topTable.classList.remove("dashboard-table--logistics-claims");
    }
    if (metrologLateStagesTableMode) {
      setTableHeaders("table-top-deviations", METROLOG_LATE_STAGE_HEADERS);
    } else if (productionClaimsTableMode) {
      setTableHeaders("table-top-deviations", PRODUCTION_CLAIMS_HEADERS);
      setTableHeaders("table-lawsuits", OPDIR_PROJECT_TABLE_HEADERS);
    } else if (opdirProjectTableMode) {
      setTableHeaders("table-top-deviations", OPDIR_PROJECT_TABLE_HEADERS);
      setTableHeaders("table-lawsuits", OPDIR_PROJECT_TABLE_HEADERS);
    } else if (technicalTablesMode) {
      setTableHeaders("table-top-deviations", TECHNICAL_TABLE_HEADERS);
      setTableHeaders("table-lawsuits", TECHNICAL_TABLE_HEADERS);
    } else {
      setTableHeaders("table-top-deviations", DEFAULT_TOP_DEVIATIONS_HEADERS);
      setTableHeaders("table-lawsuits", ["Тип документа", "Контрагент", "Предмет спора", "Роль ГК в споре", "Юр. лицо", "Подразделение", "Сумма требований, руб."]);
    }
    setTableHeaders("table-overdue-debt", DEFAULT_OVERDUE_DEBT_HEADERS);
    setTopDeviationsTableMode(false);
    setOverdueDebtTableMode(false);
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
        appendTechnicalTableRow(tbody, raw);
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
    if (!raw || isOverdueDebtRow(item) || isLawsuitsRow(item)) return false;
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
        appendTechnicalTableRow(tbody, raw);
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

  function initClaimsDataTable() {
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
    return initInteractiveDashboardTable({
      tableSelector: "#table-top-deviations",
      wrapperSelector: ".dashboard-table-wrap--claims",
      advancedSearchKey: "technical-external-order-table-advanced",
      columnConfigs: [
        { index: 0, label: "Название проекта", type: "filter", searchType: "text" },
        { index: 1, label: "Руководитель проекта", type: "filter", searchType: "text" },
        { index: 2, label: "Название вехи", type: "filter", searchType: "text" },
        { index: 3, label: "Плановая дата вехи", type: "filter", searchType: "date" },
        { index: 4, label: "Дата отклонения", type: "filter", searchType: "date" },
        { index: 5, label: "Дней отклонения", type: "filter", searchType: "text" },
        { index: 6, label: "Процент выполнения", type: "filter", searchType: "text" },
      ],
      initialOrder: [[5, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [5], type: "num", orderable: true },
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
        { index: 0, label: "Название проекта", type: "filter", searchType: "text" },
        { index: 1, label: "Руководитель проекта", type: "filter", searchType: "text" },
        { index: 2, label: "Название вехи", type: "filter", searchType: "text" },
        { index: 3, label: "Плановая дата вехи", type: "filter", searchType: "date" },
        { index: 4, label: "Дата отклонения", type: "filter", searchType: "date" },
        { index: 5, label: "Дней отклонения", type: "filter", searchType: "text" },
        { index: 6, label: "Процент выполнения", type: "filter", searchType: "text" },
      ],
      initialOrder: [[5, "desc"]],
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [5], type: "num", orderable: true },
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
    ["#table-plan-fact", "#table-top-deviations", "#table-overdue-debt", "#table-lawsuits"].forEach(function (selector) {
      if (typeof $ !== "undefined" && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable(selector)) {
        $(selector).DataTable().destroy();
      }
    });
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
    productionClaimsTableMode = !!options.productionClaimsTableMode;
    productionClaimsShop = normalizeProductionClaimsShop(options.productionClaimsShop);
    constructorProjectTableMode = !!options.constructorProjectTableMode;
    metrologLateStagesTableMode = !!options.metrologLateStagesTableMode;
    logisticsSupplierDebtTableMode = !!options.logisticsSupplierDebtTableMode;
    destroyClaimsTables();

    var topBody = document.querySelector("#table-top-deviations tbody");
    var debtBody = document.querySelector("#table-overdue-debt tbody");
    var lawsuitsBody = document.querySelector("#table-lawsuits tbody");
    if (topBody) topBody.innerHTML = "";
    if (debtBody) debtBody.innerHTML = "";
    if (lawsuitsBody) lawsuitsBody.innerHTML = "";

    if (executiveMode) {
      renderExecutiveTables(rows);
      return;
    }

    resetDefaultTables();
    setTechnicalTableMode(technicalTablesMode);
    setOpdirProjectTableMode(opdirProjectTableMode || constructorProjectTableMode);
    setMetrologLateStagesTableMode(metrologLateStagesTableMode);
    if (productionClaimsTableMode) {
      renderClaimsTableRows(rows);
      initProductionClaimsDataTable();
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
      return;
    }
    if (opdirProjectTableMode) {
      renderClaimsTableRows(rows);
      renderLawsuitsTableRows(rows);
      initOpdirProjectDataTable(
        "#table-top-deviations",
        ".dashboard-table-wrap--claims",
        "opdir-project-top-table-advanced"
      );
      initOpdirProjectDataTable(
        "#table-lawsuits",
        ".dashboard-table-wrap--lawsuits",
        "opdir-project-second-table-advanced"
      );
      return;
    }
    if (technicalTablesMode) {
      renderClaimsTableRows(rows);
      renderLawsuitsTableRows(rows);
      initTechnicalClaimsDataTable();
      initTechnicalLawsuitsDataTable();
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
  }

  global.DashboardClaimsTable = {
    init: init,
  };
})(typeof window !== "undefined" ? window : globalThis);
