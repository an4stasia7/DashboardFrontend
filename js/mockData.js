/**
 * @fileoverview Заглушки дашборда при недоступном API или mock-режиме: плитки KPI по роли, графики, таблицы.
 * Экспорт: `global.MockData` (см. конец файла). Используется из `dashboard.js` и при необходимости из `api.js` (mock).
 */
(function (global) {
  /** KPI-плитки по роли (позже подгрузка с сервера) */
  const KPI_TILES_BY_ROLE = {
    "Технический директор": [
      {
        title: "Доля проектов/заказов «в срок»",
        period: "Ежемесячно",
        badge: "KPI",
        percent: 87,
        plan: "≥ 80%",
        fact: "87%",
        formula: "Отклонение, % = (факт − план) / план × 100",
        green_threshold: "≥80%",
        yellow_threshold: "60–79,9%",
        red_threshold: "<60%",
      },
      {
        title: "Отсутствие критичных нарушений по ИБ/ПБ/ЭБ",
        period: "Ежемесячно",
        badge: "KPI",
        percent: 100,
        plan: "0",
        fact: "0",
        green_threshold: "≥100%",
        yellow_threshold: "90–99,9%",
        red_threshold: "<90%",
      },
      {
        title: "Бюджет и ФОТ блока в пределах лимита",
        period: "Ежемесячно",
        badge: "KPI",
        percent: 98,
        plan: "100%",
        fact: "98%",
        green_threshold: "≥100%",
        yellow_threshold: "90–99,9%",
        red_threshold: "<90%",
      },
      {
        title: "Стратегические технические инициативы, запланированные на год",
        period: "Ежеквартально",
        badge: "KPI",
        percent: 80,
        plan: "15",
        fact: "12/15",
        green_threshold: "≥90%",
        yellow_threshold: "70–89,9%",
        red_threshold: "<70%",
      },
      {
        title: "Текучесть персонала технического контура",
        period: "Ежеквартально",
        badge: "KPI",
        percent: 92,
        plan: "≤ 8%",
        fact: "6%",
        green_threshold: "≥80%",
        yellow_threshold: "60–79,9%",
        red_threshold: "<60%",
      },
    ],
    "Руководитель проектов": [
      {
        title: "Сроки этапов проектов",
        period: "Ежемесячно",
        badge: "KPI",
        percent: 92,
        plan: "≥ 95%",
        fact: "92%",
        green_threshold: "≥95%",
        yellow_threshold: "85–94,9%",
        red_threshold: "<85%",
      },
      {
        title: "Качество поставок",
        period: "Ежемесячно",
        badge: "KPI",
        percent: 96.5,
        plan: "≥ 98%",
        fact: "96,5%",
        green_threshold: "≥98%",
        yellow_threshold: "90–97,9%",
        red_threshold: "<90%",
      },
      {
        title: "Загрузка команды",
        period: "Ежемесячно",
        badge: "KPI",
        percent: 86,
        plan: "80–90%",
        fact: "86%",
        green_threshold: "≥80%",
        yellow_threshold: "60–79,9%",
        red_threshold: "<60%",
      },
      {
        title: "Риски портфеля",
        period: "Ежеквартально",
        badge: "KPI",
        percent: 55,
        plan: "низкий",
        fact: "умеренный",
        green_threshold: "≥80%",
        yellow_threshold: "50–79,9%",
        red_threshold: "<50%",
      },
      {
        title: "Удовлетворённость заказчика",
        period: "Ежеквартально",
        badge: "KPI",
        percent: 86,
        plan: "≥ 4,5 / 5",
        fact: "4,3 / 5",
        green_threshold: "≥90%",
        yellow_threshold: "70–89,9%",
        red_threshold: "<70%",
      },
    ],
    "Коммерческий директор": [
      {
        title: "Валовая прибыль коммерческого блока (факт/план)",
        period: "Ежемесячно · БДР / управленческая отчётность",
        badge: "KPI",
        percent: 98.3,
        plan: "120 млн ₽",
        fact: "118 млн ₽",
        formula:
          "\\mathrm{kpi\\_pct} = \\dfrac{\\text{факт}}{\\text{план}} \\cdot 100\\%",
        green_threshold: "≥100%",
        yellow_threshold: "90–99,9%",
        red_threshold: "<90%",
      },
      {
        title: "Деньги и просроченная ДЗ",
        period: "Ежемесячно · БДР / реестр ДЗ / 1С",
        badge: "KPI",
        percent: 55,
        plan: "≤ 5% просрочки",
        fact: "7%",
        green_threshold: "≥95%",
        yellow_threshold: "80–94,9%",
        red_threshold: "<80%",
      },
      {
        title: "Бюджет и ФОТ коммерческой службы в пределах лимита",
        period: "Ежемесячно · БДР / 1С / ЗУП / HRIS",
        badge: "KPI",
        percent: 99,
        plan: "100%",
        fact: "99%",
        green_threshold: "≥100%",
        yellow_threshold: "90–99,9%",
        red_threshold: "<90%",
      },
      {
        title: "CSI / NPS и удержание клиентской базы",
        period: "Ежеквартально · CRM / опросы / 1С",
        badge: "KPI",
        percent: 95,
        plan: "NPS ≥ 40",
        fact: "NPS 38",
        green_threshold: "≥100%",
        yellow_threshold: "80–99,9%",
        red_threshold: "<80%",
      },
      {
        title: "Текучесть персонала коммерческого блока",
        period: "Ежеквартально · HRIS / 1С ЗУП",
        badge: "KPI",
        percent: 70,
        plan: "≤ 10%",
        fact: "7%",
        green_threshold: "≥80%",
        yellow_threshold: "60–79,9%",
        red_threshold: "<60%",
      },
    ],
  };

  const ROLE_ALIASES = {
    User1: "Технический директор",
  };
  
  const MOCK_REPORTING_TARGETS_BY_USER_ID = {
    1: [
      {
        id: "mock-vu-engineer",
        label: "Главный инженер",
        user: {
          id: 101,
          nickname: "lead_eng",
          role: "Руководитель проектов",
          department: "Инжиниринг",
          created_at: "2026-01-10T00:00:00+00:00",
        },
      },
      {
        id: "mock-vu-sec",
        label: "Руководитель ИБ",
        user: {
          id: 102,
          nickname: "security_lead",
          role: "Руководитель проектов",
          department: "ИБ",
          created_at: "2026-01-11T00:00:00+00:00",
        },
      },
    ],
    3: [
      {
        id: "mock-vu-engineer",
        label: "Главный инженер",
        user: {
          id: 101,
          nickname: "lead_eng",
          role: "Руководитель проектов",
          department: "Инжиниринг",
          created_at: "2026-01-10T00:00:00+00:00",
        },
      },
      {
        id: "mock-vu-analyst",
        label: "Руководитель направления аналитики",
        user: {
          id: 103,
          nickname: "analyst_td",
          role: "Технический директор",
          department: "Аналитика",
          created_at: "2026-01-12T00:00:00+00:00",
        },
      },
    ],
    4: [
      {
        id: "mock-vu-salesdir",
        label: "Директор по продажам",
        user: {
          id: 201,
          nickname: "sales_dir",
          role: "Руководитель проектов",
          department: "Продажи",
          created_at: "2026-01-08T00:00:00+00:00",
        },
      },
    ],
  };

  function getViewableDashboardTargets(loggedInUser) {
    var u = loggedInUser || {};
    var selfEntry = {
      id: "self",
      label: "Мой дашборд",
      user: u,
    };
    var uid = u.id != null ? String(u.id) : "";
    var extra = MOCK_REPORTING_TARGETS_BY_USER_ID[uid] || [];
    return [selfEntry].concat(extra);
  }

  /**
   * Локальный вход (режим mock). Пароль у всех демо: demo
   */
  const MOCK_LOGIN_USERS = [
    {
      nickname: "director",
      password: "demo",
      user: {
        id: 1,
        nickname: "director",
        role: "Технический директор",
        department: "IT",
        created_at: "2026-01-01T12:00:00+00:00",
      },
    },
    {
      nickname: "manager",
      password: "demo",
      user: {
        id: 2,
        nickname: "manager",
        role: "Руководитель проектов",
        department: "Проекты",
        created_at: "2026-01-01T12:00:00+00:00",
      },
    },
    {
      nickname: "admin",
      password: "demo",
      user: {
        id: 3,
        nickname: "admin",
        role: "User1",
        department: "IT",
        created_at: "2026-01-01T12:00:00+00:00",
      },
    },
    {
      nickname: "commercial",
      password: "demo",
      user: {
        id: 4,
        nickname: "Иванов Иван Иванович",
        role: "Коммерческий директор",
        department: "Коммерция",
        created_at: "2026-01-01T12:00:00+00:00",
      },
    },
  ];

  const MONTH_LABELS_SHORT = ["Я", "Ф", "М", "А", "М", "И", "И"];
  const MONTH_LABELS_LONG = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл"];

  /**
   * Показатели для линейного графика (тестовые данные с разным масштабом оси Y).
   * С сервера позже: массив произвольной длины, series — 1..N линий.
   */
  const LINE_CHART_INDICATORS_TD = [
    {
      id: "td-on-time",
      optionLabel: "Доля «в срок»",
      title: "Доля проектов/заказов «в срок»",
      xAxisTitle: "Месяцы",
      yAxisTitle: "%",
      categories: MONTH_LABELS_SHORT,
      series: [
        { name: "Факт", data: [72, 75, 78, 80, 82, 85, 87], color: "#2563eb" },
        { name: "Цель", data: [80, 80, 80, 80, 80, 80, 80], color: "#16a34a", dashStyle: "Dash" },
      ],
    },
    {
      id: "td-budget",
      optionLabel: "Бюджет блока (% лимита)",
      title: "Использование бюджета и ФОТ (от лимита)",
      xAxisTitle: "Месяцы",
      yAxisTitle: "% от лимита",
      categories: MONTH_LABELS_SHORT,
      series: [
        { name: "Факт", data: [99.2, 98.8, 99.5, 100.1, 98.2, 97.9, 98.0], color: "#1d4ed8" },
        { name: "Лимит", data: [100, 100, 100, 100, 100, 100, 100], color: "#64748b", dashStyle: "Dash" },
      ],
    },
    {
      id: "td-incidents",
      optionLabel: "Замечания по ИБ (шт.)",
      title: "Количество замечаний по ИБ/ПБ (не критичных)",
      xAxisTitle: "Месяцы",
      yAxisTitle: "Кол-во",
      categories: MONTH_LABELS_SHORT,
      series: [{ name: "Замечания", data: [3, 1, 4, 2, 0, 1, 2], color: "#ca8a04" }],
    },
    {
      id: "td-initiatives",
      optionLabel: "Инициативы в работе",
      title: "Стратегические инициативы: в работе из плана",
      xAxisTitle: "Недели квартала",
      yAxisTitle: "Штук",
      categories: ["Н1", "Н2", "Н3", "Н4", "Н5", "Н6"],
      series: [
        { name: "В работе", data: [8, 9, 10, 11, 12, 12], color: "#059669" },
        { name: "План на квартал", data: [15, 15, 15, 15, 15, 15], color: "#94a3b8", dashStyle: "ShortDot" },
      ],
    },
  ];

  const LINE_CHART_INDICATORS_COMMERCIAL = [
    {
      id: "kd-revenue",
      optionLabel: "Валовая прибыль (млн ₽)",
      title: "Валовая прибыль коммерческого блока",
      xAxisTitle: "Месяцы",
      yAxisTitle: "млн ₽",
      categories: MONTH_LABELS_LONG,
      series: [
        { name: "Факт", data: [102, 105, 108, 112, 114, 116, 118], color: "#2563eb" },
        { name: "План", data: [120, 120, 120, 120, 120, 120, 120], color: "#16a34a", dashStyle: "Dash" },
      ],
    },
    {
      id: "kd-overdue",
      optionLabel: "Просроченная ДЗ (%)",
      title: "Доля просроченной дебиторской задолженности",
      xAxisTitle: "Месяцы",
      yAxisTitle: "%",
      categories: MONTH_LABELS_LONG,
      series: [
        { name: "Факт", data: [4.2, 5.1, 6.8, 7.2, 6.9, 7.0, 7.0], color: "#dc2626" },
        { name: "Норма", data: [5, 5, 5, 5, 5, 5, 5], color: "#22c55e", dashStyle: "Dash" },
      ],
    },
    {
      id: "kd-nps",
      optionLabel: "NPS (баллы)",
      title: "NPS по опросам клиентов",
      xAxisTitle: "Месяцы",
      yAxisTitle: "NPS",
      categories: MONTH_LABELS_LONG,
      series: [{ name: "NPS", data: [36, 37, 35, 38, 39, 37, 38], color: "#7c3aed" }],
    },
  ];

  const LINE_CHART_INDICATORS_PM = [
    {
      id: "pm-deadlines",
      optionLabel: "Сроки этапов (% в срок)",
      title: "Соблюдение сроков этапов проектов",
      xAxisTitle: "Спинт",
      yAxisTitle: "%",
      categories: ["С1", "С2", "С3", "С4", "С5", "С6"],
      series: [
        { name: "Факт", data: [88, 90, 91, 89, 92, 92], color: "#2563eb" },
        { name: "Цель", data: [95, 95, 95, 95, 95, 95], color: "#16a34a", dashStyle: "Dash" },
      ],
    },
    {
      id: "pm-quality",
      optionLabel: "Качество поставок (индекс)",
      title: "Индекс качества поставок (0–100)",
      xAxisTitle: "Месяцы",
      yAxisTitle: "Индекс",
      categories: MONTH_LABELS_SHORT,
      series: [{ name: "Индекс", data: [94, 95, 96, 95.5, 96.2, 96.5, 96.5], color: "#0d9488" }],
    },
  ];

  /**
   * Waterfall + линия плана: по каждому показателю массивы plan[] и fact[] одной длины —
   * на графике факт идёт шагами (waterfall), план — накопительная кривая до «Итого».
   */
  const WATERFALL_INDICATORS_TD = [
    {
      id: "wf-td-quarters",
      optionLabel: "Выполнение по кварталам, %",
      title: "Распределение выполнения по кварталам",
      xAxisTitle: "Период",
      yAxisTitle: "%",
      categories: ["Q1", "Q2", "Q3", "Q4"],
      plan: [24, 26, 25, 25],
      fact: [23, 27, 24, 26],
    },
    {
      id: "wf-td-streams",
      optionLabel: "Вклад направлений (доля работ)",
      title: "План и факт по техническим направлениям",
      xAxisTitle: "Направление",
      yAxisTitle: "Доля, %",
      categories: ["ИТ", "Инфраструктура", "ИБ", "Сервис"],
      plan: [35, 30, 20, 15],
      fact: [33, 32, 19, 16],
    },
    {
      id: "wf-td-initiatives",
      optionLabel: "Инициативы (кол-во)",
      title: "Закрытые инициативы по волнам",
      xAxisTitle: "Волна",
      yAxisTitle: "Шт.",
      categories: ["В1", "В2", "В3", "В4"],
      plan: [3, 4, 4, 4],
      fact: [2, 5, 3, 5],
    },
  ];

  const WATERFALL_INDICATORS_COMMERCIAL = [
    {
      id: "wf-kd-channels",
      optionLabel: "Выручка по каналам (млн ₽)",
      title: "План и факт: выручка по каналам продаж",
      xAxisTitle: "Канал",
      yAxisTitle: "млн ₽",
      categories: ["B2B", "B2C", "Госзаказ", "Прочее"],
      plan: [45, 32, 28, 15],
      fact: [44, 30, 31, 13],
    },
    {
      id: "wf-kd-regions",
      optionLabel: "Поступления по регионам (млн ₽)",
      title: "Денежные поступления по регионам",
      xAxisTitle: "Регион",
      yAxisTitle: "млн ₽",
      categories: ["Центр", "Юг", "Сибирь", "ДВ"],
      plan: [38, 42, 22, 18],
      fact: [40, 39, 24, 15],
    },
    {
      id: "wf-kd-margin",
      optionLabel: "Маржа по продуктам (млн ₽)",
      title: "Валовая маржа по продуктовым линейкам",
      xAxisTitle: "Линейка",
      yAxisTitle: "млн ₽",
      categories: ["Продукт A", "Продукт B", "Услуги", "Лицензии"],
      plan: [22, 18, 35, 45],
      fact: [21, 19, 33, 47],
    },
  ];

  const WATERFALL_INDICATORS_PM = [
    {
      id: "wf-pm-projects",
      optionLabel: "Трудозатраты по проектам (чел.-дн.)",
      title: "План и факт трудозатрат по ключевым проектам",
      xAxisTitle: "Проект",
      yAxisTitle: "чел.-дн.",
      categories: ["Альфа", "Бета", "Гамма", "Дельта"],
      plan: [120, 95, 80, 60],
      fact: [118, 102, 75, 58],
    },
    {
      id: "wf-pm-phases",
      optionLabel: "Этапы портфеля (спринты)",
      title: "Закрытые задачи по этапам",
      xAxisTitle: "Этап",
      yAxisTitle: "Задач",
      categories: ["Анализ", "Разработка", "Тест", "Ввод"],
      plan: [40, 120, 90, 50],
      fact: [38, 125, 88, 48],
    },
  ];

  function getWaterfallChartIndicators(role) {
    var key = dataBundleKeyForRole(role);
    if (key === "commercial") return WATERFALL_INDICATORS_COMMERCIAL.slice();
    if (role === "Руководитель проектов") return WATERFALL_INDICATORS_PM.slice();
    return WATERFALL_INDICATORS_TD.slice();
  }

  function shortenTileTitle(s, maxLen) {
    maxLen = maxLen || 40;
    if (s == null) return "KPI";
    var t = String(s).trim();
    if (t.length <= maxLen) return t;
    return t.slice(0, maxLen - 1) + "…";
  }

  /** Цвета сегментов RAG (с бэкенда позже можно отдавать свои hex под отдел). */
  var KPI_RAG_FILL = {
    green: "#1f9d68",
    yellow: "#d39a18",
    red: "#e14f63",
    gray: "#94a3b8",
    grey: "#94a3b8",
    unknown: "#94a3b8",
  };

  /**
   * Заглушка порогов до привязки к отделам с бэкенда:
   * зелёный от 80 %, жёлтый от 50 % до 79 %, красный ниже 50 %.
   */
  function kpiRagFromPercentStub(percent) {
    var raw = Number(percent);
    if (!isFinite(raw) || isNaN(raw)) return { rag: "gray", fillColor: KPI_RAG_FILL.gray };
    var p = Math.min(100, Math.max(0, raw));
    if (p >= 80) return { rag: "green", fillColor: KPI_RAG_FILL.green };
    if (p >= 50) return { rag: "yellow", fillColor: KPI_RAG_FILL.yellow };
    return { rag: "red", fillColor: KPI_RAG_FILL.red };
  }

  function normalizeRagFromApi(raw) {
    if (raw == null) return null;
    var s = String(raw).toLowerCase().trim();
    if (s === "green" || s === "g" || s.indexOf("зел") === 0) return "green";
    if (s === "yellow" || s === "amber" || s === "y" || s.indexOf("жёл") === 0 || s.indexOf("жел") === 0)
      return "yellow";
    if (s === "red" || s === "r" || s.indexOf("красн") === 0) return "red";
    if (
      s === "gray" ||
      s === "grey" ||
      s === "unknown" ||
      s === "undefined" ||
      s.indexOf("сер") === 0 ||
      s.indexOf("нет данных") !== -1
    )
      return "gray";
    return null;
  }

  /** Достаёт число 0–100 из плитки: kpi_pst / kpi_pct / percent / value или разбор legacy plan/fact. */
  function extractPercentFromTile(tile) {
    if (tile == null) return null;
    if (typeof tile.kpi_pst === "number" && !isNaN(tile.kpi_pst)) {
      return tile.kpi_pst;
    }
    if (typeof tile.kpi_pct === "number" && !isNaN(tile.kpi_pct)) {
      return tile.kpi_pct;
    }
    if (typeof tile.percent === "number" && !isNaN(tile.percent)) {
      return tile.percent;
    }
    if (typeof tile.value === "number" && !isNaN(tile.value)) {
      return tile.value;
    }
    var fact = String(tile.fact != null ? tile.fact : "").trim();
    var plan = String(tile.plan != null ? tile.plan : "").trim();

    var pct = fact.match(/^([\d]+(?:[.,]\d+)?)\s*%$/);
    if (pct) {
      return Math.min(100, Math.max(0, parseFloat(pct[1].replace(",", "."))));
    }
    var ratio = fact.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (ratio) {
      var a = +ratio[1];
      var b = +ratio[2];
      return b ? Math.round(10000 * a / b) / 100 : 0;
    }
    if (fact === "0" && plan === "0") return 100;

    var npsF = fact.match(/NPS\s*(\d+)/i);
    var npsP = plan.match(/(\d+)/);
    if (npsF && npsP) {
      var nf = +npsF[1];
      var np = +npsP[1];
      if (np > 0) return Math.min(100, Math.round(1000 * nf / np) / 10);
    }

    var mf = fact.match(/([\d\s]+(?:[.,]\d+)?)\s*млн/i);
    var mp = plan.match(/([\d\s]+(?:[.,]\d+)?)\s*млн/i);
    if (mf && mp) {
      var fv = parseFloat(mf[1].replace(/\s/g, "").replace(",", "."));
      var pv = parseFloat(mp[1].replace(/\s/g, "").replace(",", "."));
      if (pv > 0 && fv >= 0) {
        var mx = Math.max(fv, pv);
        return Math.round(1000 * fv / mx) / 10;
      }
    }

    if (/низк/i.test(fact)) return 85;
    if (/умерен/i.test(fact)) return 55;

    var score = fact.match(/([\d]+(?:[.,]\d+)?)\s*\/\s*5/);
    if (score) {
      return Math.min(100, parseFloat(score[1].replace(",", ".")) * 20);
    }

    return null;
  }

  function parseTilePercent(tile) {
    var n = extractPercentFromTile(tile);
    return n == null ? 0 : n;
  }

  /**
   * Парсит green_threshold / yellow_threshold строки из JSON и определяет RAG.
   * Поддерживает форматы: "≥100%", "90–99,9%", "<90%", а также числовые строки.
   */
  function deriveRagFromThresholds(tile, percent) {
    if (tile == null || percent == null || isNaN(percent)) return null;
    var gs = tile.green_threshold != null ? String(tile.green_threshold) : "";
    var ys = tile.yellow_threshold != null ? String(tile.yellow_threshold) : "";
    if (!gs && !ys) return null;

    var gMatch = gs.match(/[≥>=]\s*([\d]+(?:[.,]\d+)?)\s*%?/);
    if (gMatch) {
      var greenMin = parseFloat(gMatch[1].replace(",", "."));
      if (percent >= greenMin) return "green";
    }

    var range = ys.match(/([\d]+(?:[.,]\d+)?)\s*[\u2013\-–]\s*([\d]+(?:[.,]\d+)?)\s*%?/);
    if (range) {
      var lo = parseFloat(String(range[1]).replace(",", "."));
      var hi = parseFloat(String(range[2]).replace(",", "."));
      if (percent >= lo && percent <= hi) return "yellow";
    }

    if (gMatch || range) return "red";
    return null;
  }

  /**
   * Единая презентация плитки: число %, RAG и цвет диаграммы.
   * Приоритет: 1) rag/status из API, 2) пороги green_threshold/yellow_threshold, 3) заглушка по percent.
   */
  function getKpiTilePresentation(tile) {
    var percent = parseTilePercent(tile);
    var ragFromApi =
      normalizeRagFromApi(tile.color) ||
      normalizeRagFromApi(tile.rag) ||
      normalizeRagFromApi(tile.status) ||
      normalizeRagFromApi(tile.ragStatus);
    if (ragFromApi) {
      return {
        percent: percent,
        rag: ragFromApi,
        fillColor: KPI_RAG_FILL[ragFromApi],
        ragFromApi: true,
      };
    }
    var ragFromThresholds = deriveRagFromThresholds(tile, percent);
    if (ragFromThresholds) {
      return {
        percent: percent,
        rag: ragFromThresholds,
        fillColor: KPI_RAG_FILL[ragFromThresholds],
        ragFromApi: true,
      };
    }
    var stub = kpiRagFromPercentStub(percent);
    return {
      percent: percent,
      rag: stub.rag,
      fillColor: stub.fillColor,
      ragFromApi: false,
    };
  }

  function formatKpiPercentLabel(p) {
    var n = Number(p);
    if (isNaN(n)) return "—";
    if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
    var rounded = Math.round(n * 10) / 10;
    return String(rounded).replace(".", ",");
  }

  function buildDonutSeriesFromPresentation(pres) {
    var fill = pres.fillColor;
    var track = "#e2e8f0";
    var p = Math.min(100, Math.max(0, Number(pres.percent) || 0));
    if (p >= 100) {
      return [{ name: "Показатель", y: 100, color: fill }];
    }
    if (p <= 0) {
      return [{ name: "До 100%", y: 100, color: track }];
    }
    return [
      { name: "Показатель", y: p, color: fill },
      { name: "До 100%", y: 100 - p, color: track },
    ];
  }

  /** Одна круговая диаграмма на каждую KPI-плитка: доля = показатель %, цвет по RAG. */
  function getDonutChartsForTiles(tiles) {
    if (!tiles || !tiles.length) return [];
    return tiles.map(function (t) {
      var pres = getKpiTilePresentation(t);
      return {
        title: shortenTileTitle(t.title),
        data: buildDonutSeriesFromPresentation(pres),
      };
    });
  }

  const PLAN_FACT_TABLE_TD = [
    { kpi: "Доля проектов/заказов «в срок»", fact: "87%", plan: "≥ 80%", rag: "green", comment: "Выполнение в зелёной зоне" },
    { kpi: "Отсутствие критичных нарушений по ИБ/ПБ/ЭБ", fact: "0", plan: "0", rag: "green", comment: "Нарушений не зафиксировано" },
    { kpi: "Бюджет и ФОТ блока в пределах лимита", fact: "98%", plan: "100%", rag: "yellow", comment: "Контроль расходов" },
    { kpi: "Стратегические технические инициативы", fact: "12/15", plan: "15", rag: "green", comment: "По графику" },
    { kpi: "Текучесть персонала технического контура", fact: "6%", plan: "≤ 8%", rag: "green", comment: "В пределах нормы" },
  ];

  const PLAN_FACT_TABLE_COMMERCIAL = [
    {
      kpi: "KD-M1 · Валовая прибыль коммерческого блока (факт/план)",
      fact: "118 млн ₽",
      plan: "120 млн ₽",
      rag: "yellow",
      comment: "БДР / управленческая отчётность; ниже плана на 1,7%",
    },
    {
      kpi: "KD-M2 · Деньги и просроченная ДЗ",
      fact: "7% просрочки",
      plan: "≤ 5%",
      rag: "yellow",
      comment: "БДР / реестр ДЗ / 1С; усилить дисциплину оплаты",
    },
    {
      kpi: "KD-M3 · Бюджет и ФОТ коммерческой службы в пределах лимита",
      fact: "99%",
      plan: "100%",
      rag: "green",
      comment: "БДР / 1С / ЗУП / HRIS",
    },
    {
      kpi: "KD-Q1 · CSI / NPS и удержание клиентской базы",
      fact: "NPS 38",
      plan: "NPS ≥ 40",
      rag: "yellow",
      comment: "CRM / опросы / 1С",
    },
    {
      kpi: "KD-Q2 · Текучесть персонала коммерческого блока",
      fact: "7%",
      plan: "≤ 10%",
      rag: "green",
      comment: "HRIS / 1С ЗУП",
    },
  ];

  const PASSPORTS_TABLE_TD = [
    { passport: "TD-M1", fact: "87%", plan: "80%", rag: "green", source: "Паспорта_KPI_директоров" },
    { passport: "TD-M2", fact: "0", plan: "0", rag: "green", source: "Паспорта_KPI_директоров" },
    { passport: "TD-M3", fact: "98%", plan: "100%", rag: "yellow", source: "Паспорта_KPI_директоров" },
    { passport: "TD-Q1", fact: "80%", plan: "75%", rag: "green", source: "Паспорта_KPI_директоров" },
    { passport: "TD-Q2", fact: "6%", plan: "8%", rag: "green", source: "Паспорта_KPI_директоров" },
  ];

  const PASSPORTS_TABLE_COMMERCIAL = [
    { passport: "KD-M1", fact: "118 млн ₽", plan: "120 млн ₽", rag: "yellow", source: "Паспорта_KPI_директоров / KD-M1" },
    { passport: "KD-M2", fact: "7%", plan: "≤ 5%", rag: "yellow", source: "Паспорта_KPI_директоров / KD-M2" },
    { passport: "KD-M3", fact: "99%", plan: "100%", rag: "green", source: "Паспорта_KPI_директоров / KD-M3" },
    { passport: "KD-Q1", fact: "NPS 38", plan: "NPS ≥ 40", rag: "yellow", source: "Паспорта_KPI_директоров / KD-Q1" },
    { passport: "KD-Q2", fact: "7%", plan: "≤ 10%", rag: "green", source: "Паспорта_KPI_директоров / KD-Q2" },
  ];

  function dataBundleKeyForRole(role) {
    var key = ROLE_ALIASES[role] || role;
    if (key === "Коммерческий директор") return "commercial";
    return "td";
  }

  function getLineChartIndicators(role) {
    var key = dataBundleKeyForRole(role);
    if (key === "commercial") return LINE_CHART_INDICATORS_COMMERCIAL.slice();
    if (role === "Руководитель проектов") return LINE_CHART_INDICATORS_PM.slice();
    return LINE_CHART_INDICATORS_TD.slice();
  }

  function getPlanFactTable(role) {
    if (dataBundleKeyForRole(role) === "commercial") return PLAN_FACT_TABLE_COMMERCIAL;
    return PLAN_FACT_TABLE_TD;
  }

  function getPassportsTable(role) {
    if (dataBundleKeyForRole(role) === "commercial") return PASSPORTS_TABLE_COMMERCIAL;
    return PASSPORTS_TABLE_TD;
  }

  global.MockData = {
    MOCK_LOGIN_USERS,
    KPI_TILES_BY_ROLE,
    getKpiTilesForRole(role) {
      var key = ROLE_ALIASES[role] || role;
      return KPI_TILES_BY_ROLE[key] || KPI_TILES_BY_ROLE["Технический директор"];
    },
    getDonutChartsForTiles,
    getKpiTilePresentation,
    formatKpiPercentLabel,
    kpiRagFromPercentStub,
    deriveRagFromThresholds,
    getViewableDashboardTargets,
    getLineChartIndicators,
    getWaterfallChartIndicators,
    getPlanFactTable,
    getPassportsTable,
  };
})(typeof window !== "undefined" ? window : globalThis);
