/**
 * Ссылки e1c:// из файла описания плиток. Кнопка есть только у должности и кода, где ссылка заполнена.
 */
(function (global) {
  var REPORTS_BY_DEPT = {
    "главный конструктор": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "GK-M3.B": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
    },
    "главный метролог": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "METD-M3.B": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "METD-T-M3-BUDGET": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
    },
    "директор по развитию": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "RD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
    },
    "заместитель директора по производству": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "PD-M2.1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8709ac1f6b05524d11ec2688713a6447",
      "PD-M2.2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8709ac1f6b05524d11ec2688713a6447",
      "PD-M3.B1": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "PD-M3.B2": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
    },
    "заместитель коммерческого директора по развитию продаж": {
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
    },
    "заместитель тех. директора по качеству": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "QD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828dac1f6b05524d11e959705f70ced2",
      "QD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "QD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8a30ac1f6b05524d11ed77a19ccc0275",
      "QD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8a30ac1f6b05524d11ed77a19ccc0274",
    },
    "коммерция": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M10": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8899ac1f6b05524d11ecc7f4b90d4075",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "KD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "KD-T-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
    },
    "коммерческая служба": {
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
    },
    "коммерческий директор": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M10": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8899ac1f6b05524d11ecc7f4b90d4075",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "KD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "KD-T-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
    },
    "начальник отдела автоматизации ит": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "IT-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e970b257de10eb",
      "IT-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
    },
    "начальник отдела сопровождения 1с": {
      "1C-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e970b257de10eb",
      "1C-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
    },
    "начальник сервисной службы": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
    },
    "начальник службы логистики": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "LOG-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=94536cb31113810c11ee9a6c1e318f8c",
      "LOG-M2": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_АнализПроектныхЦенНоменклатуры",
      "LOG-M3.B": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "LOG-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8286ac1f6b05524d11e914bd38ac4343",
      "LOG-Q1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=950f6cb3111380be11ef22292bb2e007",
      "LOG-T-CLIENT-DZ": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8286ac1f6b05524d11e914bd38ac4343",
      "TMC-DELIVERIES": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=94536cb31113810c11ee9a6c1e318f8c",
    },
    "одп": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M10": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8899ac1f6b05524d11ecc7f4b90d4075",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "KD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "KD-T-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "UFG-H": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
    },
    "операционный директор": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "OD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "OD-M3.1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
    },
    "отдел вэд": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M10": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8899ac1f6b05524d11ecc7f4b90d4075",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "KD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "KD-T-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
    },
    "отдел опэоиу": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M10": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8899ac1f6b05524d11ecc7f4b90d4075",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "KD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "KD-T-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
    },
    "отдел по работе с ключевыми клиентами": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M10": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8899ac1f6b05524d11ecc7f4b90d4075",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "KD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "KD-T-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
    },
    "отдел по работе с пао \"газпром\"": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M10": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8899ac1f6b05524d11ecc7f4b90d4075",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "KD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "KD-T-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
    },
    "отдел продаж бми": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M10": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8899ac1f6b05524d11ecc7f4b90d4075",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "KD-M7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
      "KD-T-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
    },
    "председатель совета директоров / коммерческий блок": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "MRK-01": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "MRK-02": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "MRK-03": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "MRK-04": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "MRK-06": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "MRK-07": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "MRK-08": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "MRK-09": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98406cb3111380be11f17ab00f92b320",
    },
    "председатель совета директоров / мой дашборд": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "FND-T1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
      "FND-T3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "FND-T4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8709ac1f6b05524d11ec2688713a6447",
      "FND-T7": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
    },
    "руководитель гспп": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "ГСП-M5": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
    },
    "служба управления персоналом": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "HRD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
    },
    "тендерный отдел": {
      "KD-M1": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M2": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=828eac1f6b05524d11e977bbd6e9da00",
      "KD-M4": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=82afac1f6b05524d11ea069f8cb9451f",
      "KD-M6": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=8317ac1f6b05524d11ea53283b7f4471",
    },
    "технический директор": {
      "DEPT-T-PROTOCOL-OVERDUE": "e1c://server/srv1/erp_pm#e1cib/app/Обработка.ТД_COMИнтеграцияИБ",
      "TD-M3": "e1c://server/srv1/erp_pm#e1cib/data/Справочник.ВариантыОтчетов?ref=98066cb31113810e11f1535957385a30",
    },
  };

  function normDept(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLocaleLowerCase("ru-RU")
      .replace(/\s+/g, " ")
      .replace(/[«»“”„]/g, '"');
  }

  function reportUrl(kpiId, department) {
    var id = String(kpiId == null ? "" : kpiId).trim().toUpperCase();
    if (!id) return "";
    var key = normDept(department);
    if (key && REPORTS_BY_DEPT[key] && REPORTS_BY_DEPT[key][id]) {
      return REPORTS_BY_DEPT[key][id];
    }
    if (!key) return "";
    var names = Object.keys(REPORTS_BY_DEPT);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (key === name || key.indexOf(name) !== -1 || name.indexOf(key) !== -1) {
        if (REPORTS_BY_DEPT[name][id]) return REPORTS_BY_DEPT[name][id];
      }
    }
    return "";
  }

  function escapeAttr(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  var ICON =
    '<img class="onec-report-btn-icon" src="img/1c-logo.png?v=20261012-pack" alt="" draggable="false" onerror="this.style.display=\'none\';var t=this.nextElementSibling;if(t)t.hidden=false;">';

  function buttonHtml(url, label) {
    if (!url) return "";
    var caption = label ? "Открыть отчёт в 1С: " + label : "Открыть отчёт в 1С";
    return (
      '<button type="button" class="onec-report-btn" data-onec-url="' +
      escapeAttr(url) +
      '" aria-label="' +
      escapeAttr(caption) +
      '" title="Открыть в 1С">' +
      ICON +
      '<span class="onec-report-btn-text" hidden>1С</span>' +
      "</button>"
    );
  }

  function openReport(url) {
    if (!url || !/^e1c:\/\//i.test(url)) return;
    var app = global.electronApp;
    if (app && typeof app.openOnecReport === "function") {
      var creds = null;
      try {
        creds = JSON.parse(global.sessionStorage.getItem("dashboard_onec_credentials") || "null");
      } catch (err) {
        creds = null;
      }
      Promise.resolve(
        app.openOnecReport({
          url: url,
          username: creds && creds.username,
          password: creds && creds.password,
        })
      ).then(function (result) {
        if (result && result.ok === false && result.error) {
          global.alert(result.error);
        }
      });
      return;
    }
    if (app && typeof app.openExternal === "function") {
      app.openExternal(url);
      return;
    }
    var link = global.document.createElement("a");
    link.href = url;
    link.rel = "noreferrer";
    global.document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function onClick(event) {
    var btn = event.target && event.target.closest ? event.target.closest(".onec-report-btn") : null;
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    openReport(btn.getAttribute("data-onec-url"));
  }

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener("click", onClick);
  }

  global.OnecReports = {
    reportUrl: reportUrl,
    buttonHtml: buttonHtml,
    openReport: openReport,
  };
})(typeof window !== "undefined" ? window : globalThis);
