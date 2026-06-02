/**
 * Глобальные настройки клиента (базовый URL API, пути, режим mock).
 * Подключается первым на страницах; экспорт: `global.AppConfig`.
 */
(function (global) {
  var AppConfig = {
    // API_BASE_URL: "http://192.168.5.219:8000",
    //API_BASE_URL: "http://127.0.0.1:8000/",
    API_BASE_URL: "http://192.168.1.157:8000",
    APP_VERSION_PATH: "/package.json",
    APP_UPDATE_ENABLED: true,
    APP_UPDATE_REMOTE_PACKAGE_URL:
      "https://raw.githubusercontent.com/an4stasia7/DashboardFrontend/master/package.json",
    APP_UPDATE_REMOTE_RELEASES_URL:
      "https://api.github.com/repos/an4stasia7/DashboardFrontend/releases/latest",
    APP_UPDATE_OPEN_URL: "https://github.com/an4stasia7/DashboardFrontend/releases/latest",
    APP_UPDATE_CHECK_INTERVAL_MS: 300000,

    API_LOGIN_PATH: "/api/user/login/",
    API_KPI_PATH: "/api/kpi/",
    API_KPI_ALL_PATH: "/api/kpi/all/",
    API_KPI_IMMEDIATE_SUBORDINATES_PATH: "/api/kpi/immediate-subordinates/",
    API_KPI_STRUCTURE_PATH: "/api/kpi/structure/",
    API_KPI_CHAIRMAN_CATALOG_PATH: "/api/kpi/chairman/for-catalog/",
    API_SEARCH_PATH: "/api/search/",
    API_ASSISTANT_CHAT_PATH: "/api/assistant/chat/",
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
