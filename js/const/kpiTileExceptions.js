(function (global) {
  global.KPI_TILE_EXCEPTIONS = {
    "OD-M1": {
      backDeptAmounts: true,
    },
    /** QD-M5: факт и количество по направлениям ОТК-1 / ОТК-2 из last_full_month_row.departments. */
    "QD-M5": {
      defectDirectionsOverview: true,
      hideKpiPercent: true,
      allowPartialPlanFact: true,
    },
    /** QD-M1 (qualdir): как обычная плитка (факт + спарклайн), без плана; оборот — `departments`. */
    "QD-M1": {
      allowPartialPlanFact: true,
      hidePlanOnTile: true,
      hideKpiPercent: true,
      backArticlesDeptCount: true,
    },
    /** QD-M8: как QD-M1 (главное значение + спарклайн; при отсутствии fact — plan; оборот `departments`). */
    "QD-M8": {
      allowPartialPlanFact: true,
      hidePlanOnTile: true,
      hideKpiPercent: true,
      backArticlesDeptCount: true,
    },
    /** QD-M6: входной контроль — документы, оставания, на сегодня (последний полный месяц). */
    "QD-M6": {
      allowPartialPlanFact: true,
      hidePlanOnTile: true,
      hideKpiPercent: true,
      disableBack: true,
      qualdirControlOverview: {
        ariaLabel: "Предъявление продукции по входному контролю",
        rows: [
          { label: "Количество документов", field: "fact", useUnits: true },
          { label: "Оставания в днях", field: "delay_count" },
          { label: "Количество на сегодня", field: "in_work_today", lastFullMonthOnly: true, useUnits: true },
        ],
      },
    },
    /** QD-M7: выходной контроль — документы, взяты в работу / проверено ОТК сегодня (последний полный месяц). */
    "QD-M7": {
      allowPartialPlanFact: true,
      hidePlanOnTile: true,
      hideKpiPercent: true,
      disableBack: true,
      qualdirControlOverview: {
        ariaLabel: "Предъявление продукции по выходному контролю",
        rows: [
          { label: "Количество документов", field: "fact", useUnits: true },
          { label: "Взяты в работу сегодня", field: "accepted_to_work_today", lastFullMonthOnly: true, useUnits: true },
          { label: "Проверено ОТК сегодня", field: "checked_otk_today", lastFullMonthOnly: true, useUnits: true },
        ],
      },
    },
    /** План без факта (ожидание данных по месяцу) — всё равно показываем план на плитке. */
    "QD-M3": {
      allowPartialPlanFact: true,
    },
    "OD-M3.2": {
      allowPartialPlanFact: true,
      lowerIsBetterLimit: true,
    },
    "TD-M3": {
      allowPartialPlanFact: true,
    },
    "OD-Q1": {
      showBackPlanFact: true,
    },
    "PD-Q1": {
      showBackPlanFact: true,
    },
    "LOG-Q1": {
      allowPartialPlanFact: true,
      showEmptyPlanFact: true,
    },
    "HRD-Q2": {
      allowPartialPlanFact: true,
      showEmptyPlanFact: true,
      zeroEmptyPlanFact: true,
      zeroGeneratedPlanFact: true,
    },
    "LOG-M2": {
      hidePlanDelta: true,
    },
    "GK-M1": {
      backProjectDeviations: true,
    },
    "GK-Q1": {
      backProjectDeviations: true,
    },
    "KD-M4": {
      factOnly: true,
      hideHelp: true,
      hideKpiPercent: true,
      backDepartmentsOnly: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T3": {
      // Три процентные пилюли: общее, клиенты и поставщики.
      dualRatioOverview: true,
      hideHelp: true,
      hideKpiPercent: true,
      // На обратной стороне показываем ДЗ/КЗ для клиентов, поставщиков и общий итог.
      backDualRatioAmounts: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T4": {
      kpiPctOnly: true,
      hideHelp: true,
      showBackPlanFact: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T5": {
      kpiPctOnly: true,
      hideHelp: true,
      showBackPlanFact: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T6": {
      kpiPctOnly: true,
      hideHelp: true,
      hideKpiPercent: true,
      backPortfolioAmounts: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T7": {
      factOnly: true,
      hideHelp: true,
      hideKpiPercent: true,
      backDepartmentsOnly: true,
      drilldownRootDept: "Коммерческий директор",
      drilldownMatchKpiId: "KD-M4",
      drilldownMatchTitle: "Дебиторская задолженность",
      frontAccentColor: "#374e6f",
    },
    "FND-T9": {
      hideHelp: true,
      hideKpiPercent: true,
      showBackPlanFact: true,
    },
    "MRK-04": {
      kpiPctOnly: true,
      backYearCompareAmounts: true,
    },
    "MRK-06": {
      kpiPctOnly: true,
      normLabel: "Норма: ≤ 70%",
    },
    "MRK-07": {
      kpiPctOnly: true,
    },
    "MRK-08": {
      kpiPctOnly: true,
    },
    "MRK-09": {
      tenderStatusOverview: true,
      tenderDepartmentsBreakdown: true,
      hideHelp: true,
      hideKpiPercent: true,
    },
    "METD-M1": {
      kpiPctOnly: true,
      showBackPlanFact: true,
    },
    "METD-Q1": {
      backProjectDeviations: true,
    },
    "МЕТ-Q4-1": {
      backProjectDeviations: true,
    },
    "METD-Q2": {
      showBackPlanFact: true,
    },
    "METD-Q3": {
      kpiPctOnly: true,
      showBackPlanFact: true,
    },
    "METD-Q4": {
      kpiPctOnly: true,
      showBackPlanFact: true,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
