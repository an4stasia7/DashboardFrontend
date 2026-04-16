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
  var DEFAULT_OVERDUE_DEBT_HEADERS = ["№ Заказа клиента", "Контрагент", "Сумма", "Дн. просрочки", "Причина", "Действие"];
  var EXECUTIVE_DEVIATIONS_HEADERS = ["Показатель", "Факт", "План", "RAG", "Комментарий"];
  var EXECUTIVE_DECISIONS_HEADERS = ["Вопрос", "Факт", "План", "RAG", "Решение"];

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
    setTableHeaders("table-top-deviations", DEFAULT_TOP_DEVIATIONS_HEADERS);
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

    rows.forEach(function (item) {
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

  function initClaimsDataTable() {
    if (typeof $ === "undefined" || !$.fn || !$.fn.DataTable) return;
    var table = $("#table-top-deviations");
    if (!table.length) return;

    var wrapper = table.closest(".dashboard-table-wrap--claims");
    if (wrapper.length) {
      wrapper.find(".claims-column-filter-menu").remove();
    }
    if ($.fn.DataTable.isDataTable(table)) {
      table.DataTable().destroy();
    }

    var columnConfigs = [
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
    ];

    var dataTable = table.DataTable({
      order: [[10, "desc"]],
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
      columnDefs: [
        { targets: "_all", orderable: false },
        { targets: [3, 4], orderable: true },
        { targets: [10], type: "num-fmt", orderable: true },
      ],
      dom: '<"claims-table-top"lf><"claims-table-scroll"rt><"claims-table-bottom"ip>',
      footerCallback: function () {
        updateClaimsTotalRow(this.api());
      },
    });

    updateClaimsTotalRow(dataTable);

    var searchFieldConfigs = columnConfigs.filter(function (config) {
      return !!config.searchType;
    });
    var claimsSearchState = {
      fields: [],
      text: "",
      date: "",
    };
    var claimsAdvancedSearchKey = "claims-table-advanced";
    if ($.fn.dataTable && $.fn.dataTable.ext && Array.isArray($.fn.dataTable.ext.search)) {
      for (var extIdx = $.fn.dataTable.ext.search.length - 1; extIdx >= 0; extIdx--) {
        var extSearchFn = $.fn.dataTable.ext.search[extIdx];
        if (extSearchFn && extSearchFn._claimsAdvancedSearchKey === claimsAdvancedSearchKey) {
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
    claimsAdvancedSearchFn._claimsAdvancedSearchKey = claimsAdvancedSearchKey;
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
  }

  function destroyClaimsTables() {
    ["#table-plan-fact", "#table-top-deviations", "#table-overdue-debt"].forEach(function (selector) {
      if (typeof $ !== "undefined" && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable(selector)) {
        $(selector).DataTable().destroy();
      }
    });
  }

  function init(options) {
    options = options || {};
    var rows = Array.isArray(options.rows) ? options.rows : [];
    var executiveMode = !!options.executiveMode;
    destroyClaimsTables();

    var topBody = document.querySelector("#table-top-deviations tbody");
    var debtBody = document.querySelector("#table-overdue-debt tbody");
    if (topBody) topBody.innerHTML = "";
    if (debtBody) debtBody.innerHTML = "";

    if (executiveMode) {
      renderExecutiveTables(rows);
      return;
    }

    resetDefaultTables();
    renderClaimsTableRows(rows);
    initClaimsDataTable();
  }

  global.DashboardClaimsTable = {
    init: init,
  };
})(typeof window !== "undefined" ? window : globalThis);
