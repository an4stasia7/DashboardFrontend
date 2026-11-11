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

  var MONTHS = [
    ["январ", 1],
    ["феврал", 2],
    ["март", 3],
    ["апрел", 4],
    ["май", 5],
    ["июн", 6],
    ["июл", 7],
    ["август", 8],
    ["сентябр", 9],
    ["октябр", 10],
    ["ноябр", 11],
    ["декабр", 12],
  ];

  function periodFromLabel(label) {
    var text = String(label == null ? "" : label).toLocaleLowerCase("ru-RU");
    var yearMatch = text.match(/((?:19|20)\d{2})/);
    var iso = text.match(/((?:19|20)\d{2})-(\d{1,2})/);
    if (iso) {
      var isoMonth = parseInt(iso[2], 10);
      if (isoMonth >= 1 && isoMonth <= 12) {
        return { year: parseInt(iso[1], 10), month: isoMonth };
      }
    }
    if (!yearMatch) return null;
    var month = 0;
    for (var i = 0; i < MONTHS.length; i++) {
      if (text.indexOf(MONTHS[i][0]) !== -1) {
        month = MONTHS[i][1];
        break;
      }
    }
    if (!month) return null;
    return { year: parseInt(yearMatch[1], 10), month: month };
  }

  function currentDashboardPeriod() {
    var range = reportPeriodRange();
    return range ? { year: range.year, month: range.month } : null;
  }

  var COMMERCIAL_DEPTS = [
    ["отдел вэд", "49480c10-e401-11e8-8283-ac1f6b05524d"],
    ["овэд", "49480c10-e401-11e8-8283-ac1f6b05524d"],
    ["отдел внешнеэкономической деятельности", "49480c10-e401-11e8-8283-ac1f6b05524d"],
    ["отдел продаж эталонного оборудования и услуг", "34497ef7-810f-11e4-80d6-001e67112509"],
    ["опэоиу", "34497ef7-810f-11e4-80d6-001e67112509"],
    ["отдел продаж бми", "9edaa7d4-37a5-11ee-93d3-6cb31113810e"],
    ["отдел по работе с ключевыми клиентами", "639ec87b-67b6-11eb-8523-ac1f6b05524d"],
    ["отдел дилерских продаж", "7587c178-92f6-11f0-96f9-6cb31113810e"],
    ["одп", "7587c178-92f6-11f0-96f9-6cb31113810e"],
    ["отдел по работе с пао газпром", "bd7b5184-9f9c-11e4-80da-001e67112509"],
  ];
  var COMMERCIAL_GUIDS = [
    "49480c10-e401-11e8-8283-ac1f6b05524d",
    "34497ef7-810f-11e4-80d6-001e67112509",
    "9edaa7d4-37a5-11ee-93d3-6cb31113810e",
    "639ec87b-67b6-11eb-8523-ac1f6b05524d",
    "7587c178-92f6-11f0-96f9-6cb31113810e",
    "bd7b5184-9f9c-11e4-80da-001e67112509",
  ];

  function pad2(value) {
    var text = String(value);
    return text.length < 2 ? "0" + text : text;
  }

  function isoDate(year, month, day) {
    return pad2(day) + "." + pad2(month) + "." + year;
  }

  function lastDay(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function reportPeriodRange() {
    var nav = global.DashboardMonthNav;
    if (!nav || typeof nav.getPeriodState !== "function") return null;
    var state = nav.getPeriodState() || {};
    var year = parseInt(state.currentPeriodYear, 10);
    var month = parseInt(state.currentPeriodMonth, 10);
    if (!year || !month || month < 1 || month > 12) return null;
    var mode = String(state.aggregationMode || "current");
    var startMonth = month;
    var endMonth = month;
    if (mode === "quarter") {
      startMonth = Math.floor((month - 1) / 3) * 3 + 1;
    } else if (mode === "ytd") {
      startMonth = 1;
    }
    var endDay = lastDay(year, endMonth);
    var end = isoDate(year, endMonth, endDay);
    var today = new Date();
    var todayYear = today.getFullYear();
    var todayMonth = today.getMonth() + 1;
    var todayDay = today.getDate();
    var endIsFuture = year * 10000 + endMonth * 100 + endDay > todayYear * 10000 + todayMonth * 100 + todayDay;
    return {
      year: year,
      month: endMonth,
      start: isoDate(year, startMonth, 1),
      end: end,
      asof: endIsFuture ? isoDate(todayYear, todayMonth, todayDay) : end,
    };
  }

  function commercialDepartmentGuids(department) {
    var key = normDept(department);
    for (var i = 0; i < COMMERCIAL_DEPTS.length; i++) {
      if (COMMERCIAL_DEPTS[i][0] === key) return [COMMERCIAL_DEPTS[i][1]];
    }
    return COMMERCIAL_GUIDS.slice();
  }

  function liveReportContext(department) {
    var range = reportPeriodRange() || {};
    var guids = commercialDepartmentGuids(department);
    return {
      department: department || "",
      departments: guids.join(","),
      year: range.year || "",
      month: range.month || "",
      start: range.start || "",
      end: range.end || "",
      asof: range.asof || "",
    };
  }

  function buttonHtml(url, label, context) {
    if (!url) return "";
    var ctx = context || {};
    var period = null;
    if (ctx.year && ctx.month) {
      period = { year: Number(ctx.year), month: Number(ctx.month) };
    } else {
      period = periodFromLabel(ctx.periodLabel) || currentDashboardPeriod();
    }
    var caption = label ? "Открыть отчёт в 1С: " + label : "Открыть отчёт в 1С";
    return (
      '<button type="button" class="onec-report-btn" data-onec-url="' +
      escapeAttr(url) +
      '" data-onec-department="' +
      escapeAttr(ctx.department || "") +
      '" data-onec-year="' +
      escapeAttr(period && period.year ? period.year : "") +
      '" data-onec-month="' +
      escapeAttr(period && period.month ? period.month : "") +
      '" aria-label="' +
      escapeAttr(caption) +
      '" title="Открыть в 1С">' +
      ICON +
      '<span class="onec-report-btn-text" hidden>1С</span>' +
      "</button>"
    );
  }

  function openReport(url, context) {
    if (!url || !/^e1c:\/\//i.test(url)) return;
    var ctx = context || {};
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
          department: ctx.department || "",
          departments: ctx.departments || "",
          year: ctx.year || "",
          month: ctx.month || "",
          start: ctx.start || "",
          end: ctx.end || "",
          asof: ctx.asof || "",
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

  /** База, в которой открываются документы строк (та же, что у отчётов). */
  var ONEC_BASE = "e1c://server/srv1/erp_pm";
  var DOC_ATTRS = ["nav", "settlement", "order", "document", "partner"];
  var GENERIC_DOCUMENTS = {
    "": 1, "—": 1, "платёж": 1, "комиссия": 1, "взаимозачёт": 1, "отгрузка": 1, "счёт-оферта": 1,
    "договор": 1, "дозаказ": 1, "потенциальный договор": 1, "плановый платёж": 1, "заказ к отгрузке": 1,
  };

  function docTarget(target) {
    var t = target || {};
    var out = {};
    DOC_ATTRS.forEach(function (key) {
      out[key] = t[key] != null ? String(t[key]).trim() : "";
    });
    if (out.order === "?") out.order = "";
    return out;
  }

  function hasDocTarget(target) {
    var t = docTarget(target);
    if (t.nav || t.settlement || t.order) return true;
    return Boolean(t.document && !GENERIC_DOCUMENTS[t.document.toLocaleLowerCase("ru-RU")]);
  }

  function docLinkAttrs(t) {
    return DOC_ATTRS.map(function (key) {
      return t[key] ? " data-onec-" + key + '="' + escapeAttr(t[key]) + '"' : "";
    }).join("");
  }

  /** HTML названия документа: ссылка в 1С, если документ можно найти, иначе просто текст. */
  function docLinkHtml(text, target) {
    var label = String(text == null ? "" : text);
    var safe = escapeAttr(label).replace(/>/g, "&gt;");
    if (!hasDocTarget(target)) return safe;
    return (
      '<a href="#" class="onec-doc-link"' +
      docLinkAttrs(docTarget(target)) +
      ' title="Открыть в 1С (клик по названию или двойной клик по строке)">' +
      safe +
      "</a>"
    );
  }

  /** То же для ячейки, собранной через DOM. */
  function decorateDocCell(td, text, target) {
    if (!td) return;
    if (!hasDocTarget(target)) {
      td.textContent = String(text == null ? "" : text);
      return;
    }
    td.innerHTML = docLinkHtml(text, target);
  }

  function targetFromLink(link) {
    var t = {};
    DOC_ATTRS.forEach(function (key) {
      t[key] = link.getAttribute("data-onec-" + key) || "";
    });
    return t;
  }

  var lastDocOpen = { key: "", at: 0 };

  function openDocument(target, link) {
    var t = docTarget(target);
    var key = DOC_ATTRS.map(function (k) {
      return t[k];
    }).join("|");
    var now = Date.now();
    // Двойной клик по ссылке — это ещё два click: 1С открываем один раз.
    if (key === lastDocOpen.key && now - lastDocOpen.at < 2000) return;
    lastDocOpen = { key: key, at: now };
    if (t.nav) {
      openReport(ONEC_BASE + "#" + t.nav, {});
      return;
    }
    var api = global.Api;
    if (!api || typeof api.fetchOnecLink !== "function") return;
    if (link) link.classList.add("is-loading");
    api
      .fetchOnecLink({
        settlement: t.settlement,
        order_num: t.order,
        document: t.document,
        partner: t.partner,
      })
      .then(function (res) {
        if (res && res.ok && res.data && res.data.nav) {
          if (link) link.setAttribute("data-onec-nav", res.data.nav);
          openReport(ONEC_BASE + "#" + res.data.nav, {});
          return;
        }
        lastDocOpen = { key: "", at: 0 };
        global.alert((res && res.error) || "Документ в 1С не найден");
      })
      .then(function () {
        if (link) link.classList.remove("is-loading");
      });
  }

  function onDocClick(event) {
    var link = event.target && event.target.closest ? event.target.closest(".onec-doc-link") : null;
    if (!link) return false;
    event.preventDefault();
    event.stopPropagation();
    openDocument(targetFromLink(link), link);
    return true;
  }

  function onDocDblClick(event) {
    if (!event.target || !event.target.closest) return;
    var row = event.target.closest("tr");
    var link = row ? row.querySelector(".onec-doc-link") : null;
    if (!link) return;
    event.preventDefault();
    if (global.getSelection) {
      var sel = global.getSelection();
      if (sel && typeof sel.removeAllRanges === "function") sel.removeAllRanges();
    }
    openDocument(targetFromLink(link), link);
  }

  function onClick(event) {
    if (onDocClick(event)) return;
    var btn = event.target && event.target.closest ? event.target.closest(".onec-report-btn") : null;
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    var department = btn.getAttribute("data-onec-department") || "";
    if (typeof global.getOnecReportDepartment === "function") {
      department = global.getOnecReportDepartment() || department;
    }
    openReport(btn.getAttribute("data-onec-url"), liveReportContext(department));
  }

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener("click", onClick);
    global.document.addEventListener("dblclick", onDocDblClick);
  }

  global.OnecReports = {
    reportUrl: reportUrl,
    buttonHtml: buttonHtml,
    openReport: openReport,
    docLinkHtml: docLinkHtml,
    decorateDocCell: decorateDocCell,
    openDocument: openDocument,
  };
})(typeof window !== "undefined" ? window : globalThis);
