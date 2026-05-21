(function (global) {
  global.KPI_TILE_EXCEPTIONS = {
    "OD-M1": {
      backDeptAmounts: true,
    },
    "OD-M3.2": {
      allowPartialPlanFact: true,
      lowerIsBetterLimit: true,
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
    "LOG-M2": {
      hidePlanDelta: true,
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
