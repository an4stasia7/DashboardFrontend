/**
 * @fileoverview HTTP-клиент дашборда: вход, KPI, список пользователей, immediate-subordinates.
 * Парсинг JSON KPI (кириллические ключи «Плитки», «Графики», «Таблицы») и приведение к структурам UI.
 * Зависимости: `global.AppConfig`, для KPI — `global.Auth.getAuthHeaders()`.
 * Публикует объект `global.Api`.
 */
(function (global) {
  /** Ключи верхнего уровня в JSON ответа KPI (как в API). */
  var KPI_JSON_KEY_TILES = "\u041f\u043b\u0438\u0442\u043a\u0438";
  var KPI_JSON_KEY_CHARTS = "\u0413\u0440\u0430\u0444\u0438\u043a\u0438";
  var KPI_JSON_KEY_TABLES = "\u0422\u0430\u0431\u043b\u0438\u0446\u044b";
  var CHART_AXIS_MONTH = "\u041c\u0435\u0441\u044f\u0446";
  var CHART_AXIS_QUARTER = "\u041a\u0432\u0430\u0440\u0442\u0430\u043b";
  var CHART_SERIES_FACT = "\u0424\u0430\u043a\u0442";
  var CHART_SERIES_PLAN = "\u041f\u043b\u0430\u043d";

  function isAggregateKpiTile(item, title) {
    var kpiId = item && item.kpi_id != null ? String(item.kpi_id).trim().toUpperCase() : "";
    var badge = item && item.kpi_id != null ? String(item.kpi_id).trim() : "";
    var titleNorm = title != null ? String(title).trim().toLowerCase() : "";
    if (kpiId === "KD-AVG") return true;
    if (/^\d+\s*kpi$/i.test(badge)) return true;
    if (titleNorm.indexOf("среднее по плиткам kpi") !== -1) return true;
    if (titleNorm.indexOf("среднее по kpi") !== -1) return true;
    if (titleNorm.indexOf("сводка по паспортам") !== -1) return true;
    if (titleNorm.indexOf("rag по kpi / паспортам") !== -1) return true;
    return false;
  }

  /**
   * Журнал ответов API для окна отладки на дашборде (см. renderDebugJsonLogPanel в dashboard.js).
   */
  function pushApiDebug(sourceShort, method, url, status, body) {
    var entry = {
      at: new Date().toISOString(),
      source: sourceShort,
      method: method,
      url: url,
      status: status,
      body: body,
    };
    if (!global.__apiDebugJsonLog) global.__apiDebugJsonLog = [];
    global.__apiDebugJsonLog.push(entry);
    if (typeof global.ApiDebugLog === "function") {
      try {
        global.ApiDebugLog();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function baseUrl() {
    var c = global.AppConfig;
    var u = (c && c.API_BASE_URL) || "";
    return u.replace(/\/+$/, "");
  }

  function loginUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_LOGIN_PATH || "/api/user/login/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  function kpiUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_KPI_PATH || "/api/kpi/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  /**
   * Добавляет к URL query `department=`, если в options передано непустое подразделение.
   * @param {string} url
   * @param {{ department?: string }|null|undefined} options
   * @returns {string}
   */
  function appendQueryParams(url, options) {
    var u = url || "";
    options = options || {};
    var dept = options.department != null ? String(options.department).trim() : "";
    if (dept) {
      u += (u.indexOf("?") === -1 ? "?" : "&") + "department=" + encodeURIComponent(dept);
    }
    if (options.for != null && String(options.for).trim() !== "") {
      u += (u.indexOf("?") === -1 ? "?" : "&") + "for=" + encodeURIComponent(String(options.for).trim());
    }
    if (options.month != null) {
      u += (u.indexOf("?") === -1 ? "?" : "&") + "month=" + encodeURIComponent(String(options.month));
    }
    if (options.year != null) {
      u += (u.indexOf("?") === -1 ? "?" : "&") + "year=" + encodeURIComponent(String(options.year));
    }
    return u;
  }

  function appendDepartmentQuery(url, options) {
    return appendQueryParams(url, options);
  }

  function buildKpiUrlWithQuery(options) {
    return appendDepartmentQuery(kpiUrl(), options);
  }

  function kpiAllUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_KPI_ALL_PATH || "/api/kpi/all/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  function buildKpiAllUrlWithQuery(options) {
    return appendDepartmentQuery(kpiAllUrl(), options);
  }

  function kpiImmediateSubordinatesUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_KPI_IMMEDIATE_SUBORDINATES_PATH || "/api/kpi/immediate-subordinates/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  function kpiChairmanCatalogUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_KPI_CHAIRMAN_CATALOG_PATH || "/api/kpi/chairman/for-catalog/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  function kpiUsersUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_KPI_USERS_PATH || "/api/kpi/users/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  function searchUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_SEARCH_PATH || "/api/search/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  function buildSearchUrlWithQuery(options) {
    var url = searchUrl();
    var q = options && options.q != null ? String(options.q).trim() : "";
    var topK = options && options.top_k != null ? parseInt(String(options.top_k), 10) : 5;
    if (isNaN(topK)) topK = 5;
    topK = Math.max(1, Math.min(20, topK));
    if (q) {
      url += (url.indexOf("?") === -1 ? "?" : "&") + "q=" + encodeURIComponent(q);
    }
    url += (url.indexOf("?") === -1 ? "?" : "&") + "top_k=" + encodeURIComponent(String(topK));
    return url;
  }

  function normalizeKpiUserEntry(u) {
    if (!u || typeof u !== "object") return { nickname: "", department: "" };
    return {
      nickname: u.nickname != null ? String(u.nickname).trim() : "",
      department: u.department != null ? String(u.department).trim() : "",
    };
  }

  /**
   * GET /api/kpi/users/ — список пользователей без авторизации (страница входа).
   * @returns {Promise<{ ok: boolean, users?: Array<{nickname:string,department:string}>, count?: number, error?: string }>}
   */
  function fetchKpiUsers() {
    var cfg = global.AppConfig || {};
    if (cfg.isMockApi && cfg.isMockApi()) {
      return Promise.resolve({
        ok: true,
        users: [
          { nickname: "User1", department: "Технический директор" },
          { nickname: "User2", department: "Коммерческий директор" },
        ],
        count: 2,
      });
    }
    var url = kpiUsersUrl();
    var headers = { Accept: "application/json" };
    var fetchOpts = { method: "GET", headers: headers };
    if (cfg.FETCH_CREDENTIALS === "include") {
      fetchOpts.credentials = "include";
    }
    return fetch(url, fetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = null;
          }
          var dbgBody = data;
          if (dbgBody === null && text) {
            dbgBody = { _nonJson: text.slice(0, 2000) };
          }
          pushApiDebug("GET /api/kpi/users/", "GET", url, res.status, dbgBody);
          if (!res.ok) {
            return {
              ok: false,
              status: res.status,
              error:
                parseErrorBody(text) ||
                "Не удалось загрузить список пользователей (" + res.status + ")",
            };
          }
          var raw = Array.isArray(data && data.users) ? data.users : [];
          var users = raw.map(normalizeKpiUserEntry).filter(function (u) {
            return u.nickname;
          });
          return {
            ok: true,
            users: users,
            count: typeof data.count === "number" ? data.count : users.length,
            data: data,
          };
        });
      })
      .catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        pushApiDebug("GET /api/kpi/users/", "GET", url, 0, { _networkError: m });
        if (m.indexOf("Failed to fetch") !== -1 || m.indexOf("NetworkError") !== -1) {
          return { ok: false, error: "Нет связи с сервером (список пользователей)" };
        }
        return { ok: false, error: m || "Ошибка запроса списка пользователей" };
      });
  }

  function buildImmediateSubordinatesUrl(options) {
    var url = kpiImmediateSubordinatesUrl();
    options = options || {};
    var dept = options.department != null ? String(options.department).trim() : "";
    if (!dept) return url;
    url += (url.indexOf("?") === -1 ? "?" : "&") + "department=" + encodeURIComponent(dept);
    if (options.for != null && String(options.for).trim() !== "") {
      url += (url.indexOf("?") === -1 ? "?" : "&") + "for=" + encodeURIComponent(String(options.for).trim());
    }
    return url;
  }

  /**
   * GET /api/kpi/immediate-subordinates/?department= — прямые дочерние подразделения (один уровень).
   * @param {{ department: string }} options — родитель (обязательно)
   */
  function fetchImmediateSubordinates(options) {
    var cfg = global.AppConfig || {};
    if (cfg.isMockApi && cfg.isMockApi()) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var dept = options && options.department != null ? String(options.department).trim() : "";
    if (!dept) {
      return Promise.resolve({ ok: false, error: "Не указано подразделение (department)" });
    }
    var A = global.Auth;
    if (!A || typeof A.getAuthHeaders !== "function") {
      return Promise.resolve({ ok: false, error: "Модуль Auth не загружен" });
    }
    var authHeaders = A.getAuthHeaders();
    if (!authHeaders.Authorization) {
      return Promise.resolve({ ok: false, error: "Нет токена авторизации" });
    }
    var url = buildImmediateSubordinatesUrl({ department: dept });
    var headers = Object.assign({ Accept: "application/json" }, authHeaders);
    var fetchOpts = { method: "GET", headers: headers };
    if (cfg.FETCH_CREDENTIALS === "include") {
      fetchOpts.credentials = "include";
    }
    return fetch(url, fetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = null;
          }
          var dbgBody = data;
          if (dbgBody === null && text) {
            dbgBody = { _nonJson: text.slice(0, 2000) };
          }
          pushApiDebug("GET /api/kpi/immediate-subordinates/", "GET", url, res.status, dbgBody);
          if (res.status === 401) {
            return { ok: false, status: 401, error: "Требуется повторный вход", unauthorized: true };
          }
          if (!res.ok) {
            return {
              ok: false,
              status: res.status,
              error: parseErrorBody(text) || "Ошибка списка подчинённых (" + res.status + ")",
            };
          }
          var children = Array.isArray(data && data.immediate_children) ? data.immediate_children : [];
          return {
            ok: true,
            immediate_children: children,
            department: data && data.department,
            count: data && data.count,
            data: data,
          };
        });
      })
      .catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        pushApiDebug("GET /api/kpi/immediate-subordinates/", "GET", url, 0, { _networkError: m });
        if (m.indexOf("Failed to fetch") !== -1 || m.indexOf("NetworkError") !== -1) {
          return { ok: false, error: "Нет связи с сервером (immediate-subordinates)" };
        }
        return { ok: false, error: m || "Ошибка запроса immediate-subordinates" };
      });
  }

  function normalizeChairmanCatalogItem(item, labels, index) {
    if (!item || typeof item !== "object") return null;
    var rawId = item.id != null ? String(item.id).trim() : "";
    if (!rawId) return null;
    var labelsMap = labels && typeof labels === "object" ? labels : {};
    var rawLabel =
      item.label != null && String(item.label).trim() !== ""
        ? String(item.label).trim()
        : labelsMap[rawId] != null && String(labelsMap[rawId]).trim() !== ""
          ? String(labelsMap[rawId]).trim()
          : "";
    var aliases = Array.isArray(item.aliases)
      ? item.aliases
          .map(function (alias) {
            return alias != null ? String(alias).trim() : "";
          })
          .filter(Boolean)
      : [];
    return {
      id: rawId,
      label: rawLabel,
      aliases: aliases,
      raw: item,
      index: index,
    };
  }

  /**
   * GET /api/kpi/chairman/for-catalog/ — список доступных дашбордов для ПСД.
   * @returns {Promise<{ok:true,items:object[],labels:object,count:number,data:any}|{ok:false,error:string,status?:number,unauthorized?:boolean,skipped?:boolean}>}
   */
  function fetchChairmanDashboardCatalog() {
    var cfg = global.AppConfig || {};
    if (cfg.isMockApi && cfg.isMockApi()) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var A = global.Auth;
    if (!A || typeof A.getAuthHeaders !== "function") {
      return Promise.resolve({ ok: false, error: "Модуль Auth не загружен" });
    }
    var authHeaders = A.getAuthHeaders();
    if (!authHeaders.Authorization) {
      return Promise.resolve({ ok: false, error: "Нет токена авторизации" });
    }
    var url = kpiChairmanCatalogUrl();
    var headers = Object.assign({ Accept: "application/json" }, authHeaders);
    var fetchOpts = { method: "GET", headers: headers };
    if (cfg.FETCH_CREDENTIALS === "include") {
      fetchOpts.credentials = "include";
    }
    return fetch(url, fetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = null;
          }
          var dbgBody = data;
          if (dbgBody === null && text) {
            dbgBody = { _nonJson: text.slice(0, 2000) };
          }
          pushApiDebug("GET /api/kpi/chairman/for-catalog/", "GET", url, res.status, dbgBody);
          if (res.status === 401) {
            return { ok: false, status: 401, error: "Требуется повторный вход", unauthorized: true };
          }
          if (!res.ok) {
            return {
              ok: false,
              status: res.status,
              error: parseErrorBody(text) || "Ошибка каталога дашбордов ПСД (" + res.status + ")",
            };
          }
          var labels = data && typeof data.labels === "object" && data.labels ? data.labels : {};
          var rawItems = Array.isArray(data && data.items) ? data.items : [];
          var items = rawItems
            .map(function (item, index) {
              return normalizeChairmanCatalogItem(item, labels, index);
            })
            .filter(Boolean);
          return {
            ok: true,
            items: items,
            labels: labels,
            count: typeof data === "object" && data && typeof data.count === "number" ? data.count : items.length,
            data: data,
          };
        });
      })
      .catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        pushApiDebug("GET /api/kpi/chairman/for-catalog/", "GET", url, 0, { _networkError: m });
        if (m.indexOf("Failed to fetch") !== -1 || m.indexOf("NetworkError") !== -1) {
          return { ok: false, error: "Нет связи с сервером (каталог ПСД)" };
        }
        return { ok: false, error: m || "Ошибка запроса каталога ПСД" };
      });
  }

  /**
   * Параметры `month` / `year` из query KPI URL (совпадают с тем, что передали в fetchKpis / fetchKpiAll).
   * @param {string} url
   * @returns {{ year: number|null, month: number|null }}
   */
  function parseMonthYearFromKpiUrl(url) {
    if (url == null || String(url).trim() === "") return { year: null, month: null };
    try {
      var base =
        typeof window !== "undefined" && window.location && window.location.href
          ? window.location.href
          : "http://local/";
      var u = new URL(String(url), base);
      var mStr = u.searchParams.get("month");
      var yStr = u.searchParams.get("year");
      var m = mStr != null && String(mStr).trim() !== "" ? parseInt(String(mStr), 10) : NaN;
      var y = yStr != null && String(yStr).trim() !== "" ? parseInt(String(yStr), 10) : NaN;
      var month = !isNaN(m) && m >= 1 && m <= 12 ? m : null;
      var year = !isNaN(y) ? y : null;
      return { year: year, month: month };
    } catch (e) {
      return { year: null, month: null };
    }
  }

  /**
   * Извлекает `?for=` из URL запроса KPI.
   * @param {string} url
   * @returns {string}
   */
  function parseForFromKpiUrl(url) {
    if (url == null || String(url).trim() === "") return "";
    try {
      var base =
        typeof window !== "undefined" && window.location && window.location.href
          ? window.location.href
          : "http://local/";
      var u = new URL(String(url), base);
      var v = u.searchParams.get("for");
      return v != null ? String(v).trim() : "";
    } catch (e) {
      return "";
    }
  }

  /**
   * true, если у объекта есть хотя бы одно KPI-поле верхнего уровня.
   * @param {any} obj
   * @returns {boolean}
   */
  function hasKpiStructureKeys(obj) {
    return !!(
      obj &&
      typeof obj === "object" &&
      (obj[KPI_JSON_KEY_TILES] || obj[KPI_JSON_KEY_CHARTS] || obj[KPI_JSON_KEY_TABLES])
    );
  }

  /**
   * Разворачивает обёртку `{ departments: [ { for, Плитки, Графики, Таблицы, ... } ] }` в плоский объект.
   * Выбор элемента: сначала по `?for=` из URL, иначе первый со структурой KPI, иначе первый.
   * @param {object|null} body
   * @param {string} [url]
   * @returns {object|null}
   */
  function unwrapKpiResponseBody(body, url) {
    if (!body || typeof body !== "object") return body;
    if (hasKpiStructureKeys(body)) return body;
    var deps = body.departments;
    if (!Array.isArray(deps) || !deps.length) return body;
    var forParam = parseForFromKpiUrl(url || "");
    var matched = null;
    if (forParam) {
      for (var i = 0; i < deps.length; i++) {
        var item = deps[i];
        if (!item || typeof item !== "object") continue;
        var itemFor = item.for != null ? String(item.for).trim() : "";
        if (itemFor && itemFor === forParam) {
          matched = item;
          break;
        }
      }
    }
    if (!matched) {
      for (var j = 0; j < deps.length; j++) {
        if (hasKpiStructureKeys(deps[j])) {
          matched = deps[j];
          break;
        }
      }
    }
    if (!matched) matched = deps[0];
    return matched || body;
  }

  /**
   * Единая постобработка успешного JSON KPI: плитки, графики, таблица план/факт, подстановка план/факт на плитки.
   * @param {object|null} data — распарсенное тело ответа GET /api/kpi/ или /api/kpi/all/
   * @param {string} [requestUrl] — полный URL запроса (для выбора месяца план/факт по ?month=&year=)
   * @returns {{ tiles: object[], chartIndicators: object, tableRows: object[], unwrappedData: object|null }}
   */
  function processKpiResponseBody(data, requestUrl) {
    var body = unwrapKpiResponseBody(data, requestUrl || "");
    var tiles = normalizeKpiListFromApiResponse(body);
    var qp = parseMonthYearFromKpiUrl(requestUrl || "");
    applyPlanFactFromJsonLastPeriodToTiles(body, tiles, qp.year, qp.month);
    return {
      tiles: tiles,
      chartIndicators: buildChartIndicatorsFromApiResponse(body),
      tableRows: buildTableRowsFromApiResponse(body),
      unwrappedData: body,
    };
  }

  /**
   * То же, что `processKpiResponseBody`, но с явным выбором периода.
   * Используется на клиенте для локального переключения месяца без нового запроса.
   */
  function processKpiResponseBodyAtPeriod(data, year, month) {
    var body = unwrapKpiResponseBody(data, "");
    var tiles = normalizeKpiListFromApiResponse(body);
    applyPlanFactFromJsonLastPeriodToTiles(body, tiles, year, month);
    return {
      tiles: tiles,
      chartIndicators: buildChartIndicatorsFromApiResponse(body),
      tableRows: buildTableRowsFromApiResponse(body),
      unwrappedData: body,
    };
  }

  /**
   * Авторизованный GET по полному URL KPI; при успехе добавляет поля из processKpiResponseBody().
   * @param {string} url
   * @returns {Promise<object>}
   */
  function performKpiGet(url) {
    var cfg = global.AppConfig || {};
    if (cfg.isMockApi && cfg.isMockApi()) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var A = global.Auth;
    if (!A || typeof A.getAuthHeaders !== "function") {
      return Promise.resolve({ ok: false, error: "Модуль Auth не загружен" });
    }
    var authHeaders = A.getAuthHeaders();
    if (!authHeaders.Authorization) {
      return Promise.resolve({ ok: false, error: "Нет токена авторизации" });
    }
    var headers = Object.assign({ Accept: "application/json" }, authHeaders);
    var fetchOpts = { method: "GET", headers: headers };
    if (cfg.FETCH_CREDENTIALS === "include") {
      fetchOpts.credentials = "include";
    }
    return fetch(url, fetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = null;
          }
          var dbgBody = data;
          if (dbgBody === null && text) {
            dbgBody = { _nonJson: text.slice(0, 2000) };
          }
          var src =
            url.indexOf("/kpi/all") !== -1 || url.indexOf("kpi/all") !== -1
              ? "GET /api/kpi/all/"
              : "GET /api/kpi/";
          pushApiDebug(src, "GET", url, res.status, dbgBody);
          if (res.status === 401) {
            return { ok: false, status: 401, error: "Требуется повторный вход", unauthorized: true };
          }
          if (!res.ok) {
            return {
              ok: false,
              status: res.status,
              error: parseErrorBody(text) || "Ошибка KPI (" + res.status + ")",
            };
          }
          var processed = processKpiResponseBody(data, url);
          var unwrapped = processed.unwrappedData || data;
          delete processed.unwrappedData;
          return Object.assign({ ok: true, data: unwrapped, raw: data }, processed);
        });
      })
      .catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        var src =
          url.indexOf("/kpi/all") !== -1 || url.indexOf("kpi/all") !== -1
            ? "GET /api/kpi/all/"
            : "GET /api/kpi/";
        pushApiDebug(src, "GET", url, 0, { _networkError: m });
        if (m.indexOf("Failed to fetch") !== -1 || m.indexOf("NetworkError") !== -1) {
          return { ok: false, error: "Нет связи с сервером (KPI)" };
        }
        return { ok: false, error: m || "Ошибка запроса KPI" };
      });
  }

  /**
   * Приводит ответ API к формату плиток дашборда.
   * Ожидаемый формат: `body[KPI_JSON_KEY_TILES].items` — массив объектов с полями
   * `kpi_id`, `name`, `kpi_pct` / `kpi_pst`, `color`, `period`, `thresholds`, опционально `plan`, `fact`, `has_data`.
   * @param {object|null} body
   * @returns {object[]}
   */
  function normalizeKpiListFromApiResponse(body) {
    if (body == null) return [];
    var items = body[KPI_JSON_KEY_TILES] && body[KPI_JSON_KEY_TILES].items;
    if (!Array.isArray(items) || !items.length) return [];
    return items
      .map(function (item) {
        if (!item || typeof item !== "object") return null;
        var title = item.name != null ? String(item.name) : "";
        if (!title && item.kpi_id != null) title = String(item.kpi_id);
        if (!title) return null;
        if (isAggregateKpiTile(item, title)) return null;
        var pct =
          typeof item.kpi_pst === "number" && !isNaN(item.kpi_pst)
            ? item.kpi_pst
            : typeof item.kpi_pct === "number" && !isNaN(item.kpi_pct)
              ? item.kpi_pct
              : null;
        var color = item.color != null ? String(item.color).toLowerCase().trim() : null;
        var th = item.thresholds && typeof item.thresholds === "object" ? item.thresholds : {};
        var hint =
          item.description != null
            ? String(item.description)
            : item.hint != null
              ? String(item.hint)
              : item.comment != null
                ? String(item.comment)
                : "";
        function thStr(obj, key, flatKey) {
          if (obj[key] != null) return String(obj[key]);
          if (flatKey != null && item[flatKey] != null) return String(item[flatKey]);
          return null;
        }
        function firstStringValue(keys) {
          for (var ki = 0; ki < keys.length; ki++) {
            var key = keys[ki];
            if (item[key] == null) continue;
            var value = String(item[key]).trim();
            if (value) return value;
          }
          return "";
        }
        var formulaSrc = item.formula != null ? item.formula : th.formula;
        var hasData = typeof item.has_data === "boolean" ? item.has_data : undefined;
        var units = firstStringValue(["units", "unit", "uom", "measure_unit", "measurement_unit"]);
        var frequency = firstStringValue(["frequency", "periodicity", "update_frequency", "frequency_label"]);
        var cacheUpdatedAt = firstStringValue(["cache_updated_at"]);
        return {
          kpi_id: item.kpi_id != null ? String(item.kpi_id) : "",
          title: title,
          badge: item.kpi_id != null ? String(item.kpi_id) : "KPI",
          period: item.period != null ? String(item.period) : "",
          units: units,
          frequency: frequency,
          cache_updated_at: cacheUpdatedAt,
          formula: formulaSrc != null ? String(formulaSrc) : null,
          plan_fact_period_label:
            item.plan_fact_period_label != null
              ? String(item.plan_fact_period_label)
              : null,
          monthly_data: Array.isArray(item.monthly_data) ? item.monthly_data : [],
          percent: pct,
          kpi_pst: typeof item.kpi_pst === "number" && !isNaN(item.kpi_pst) ? item.kpi_pst : null,
          kpi_pct: typeof item.kpi_pct === "number" && !isNaN(item.kpi_pct) ? item.kpi_pct : null,
          plan: item.plan,
          fact: item.fact,
          found: item.found != null ? item.found : null,
          won: item.won != null ? item.won : null,
          not_participating:
            item.not_participating != null ? item.not_participating : null,
          status_counts:
            item.status_counts && typeof item.status_counts === "object"
              ? item.status_counts
              : null,
          // FND-T3 «Соотношение ДЗ и КЗ» — клиенты/поставщики + общий итог.
          dz_client: item.dz_client != null ? item.dz_client : null,
          kz_client: item.kz_client != null ? item.kz_client : null,
          dz_supplier: item.dz_supplier != null ? item.dz_supplier : null,
          kz_supplier: item.kz_supplier != null ? item.kz_supplier : null,
          dz_total: item.dz_total != null ? item.dz_total : null,
          kz_total: item.kz_total != null ? item.kz_total : null,
          portfolio_count: item.portfolio_count != null ? item.portfolio_count : null,
          deviation_count: item.deviation_count != null ? item.deviation_count : null,
          pct_client: item.pct_client != null ? item.pct_client : null,
          pct_supplier: item.pct_supplier != null ? item.pct_supplier : null,
          pct_total: item.pct_total != null ? item.pct_total : null,
          has_data: hasData,
          hint: hint,
          rag: color,
          green_threshold: thStr(th, "green", "green_threshold"),
          yellow_threshold: thStr(th, "yellow", "yellow_threshold"),
          red_threshold: thStr(th, "red", "red_threshold"),
          blue_threshold: thStr(th, "blue", "blue_threshold"),
        };
      })
      .filter(Boolean);
  }

  /* ── Построение индикаторов для графиков из raw API ── */

  var MONTH_SHORT = ["\u042f\u043d\u0432", "\u0424\u0435\u0432", "\u041c\u0430\u0440", "\u0410\u043f\u0440", "\u041c\u0430\u0439", "\u0418\u044e\u043d", "\u0418\u044e\u043b", "\u0410\u0432\u0433", "\u0421\u0435\u043d", "\u041e\u043a\u0442", "\u041d\u043e\u044f", "\u0414\u0435\u043a"];

  function classifyChartType(raw) {
    if (raw == null) return null;
    var s = String(raw).toLowerCase();
    if (s.indexOf("line") !== -1 || s.indexOf("multi_line") !== -1) return "line";
    if (s.indexOf("column") !== -1 || s.indexOf("waterfall") !== -1) return "bar";
    if (s.indexOf("donut") !== -1 || s.indexOf("pie") !== -1) return "donut";
    return null;
  }

  function arrayFromValue(value) {
    if (Array.isArray(value)) return value.slice();
    if (value && typeof value === "object") return [value];
    return [];
  }

  function getChartSeriesList(chart) {
    if (!chart || typeof chart !== "object") return [];
    return arrayFromValue(chart.series);
  }

  function getSeriesPointsList(series) {
    if (!series || typeof series !== "object") return [];
    return arrayFromValue(series.points);
  }

  function getTableRowsList(tab) {
    if (!tab) return [];
    if (Array.isArray(tab && tab.rows)) return tab.rows.slice();
    if (tab && tab.rows && typeof tab.rows === "object") return [tab.rows];
    if (Array.isArray(tab)) return tab.slice();
    if (tab && typeof tab === "object" && !Object.prototype.hasOwnProperty.call(tab, "rows")) {
      return [tab];
    }
    return [];
  }

  function numberOrNull(v) {
    if (v == null) return null;
    if (typeof v === "string" && String(v).trim() === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function buildBarIndicatorsFromSeries(chart, series, name) {
    var explicitCategories = Array.isArray(series.categories) ? series.categories.slice() : [];
    var explicitPlan = Array.isArray(series.plan) ? series.plan.slice() : [];
    var explicitFact = Array.isArray(series.fact) ? series.fact.slice() : [];
    var points = getSeriesPointsList(series);
    var hasExplicitMonthlyArrays =
      explicitCategories.length > 0 && (explicitPlan.length > 0 || explicitFact.length > 0);

    if (hasExplicitMonthlyArrays) {
      var maxLen = explicitCategories.length;
      if (explicitPlan.length > maxLen) maxLen = explicitPlan.length;
      if (explicitFact.length > maxLen) maxLen = explicitFact.length;
      if (points.length > maxLen) maxLen = points.length;

      var indicators = [];

      for (var i = 0; i < maxLen; i++) {
        var srcPoint = points[i] && typeof points[i] === "object" ? points[i] : null;
        var category =
          explicitCategories[i] != null && String(explicitCategories[i]).trim() !== ""
            ? String(explicitCategories[i]).trim()
            : srcPoint && srcPoint.name != null && String(srcPoint.name).trim() !== ""
              ? String(srcPoint.name).trim()
              : String(i + 1);
        var planValue = explicitPlan[i];
        var factValue = explicitFact[i];
        var point = srcPoint ? Object.assign({}, srcPoint) : {};
        if (point.name == null) point.name = category;
        if (point.plan == null && planValue !== undefined) point.plan = planValue;
        if (point.fact == null && factValue !== undefined) point.fact = factValue;
        indicators.push({
          id: point.kpi_id || (series.kpi_id || name) + ":" + String(i),
          optionLabel: category,
          title: category,
          xAxisTitle: "Показатель",
          yAxisTitle: "Значение",
          categories: [category],
          points: [point],
          plan: [numberOrNull(point.plan)],
          fact: [numberOrNull(point.fact)],
        });
      }

      return indicators;
    }

    if (!points.length) return [];
    var sortedQ = points.slice().sort(function (a, b) { return (a.quarter || 0) - (b.quarter || 0); });
    var ROMAN_Q = ["I кв.", "II кв.", "III кв.", "IV кв."];
    return [{
      id: series.kpi_id || name,
      optionLabel: name,
      title: name,
      xAxisTitle: CHART_AXIS_QUARTER,
      yAxisTitle: "Значение",
      categories: sortedQ.map(function (p) { return ROMAN_Q[(p.quarter || 1) - 1] || (p.quarter + " кв."); }),
      points: sortedQ,
      plan: sortedQ.map(function (p) { return numberOrNull(p.plan); }),
      fact: sortedQ.map(function (p) { return numberOrNull(p.fact); }),
    }];
  }

  function parseIntLoose(v) {
    if (typeof v === "number" && !isNaN(v)) return v;
    if (v == null || v === "") return NaN;
    var n = parseInt(String(v), 10);
    return isNaN(n) ? NaN : n;
  }

  /** Ключ для сравнения месяцев: year * 100 + month; иначе -1. */
  function monthlyPointSortKey(p) {
    if (!p) return -1;
    var y = parseIntLoose(p.year);
    var m = parseIntLoose(p.month);
    if (!isNaN(y) && !isNaN(m)) return y * 100 + m;
    if (!isNaN(m)) return m;
    return -1;
  }

  function planFactValuePresent(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === "number") return !isNaN(v);
    if (typeof v === "string") return String(v).trim() !== "";
    return true;
  }

  function planFactPointHasBoth(p) {
    return p && planFactValuePresent(p.plan) && planFactValuePresent(p.fact);
  }

  function capitalizeRuMonthToken(s) {
    if (s == null || !String(s).trim()) return "";
    var t = String(s).trim();
    var first = t.charAt(0);
    var upper =
      typeof first.toLocaleUpperCase === "function"
        ? first.toLocaleUpperCase("ru-RU")
        : first.toUpperCase();
    return upper + t.slice(1).toLowerCase();
  }

  /** Подпись периода для плитки: месяц и год из точки линейного графика. */
  function formatPlanFactPeriodFromMonthlyPoint(p) {
    if (!p) return "";
    if (p.month_name != null && String(p.month_name).trim()) {
      var mn = capitalizeRuMonthToken(p.month_name);
      var y = parseIntLoose(p.year);
      return !isNaN(y) ? mn + " " + y : mn;
    }
    var m = parseIntLoose(p.month);
    var y = parseIntLoose(p.year);
    if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
      return capitalizeRuMonthToken(MONTH_SHORT[m - 1]) + " " + y;
    }
    return "";
  }

  var ROMAN_Q = ["I", "II", "III", "IV"];

  function formatPlanFactPeriodFromQuarterPoint(p) {
    if (!p) return "";
    var y = parseIntLoose(p.year);
    var q = parseIntLoose(p.quarter);
    if (!isNaN(y) && !isNaN(q) && q >= 1 && q <= 4) {
      return (ROMAN_Q[q - 1] || String(q)) + " кв. " + y;
    }
    return "";
  }

  function formatPlanFactPeriodFromKpiPeriod(kp) {
    if (!kp || typeof kp !== "object") return "";
    if (kp.month_name != null && String(kp.month_name).trim()) {
      var mn = capitalizeRuMonthToken(kp.month_name);
      var y = parseIntLoose(kp.year);
      return !isNaN(y) ? mn + " " + y : mn;
    }
    var m = parseIntLoose(kp.month);
    var y = parseIntLoose(kp.year);
    if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
      return capitalizeRuMonthToken(MONTH_SHORT[m - 1]) + " " + y;
    }
    var q = parseIntLoose(kp.quarter);
    if (!isNaN(y) && !isNaN(q) && q >= 1 && q <= 4) {
      return (ROMAN_Q[q - 1] || String(q)) + " кв. " + y;
    }
    return "";
  }

  function formatPlanFactPeriodFromYearMonth(year, month) {
    var y = parseIntLoose(year);
    var m = parseIntLoose(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return "";
    return capitalizeRuMonthToken(MONTH_SHORT[m - 1]) + " " + y;
  }

  function kpiPeriodMatchesMonthYear(kp, year, month) {
    if (!kp || typeof kp !== "object") return false;
    var y = parseIntLoose(kp.year);
    var m = parseIntLoose(kp.month);
    return !isNaN(y) && !isNaN(m) && y === parseIntLoose(year) && m === parseIntLoose(month);
  }

  /**
   * Точка линейного графика за конкретный календарный месяц (и plan, и fact).
   * @param {object[]} points
   * @param {number} year
   * @param {number} month 1–12
   */
  function pickMonthlyPointWithPlanAndFactForYearMonth(points, year, month) {
    if (!points || !points.length || year == null || month == null) return null;
    var target = year * 100 + month;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!planFactPointHasBoth(p)) continue;
      if (monthlyPointSortKey(p) === target) return p;
    }
    return null;
  }

  /**
   * Самый поздний календарный месяц, у которого в точке заданы и plan, и fact.
   */
  function pickLatestMonthlyPointWithPlanAndFact(points) {
    if (!points || !points.length) return null;
    var best = null;
    var bestKey = -1;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!planFactPointHasBoth(p)) continue;
      var k = monthlyPointSortKey(p);
      if (k < 0) continue;
      if (k >= bestKey) {
        bestKey = k;
        best = p;
      }
    }
    return best;
  }

  function quarterPointSortKey(p) {
    if (!p) return -1;
    var y = parseIntLoose(p.year);
    var q = parseIntLoose(p.quarter);
    var yy = isNaN(y) ? 0 : y;
    var qq = isNaN(q) ? 0 : q;
    return yy * 10 + qq;
  }

  function pickLatestQuarterPointWithPlanAndFact(points) {
    if (!points || !points.length) return null;
    var best = null;
    var bestKey = -1;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!planFactPointHasBoth(p)) continue;
      var k = quarterPointSortKey(p);
      if (k >= bestKey) {
        bestKey = k;
        best = p;
      }
    }
    return best;
  }

  function chartPlanFactEntryComplete(entry) {
    return entry && planFactValuePresent(entry.plan) && planFactValuePresent(entry.fact);
  }

  /** Логическое объединение флагов достоверности данных (таблицы / точки графика). */
  function mergeHasDataFlags(a, b) {
    if (a === false || b === false) return false;
    if (a === true || b === true) return true;
    return undefined;
  }

  /**
   * Флаг has_data с точки и серии графика: `false` — сгенерированные данные.
   * @param {object|null|undefined} point
   * @param {object|null|undefined} series
   * @returns {boolean|undefined}
   */
  function hasDataFromPointAndSeries(point, series) {
    var hp = point && typeof point.has_data === "boolean" ? point.has_data : undefined;
    var hs = series && typeof series.has_data === "boolean" ? series.has_data : undefined;
    return mergeHasDataFlags(hp, hs);
  }

  /**
   * План/факт по kpi_id из Графики: при заданных `filterYear`+`filterMonth`
   * берётся только точка этого месяца; иначе — последний месяц, где есть и plan, и fact.
   * Квартальная fallback-логика используется только без месячного фильтра.
   * @param {object|null} body
   * @param {number|null} [filterYear]
   * @param {number|null} [filterMonth] 1–12
   */
  function buildPlanFactFromChartsLastAvailable(body, filterYear, filterMonth) {
    var out = {};
    if (!body) return out;
    var charts = body[KPI_JSON_KEY_CHARTS];
    if (!charts || typeof charts !== "object") return out;

    var useMonthFilter =
      filterYear != null &&
      filterMonth != null &&
      !isNaN(filterYear) &&
      !isNaN(filterMonth) &&
      filterMonth >= 1 &&
      filterMonth <= 12;

    Object.keys(charts).forEach(function (key) {
      var chart = charts[key];
      var seriesList = getChartSeriesList(chart);
      if (!chart || !chart.chart_type || !seriesList.length) return;
      if (classifyChartType(chart.chart_type) !== "line") return;
      seriesList.forEach(function (s) {
        var points = getSeriesPointsList(s);
        if (!s || s.kpi_id == null || !points.length) return;
        var kid = String(s.kpi_id);
        var last = useMonthFilter
          ? pickMonthlyPointWithPlanAndFactForYearMonth(points, filterYear, filterMonth)
          : pickLatestMonthlyPointWithPlanAndFact(points);
        if (!last) return;
        var pk = monthlyPointSortKey(last);
        var prev = out[kid];
        var prevK = prev && prev._pk != null ? prev._pk : -1;
        if (pk >= prevK) {
          out[kid] = {
            plan: last.plan,
            fact: last.fact,
            plan_fact_period_label: formatPlanFactPeriodFromMonthlyPoint(last),
            has_data: hasDataFromPointAndSeries(last, s),
            _pk: pk,
          };
        }
      });
    });

    Object.keys(charts).forEach(function (keyBar) {
      if (useMonthFilter) return;
      var chart = charts[keyBar];
      var seriesList = getChartSeriesList(chart);
      if (!chart || !chart.chart_type || !seriesList.length) return;
      if (classifyChartType(chart.chart_type) !== "bar") return;
      seriesList.forEach(function (s) {
        var points = getSeriesPointsList(s);
        if (!s || s.kpi_id == null || !points.length) return;
        var kid = String(s.kpi_id);
        if (chartPlanFactEntryComplete(out[kid])) return;
        var last = pickLatestQuarterPointWithPlanAndFact(points);
        if (!last) return;
        var qk = quarterPointSortKey(last);
        var cur = out[kid];
        var prevQ = cur && cur._qk != null ? cur._qk : -1;
        if (qk >= prevQ) {
          out[kid] = {
            plan: last.plan,
            fact: last.fact,
            plan_fact_period_label: formatPlanFactPeriodFromQuarterPoint(last),
            has_data: hasDataFromPointAndSeries(last, s),
            _qk: qk,
          };
        }
      });
    });

    Object.keys(out).forEach(function (kid) {
      delete out[kid]._pk;
      delete out[kid]._qk;
    });
    return out;
  }

  /**
   * Обход строк body["Таблицы"]: значение по ключу — { rows: [...] } или сразу массив строк.
   * @param {object|null|undefined} tables
   * @param {function(string tabKey, object row): void} fn
   */
  function forEachTablesRow(tables, fn) {
    if (!tables || typeof tables !== "object") return;
    Object.keys(tables).forEach(function (tk) {
      var tab = tables[tk];
      var rows = getTableRowsList(tab);
      if (!rows || !rows.length) return;
      for (var i = 0; i < rows.length; i++) {
        fn(tk, rows[i]);
      }
    });
  }

  /** Только блоки Таблицы: plan/fact по строкам (например сводка за период). */
  function buildPlanFactLookupFromTablesOnly(body, filterYear, filterMonth) {
    var planFactLookup = {};
    if (!body) return planFactLookup;
    var tables = body[KPI_JSON_KEY_TABLES];
    var useMonthFilter =
      filterYear != null &&
      filterMonth != null &&
      !isNaN(filterYear) &&
      !isNaN(filterMonth) &&
      filterMonth >= 1 &&
      filterMonth <= 12;
    forEachTablesRow(tables, function (tk, row) {
      if (!row || typeof row !== "object") return;
      var id = row.kpi_id != null ? String(row.kpi_id) : row.kpi_name != null ? String(row.kpi_name) : "";
      if (!id) return;
      if (useMonthFilter) {
        if (!row.kpi_period || !kpiPeriodMatchesMonthYear(row.kpi_period, filterYear, filterMonth)) return;
      }
      if (row.plan !== undefined || row.fact !== undefined) {
        var prev = planFactLookup[id] || {};
        var periodLbl = "";
        if (row.kpi_period && typeof row.kpi_period === "object") {
          periodLbl = formatPlanFactPeriodFromKpiPeriod(row.kpi_period);
        }
        var rowHd = typeof row.has_data === "boolean" ? row.has_data : undefined;
        planFactLookup[id] = {
          plan: row.plan !== undefined ? row.plan : prev.plan,
          fact: row.fact !== undefined ? row.fact : prev.fact,
          plan_fact_period_label: periodLbl || prev.plan_fact_period_label,
          has_data: mergeHasDataFlags(prev.has_data, rowHd),
        };
      }
    });
    return planFactLookup;
  }

  /**
   * Переносит `has_data` с источника план/факт на плитку; `false` на плитке не перезаписывается в `true`.
   * @param {object} tile
   * @param {{ has_data?: boolean }|null|undefined} src
   */
  function applyHasDataFromSource(tile, src) {
    if (!src || typeof src.has_data !== "boolean") return;
    if (src.has_data === false) {
      tile.has_data = false;
      return;
    }
    if (src.has_data === true && tile.has_data !== false) {
      tile.has_data = true;
    }
  }

  /**
   * Дополняет плитки полями `plan`, `fact`, подписью периода и `has_data` из «Графики» / «Таблицы» (приоритет — график).
   * @param {object|null} body — сырой JSON KPI
   * @param {object[]} tiles — уже нормализованные плитки (мутируются на месте)
   */
  function applyPlanFactFromJsonLastPeriodToTiles(body, tiles, filterYear, filterMonth) {
    if (!body || !tiles || !tiles.length) return;
    var useMonthFilter =
      filterYear != null &&
      filterMonth != null &&
      !isNaN(filterYear) &&
      !isNaN(filterMonth) &&
      filterMonth >= 1 &&
      filterMonth <= 12;
    var requestedPeriodLabel = useMonthFilter
      ? formatPlanFactPeriodFromYearMonth(filterYear, filterMonth)
      : "";
    var fromCharts = buildPlanFactFromChartsLastAvailable(body, filterYear, filterMonth);
    var fromTables = buildPlanFactLookupFromTablesOnly(body, filterYear, filterMonth);
    tiles.forEach(function (tile) {
      var id = tile.kpi_id;
      if (!id) return;
      var ch = fromCharts[id];
      var tb = fromTables[id];
      var chartBoth =
        ch && planFactValuePresent(ch.plan) && planFactValuePresent(ch.fact);
      var tableBoth =
        tb && planFactValuePresent(tb.plan) && planFactValuePresent(tb.fact);
      if (chartBoth) {
        tile.plan = ch.plan;
        tile.fact = ch.fact;
        if (ch.plan_fact_period_label) tile.plan_fact_period_label = String(ch.plan_fact_period_label);
        applyHasDataFromSource(tile, ch);
      } else if (tableBoth) {
        tile.plan = tb.plan;
        tile.fact = tb.fact;
        if (tb.plan_fact_period_label) tile.plan_fact_period_label = String(tb.plan_fact_period_label);
        applyHasDataFromSource(tile, tb);
      } else {
        if (ch) {
          if (planFactValuePresent(ch.plan)) tile.plan = ch.plan;
          if (planFactValuePresent(ch.fact)) tile.fact = ch.fact;
          applyHasDataFromSource(tile, ch);
        }
        if (tb) {
          if (planFactValuePresent(tb.plan)) tile.plan = tb.plan;
          if (planFactValuePresent(tb.fact)) tile.fact = tb.fact;
          applyHasDataFromSource(tile, tb);
        }
      }
      if (
        useMonthFilter &&
        requestedPeriodLabel &&
        (planFactValuePresent(tile.plan) || planFactValuePresent(tile.fact))
      ) {
        tile.plan_fact_period_label = requestedPeriodLabel;
      }
    });
  }

  /**
   * Из body["Графики"] строит индикаторы для графиков.
   * chart_type: "multi_line_plan_fact_monthly" → line, "column_plan_fact_waterfall_quarterly" → bar.
   * Каждый series внутри графика = отдельный переключаемый показатель.
   */
  function buildChartIndicatorsFromApiResponse(body) {
    var out = { line: [], bar: [], donut: [] };
    if (!body) return out;
    var charts = body[KPI_JSON_KEY_CHARTS];
    if (!charts || typeof charts !== "object") return out;

    Object.keys(charts).forEach(function (key) {
      var chart = charts[key];
      var seriesList = getChartSeriesList(chart);
      if (!chart || !chart.chart_type || !seriesList.length) return;
      var target = classifyChartType(chart.chart_type);
      if (!target) return;

      seriesList.forEach(function (s) {
        var points = getSeriesPointsList(s);
        if (!s || (!points.length && !Array.isArray(s.categories))) return;
        var name = s.name || s.kpi_id || "KPI";
        if (isAggregateKpiTile(s, name)) return;

        if (target === "line") {
          if (!points.length) return;
          var sorted = points.slice().sort(function (a, b) { return (a.month || 0) - (b.month || 0); });
          var categories = sorted.map(function (p) {
            if (p.month_name) {
              var mn = String(p.month_name);
              return mn.charAt(0).toUpperCase() + mn.slice(1, 3);
            }
            return MONTH_SHORT[(p.month || 1) - 1] || String(p.month);
          });
          out.line.push({
            id: s.kpi_id || name,
            optionLabel: name,
            title: name,
            xAxisTitle: CHART_AXIS_MONTH,
            yAxisTitle: "Значение",
            categories: categories,
            points: sorted,
            series: [
              { name: CHART_SERIES_FACT, data: sorted.map(function (p) { return p.fact != null ? Number(p.fact) : null; }), color: "#2b5ca6" },
              { name: CHART_SERIES_PLAN, data: sorted.map(function (p) { return p.plan != null ? Number(p.plan) : null; }), color: "#c8d6ee", dashStyle: "Dash" },
            ],
          });
        } else if (target === "bar") {
          var barIndicators = buildBarIndicatorsFromSeries(chart, s, name);
          if (barIndicators && barIndicators.length) {
            Array.prototype.push.apply(out.bar, barIndicators);
          }
        }
      });
    });

    return out;
  }

  /**
   * Текст status из таблицы ТОП → ключ RAG для CSS (rag-dot).
   */
  function normalizeTableStatus(raw) {
    if (raw == null) return "blue";
    var s = String(raw).toLowerCase().trim();
    if (s === "green" || s === "зелёный" || s === "зеленый" || s.indexOf("зел") === 0) return "green";
    if (s === "yellow" || s === "жёлтый" || s === "желтый" || s.indexOf("жёл") === 0 || s.indexOf("жел") === 0) return "yellow";
    if (s === "red" || s === "красный" || s.indexOf("красн") === 0) return "red";
    return "blue";
  }

  function formatDeviationPercent(pct) {
    if (pct == null || typeof pct !== "number" || isNaN(pct)) return "—";
    var sign = pct > 0 ? "+" : "";
    return sign + String(Math.round(pct * 10) / 10).replace(".", ",") + "%";
  }

  /**
   * Отклонение в процентах по таблице: ((fact − plan) / plan) × 100.
   * @returns {number|null}
   */
  function computePlanFactDeviationPct(plan, fact) {
    if (!planFactValuePresent(plan) || !planFactValuePresent(fact)) return null;
    var p =
      typeof plan === "number" && !isNaN(plan)
        ? plan
        : parseFloat(String(plan).replace(/[^\d.,\-]/g, "").replace(",", "."));
    var f =
      typeof fact === "number" && !isNaN(fact)
        ? fact
        : parseFloat(String(fact).replace(/[^\d.,\-]/g, "").replace(",", "."));
    if (!isFinite(p) || !isFinite(f) || p === 0) return null;
    return ((f - p) / p) * 100;
  }

  /**
   * name по kpi_id: Плитки → строки других таблиц (сводка) → серии Графиков.
   * plan/fact: строки Таблиц с полями plan/fact (например KD-T-KPI-SUMMARY), иначе последняя точка серии в Графиках.
   */
  function buildKpiDisplayAndPlanFactLookups(body) {
    var nameLookup = {};
    var planFactLookup = {};

    var tiles = body[KPI_JSON_KEY_TILES];
    if (tiles && Array.isArray(tiles.items)) {
      tiles.items.forEach(function (t) {
        if (!t || t.kpi_id == null) return;
        if (isAggregateKpiTile(t, t.name)) return;
        var id = String(t.kpi_id);
        if (t.name != null) nameLookup[id] = String(t.name);
      });
    }

    var tables = body[KPI_JSON_KEY_TABLES];
    if (tables && typeof tables === "object") {
      forEachTablesRow(tables, function (tk, row) {
        if (!row || typeof row !== "object") return;
        var id = row.kpi_id != null ? String(row.kpi_id) : row.kpi_name != null ? String(row.kpi_name) : "";
        if (!id) return;
        if (row.name != null && nameLookup[id] == null) nameLookup[id] = String(row.name);
        if (row.plan !== undefined || row.fact !== undefined) {
          var prev = planFactLookup[id] || {};
          planFactLookup[id] = {
            plan: row.plan !== undefined ? row.plan : prev.plan,
            fact: row.fact !== undefined ? row.fact : prev.fact,
          };
        }
      });
    }

    var charts = body[KPI_JSON_KEY_CHARTS];
    if (charts && typeof charts === "object") {
      Object.keys(charts).forEach(function (ck) {
        var ch = charts[ck];
        var seriesList = getChartSeriesList(ch);
        if (!ch || !seriesList.length) return;
        seriesList.forEach(function (s) {
          var points = getSeriesPointsList(s);
          if (!s || s.kpi_id == null || !points.length) return;
          var kid = String(s.kpi_id);
          if (s.name != null && nameLookup[kid] == null) nameLookup[kid] = String(s.name);
          var last = points[points.length - 1];
          if (planFactLookup[kid] == null) {
            planFactLookup[kid] = { plan: last.plan, fact: last.fact };
          } else {
            var c = planFactLookup[kid];
            if (c.plan === undefined && last.plan !== undefined) c.plan = last.plan;
            if (c.fact === undefined && last.fact !== undefined) c.fact = last.fact;
          }
        });
      });
    }

    return { nameLookup: nameLookup, planFactLookup: planFactLookup };
  }

  /** RAG (green|yellow|red|blue) по kpi_id из цвета плитки — как на дашборде. */
  function buildTileRagByKpiId(body) {
    var ragById = {};
    var tiles = body[KPI_JSON_KEY_TILES];
    if (!tiles || !Array.isArray(tiles.items)) return ragById;
    tiles.items.forEach(function (t) {
      if (!t || t.kpi_id == null || t.color == null) return;
      if (isAggregateKpiTile(t, t.name)) return;
      ragById[String(t.kpi_id)] = normalizeTableStatus(t.color);
    });
    return ragById;
  }

  function tableRowKpiKey(row) {
    if (!row || typeof row !== "object") return "";
    if (row.kpi_id != null) return String(row.kpi_id);
    if (row.kpi_name != null) return String(row.kpi_name);
    return "";
  }

  function tableRowIdentity(row, tabKey, index) {
    var kpiKey = tableRowKpiKey(row);
    if (kpiKey) return kpiKey;
    if (row && row.project_name != null && String(row.project_name).trim() !== "") {
      var projectName = String(row.project_name).trim();
      if (row.milestone_name != null && String(row.milestone_name).trim() !== "") {
        return "project:" + projectName + "|milestone:" + String(row.milestone_name).trim();
      }
      return "project:" + projectName;
    }
    if (row && row.code != null && String(row.code).trim() !== "") return "code:" + String(row.code).trim();
    if (row && row.name != null && String(row.name).trim() !== "") return "name:" + String(row.name).trim();
    if (row && row.partner != null && String(row.partner).trim() !== "") return "partner:" + String(row.partner).trim();
    if (row && row.number != null && String(row.number).trim() !== "") return "number:" + String(row.number).trim();
    if (row && row.counterparty != null && String(row.counterparty).trim() !== "") return "counterparty:" + String(row.counterparty).trim();
    return String(tabKey || "table") + ":" + String(index);
  }

  function tableRowHasDisplayableData(row) {
    if (!row || typeof row !== "object") return false;
    return (
      tableRowKpiKey(row) !== "" ||
      (row.name != null && String(row.name).trim() !== "") ||
      (row.project_name != null && String(row.project_name).trim() !== "") ||
      (row.project_manager != null && String(row.project_manager).trim() !== "") ||
      (row.milestone_name != null && String(row.milestone_name).trim() !== "") ||
      (row.partner != null && String(row.partner).trim() !== "") ||
      (row.code != null && String(row.code).trim() !== "") ||
      (row.number != null && String(row.number).trim() !== "") ||
      (row.counterparty != null && String(row.counterparty).trim() !== "") ||
      (row.partner_name != null && String(row.partner_name).trim() !== "") ||
      (row.order_num != null && String(row.order_num).trim() !== "") ||
      (row.milestone_planned_finish_date != null && String(row.milestone_planned_finish_date).trim() !== "") ||
      (row.deviation_date != null && String(row.deviation_date).trim() !== "") ||
      row.delay_days !== undefined ||
      row.percent_complete !== undefined ||
      row.plan !== undefined ||
      row.fact !== undefined ||
      row.order_sum !== undefined ||
      row.amount !== undefined ||
      row.claim_amount !== undefined
    );
  }

  function tableRowComment(row, tabKey) {
    if (!row || typeof row !== "object") return "";
    if (row.comment != null && String(row.comment).trim() !== "") return String(row.comment).trim();
    if (row.description != null && String(row.description).trim() !== "") return String(row.description).trim();
    if (row.source != null && String(row.source).trim() !== "") return String(row.source).trim();
    if (row.status != null && String(row.status).trim() !== "") return String(row.status).trim();
    return tabKey != null ? String(tabKey).trim() : "";
  }

  /**
   * body["Таблицы"]: строки KPI и прикладных таблиц.
   * KPI — название из «Плитки» по kpi_id, иначе name/partner/code из строки; план/факт — plan/fact,
   * а для прикладных таблиц возможны fallback-поля; RAG — color строки, иначе цвет плитки;
   * отклонение — ((fact − plan) / plan) × 100 %, либо готовое/статусное значение из строки.
   */
  function buildTableRowsFromApiResponse(body) {
    if (!body) return [];
    var tables = body[KPI_JSON_KEY_TABLES];
    if (!tables || typeof tables !== "object") return [];

    var collected = [];
    forEachTablesRow(tables, function (tk, row, _unused) {
      if (!row || typeof row !== "object") return;
      if (!tableRowHasDisplayableData(row)) return;
      collected.push({ tk: tk, row: row, index: collected.length });
    });
    if (!collected.length) return [];

    var idCount = Object.create(null);
    for (var c = 0; c < collected.length; c++) {
      var kid = tableRowIdentity(collected[c].row, collected[c].tk, c);
      idCount[kid] = (idCount[kid] || 0) + 1;
    }

    var lookups = buildKpiDisplayAndPlanFactLookups(body);
    var nameLookup = lookups.nameLookup;
    var planFactLookup = lookups.planFactLookup;
    var ragByKpi = buildTileRagByKpiId(body);

    return collected
      .map(function (item) {
        var row = item.row;
        var tk = item.tk;
        var id = tableRowIdentity(row, tk, item.index);
        var kpiId = tableRowKpiKey(row);
        var fromTiles = kpiId && nameLookup[kpiId] != null ? String(nameLookup[kpiId]).trim() : "";
        var fromRowName = row.name != null ? String(row.name).trim() : "";
        var fromPartner = row.partner != null ? String(row.partner).trim() : "";
        var fromCode = row.code != null ? String(row.code).trim() : "";
        var fromNumber = row.number != null ? String(row.number).trim() : "";
        var fromCounterparty = row.counterparty != null ? String(row.counterparty).trim() : "";
        var kpiBase = fromTiles || fromRowName || fromPartner || fromCode || fromNumber || fromCounterparty || kpiId || id || "—";
        var dup = idCount[id] > 1;
        var section = tk != null ? String(tk).trim() : "";
        var kpiLabel = kpiBase + (dup && section ? " (" + section + ")" : "");

        var pf = kpiId ? planFactLookup[kpiId] || {} : {};
        var plan =
          row.plan !== undefined && row.plan !== null
            ? row.plan
            : row.date_plan != null && String(row.date_plan).trim() !== ""
              ? row.date_plan
              : row.order_num != null && String(row.order_num).trim() !== ""
                ? row.order_num
                : pf.plan != null
                  ? pf.plan
                  : "—";
        var planForDeviation =
          row.plan !== undefined && row.plan !== null
            ? row.plan
            : pf.plan != null
              ? pf.plan
              : null;
        var fact =
          row.fact !== undefined && row.fact !== null
            ? row.fact
            : row.order_sum !== undefined && row.order_sum !== null
              ? row.order_sum
              : row.amount !== undefined && row.amount !== null
                ? row.amount
                : row.date_reg != null && String(row.date_reg).trim() !== ""
                  ? row.date_reg
                  : pf.fact != null
                    ? pf.fact
                    : "—";
        var factForDeviation =
          row.fact !== undefined && row.fact !== null
            ? row.fact
            : row.order_sum !== undefined && row.order_sum !== null
              ? row.order_sum
              : row.amount !== undefined && row.amount !== null
                ? row.amount
                : pf.fact != null
                  ? pf.fact
                  : null;

        var devNum = computePlanFactDeviationPct(planForDeviation, factForDeviation);
        var devStr =
          devNum != null && !isNaN(devNum)
            ? formatDeviationPercent(devNum)
            : typeof row.deviation_pct === "number" && !isNaN(row.deviation_pct)
              ? formatDeviationPercent(row.deviation_pct)
              : row.status != null && String(row.status).trim() !== ""
                ? String(row.status).trim()
              : "—";

        var rag =
          row.color != null && String(row.color).trim() !== ""
            ? normalizeTableStatus(row.color)
            : kpiId && ragByKpi[kpiId] != null
              ? ragByKpi[kpiId]
              : "blue";

        return {
          kpi: kpiLabel,
          fact: fact,
          plan: plan,
          rag: rag,
          deviation: devStr,
          comment: tableRowComment(row, tk),
          tableKey: tk != null ? String(tk).trim() : "",
          raw: row,
        };
      })
      .filter(Boolean);
  }

  /**
   * GET /api/kpi/ с заголовком Authorization: Bearer <token> из сессии.
   * @param {object} [options]
   * @param {string} [options.department] — подразделение подчинённой ветки (?department=)
   * @returns {Promise<{ok:true,data:any,tiles:object[]}|{ok:false,error:string,status?:number,unauthorized?:boolean,skipped?:boolean}>}
   */
  function fetchKpis(options) {
    var cfg = global.AppConfig || {};
    if (cfg.isMockApi && cfg.isMockApi()) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var url = buildKpiUrlWithQuery(options);
    return performKpiGet(url);
  }

  /**
   * GET /api/kpi/all/ — KPI по ветке или по одному подразделению (?department=).
   * Для вкладок подчинённых подразделений используйте с параметром department.
   */
  function fetchKpiAll(options) {
    var cfg = global.AppConfig || {};
    if (cfg.isMockApi && cfg.isMockApi()) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var url = buildKpiAllUrlWithQuery(options);
    return performKpiGet(url);
  }

  function normalizeSearchResultEntry(item, index) {
    if (item == null) return null;
    if (typeof item === "string") {
      var text = String(item).trim();
      if (!text) return null;
      return {
        id: "search:" + encodeURIComponent(text),
        label: text,
        department: text,
        viewDepartment: text,
        raw: item,
      };
    }
    if (typeof item !== "object") return null;

    var department =
      item.department != null && String(item.department).trim() !== ""
        ? String(item.department).trim()
        : item.department_name != null && String(item.department_name).trim() !== ""
          ? String(item.department_name).trim()
          : item.viewDepartment != null && String(item.viewDepartment).trim() !== ""
            ? String(item.viewDepartment).trim()
            : item.name != null && String(item.name).trim() !== ""
              ? String(item.name).trim()
              : item.title != null && String(item.title).trim() !== ""
                ? String(item.title).trim()
                : item.label != null && String(item.label).trim() !== ""
                  ? String(item.label).trim()
                  : item.display_name != null && String(item.display_name).trim() !== ""
                    ? String(item.display_name).trim()
                    : item.full_name != null && String(item.full_name).trim() !== ""
                      ? String(item.full_name).trim()
                      : "";
    var label =
      item.label != null && String(item.label).trim() !== ""
        ? String(item.label).trim()
        : item.title != null && String(item.title).trim() !== ""
          ? String(item.title).trim()
          : item.display_name != null && String(item.display_name).trim() !== ""
            ? String(item.display_name).trim()
            : item.full_name != null && String(item.full_name).trim() !== ""
              ? String(item.full_name).trim()
              : department;
    var id = item.id != null && String(item.id).trim() !== "" ? String(item.id).trim() : "";
    if (!id) {
      var fallbackId = item.department_id != null ? String(item.department_id).trim() : department || label || String(index + 1);
      id = "search:" + encodeURIComponent(fallbackId);
    }
    var result = {
      id: id,
      label: label || department || id,
      department: department || "",
      viewDepartment:
        item.viewDepartment != null && String(item.viewDepartment).trim() !== ""
          ? String(item.viewDepartment).trim()
          : department || "",
      raw: item,
    };
    if (item.user && typeof item.user === "object") {
      result.user = item.user;
    }
    if (Array.isArray(item.path)) result.path = item.path.slice();
    if (Array.isArray(item.hierarchy)) result.hierarchy = item.hierarchy.slice();
    if (Array.isArray(item.breadcrumbs)) result.breadcrumbs = item.breadcrumbs.slice();
    return result;
  }

  function collectSearchResultItems(value, depth) {
    var items = [];
    if (!value || depth < 0) return items;
    if (Array.isArray(value)) {
      return value.slice();
    }
    if (typeof value !== "object") return items;

    var keys = ["results", "items", "search_results", "departments", "matches", "data", "result", "entries"];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var candidate = value[key];
      if (Array.isArray(candidate)) {
        return candidate.slice();
      }
      if (candidate && typeof candidate === "object") {
        var nested = collectSearchResultItems(candidate, depth - 1);
        if (nested.length) return nested;
      }
    }

    if (
      value.department != null ||
      value.name != null ||
      value.label != null ||
      value.title != null ||
      value.display_name != null
    ) {
      items = [value];
    }
    return items
      .map(function (item, index) {
        return normalizeSearchResultEntry(item, index);
      })
      .filter(Boolean);
  }

  function normalizeSearchResultsFromApiResponse(data) {
    return collectSearchResultItems(data, 2);
  }

  /**
   * POST /api/search/ — поиск подразделений по `q` с ограничением `top_k`.
   * @param {{ q?: string, top_k?: number }} options
   * @returns {Promise<{ok:true,results:object[],count:number,data:any}|{ok:false,error:string,status?:number,unauthorized?:boolean,skipped?:boolean}>}
   */
  function searchDepartments(options) {
    var cfg = global.AppConfig || {};
    if (cfg.isMockApi && cfg.isMockApi()) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var A = global.Auth;
    if (!A || typeof A.getAuthHeaders !== "function") {
      return Promise.resolve({ ok: false, error: "Модуль Auth не загружен" });
    }
    var q = options && options.q != null ? String(options.q).trim() : "";
    if (!q) {
      return Promise.resolve({ ok: true, results: [], count: 0, data: { results: [] } });
    }
    var topK = options && options.top_k != null ? parseInt(String(options.top_k), 10) : 5;
    if (isNaN(topK)) topK = 5;
    topK = Math.max(1, Math.min(20, topK));
    var authHeaders = A.getAuthHeaders();
    if (!authHeaders.Authorization) {
      return Promise.resolve({ ok: false, error: "Нет токена авторизации" });
    }
    var url = buildSearchUrlWithQuery({ q: q, top_k: topK });
    var headers = Object.assign({ Accept: "application/json", "Content-Type": "application/json" }, authHeaders);
    var fetchOpts = {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ q: q, top_k: topK }),
    };
    if (cfg.FETCH_CREDENTIALS === "include") {
      fetchOpts.credentials = "include";
    }
    return fetch(url, fetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = null;
          }
          var dbgBody = data;
          if (dbgBody === null && text) {
            dbgBody = { _nonJson: text.slice(0, 2000) };
          }
          pushApiDebug("POST /api/search/", "POST", url, res.status, dbgBody);
          if (res.status === 401) {
            return { ok: false, status: 401, error: "Требуется повторный вход", unauthorized: true };
          }
          if (!res.ok) {
            return {
              ok: false,
              status: res.status,
              error: parseErrorBody(text) || "Ошибка поиска (" + res.status + ")",
            };
          }
          var results = normalizeSearchResultsFromApiResponse(data).slice(0, topK);
          return {
            ok: true,
            results: results,
            count: typeof data === "object" && data && typeof data.count === "number" ? data.count : results.length,
            data: data,
          };
        });
      })
      .catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        pushApiDebug("POST /api/search/", "POST", url, 0, { _networkError: m });
        if (m.indexOf("Failed to fetch") !== -1 || m.indexOf("NetworkError") !== -1) {
          return { ok: false, error: "Нет связи с сервером (поиск)" };
        }
        return { ok: false, error: m || "Ошибка запроса поиска" };
      });
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function parseErrorBody(text) {
    if (!text) return "";
    try {
      var j = JSON.parse(text);
      if (typeof j.detail === "string") return j.detail;
      if (Array.isArray(j.detail)) {
        var d0 = j.detail[0];
        if (typeof d0 === "string") return d0;
        if (d0 && d0.msg) return String(d0.msg);
      }
      if (j.message) return j.message;
      if (j.error) return String(j.error);
      if (j.non_field_errors && j.non_field_errors[0]) return String(j.non_field_errors[0]);
      if (j.nickname && Array.isArray(j.nickname)) return String(j.nickname[0]);
      if (j.password && Array.isArray(j.password)) return String(j.password[0]);
    } catch (e) {
      /* ignore */
    }
    return text.slice(0, 200);
  }

  /** Понятное сообщение для формы входа */
  function humanizeLoginError(raw) {
    if (!raw) return "Неверный логин или пароль";
    var s = String(raw).trim();
    var lower = s.toLowerCase();
    if (
      lower.indexOf("invalid nickname") !== -1 ||
      lower.indexOf("invalid password") !== -1 ||
      lower.indexOf("invalid credentials") !== -1 ||
      lower.indexOf("wrong password") !== -1 ||
      lower.indexOf("incorrect password") !== -1 ||
      lower.indexOf("authentication failed") !== -1
    ) {
      return "Неверный логин или пароль. Проверьте данные на сервере, раскладку и Caps Lock.";
    }
    if (lower.indexOf("required") !== -1 || lower.indexOf("обязател") !== -1) {
      return "Заполните логин и пароль.";
    }
    return s;
  }

  function buildLoginPayload(nickname, password) {
    var cfg = global.AppConfig || {};
    var field = cfg.LOGIN_USER_FIELD || "nickname";
    var body = { password: password };
    body[field] = nickname;
    if (cfg.LOGIN_ALSO_SEND_USERNAME && field !== "username") {
      body.username = nickname;
    }
    return body;
  }

  function delay(ms, value) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(value);
      }, ms);
    });
  }

  /**
   * Локальный «вход» без HTTP (режим mock).
   */
  function loginMock(nickname, password) {
    var list = (global.MockData && global.MockData.MOCK_LOGIN_USERS) || [];
    if (!list.length) {
      return Promise.resolve({
        ok: false,
        error: "Нет данных MOCK_LOGIN_USERS (подключите mockData.js до api.js).",
      });
    }
    var nick = String(nickname || "").trim();
    var row = list.find(function (u) {
      return u.nickname.toLowerCase() === nick.toLowerCase() && u.password === password;
    });
    return delay(200).then(function () {
      if (!row) {
        return { ok: false, error: humanizeLoginError("invalid nickname or password") };
      }
      return {
        ok: true,
        token: "mock-jwt." + String(row.user.id) + "." + Date.now(),
        user: row.user,
      };
    });
  }

  /**
   * POST на AppConfig.API_LOGIN_PATH
   * @returns {Promise<{ok:true, token:string, user:object}|{ok:false, error:string}>}
   */
  function login(nickname, password) {
    var cfg = global.AppConfig || {};
    if (cfg.isMockApi && cfg.isMockApi()) {
      return loginMock(nickname, password);
    }

    var url = loginUrl();
    var headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (cfg.SEND_DJANGO_CSRF_TOKEN) {
      var csrf = getCookie("csrftoken");
      if (csrf) headers["X-CSRFToken"] = csrf;
    }
    var fetchOpts = {
      method: "POST",
      headers: headers,
      body: JSON.stringify(buildLoginPayload(nickname, password)),
    };
    if (cfg.FETCH_CREDENTIALS === "include") {
      fetchOpts.credentials = "include";
    }
    return fetch(url, fetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          var data = {};
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = {};
            }
          }
          var dbgBody = data && Object.keys(data).length ? data : text ? { _nonJson: text.slice(0, 2000) } : {};
          pushApiDebug("POST /api/user/login/", "POST", url, res.status, dbgBody);
          if (res.ok) {
            if (!data.token || !data.user) {
              return { ok: false, error: "Некорректный ответ сервера" };
            }
            return { ok: true, token: data.token, user: data.user };
          }
          if (res.status === 404) {
            return {
              ok: false,
              error:
                "Маршрут входа не найден (404). Задайте верный API_LOGIN_PATH в js/config.js (сейчас: " +
                ((cfg.API_LOGIN_PATH || "/api/user/login/") + ")"),
            };
          }
          if (res.status === 403) {
            var forbiddenHint =
              "Доступ запрещён (403). Частые причины на Django: CSRF (в config.js: SEND_DJANGO_CSRF_TOKEN: true и FETCH_CREDENTIALS: «include», на сервере — CORS с Access-Control-Allow-Credentials и выдача csrftoken), ALLOWED_HOSTS, middleware, права на view. Уточните у бэкенда. Для UI без сервера — режим заглушек на входе.";
            var fm = parseErrorBody(text);
            if (fm && fm.indexOf("<!DOCTYPE") !== -1) fm = "";
            return {
              ok: false,
              error: fm ? forbiddenHint + " Детали: " + fm.slice(0, 160) : forbiddenHint,
            };
          }
          var msg = parseErrorBody(text);
          if (res.status === 401) {
            return { ok: false, error: humanizeLoginError(msg) };
          }
          if (res.status === 400) {
            return { ok: false, error: humanizeLoginError(msg) || "Не переданы логин или пароль" };
          }
          return {
            ok: false,
            error: humanizeLoginError(msg) || "Ошибка сервера (" + res.status + ")",
          };
        });
      })
      .catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        pushApiDebug("POST /api/user/login/", "POST", url, 0, { _networkError: m });
        if (m.indexOf("Failed to fetch") !== -1 || m.indexOf("NetworkError") !== -1) {
          return { ok: false, error: "Нет связи с сервером. Проверьте URL API и сеть." };
        }
        return { ok: false, error: m || "Ошибка запроса" };
      });
  }

  /**
   * Публичный API модуля (см. JSDoc у отдельных методов).
   * @namespace Api
   * @property {function(string,string): Promise} login
   * @property {function(): string} baseUrl
   * @property {function({department?: string}=): Promise} fetchKpis — GET /api/kpi/
   * @property {function({department?: string}=): Promise} fetchKpiAll — GET /api/kpi/all/
   * @property {function(): Promise} fetchKpiUsers — GET без токена, список для login
   * @property {function({department?: string}=): Promise} fetchImmediateSubordinates
   * @property {function(): Promise} fetchChairmanDashboardCatalog
   */
  global.Api = {
    login: login,
    baseUrl: baseUrl,
    loginUrl: loginUrl,
    kpiUrl: kpiUrl,
    kpiAllUrl: kpiAllUrl,
    kpiImmediateSubordinatesUrl: kpiImmediateSubordinatesUrl,
    kpiUsersUrl: kpiUsersUrl,
    searchUrl: searchUrl,
    fetchKpiUsers: fetchKpiUsers,
    fetchKpis: fetchKpis,
    fetchKpiAll: fetchKpiAll,
    fetchImmediateSubordinates: fetchImmediateSubordinates,
    fetchChairmanDashboardCatalog: fetchChairmanDashboardCatalog,
    searchDepartments: searchDepartments,
    normalizeKpiListFromApiResponse: normalizeKpiListFromApiResponse,
    buildChartIndicatorsFromApiResponse: buildChartIndicatorsFromApiResponse,
    processKpiResponseBodyAtPeriod: processKpiResponseBodyAtPeriod,
  };
})(typeof window !== "undefined" ? window : globalThis);
