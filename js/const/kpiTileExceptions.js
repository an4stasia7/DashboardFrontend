(function (global) {
  global.KPI_TILE_EXCEPTIONS = {
    "OD-M1": {
      backDeptAmounts: true,
    },
    /** QD-M5: plan/fact на лице; детализация форм и ОТК-1 / ОТК-2 на обороте. */
    "QD-M5": {
      allowPartialPlanFact: true,
      periodLabelPrefix: "Период",
      qualdirControlOverviewOnBack: true,
      qualdirControlOverview: {
        ariaLabel: "Формы",
        rows: [
          { label: "Всего форм", field: "plan", useUnits: true },
          { label: "Значимые формы", field: "significant", useUnits: true },
        ],
      },
      backDefectDirections: true,
    },
    /** QD-M1: plan/fact на лице; детализация форм и подразделения на обороте. */
    "QD-M1": {
      allowPartialPlanFact: true,
      backArticlesDeptCount: true,
      periodLabelPrefix: "Период",
      qualdirControlOverviewOnBack: true,
      qualdirControlOverview: {
        ariaLabel: "Формы",
        rows: [
          { label: "Всего форм", field: "plan", useUnits: true },
          { label: "Значимые формы", field: "significant", useUnits: true },
        ],
      },
    },
    /** QD-M8: plan/fact на лице; детализация форм и подразделения на обороте. */
    "QD-M8": {
      allowPartialPlanFact: true,
      backArticlesDeptCount: true,
      periodLabelPrefix: "Период",
      qualdirControlOverviewOnBack: true,
      qualdirControlOverview: {
        ariaLabel: "Формы",
        rows: [
          { label: "Всего форм", field: "plan", useUnits: true },
          { label: "Значимые формы", field: "significant", useUnits: true },
        ],
      },
    },
    /** QD-M6: plan/fact на лице; входной контроль на обороте. */
    "QD-M6": {
      allowPartialPlanFact: true,
      periodLabelPrefix: "Период",
      donutRejectedItemsShare: {
        title: "Забракованные наименования",
        green_threshold: "≤5%",
        yellow_threshold: "5,1–15%",
        red_threshold: ">15%",
      },
      qualdirControlOverviewOnBack: true,
      qualdirControlOverview: {
        ariaLabel: "Предъявление продукции по входному контролю",
        rows: [
          { label: "Количество документов", field: "fact", useUnits: true },
          { label: "Забраковано, наименований", field: "rejected_items_count", useUnits: true },
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
    "PD-M1.1.M": {
      backDeptAmounts: true,
    },
    "PD-M1.1.W": {
      backDeptAmounts: true,
    },
    "PD-M1.1.T": {
      backDeptAmounts: true,
    },
    "PD-M1.2.M": {
      backDeptAmounts: true,
    },
    "PD-M1.2.W": {
      backDeptAmounts: true,
    },
    "PD-M1.2.T": {
      backDeptAmounts: true,
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
      hidePlanDelta: false,
      // Суммы в рублях (млн на плитке); бейдж — KPI% отклонения от плана.
    },
    "LOG-M5": {
      // kpi_pct = просроченная ДЗ / общая ДЗ × 100; бейдж показывает долю, не отклонение от 100%.
      kpiPctIsShare: true,
      planDeltaSubLabel: "просрочено",
    },
    "GK-M1": {
      backProjectDeviations: true,
    },
    "GK-Q1": {
      backProjectDeviations: true,
    },
    "KD-M4": {
      factOnly: true,
      hideKpiPercent: true,
      backDepartmentsOnly: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T3": {
      // Три процентные пилюли: общее, клиенты и поставщики.
      dualRatioOverview: true,
      hideKpiPercent: true,
      // На обратной стороне показываем ДЗ/КЗ для клиентов, поставщиков и общий итог.
      backDualRatioAmounts: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T4": {
      kpiPctOnly: true,
      showBackPlanFact: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T5": {
      kpiPctOnly: true,
      showBackPlanFact: true,
      frontAccentColor: "#374e6f",
    },
    "FND-T6": {
      kpiPctOnly: true,
      hideKpiPercent: true,
      backProjectDeviations: true,
      backProjectDeviationsTitle: "Все проекты портфеля",
      frontAccentColor: "#374e6f",
    },
    "FND-T7": {
      factOnly: true,
      hideKpiPercent: true,
      backDepartmentsOnly: true,
      drilldownRootDept: "Коммерческий директор",
      drilldownMatchKpiId: "KD-M4",
      drilldownMatchTitle: "Дебиторская задолженность",
      frontAccentColor: "#374e6f",
    },
    "FND-T9": {
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
      hideKpiPercent: true,
    },
    "METD-M1": {
      hideKpiPercent: true,
      showBackPlanFact: true,
      backStageRows: true,
      backStageRowsTitle: "План производства в части МС",
    },
    "МЕТ-M1": {
      hideKpiPercent: true,
      showBackPlanFact: true,
      backStageRows: true,
      backStageRowsTitle: "План производства в части МС",
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
    "SH-M2": {
      pctLowerIsBetter: true,
    },
    "SH-M3": {
      pctLowerIsBetter: true,
    },
    "SH-M5": {
      pctLowerIsBetter: true,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
