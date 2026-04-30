/**
 * Глобальные настройки клиента (базовый URL API, пути, режим mock).
 * Подключается первым на страницах; экспорт: `global.AppConfig`.
 */
(function (global) {
  var DEFAULT_API_BASE_URL = "http://192.168.1.157:8000";
  var TECHDIR_API_BASE_URL = "http://192.168.5.9:8000";

  function normalizeUserValue(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function isTechdirUser(user) {
    if (!user || typeof user !== "object") return false;
    var nickname = normalizeUserValue(user.nickname || user.username || user.login || user.name);
    var department = normalizeUserValue(user.department || user.role);
    return nickname === "techdir" || department === "techdir";
  }

  function readStoredSessionUser() {
    var keys = ["dashboard_session", "dashboard_session_remember_backup"];
    for (var i = 0; i < keys.length; i++) {
      try {
        var storage = keys[i] === "dashboard_session_remember_backup" ? localStorage : sessionStorage;
        var raw = storage.getItem(keys[i]);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.user) return parsed.user;
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  }

  function resolveApiBaseUrl(user) {
    return isTechdirUser(user) ? TECHDIR_API_BASE_URL : DEFAULT_API_BASE_URL;
  }

  var AppConfig = {
    // API_BASE_URL: "http://192.168.5.219:8000",
    //API_BASE_URL: "http://127.0.0.1:8000/",
    API_BASE_URL: resolveApiBaseUrl(readStoredSessionUser()),
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
    API_KPI_CHAIRMAN_CATALOG_PATH: "/api/kpi/chairman/for-catalog/",
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
    resolveApiBaseUrl: resolveApiBaseUrl,
    setApiBaseUrlForUser: function (user) {
      AppConfig.API_BASE_URL = resolveApiBaseUrl(user);
      return AppConfig.API_BASE_URL;
    },
    resetApiBaseUrl: function () {
      AppConfig.API_BASE_URL = DEFAULT_API_BASE_URL;
      return AppConfig.API_BASE_URL;
    },
    onReady: function (fn) { fn(); },
  };

  global.AppConfig = AppConfig;
})(typeof window !== "undefined" ? window : globalThis);
