(function (global) {
  global.KPI_TILE_EXCEPTIONS = {
    "OD-M1": {
      backDeptAmounts: true,
    },
    "OD-M3.2": {
      allowPartialPlanFact: true,
    },
    "OD-Q1": {
      showBackPlanFact: true,
    },
    "PD-Q1": {
      showBackPlanFact: true,
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
      kpiPctOnly: true,
      hideHelp: true,
      backPlanOnly: true,
      frontAccentColor: "#374e6f",
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
      hideHelp: true,
      hideKpiPercent: true,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
