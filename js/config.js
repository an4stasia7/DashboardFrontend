/**
 * Глобальные настройки клиента (базовый URL API, пути, режим mock).
 * Подключается первым на страницах; экспорт: `global.AppConfig`.
 */
(function (global) {
  var AppConfig = {
    // API_BASE_URL: "http://192.168.5.219:8000",
    API_BASE_URL: "http://192.168.1.157:8000",

    API_LOGIN_PATH: "/api/user/login/",
    API_KPI_PATH: "/api/kpi/",
    API_KPI_ALL_PATH: "/api/kpi/all/",
    API_KPI_IMMEDIATE_SUBORDINATES_PATH: "/api/kpi/immediate-subordinates/",
    API_SEARCH_PATH: "/api/search/",
    /** Список пользователей для входа (GET без авторизации) */
    API_KPI_USERS_PATH: "/api/kpi/users/",
    AUTH_SCHEME: "Bearer ",
    LOGIN_USER_FIELD: "nickname",
    LOGIN_ALSO_SEND_USERNAME: false,
    FETCH_CREDENTIALS: "omit",
    SEND_DJANGO_CSRF_TOKEN: false,

    getApiMode: function () { return "live"; },
    setApiMode: function () {},
    isMockApi: function () { return false; },
    onReady: function (fn) { fn(); },
  };

  global.AppConfig = AppConfig;
})(typeof window !== "undefined" ? window : globalThis);
