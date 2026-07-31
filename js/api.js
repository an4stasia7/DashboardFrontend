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
  var KPI_GET_MEMORY_CACHE_TTL_MS = 2 * 60 * 1000;
  var kpiGetMemoryCache = Object.create(null);

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

  function userApiPath(path) {
    var p = path || "/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + "/api/user" + p;
  }

  function jsonFetch(url, options, debugLabel) {
    var cfg = global.AppConfig || {};
    var fetchOpts = options || {};
    if (cfg.FETCH_CREDENTIALS === "include") {
      fetchOpts.credentials = "include";
    }
    return fetch(url, fetchOpts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = null;
        }
        pushApiDebug(debugLabel || url, fetchOpts.method || "GET", url, res.status, data || (text ? { _nonJson: text.slice(0, 2000) } : {}));
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            unauthorized: res.status === 401,
            error: parseErrorBody(text) || "Ошибка запроса (" + res.status + ")",
            data: data,
          };
        }
        return { ok: true, data: data };
      });
    }).catch(function (err) {
      var m = err && err.message ? err.message : String(err);
      pushApiDebug(debugLabel || url, (fetchOpts && fetchOpts.method) || "GET", url, 0, { _networkError: m });
      return { ok: false, error: m || "Ошибка сети" };
    });
  }

  function fetchDepartments() {
    return jsonFetch(userApiPath("/departments/"), { method: "GET", headers: { Accept: "application/json" } }, "GET /api/user/departments/")
      .then(function (res) {
        if (!res.ok) return res;
        return {
          ok: true,
          departments: Array.isArray(res.data && res.data.departments) ? res.data.departments : [],
          data: res.data,
        };
      });
  }

  function submitRegistrationRequest(payload) {
    return jsonFetch(userApiPath("/access-requests/register/"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload || {}),
    }, "POST /api/user/access-requests/register/");
  }

  function submitPasswordResetRequest(payload) {
    return jsonFetch(userApiPath("/access-requests/password-reset/"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload || {}),
    }, "POST /api/user/access-requests/password-reset/");
  }

  function adminHeaders() {
    var A = global.Auth;
    var authHeaders = A && typeof A.getAuthHeaders === "function" ? A.getAuthHeaders() : {};
    return Object.assign({ Accept: "application/json", "Content-Type": "application/json" }, authHeaders);
  }

  function fetchAccessRequests(status) {
    var url = userApiPath("/access-requests/");
    if (status) url += "?status=" + encodeURIComponent(status);
    return jsonFetch(url, { method: "GET", headers: adminHeaders() }, "GET /api/user/access-requests/")
      .then(function (res) {
        if (!res.ok) return res;
        return {
          ok: true,
          requests: Array.isArray(res.data && res.data.requests) ? res.data.requests : [],
          data: res.data,
        };
      });
  }

  function approveAccessRequest(id) {
    return jsonFetch(userApiPath("/access-requests/" + encodeURIComponent(String(id)) + "/approve/"), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({}),
    }, "POST /api/user/access-requests/approve/");
  }

  function rejectAccessRequest(id, comment) {
    return jsonFetch(userApiPath("/access-requests/" + encodeURIComponent(String(id)) + "/reject/"), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ comment: comment || "" }),
    }, "POST /api/user/access-requests/reject/");
  }

  function authHeaders() {
    var A = global.Auth;
    var auth = A && typeof A.getAuthHeaders === "function" ? A.getAuthHeaders() : {};
    return Object.assign({ Accept: "application/json" }, auth);
  }

  function apiPath(path) {
    var p = path || "/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + "/api" + p;
  }

  function normalizeFeedbackSubmitResult(res) {
    if (!res.ok) return res;
    return {
      ok: true,
      request: res.data && res.data.request,
      email_sent: !!(res.data && res.data.email_sent),
      data: res.data,
    };
  }

  function postFeedbackRequest(url, formData) {
    return jsonFetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    }, "POST feedback request");
  }

  function submitFeedbackRequest(formData) {
    return postFeedbackRequest(userApiPath("/feedback-requests/"), formData).then(function (res) {
      if (res && res.status === 404) {
        return postFeedbackRequest(apiPath("/feedback-requests/"), formData).then(normalizeFeedbackSubmitResult);
      }
      return normalizeFeedbackSubmitResult(res);
    });
  }

  function fetchMyFeedbackRequests() {
    return jsonFetch(userApiPath("/feedback-requests/"), {
      method: "GET",
      headers: authHeaders(),
    }, "GET /api/user/feedback-requests/").then(function (res) {
      if (res && res.status === 404) {
        return jsonFetch(apiPath("/feedback-requests/"), {
          method: "GET",
          headers: authHeaders(),
        }, "GET /api/feedback-requests/");
      }
      return res;
    }).then(function (res) {
      if (!res.ok) return res;
      return {
        ok: true,
        requests: Array.isArray(res.data && res.data.requests) ? res.data.requests : [],
        data: res.data,
      };
    });
  }

  function fetchAdminFeedbackRequests(archive) {
    var suffix = archive ? "?archive=1" : "";
    return jsonFetch(userApiPath("/feedback-requests/admin/" + suffix), {
      method: "GET",
      headers: adminHeaders(),
    }, "GET /api/user/feedback-requests/admin/").then(function (res) {
      if (res && res.status === 404) {
        return jsonFetch(apiPath("/feedback-requests/admin/" + suffix), {
          method: "GET",
          headers: adminHeaders(),
        }, "GET /api/feedback-requests/admin/");
      }
      return res;
    }).then(function (res) {
      if (!res.ok) return res;
      return {
        ok: true,
        requests: Array.isArray(res.data && res.data.requests) ? res.data.requests : [],
        data: res.data,
      };
    });
  }

  function processFeedbackRequest(id, action) {
    var cleanAction = action === "delete" ? "delete" : action === "reject" ? "reject" : "complete";
    return jsonFetch(userApiPath("/feedback-requests/" + encodeURIComponent(String(id)) + "/" + cleanAction + "/"), {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({}),
    }, "POST /api/user/feedback-requests/" + cleanAction + "/").then(function (res) {
      if (res && res.status === 404) {
        return jsonFetch(apiPath("/feedback-requests/" + encodeURIComponent(String(id)) + "/" + cleanAction + "/"), {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({}),
        }, "POST /api/feedback-requests/" + cleanAction + "/");
      }
      return res;
    });
  }

  function kpiUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_KPI_PATH || "/api/kpi/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  function kpiCacheRefreshUrl() {
    return kpiUrl().replace(/\/+$/, "") + "/cache-refresh/";
  }

  function clearKpiGetMemoryCache() {
    kpiGetMemoryCache = Object.create(null);
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

  function kpiStructureUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_KPI_STRUCTURE_PATH || "/api/kpi/structure/";
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

  function assistantChatUrl() {
    var cfg = global.AppConfig || {};
    var p = cfg.API_ASSISTANT_CHAT_PATH || "/api/assistant/chat/";
    if (p.charAt(0) !== "/") p = "/" + p;
    return baseUrl() + p;
  }

  function assistantJobUrl(jobId, suffix) {
    var base = assistantChatUrl().replace(/\/chat\/?$/, "/jobs/");
    return base + encodeURIComponent(String(jobId || "")) + "/" + (suffix || "");
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

  function readAssistantEventStream(url, fetchOpts, handlers) {
    handlers = handlers || {};
    return fetch(url, fetchOpts)
      .then(function (res) {
        if (res.status === 401) {
          return { ok: false, status: 401, unauthorized: true, error: "Требуется повторный вход" };
        }
        if (!res.ok) {
          return res.text().then(function (text) {
            pushApiDebug("AI assistant stream", fetchOpts.method || "GET", url, res.status, text ? { _nonJson: text.slice(0, 2000) } : {});
            return { ok: false, status: res.status, error: parseErrorBody(text) || "Ошибка AI-ассистента (" + res.status + ")" };
          });
        }
        if (!res.body || typeof res.body.getReader !== "function") {
          return { ok: false, error: "Браузер не поддерживает потоковый ответ" };
        }
        var headerJobId = res.headers && res.headers.get ? res.headers.get("X-AI-Job-ID") : "";
        if (headerJobId && typeof handlers.onEvent === "function") {
          handlers.onEvent({ type: "job", job_id: headerJobId });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder("utf-8");
        var buffer = "";
        function emitAssistantStreamLine(line) {
          var text = line != null ? String(line).trim() : "";
          if (!text) return;
          var event = null;
          try {
            event = JSON.parse(text);
          } catch (e) {
            event = { type: "raw", content: text };
          }
          if (typeof handlers.onEvent === "function") {
            handlers.onEvent(event);
          }
        }
        function pump() {
          return reader.read().then(function (chunk) {
            if (chunk.done) {
              if (buffer.trim()) emitAssistantStreamLine(buffer);
              return { ok: true };
            }
            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            lines.forEach(emitAssistantStreamLine);
            return pump();
          });
        }
        return pump();
      });
  }

  function assistantAuthHeaders() {
    var A = global.Auth;
    if (!A || typeof A.getAuthHeaders !== "function") {
      return { error: "Модуль Auth не загружен" };
    }
    var authHeaders = A.getAuthHeaders();
    if (!authHeaders.Authorization) {
      return { error: "Нет токена авторизации", unauthorized: true };
    }
    return authHeaders;
  }

  function sendAssistantMessageStream(payload, handlers) {
    var cfg = global.AppConfig || {};
    var authHeaders = assistantAuthHeaders();
    if (authHeaders.error) return Promise.resolve({ ok: false, error: authHeaders.error, unauthorized: authHeaders.unauthorized });
    var url = assistantChatUrl();
    var headers = Object.assign(
      { Accept: "application/x-ndjson", "Content-Type": "application/json" },
      authHeaders
    );
    var fetchOpts = {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload || {}),
    };
    if (cfg.FETCH_CREDENTIALS === "include") {
      fetchOpts.credentials = "include";
    }
    return readAssistantEventStream(url, fetchOpts, handlers)
      .catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        pushApiDebug("POST /api/assistant/chat/", "POST", url, 0, { _networkError: m });
        return { ok: false, error: m || "Ошибка запроса AI-ассистента" };
      });
  }

  function streamAssistantJob(jobId, after, handlers) {
    var cfg = global.AppConfig || {};
    var authHeaders = assistantAuthHeaders();
    if (authHeaders.error) return Promise.resolve({ ok: false, error: authHeaders.error, unauthorized: authHeaders.unauthorized });
    var url = assistantJobUrl(jobId, "stream/") + "?after=" + encodeURIComponent(String(after == null ? -1 : after));
    var fetchOpts = { method: "GET", headers: Object.assign({ Accept: "application/x-ndjson" }, authHeaders) };
    if (cfg.FETCH_CREDENTIALS === "include") fetchOpts.credentials = "include";
    return readAssistantEventStream(url, fetchOpts, handlers).catch(function (err) {
      var m = err && err.message ? err.message : String(err);
      pushApiDebug("GET /api/assistant/jobs/stream/", "GET", url, 0, { _networkError: m });
      return { ok: false, error: m || "Ошибка стрима AI job" };
    });
  }

  function stopAssistantJob(jobId) {
    var cfg = global.AppConfig || {};
    var authHeaders = assistantAuthHeaders();
    if (authHeaders.error) return Promise.resolve({ ok: false, error: authHeaders.error, unauthorized: authHeaders.unauthorized });
    var url = assistantJobUrl(jobId, "stop/");
    var fetchOpts = { method: "POST", headers: Object.assign({ Accept: "application/json" }, authHeaders) };
    if (cfg.FETCH_CREDENTIALS === "include") fetchOpts.credentials = "include";
    return jsonFetch(url, fetchOpts, "POST /api/assistant/jobs/stop/").then(function (res) {
      if (!res.ok) return res;
      return { ok: true, job: res.data && res.data.job, data: res.data };
    });
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
    var url = buildImmediateSubordinatesUrl(options || { department: dept });
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

  function fetchKpiStructure(options) {
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
    options = options || {};
    var url = kpiStructureUrl();
    if (options.includeHeadcount) {
      url += (url.indexOf("?") === -1 ? "?" : "&") + "include_headcount=1";
    }
    var headers = Object.assign({ Accept: "application/json" }, authHeaders);
    return jsonFetch(url, { method: "GET", headers: headers }, "GET /api/kpi/structure/")
      .then(function (res) {
        if (!res.ok) return res;
        return {
          ok: true,
          structure: res.data && res.data.structure && typeof res.data.structure === "object" ? res.data.structure : {},
          headcount: res.data && res.data.headcount && typeof res.data.headcount === "object" ? res.data.headcount : null,
          data: res.data,
        };
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
   * Месяц/год для графиков: из query URL или из полей `month`/`year` тела KPI-ответа.
   */
  function resolveKpiFilterYearMonth(body, requestUrl) {
    var qp = parseMonthYearFromKpiUrl(requestUrl || "");
    if (qp.year != null && qp.month != null) return qp;
    if (body && typeof body === "object") {
      var y = parseIntLoose(body.year);
      var m = parseIntLoose(body.month);
      if (isNaN(m) || m < 1 || m > 12) {
        m = parseIntLoose(body.kpi_ref_month);
      }
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
        return { year: y, month: m };
      }
    }
    return qp;
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
    var qp = resolveKpiFilterYearMonth(body, requestUrl || "");
    applyPlanFactFromJsonLastPeriodToTiles(body, tiles, qp.year, qp.month);
    return {
      tiles: tiles,
      chartIndicators: buildChartIndicatorsFromApiResponse(body, qp.year, qp.month),
      tableRows: buildTableRowsFromApiResponse(body, qp.year, qp.month),
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
    applyMonthlyDataToTilesAtPeriod(tiles, year, month);
    return {
      tiles: tiles,
      chartIndicators: buildChartIndicatorsFromApiResponse(body, year, month),
      tableRows: buildTableRowsFromApiResponse(body, year, month),
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
    var cached = kpiGetMemoryCache[url];
    if (cached && Date.now() - cached.at < KPI_GET_MEMORY_CACHE_TTL_MS) {
      var cachedProcessed = processKpiResponseBody(cached.data, url);
      var cachedUnwrapped = cachedProcessed.unwrappedData || cached.data;
      delete cachedProcessed.unwrappedData;
      pushApiDebug("GET KPI cache", "GET", url, 200, { _memoryCache: true });
      return Promise.resolve(Object.assign({ ok: true, data: cachedUnwrapped, raw: cached.data }, cachedProcessed));
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
          kpiGetMemoryCache[url] = { at: Date.now(), data: data };
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
        var hintFields =
          global.DashUi && typeof global.DashUi.normalizeKpiTileHintFields === "function"
            ? global.DashUi.normalizeKpiTileHintFields(item)
            : {
                description:
                  item.description != null
                    ? String(item.description)
                    : "",
                hint:
                  item.description != null
                    ? String(item.description)
                    : item.hint != null
                      ? String(item.hint)
                      : item.comment != null
                        ? String(item.comment)
                        : "",
                source: firstStringValue(["source", "data_source", "kpi_source", "info_source", "hint_source"]),
                plan_description: firstStringValue([
                  "plan_description",
                  "description_plan",
                  "hint_plan",
                  "plan_hint",
                ]),
                fact_description: firstStringValue([
                  "fact_description",
                  "description_fact",
                  "hint_fact",
                  "fact_hint",
                ]),
              };
        function normalizeUnits(kpiId, value) {
          var kid = kpiId != null ? String(kpiId).trim().toUpperCase() : "";
          if (kid === "LOG-M2") return "руб.";
          if (kid === "OD-M1" || kid === "OD-M3.1" || kid === "OD-M3.2") return "руб.";
          if (kid === "KD-M11") return "чел.";
          if (/^QD-M\d+$/i.test(kid)) {
            var unitText = value != null ? String(value).trim() : "";
            if (!unitText || unitText === "%") return "шт.";
            return unitText;
          }
          if (/^SH-M\d+$/i.test(kid)) {
            var shUnit = value != null ? String(value).trim() : "";
            if (!shUnit || shUnit === "%") return "шт.";
            return shUnit;
          }
          if (kid === "METD-M1" || kid === "МЕТ-M1") return "шт.";
          return value;
        }
        var formulaSrc = item.formula != null ? item.formula : th.formula;
        var hasData = typeof item.has_data === "boolean" ? item.has_data : undefined;
        var units = normalizeUnits(
          item.kpi_id,
          firstStringValue(["units", "unit", "uom", "measure_unit", "measurement_unit"])
        );
        var frequency = firstStringValue(["frequency", "periodicity", "update_frequency", "frequency_label"]);
        var cacheUpdatedAt = firstStringValue(["cache_updated_at"]);
        var lastFullMonthRow =
          item.last_full_month_row && typeof item.last_full_month_row === "object" ? item.last_full_month_row : null;
        var tileDepartments = normalizeDefectDirectionDepartments(
          Array.isArray(item.departments) && item.departments.length
            ? item.departments
            : lastFullMonthRow && Array.isArray(lastFullMonthRow.departments)
              ? lastFullMonthRow.departments
              : []
        );
        var defectDirectionDepartments = normalizeDefectDirectionDepartments(
          lastFullMonthRow && Array.isArray(lastFullMonthRow.departments) ? lastFullMonthRow.departments : []
        );
        var tileOut = {
          kpi_id: item.kpi_id != null ? String(item.kpi_id) : "",
          title: title,
          badge: item.kpi_id != null ? String(item.kpi_id) : "KPI",
          period: item.period != null ? String(item.period) : "",
          units: units,
          frequency: frequency,
          cache_updated_at: cacheUpdatedAt,
          formula: formulaSrc != null ? String(formulaSrc) : null,
          data_granularity: item.data_granularity != null ? String(item.data_granularity) : "",
          plan_fact_period_label:
            item.plan_fact_period_label != null
              ? String(item.plan_fact_period_label)
              : null,
          monthly_data: Array.isArray(item.monthly_data) ? item.monthly_data : [],
          period_aggregates:
            item.period_aggregates && typeof item.period_aggregates === "object"
              ? item.period_aggregates
              : null,
          frontend_aggregation:
            item.frontend_aggregation && typeof item.frontend_aggregation === "object"
              ? item.frontend_aggregation
              : null,
          quarterly_data: Array.isArray(item.quarterly_data) ? item.quarterly_data : [],
          plan_fact_rows: Array.isArray(item.plan_fact_rows) ? item.plan_fact_rows : [],
          project_deviation_rows: Array.isArray(item.project_deviation_rows) ? item.project_deviation_rows : [],
          max_allowed_delay_workdays:
            item.max_allowed_delay_workdays != null ? item.max_allowed_delay_workdays : null,
          percent: pct,
          kpi_pst: typeof item.kpi_pst === "number" && !isNaN(item.kpi_pst) ? item.kpi_pst : null,
          kpi_pct: typeof item.kpi_pct === "number" && !isNaN(item.kpi_pct) ? item.kpi_pct : null,
          kpi_pct_is_deviation: item.kpi_pct_is_deviation === true,
          plan: item.plan,
          fact: item.fact,
          expected_plan: item.expected_plan != null ? item.expected_plan : null,
          found: item.found != null ? item.found : null,
          won: item.won != null ? item.won : null,
          not_participating:
            item.not_participating != null ? item.not_participating : null,
          status_counts:
            item.status_counts && typeof item.status_counts === "object"
              ? item.status_counts
              : null,
          tender_departments: Array.isArray(item.tender_departments) ? item.tender_departments : [],
          // FND-T3 «Соотношение ДЗ и КЗ» — клиенты/поставщики + общий итог.
          dz_client: item.dz_client != null ? item.dz_client : null,
          kz_client: item.kz_client != null ? item.kz_client : null,
          dz_supplier: item.dz_supplier != null ? item.dz_supplier : null,
          kz_supplier: item.kz_supplier != null ? item.kz_supplier : null,
          dz_total: item.dz_total != null ? item.dz_total : null,
          kz_total: item.kz_total != null ? item.kz_total : null,
          portfolio_count: item.portfolio_count != null ? item.portfolio_count : null,
          deviation_count: item.deviation_count != null ? item.deviation_count : null,
          rejected_items_count:
            item.rejected_items_count !== undefined ? item.rejected_items_count : null,
          plan_by_dept:
            item.plan_by_dept && typeof item.plan_by_dept === "object"
              ? item.plan_by_dept
              : null,
          fact_by_dept:
            item.fact_by_dept && typeof item.fact_by_dept === "object"
              ? item.fact_by_dept
              : null,
          /** QD-M1 и др.: подразделения с планом/фактом на обороте плитки. */
          articles: Array.isArray(item.articles) ? item.articles : [],
          last_full_month_row: lastFullMonthRow,
          departments: tileDepartments,
          defect_direction_departments: defectDirectionDepartments,
          pct_client: item.pct_client != null ? item.pct_client : null,
          pct_supplier: item.pct_supplier != null ? item.pct_supplier : null,
          pct_total: item.pct_total != null ? item.pct_total : null,
          has_data: hasData,
          generated_data: item.generated_data === true,
          is_generated: item.is_generated === true,
          synthetic_data: item.synthetic_data === true,
          description: hintFields.description,
          hint: hintFields.description,
          source: hintFields.source,
          plan_description: hintFields.plan_description,
          fact_description: hintFields.fact_description,
          color: color,
          backend_color: color,
          status_color:
            item.status_color != null
              ? normalizeBackendTileColor(item.status_color)
              : color,
          rag: color,
          pct_lower_is_better: item.pct_lower_is_better === true,
          pct_higher_is_better: item.pct_higher_is_better === true,
          rag_direction: item.rag_direction != null ? String(item.rag_direction) : "",
          green_threshold: thStr(th, "green", "green_threshold"),
          yellow_threshold: thStr(th, "yellow", "yellow_threshold"),
          red_threshold: thStr(th, "red", "red_threshold"),
          blue_threshold: thStr(th, "blue", "blue_threshold"),
        };
        applyQualdirControlFieldsToTileOut(tileOut, item, lastFullMonthRow);
        ensureQualdirPieceCountUnits(tileOut);
        return tileOut;
      })
      .filter(Boolean);
  }

  function isQualdirPieceCountKpiId(kpiId) {
    var id = kpiId != null ? String(kpiId).trim().toUpperCase() : "";
    return /^QD-M\d+$/.test(id);
  }

  function ensureQualdirPieceCountUnits(tile) {
    if (!tile || !isQualdirPieceCountKpiId(tile.kpi_id)) return;
    var unitText =
      tile.units != null ? String(tile.units).trim() : tile.unit != null ? String(tile.unit).trim() : "";
    if (!unitText || unitText === "%") {
      tile.units = "шт.";
      tile.unit = "шт.";
    }
  }

  function getQualdirControlOverviewRule(kpiId) {
    var cfg = global.KPI_TILE_EXCEPTIONS || null;
    var key = kpiId != null ? String(kpiId).trim().toUpperCase() : "";
    return cfg && key && cfg[key] && cfg[key].qualdirControlOverview ? cfg[key].qualdirControlOverview : null;
  }

  function applyQualdirControlFieldsToTileOut(tileOut, item, lastFullMonthRow) {
    if (!tileOut || !item) return;
    var rule = getQualdirControlOverviewRule(tileOut.kpi_id);
    if (!rule || !Array.isArray(rule.rows)) return;
    rule.rows.forEach(function (row) {
      if (!row || !row.field || row.field === "fact") return;
      if (row.lastFullMonthOnly) {
        if (Object.prototype.hasOwnProperty.call(item, row.field)) {
          tileOut[row.field] = item[row.field];
        } else if (
          lastFullMonthRow &&
          Object.prototype.hasOwnProperty.call(lastFullMonthRow, row.field)
        ) {
          tileOut[row.field] = lastFullMonthRow[row.field];
        }
        return;
      }
      if (item[row.field] !== undefined) {
        tileOut[row.field] = item[row.field];
      }
    });
  }

  function resolveQualdirControlField(tile, point, year, month, fieldName) {
    if (!tile || !fieldName) return undefined;
    if (point && Object.prototype.hasOwnProperty.call(point, fieldName)) {
      return point[fieldName];
    }
    var lfm = tile.last_full_month_row;
    if (!lfm || typeof lfm !== "object") return undefined;
    var y = Number(year);
    var m = Number(month);
    var ly = Number(lfm.year);
    var lm = Number(lfm.month);
    if (isNaN(y) || isNaN(m) || isNaN(ly) || isNaN(lm) || y !== ly || m !== lm) {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(lfm, fieldName)) {
      return lfm[fieldName];
    }
    return undefined;
  }

  function syncQualdirControlTileFieldsFromPoint(tile, point, year, month) {
    var rule = getQualdirControlOverviewRule(tile && tile.kpi_id);
    if (!rule || !Array.isArray(rule.rows)) return;
    if (!point || typeof point !== "object") {
      rule.rows.forEach(function (row) {
        if (row && row.field && row.field !== "fact") delete tile[row.field];
      });
      return;
    }
    rule.rows.forEach(function (row) {
      if (!row || !row.field || row.field === "fact") return;
      if (row.lastFullMonthOnly) {
        var todayValue = resolveQualdirControlField(tile, point, year, month, row.field);
        if (todayValue !== undefined) {
          tile[row.field] = todayValue;
        } else {
          delete tile[row.field];
        }
        return;
      }
      if (point[row.field] !== undefined) {
        tile[row.field] = point[row.field];
      } else {
        tile[row.field] = null;
      }
    });
  }

  function findTileMonthlyDataPoint(monthlyData, year, month) {
    if (!Array.isArray(monthlyData) || year == null || month == null) return null;
    var y = Number(year);
    var m = Number(month);
    if (isNaN(y) || isNaN(m)) return null;
    for (var i = 0; i < monthlyData.length; i++) {
      var point = monthlyData[i];
      if (!point || typeof point !== "object") continue;
      if (Number(point.year) === y && Number(point.month) === m) return point;
    }
    return null;
  }

  /** Последний месяц в monthly_data не позже выбранного (или последний с plan/fact). */
  function findLatestTileMonthlyDataPointUpTo(monthlyData, year, month) {
    if (!Array.isArray(monthlyData) || !monthlyData.length) return null;
    var y = Number(year);
    var m = Number(month);
    var hasTarget = !isNaN(y) && !isNaN(m) && m >= 1 && m <= 12;
    var targetKey = hasTarget ? y * 100 + m : Infinity;
    var best = null;
    var bestKey = -1;
    for (var i = 0; i < monthlyData.length; i++) {
      var point = monthlyData[i];
      if (!point || typeof point !== "object") continue;
      var py = Number(point.year);
      var pm = Number(point.month);
      if (isNaN(py) || isNaN(pm) || pm < 1 || pm > 12) continue;
      if (
        !planFactValuePresent(point.plan) &&
        !planFactValuePresent(point.fact) &&
        point.has_data !== true
      ) {
        continue;
      }
      var key = py * 100 + pm;
      if ((!hasTarget || key <= targetKey) && key > bestKey) {
        best = point;
        bestKey = key;
      }
    }
    if (best) return best;
    for (var j = monthlyData.length - 1; j >= 0; j--) {
      var tail = monthlyData[j];
      if (
        tail &&
        typeof tail === "object" &&
        (planFactValuePresent(tail.plan) ||
          planFactValuePresent(tail.fact) ||
          tail.has_data === true)
      ) {
        return tail;
      }
    }
    return null;
  }

  function normalizeDefectDirectionDepartments(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(function (item) {
        return item && typeof item === "object";
      })
      .map(function (item) {
        var count = Number(item.count);
        return {
          direction: item.direction != null ? String(item.direction).trim() : "",
          name: item.name != null ? String(item.name).trim() : "",
          direction_label: item.direction_label != null ? String(item.direction_label).trim() : "",
          count: isFinite(count) && !isNaN(count) ? Math.round(count) : 0,
        };
      });
  }

  function applyDefectDirectionsToTile(tile, source, year, month) {
    if (!tile || !source || typeof source !== "object") return;
    if (year != null && month != null) {
      var sy = Number(source.year);
      var sm = Number(source.month);
      if (!isNaN(sy) && !isNaN(sm) && (sy !== Number(year) || sm !== Number(month))) return;
    }
    var departments = normalizeDefectDirectionDepartments(source.departments);
    if (departments.length) tile.defect_direction_departments = departments;
    if (source.fact !== undefined && source.fact !== null) tile.fact = source.fact;
  }

  function syncDepartmentsForTile(tile, year, month) {
    if (!tile) return;
    var point =
      year != null && month != null && Array.isArray(tile.monthly_data)
        ? findTileMonthlyDataPoint(tile.monthly_data, year, month)
        : null;
    if (!point) return;
    if (Array.isArray(point.departments)) {
      tile.departments = normalizeDefectDirectionDepartments(point.departments);
    } else if (
      tile.last_full_month_row &&
      typeof tile.last_full_month_row === "object" &&
      Number(tile.last_full_month_row.year) === Number(year) &&
      Number(tile.last_full_month_row.month) === Number(month) &&
      Array.isArray(tile.last_full_month_row.departments)
    ) {
      tile.departments = normalizeDefectDirectionDepartments(tile.last_full_month_row.departments);
    }
    if (point.fact !== undefined && point.fact !== null) tile.fact = point.fact;
  }

  function syncDefectDirectionsForTile(tile, year, month) {
    if (!tile) return;
    var point =
      year != null && month != null && Array.isArray(tile.monthly_data)
        ? findTileMonthlyDataPoint(tile.monthly_data, year, month)
        : null;
    if (point && Array.isArray(point.departments)) {
      applyDefectDirectionsToTile(tile, point, year, month);
      return;
    }
    if (tile.last_full_month_row && typeof tile.last_full_month_row === "object") {
      applyDefectDirectionsToTile(tile, tile.last_full_month_row, year, month);
    }
  }

  function applyMonthlyDataToTilesAtPeriod(tiles, year, month) {
    if (!Array.isArray(tiles) || !tiles.length) return;
    tiles.forEach(function (tile) {
      if (!tile || !Array.isArray(tile.monthly_data)) return;
      var point = findTileMonthlyDataPoint(tile.monthly_data, year, month);
      if (!point) return;
      var isLogM2 = String(tile.kpi_id || "").trim().toUpperCase() === "LOG-M2";
      if (point.plan !== undefined) tile.plan = point.plan;
      if (point.fact !== undefined) tile.fact = point.fact;
      if (point.kpi_pct !== undefined) {
        if (typeof point.kpi_pct === "number" && !isNaN(point.kpi_pct)) {
          tile.percent = point.kpi_pct;
          tile.kpi_pct = point.kpi_pct;
        } else {
          tile.kpi_pct = null;
          tile.percent = null;
        }
      }
      if (isLogM2) {
        tile.units = "руб.";
        tile.unit = "руб.";
        tile.kpi_pct_is_deviation = true;
        var planNum = Number(tile.plan);
        var factNum = Number(tile.fact);
        if (
          isFinite(planNum) &&
          !isNaN(planNum) &&
          isFinite(factNum) &&
          !isNaN(factNum) &&
          Math.abs(planNum) > 0.000001
        ) {
          var devPct = ((factNum - planNum) / Math.abs(planNum)) * 100;
          tile.kpi_pct = devPct;
          tile.percent = devPct;
        }
      }
      if (typeof point.has_data === "boolean") tile.has_data = point.has_data;
      syncTileColorFromMonthlyPoint(tile, point, { useMonthFilter: true });
      var label = formatPlanFactPeriodFromMonthlyPoint(point);
      if (label) tile.plan_fact_period_label = label;
      if (Array.isArray(point.articles)) {
        tile.articles = point.articles.slice();
      }
      syncDepartmentsForTile(tile, year, month);
      syncDefectDirectionsForTile(tile, year, month);
      syncQualdirControlTileFieldsFromPoint(tile, point, year, month);
      ensureQualdirPieceCountUnits(tile);
    });
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

  function rowsObjectToArray(rows) {
    if (!rows || typeof rows !== "object") return [];
    if (Array.isArray(rows)) return rows.slice();
    var keys = Object.keys(rows);
    if (!keys.length) return [];
    var looksLikeRowMap = keys.every(function (key) {
      var item = rows[key];
      return item && typeof item === "object";
    });
    if (!looksLikeRowMap) return [rows];
    return keys
      .map(function (key) {
        return rows[key];
      })
      .filter(function (item) {
        return item && typeof item === "object";
      });
  }

  function getTablesMapFromBody(body) {
    if (!body || typeof body !== "object") return null;
    var tables = body[KPI_JSON_KEY_TABLES] || body.tables || body.Tables;
    if (!tables || typeof tables !== "object") return null;
    if (Array.isArray(tables)) {
      var mapped = Object.create(null);
      for (var i = 0; i < tables.length; i++) {
        var tab = tables[i];
        if (!tab || typeof tab !== "object") continue;
        var key =
          tab.kpi_id != null && String(tab.kpi_id).trim() !== ""
            ? String(tab.kpi_id).trim()
            : tab.id != null && String(tab.id).trim() !== ""
              ? String(tab.id).trim()
              : tab.key != null && String(tab.key).trim() !== ""
                ? String(tab.key).trim()
                : "table-" + String(i + 1);
        mapped[key] = tab;
      }
      return mapped;
    }
    return tables;
  }

  function pickLatestTableMonthlyDataPoint(monthlyData) {
    if (!Array.isArray(monthlyData) || !monthlyData.length) return null;
    var best = null;
    var bestKey = -1;
    for (var i = 0; i < monthlyData.length; i++) {
      var point = monthlyData[i];
      if (!point || typeof point !== "object") continue;
      var y = Number(point.year);
      var m = Number(point.month);
      if (isNaN(y) || isNaN(m)) continue;
      var key = y * 100 + m;
      if (key >= bestKey) {
        bestKey = key;
        best = point;
      }
    }
    return best;
  }

  function isMonthKeyedTablesContainerKey(tabKey) {
    var key = tabKey != null ? String(tabKey).trim().toUpperCase() : "";
    return key.indexOf("-BY-MONTH") !== -1;
  }

  /** Таблица-словарь: ключи «1»…«12», значения — срезы с rows/columns (HRD-T-M1-LATE-VACANCIES-BY-MONTH). */
  function isMonthKeyedTableMap(tab) {
    if (!tab || typeof tab !== "object" || Array.isArray(tab)) return false;
    if (Array.isArray(tab.monthly_data) && tab.monthly_data.length) return false;
    if (tab.rows != null) return false;
    if (Array.isArray(tab.columns) && tab.columns.length) return false;
    var keys = Object.keys(tab);
    if (!keys.length) return false;
    for (var i = 0; i < keys.length; i++) {
      var n = Number(keys[i]);
      if (isNaN(n) || n < 1 || n > 12) return false;
      if (!tab[keys[i]] || typeof tab[keys[i]] !== "object") return false;
    }
    return true;
  }

  function pickMonthKeyedTableSlice(tabMap, filterYear, filterMonth) {
    if (!isMonthKeyedTableMap(tabMap)) return null;
    var month = Number(filterMonth);
    if (isNaN(month) || month < 1 || month > 12) return null;
    var slice = tabMap[String(month)] != null ? tabMap[String(month)] : tabMap[month];
    if (!slice || typeof slice !== "object") return null;
    if (filterYear != null && slice.period && slice.period.year != null) {
      if (Number(slice.period.year) !== Number(filterYear)) return null;
    }
    return slice;
  }

  function getMonthKeyedTableCompanionKey(tabKey) {
    var key = tabKey != null ? String(tabKey).trim() : "";
    if (!key || isMonthKeyedTablesContainerKey(key)) return "";
    return key + "-BY-MONTH";
  }

  function getMonthKeyedTableTemplateSlice(tabMap, fallbackTab) {
    if (!isMonthKeyedTableMap(tabMap)) return fallbackTab;
    var keys = Object.keys(tabMap)
      .map(function (k) {
        return Number(k);
      })
      .filter(function (n) {
        return !isNaN(n);
      })
      .sort(function (a, b) {
        return a - b;
      });
    if (keys.length && tabMap[String(keys[0])]) return tabMap[String(keys[0])];
    return fallbackTab;
  }

  /**
   * Для таблиц с companion *-BY-MONTH подставляет срез выбранного месяца вместо
   * плоского снимка «последнего полного месяца» (HRD-T-M1-LATE-VACANCIES).
   */
  function resolveTableSourceForPeriod(tables, tabKey, tab, filterYear, filterMonth) {
    var hasFilter =
      filterYear != null &&
      filterMonth != null &&
      !isNaN(filterYear) &&
      !isNaN(filterMonth) &&
      filterMonth >= 1 &&
      filterMonth <= 12;
    if (!hasFilter || !tables || !tabKey) return tab;

    var companionKey = getMonthKeyedTableCompanionKey(tabKey);
    if (!companionKey || !Object.prototype.hasOwnProperty.call(tables, companionKey)) return tab;

    var byMonth = tables[companionKey];
    var slice = pickMonthKeyedTableSlice(byMonth, filterYear, filterMonth);
    if (slice) return slice;

    var template = getMonthKeyedTableTemplateSlice(byMonth, tab);
    return {
      name: template && template.name != null ? template.name : tab && tab.name,
      description: template && template.description != null ? template.description : tab && tab.description,
      columns:
        template && Array.isArray(template.columns)
          ? template.columns
          : tab && Array.isArray(tab.columns)
            ? tab.columns
            : null,
      period: { year: filterYear, month: filterMonth },
      rows: [],
    };
  }

  /**
   * Прикладная таблица: плоские rows или срез monthly_data по year/month (как у плиток KPI).
   */
  function resolveTableTabView(tab, filterYear, filterMonth) {
    if (!tab || typeof tab !== "object") {
      return { rows: [], columns: null, period: null, name: "", description: "" };
    }
    var hasFilter =
      filterYear != null &&
      filterMonth != null &&
      !isNaN(filterYear) &&
      !isNaN(filterMonth) &&
      filterMonth >= 1 &&
      filterMonth <= 12;
    var monthly = Array.isArray(tab.monthly_data) ? tab.monthly_data : null;
    var slice = null;

    if (monthly && monthly.length) {
      if (hasFilter) {
        slice = findTileMonthlyDataPoint(monthly, filterYear, filterMonth);
      } else {
        var tabPeriod = tab.period && typeof tab.period === "object" ? tab.period : null;
        if (tabPeriod && tabPeriod.year != null && tabPeriod.month != null) {
          slice = findTileMonthlyDataPoint(monthly, tabPeriod.year, tabPeriod.month);
        }
        if (!slice) slice = pickLatestTableMonthlyDataPoint(monthly);
      }
    }

    if (slice) {
      return {
        rows: rowsObjectToArray(slice.rows),
        columns: Array.isArray(slice.columns) ? slice.columns : Array.isArray(tab.columns) ? tab.columns : null,
        period: slice,
        name: tab.name != null ? String(tab.name) : "",
        description: tab.description != null ? String(tab.description) : "",
      };
    }

    return {
      rows: rowsObjectToArray(tab.rows),
      columns: Array.isArray(tab.columns) ? tab.columns : null,
      period: tab.period && typeof tab.period === "object" ? tab.period : null,
      name: tab.name != null ? String(tab.name) : "",
      description: tab.description != null ? String(tab.description) : "",
    };
  }

  function getTableRowsList(tab, filterYear, filterMonth) {
    if (!tab) return [];
    if (Array.isArray(tab.monthly_data) && tab.monthly_data.length) {
      return resolveTableTabView(tab, filterYear, filterMonth).rows;
    }
    if (Array.isArray(tab.items)) return tab.items.slice();
    if (tab && tab.rows != null) return rowsObjectToArray(tab.rows);
    if (tab && tab.items && typeof tab.items === "object") return [tab.items];
    if (Array.isArray(tab)) return tab.slice();
    if (tab && typeof tab === "object" && Array.isArray(tab.data)) return tab.data.slice();
    if (tab && typeof tab === "object" && !Object.prototype.hasOwnProperty.call(tab, "rows")) {
      return [tab];
    }
    return [];
  }

  function isProtocolOverdueTableTabKey(tabKey) {
    var key = tabKey != null ? String(tabKey).trim().toUpperCase() : "";
    return key.indexOf("PROTOCOL-OVERDUE") !== -1;
  }

  var QUALDIR_DEFECT_TABLE_KEYS = ["QD-T-M1", "QD-T-M5", "QD-T-M8"];

  function isQualdirDefectTableTabKey(tabKey) {
    var key = tabKey != null ? String(tabKey).trim().toUpperCase() : "";
    for (var i = 0; i < QUALDIR_DEFECT_TABLE_KEYS.length; i++) {
      if (key === QUALDIR_DEFECT_TABLE_KEYS[i]) return true;
    }
    return false;
  }

  function isServheadSurveysTableTabKey(tabKey) {
    return tabKey != null && String(tabKey).trim().toUpperCase() === "SH-T2";
  }

  function isServheadClientsTableTabKey(tabKey) {
    var key = tabKey != null ? String(tabKey).trim().toUpperCase() : "";
    if (isServheadSurveysTableTabKey(key)) return false;
    return key === "SH-T1" || key.indexOf("SH-T") === 0;
  }

  function hasServheadSurveysTableInBody(body) {
    var tables = getTablesMapFromBody(body);
    if (!tables || typeof tables !== "object") return false;
    return Object.prototype.hasOwnProperty.call(tables, "SH-T2");
  }

  function hasServheadClientsTableInBody(body) {
    var tables = getTablesMapFromBody(body);
    if (!tables || typeof tables !== "object") return false;
    var keys = Object.keys(tables);
    for (var i = 0; i < keys.length; i++) {
      if (isServheadClientsTableTabKey(keys[i])) return true;
    }
    return false;
  }

  function hasServheadDashboardTilesInBody(body) {
    var tiles = body && body[KPI_JSON_KEY_TILES] && body[KPI_JSON_KEY_TILES].items;
    if (!Array.isArray(tiles)) return false;
    for (var i = 0; i < tiles.length; i++) {
      var id = tiles[i] && tiles[i].kpi_id != null ? String(tiles[i].kpi_id).trim().toUpperCase() : "";
      if (id.indexOf("SH-M") === 0) return true;
    }
    return false;
  }

  function hasServheadDashboardInBody(body) {
    return (
      hasServheadClientsTableInBody(body) ||
      hasServheadSurveysTableInBody(body) ||
      hasServheadDashboardTilesInBody(body)
    );
  }

  function getTableTabMetaFromBody(body, tableKey, filterYear, filterMonth) {
    var tables = getTablesMapFromBody(body);
    if (!tables || typeof tables !== "object") return null;
    var wanted = tableKey != null ? String(tableKey).trim() : "";
    if (!wanted || !Object.prototype.hasOwnProperty.call(tables, wanted)) return null;
    var tab = tables[wanted];
    if (!tab || typeof tab !== "object") return null;
    var view = resolveTableTabView(tab, filterYear, filterMonth);
    return {
      kpi_id: tab.kpi_id != null ? String(tab.kpi_id) : wanted,
      name: view.name || (tab.name != null ? String(tab.name).trim() : ""),
      description: view.description || (tab.description != null ? String(tab.description).trim() : ""),
      columns: Array.isArray(view.columns)
        ? view.columns.slice()
        : Array.isArray(tab.columns)
          ? tab.columns.slice()
          : [],
      periodicity: tab.periodicity != null ? String(tab.periodicity) : "",
      period: view.period || tab.period || null,
      totals: tab.totals && typeof tab.totals === "object" ? tab.totals : null,
    };
  }

  function hasQualdirDefectTablesInBody(body) {
    var tables = getTablesMapFromBody(body);
    if (!tables || typeof tables !== "object") return false;
    var keys = Object.keys(tables);
    for (var i = 0; i < keys.length; i++) {
      if (isQualdirDefectTableTabKey(keys[i])) return true;
    }
    return false;
  }

  function hasProtocolOverdueTableInBody(body, filterYear, filterMonth) {
    var tables = getTablesMapFromBody(body);
    if (!tables || typeof tables !== "object") return false;
    var keys = Object.keys(tables);
    for (var i = 0; i < keys.length; i++) {
      if (isProtocolOverdueTableTabKey(keys[i])) return true;
    }
    return false;
  }

  function numberOrNull(v) {
    if (v == null) return null;
    if (typeof v === "string" && String(v).trim() === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function isMonthlyColumnChartType(raw) {
    if (raw == null) return false;
    var s = String(raw).toLowerCase();
    return s.indexOf("column") !== -1 && s.indexOf("monthly") !== -1;
  }

  function resolveChartFilterYearMonth(chart, filterYear, filterMonth) {
    var y = parseIntLoose(filterYear);
    var m = parseIntLoose(filterMonth);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
    var period = chart && chart.period && typeof chart.period === "object" ? chart.period : null;
    if (period) {
      y = parseIntLoose(period.year);
      m = parseIntLoose(period.month);
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
        return { year: y, month: m };
      }
    }
    return null;
  }

  function findMonthlySeriesDataIndex(series, year, month) {
    var points = getSeriesPointsList(series);
    var y = parseIntLoose(year);
    var m = parseIntLoose(month);
    if (isNaN(y) || isNaN(m)) return -1;

    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p || typeof p !== "object") continue;
      if (parseIntLoose(p.year) === y && parseIntLoose(p.month) === m) return i;
    }

    var categories = Array.isArray(series.categories) ? series.categories : [];
    var monthNames = [null, "январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
    var monthToken = monthNames[m] || "";
    for (var c = 0; c < categories.length; c++) {
      var cat = categories[c] != null ? String(categories[c]).trim().toLowerCase() : "";
      if (!cat) continue;
      if (monthToken && cat.indexOf(monthToken) === 0) return c;
    }

    var idx = m - 1;
    if (idx >= 0 && idx < categories.length) return idx;
    return -1;
  }

  function categoryLooksLikeMonthName(cat) {
    var c = cat != null ? String(cat).trim().toLowerCase() : "";
    if (!c) return false;
    var monthPrefixes = [
      "январ",
      "феврал",
      "март",
      "апрел",
      "май",
      "июн",
      "июл",
      "август",
      "сентябр",
      "октябр",
      "ноябр",
      "декабр",
    ];
    for (var i = 0; i < monthPrefixes.length; i++) {
      if (c.indexOf(monthPrefixes[i]) === 0) return true;
    }
    return false;
  }

  function seriesCategoriesLookLikeMonths(series) {
    var categories = Array.isArray(series && series.categories) ? series.categories : [];
    if (!categories.length) return false;
    for (var i = 0; i < categories.length; i++) {
      if (!categoryLooksLikeMonthName(categories[i])) return false;
    }
    return true;
  }

  function readSeriesPlanFactAtIndex(series, idx) {
    if (!series) return { plan: null, fact: null, point: null };
    var explicitPlan = Array.isArray(series.plan) ? series.plan : [];
    var explicitFact = Array.isArray(series.fact) ? series.fact : [];
    var seriesPoints = getSeriesPointsList(series);
    var srcPoint =
      idx >= 0 && seriesPoints[idx] && typeof seriesPoints[idx] === "object" ? seriesPoints[idx] : null;
    var point = srcPoint ? Object.assign({}, srcPoint) : {};
    var planValue;
    var factValue;
    if (idx >= 0) {
      planValue = explicitPlan[idx];
      factValue = explicitFact[idx];
    } else if (!Array.isArray(series.plan) && !Array.isArray(series.fact)) {
      planValue = series.plan;
      factValue = series.fact;
    } else {
      planValue = explicitPlan.length === 1 ? explicitPlan[0] : undefined;
      factValue = explicitFact.length === 1 ? explicitFact[0] : undefined;
    }
    if (point.plan == null && planValue !== undefined) point.plan = planValue;
    if (point.fact == null && factValue !== undefined) point.fact = factValue;
    return { plan: planValue, fact: factValue, point: point };
  }

  function seriesHasColumnDataForPeriod(series, year, month) {
    if (!series) return false;
    if (findMonthlySeriesDataIndex(series, year, month) >= 0) return true;
    if (seriesCategoriesLookLikeMonths(series)) return false;
    if (Array.isArray(series.plan) && series.plan.length) return true;
    if (Array.isArray(series.fact) && series.fact.length) return true;
    if (planFactValuePresent(series.plan) || planFactValuePresent(series.fact)) return true;
    return false;
  }

  function buildTileLookupByKpiId(body) {
    var lookup = Object.create(null);
    if (!body || typeof body !== "object") return lookup;
    var tilesBlock = body[KPI_JSON_KEY_TILES];
    var items =
      tilesBlock && Array.isArray(tilesBlock.items)
        ? tilesBlock.items
        : Array.isArray(tilesBlock)
          ? tilesBlock
          : [];
    for (var i = 0; i < items.length; i++) {
      var tile = items[i];
      if (!tile || tile.kpi_id == null) continue;
      lookup[String(tile.kpi_id).trim().toUpperCase()] = tile;
    }
    return lookup;
  }

  function readPlanFactFromTileMonthlyData(kpiId, period, tileLookup) {
    if (!kpiId || !tileLookup || !period) return null;
    var tile = tileLookup[String(kpiId).trim().toUpperCase()];
    if (!tile || !Array.isArray(tile.monthly_data)) return null;
    var monthlyPoint =
      findTileMonthlyDataPoint(tile.monthly_data, period.year, period.month) ||
      findLatestTileMonthlyDataPointUpTo(tile.monthly_data, period.year, period.month);
    if (!monthlyPoint) return null;
    return {
      plan: monthlyPoint.plan,
      fact: monthlyPoint.fact,
      point: Object.assign({}, monthlyPoint, {
        kpi_id: kpiId,
        year: monthlyPoint.year != null ? monthlyPoint.year : period.year,
        month: monthlyPoint.month != null ? monthlyPoint.month : period.month,
      }),
    };
  }

  /**
   * GSPP-C2 / DEVDIR-C2 / RD-C2: одна series, на оси X несколько KPI за один месяц.
   */
  function isSeriesKpiSnapshotColumn(series, year, month) {
    if (!series || typeof series !== "object") return false;
    if (seriesCategoriesLookLikeMonths(series)) return false;
    var categories = Array.isArray(series.categories) ? series.categories : [];
    var plan = Array.isArray(series.plan) ? series.plan : [];
    var fact = Array.isArray(series.fact) ? series.fact : [];
    if (!categories.length) return false;
    if (!plan.length && !fact.length) return false;
    var points = getSeriesPointsList(series);
    if (!points.length) return true;
    var y = parseIntLoose(year);
    var m = parseIntLoose(month);
    if (isNaN(y) || isNaN(m)) return true;
    var matched = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p || typeof p !== "object") continue;
      if (parseIntLoose(p.year) === y && parseIntLoose(p.month) === m) matched++;
    }
    return matched >= 1 || categories.length >= 2;
  }

  function buildKpiSnapshotColumnBarIndicator(chart, chartKey, series, period, tileLookup) {
    var explicitCategories = Array.isArray(series.categories) ? series.categories.slice() : [];
    var explicitPlan = Array.isArray(series.plan) ? series.plan.slice() : [];
    var explicitFact = Array.isArray(series.fact) ? series.fact.slice() : [];
    var seriesPoints = getSeriesPointsList(series);
    var maxLen = explicitCategories.length;
    if (explicitPlan.length > maxLen) maxLen = explicitPlan.length;
    if (explicitFact.length > maxLen) maxLen = explicitFact.length;
    if (seriesPoints.length > maxLen) maxLen = seriesPoints.length;
    if (!maxLen) return null;

    var categories = [];
    var plan = [];
    var fact = [];
    var points = [];

    for (var i = 0; i < maxLen; i++) {
      var srcPoint = seriesPoints[i] && typeof seriesPoints[i] === "object" ? seriesPoints[i] : null;
      var categoryLabel =
        explicitCategories[i] != null && String(explicitCategories[i]).trim() !== ""
          ? String(explicitCategories[i]).trim()
          : srcPoint && srcPoint.name != null && String(srcPoint.name).trim() !== ""
            ? String(srcPoint.name).trim()
            : String(i + 1);
      var planValue = explicitPlan[i];
      var factValue = explicitFact[i];
      var point = srcPoint ? Object.assign({}, srcPoint) : {};
      var kpiId = srcPoint && srcPoint.kpi_id != null ? String(srcPoint.kpi_id).trim() : "";
      var fromTiles = kpiId ? readPlanFactFromTileMonthlyData(kpiId, period, tileLookup) : null;

      if (fromTiles) {
        planValue = fromTiles.plan !== undefined ? fromTiles.plan : planValue;
        factValue = fromTiles.fact !== undefined ? fromTiles.fact : factValue;
        point = Object.assign({}, point, fromTiles.point);
      } else if (srcPoint) {
        var py = parseIntLoose(srcPoint.year);
        var pm = parseIntLoose(srcPoint.month);
        if (!isNaN(py) && !isNaN(pm) && (py !== period.year || pm !== period.month)) {
          planValue = planValue !== undefined ? planValue : srcPoint.plan;
          factValue = factValue !== undefined ? factValue : srcPoint.fact;
          point = Object.assign({}, srcPoint);
        }
      }

      if (point.name == null) point.name = categoryLabel;
      if (point.plan == null && planValue !== undefined) point.plan = planValue;
      if (point.fact == null && factValue !== undefined) point.fact = factValue;
      categories.push(categoryLabel);
      plan.push(numberOrNull(planValue !== undefined ? planValue : point.plan));
      fact.push(numberOrNull(factValue !== undefined ? factValue : point.fact));
      points.push(point);
    }

    if (!categories.length) return null;

    var chartName =
      chart.name != null && String(chart.name).trim() !== ""
        ? String(chart.name).trim()
        : chart.kpi_id != null
          ? String(chart.kpi_id).trim()
          : chartKey != null
            ? String(chartKey).trim()
            : "KPI";

    return {
      id: chart.kpi_id || chartKey || chartName,
      optionLabel: chartName,
      title: chartName,
      xAxisTitle: chart.x_axis_title || chart.xAxisTitle || "Показатель",
      yAxisTitle: chart.y_axis_title || chart.yAxisTitle || "Значение",
      categories: categories,
      points: points,
      plan: plan,
      fact: fact,
      disableAllOption: true,
    };
  }

  function buildMergedKpiColumnBarIndicator(chart, chartKey, seriesList, period, tileLookup) {
    var rows = seriesList.filter(function (s) {
      if (!s) return false;
      var label = s.form || s.name || s.kpi_id || "KPI";
      if (isAggregateKpiTile(s, label)) return false;
      if (seriesHasColumnDataForPeriod(s, period.year, period.month)) return true;
      return !!(s.kpi_id && readPlanFactFromTileMonthlyData(s.kpi_id, period, tileLookup));
    });
    if (!rows.length) return null;

    var categories = [];
    var plan = [];
    var fact = [];
    var points = [];

    rows.forEach(function (s) {
      var idx = findMonthlySeriesDataIndex(s, period.year, period.month);
      var pf = readSeriesPlanFactAtIndex(s, idx);
      if (idx < 0 && s.kpi_id) {
        var fromTiles = readPlanFactFromTileMonthlyData(s.kpi_id, period, tileLookup);
        if (fromTiles) {
          pf = {
            plan: fromTiles.plan,
            fact: fromTiles.fact,
            point: Object.assign({}, fromTiles.point, {
              name:
                s.name != null && String(s.name).trim() !== ""
                  ? String(s.name).trim()
                  : fromTiles.point.name,
            }),
          };
        }
      }
      var categoryLabel =
        s.form != null && String(s.form).trim() !== ""
          ? String(s.form).trim()
          : s.name != null && String(s.name).trim() !== ""
            ? String(s.name).trim()
            : pf.point && pf.point.name != null && String(pf.point.name).trim() !== ""
              ? String(pf.point.name).trim()
              : s.kpi_id != null
                ? String(s.kpi_id).trim()
                : "KPI";
      if (pf.point.name == null) pf.point.name = categoryLabel;
      categories.push(categoryLabel);
      plan.push(
        numberOrNull(pf.plan !== undefined ? pf.plan : pf.point.plan)
      );
      fact.push(
        numberOrNull(pf.fact !== undefined ? pf.fact : pf.point.fact)
      );
      points.push(pf.point);
    });

    if (!categories.length) return null;

    var chartName =
      chart.name != null && String(chart.name).trim() !== ""
        ? String(chart.name).trim()
        : chart.kpi_id != null
          ? String(chart.kpi_id).trim()
          : chartKey != null
            ? String(chartKey).trim()
            : "KPI";

    return {
      id: chart.kpi_id || chartKey || chartName,
      optionLabel: chartName,
      title: chartName,
      xAxisTitle: chart.x_axis_title || chart.xAxisTitle || "Показатель",
      yAxisTitle: chart.y_axis_title || chart.yAxisTitle || "Значение",
      categories: categories,
      points: points,
      plan: plan,
      fact: fact,
      disableAllOption: true,
    };
  }

  /**
   * column_plan_fact_monthly: на оси X — формы/показатели, значения plan/fact только за выбранный месяц.
   */
  function buildMonthlyColumnBarIndicatorFromChart(chart, chartKey, filterYear, filterMonth, tileLookup) {
    var seriesList = getChartSeriesList(chart);
    if (!seriesList.length) return null;

    var period = resolveChartFilterYearMonth(chart, filterYear, filterMonth);
    if (!period) return null;

    if (seriesList.length === 1 && isSeriesKpiSnapshotColumn(seriesList[0], period.year, period.month)) {
      return buildKpiSnapshotColumnBarIndicator(chart, chartKey, seriesList[0], period, tileLookup);
    }

    if (seriesList.length > 1) {
      var allKpiColumns = seriesList.every(function (s) {
        return !s || !seriesCategoriesLookLikeMonths(s);
      });
      if (allKpiColumns) {
        var merged = buildMergedKpiColumnBarIndicator(chart, chartKey, seriesList, period, tileLookup);
        if (merged) return merged;
      }
    }

    var usableSeries = seriesList.filter(function (s) {
      if (!s) return false;
      var label = s.form || s.name || s.kpi_id || "KPI";
      if (isAggregateKpiTile(s, label)) return false;
      return seriesHasColumnDataForPeriod(s, period.year, period.month);
    });
    if (!usableSeries.length) return null;

    var multiSeries = usableSeries.length > 1;
    var categories = [];
    var plan = [];
    var fact = [];
    var points = [];

    usableSeries.forEach(function (s) {
      var idx = findMonthlySeriesDataIndex(s, period.year, period.month);
      if (idx < 0 && !seriesHasColumnDataForPeriod(s, period.year, period.month)) return;

      var explicitCategories = Array.isArray(s.categories) ? s.categories : [];
      var pf = readSeriesPlanFactAtIndex(s, idx);
      var point = pf.point;

      var categoryLabel;
      if (multiSeries) {
        categoryLabel =
          s.form != null && String(s.form).trim() !== ""
            ? String(s.form).trim()
            : s.name != null && String(s.name).trim() !== ""
              ? String(s.name).trim()
              : s.kpi_id != null
                ? String(s.kpi_id).trim()
                : "KPI";
      } else if (point && point.month_name != null && String(point.month_name).trim() !== "") {
        categoryLabel = capitalizeRuMonthToken(point.month_name);
      } else if (chart.period && chart.period.month_name != null && String(chart.period.month_name).trim() !== "") {
        categoryLabel = capitalizeRuMonthToken(chart.period.month_name);
      } else if (idx >= 0 && explicitCategories[idx] != null && String(explicitCategories[idx]).trim() !== "") {
        categoryLabel = capitalizeRuMonthToken(explicitCategories[idx]);
      } else {
        categoryLabel =
          s.form != null && String(s.form).trim() !== ""
            ? String(s.form).trim()
            : s.name != null && String(s.name).trim() !== ""
              ? String(s.name).trim()
              : capitalizeRuMonthToken(MONTH_SHORT[period.month - 1] || String(period.month));
      }

      if (point.name == null) point.name = categoryLabel;

      categories.push(categoryLabel);
      plan.push(numberOrNull(pf.plan !== undefined ? pf.plan : point.plan));
      fact.push(numberOrNull(pf.fact !== undefined ? pf.fact : point.fact));
      points.push(point);
    });

    if (!categories.length) return null;

    var chartName =
      chart.name != null && String(chart.name).trim() !== ""
        ? String(chart.name).trim()
        : chart.kpi_id != null
          ? String(chart.kpi_id).trim()
          : chartKey != null
            ? String(chartKey).trim()
            : "KPI";

    return {
      id: chart.kpi_id || chartKey || chartName,
      optionLabel: chartName,
      title: chartName,
      xAxisTitle: chart.x_axis_title || chart.xAxisTitle || (multiSeries ? "Форма" : "Период"),
      yAxisTitle: chart.y_axis_title || chart.yAxisTitle || "Значение",
      categories: categories,
      points: points,
      plan: plan,
      fact: fact,
      disableAllOption: true,
    };
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

      if (series.single_indicator || series.singleIndicator) {
        return [{
          id: series.kpi_id || name,
          optionLabel: series.option_label || series.optionLabel || name,
          title: series.option_label || series.optionLabel || name,
          xAxisTitle: series.x_axis_title || series.xAxisTitle || "Период",
          yAxisTitle: series.y_axis_title || series.yAxisTitle || series.unit || "Значение",
          categories: explicitCategories.map(function (v, idx) {
            if (v != null && String(v).trim() !== "") return String(v).trim();
            var srcPoint = points[idx] && typeof points[idx] === "object" ? points[idx] : null;
            if (srcPoint && srcPoint.label != null) return String(srcPoint.label);
            return String(idx + 1);
          }),
          points: points,
          plan: explicitPlan.map(numberOrNull),
          fact: explicitFact.map(numberOrNull),
          disableAllOption: !!series.disable_all_option,
          unit: series.unit || null,
        }];
      }

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

  function planFactPointHasAny(p) {
    return p && (planFactValuePresent(p.plan) || planFactValuePresent(p.fact));
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

  function pickMonthlyPointWithAnyPlanFactForYearMonth(points, year, month) {
    if (!points || !points.length || year == null || month == null) return null;
    var target = year * 100 + month;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!planFactPointHasAny(p)) continue;
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

  function pickLatestMonthlyPointWithAnyPlanFact(points) {
    if (!points || !points.length) return null;
    var best = null;
    var bestKey = -1;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!planFactPointHasAny(p)) continue;
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

  function buildMonthlyDataFromCharts(body) {
    var out = {};
    if (!body) return out;
    var charts = body[KPI_JSON_KEY_CHARTS];
    if (!charts || typeof charts !== "object") return out;
    Object.keys(charts).forEach(function (key) {
      var chart = charts[key];
      var seriesList = getChartSeriesList(chart);
      if (!chart || !chart.chart_type || !seriesList.length) return;
      if (classifyChartType(chart.chart_type) !== "line") return;
      seriesList.forEach(function (s) {
        var points = getSeriesPointsList(s);
        if (!s || s.kpi_id == null || !points.length) return;
        var kid = String(s.kpi_id);
        var sortedPoints = points
          .filter(function (point) { return point && typeof point === "object" && point.month != null; })
          .sort(function (a, b) { return monthlyPointSortKey(a) - monthlyPointSortKey(b); });
        var normalized = sortedPoints.map(function (point) {
            return {
              month: point.month,
              month_name: point.month_name,
              year: point.year,
              plan: point.plan,
              fact: point.fact,
              expected_plan: point.expected_plan,
              kpi_pct: point.kpi_pct,
              has_data: hasDataFromPointAndSeries(point, s),
            };
          });
        if (Array.isArray(s.line_series) && s.line_series.length) {
          var factLine = null;
          var planLine = null;
          s.line_series.forEach(function (line) {
            if (!line || !Array.isArray(line.data)) return;
            var role = String(line.value_role || line.valueRole || "").toLowerCase();
            var metric = String(line.metric || "").toLowerCase();
            var name = String(line.name || "").toLowerCase();
            if (!factLine && (role === "fact" || metric.indexOf("fact") !== -1 || name.indexOf("факт") !== -1)) factLine = line;
            if (!planLine && (role === "plan" || metric.indexOf("plan") !== -1 || name.indexOf("план") !== -1)) planLine = line;
          });
          if (factLine || planLine) {
            normalized = sortedPoints.map(function (point, idx) {
              return {
                month: point.month,
                month_name: point.month_name,
                year: point.year,
                plan: planLine && planLine.data ? planLine.data[idx] : point.plan,
                fact: factLine && factLine.data ? factLine.data[idx] : point.fact,
                expected_plan: point.expected_plan,
                kpi_pct: point.kpi_pct,
                has_data: hasDataFromPointAndSeries(point, s),
              };
            });
          }
        }
        if (normalized.length && (!out[kid] || normalized.length > out[kid].length)) {
          out[kid] = normalized;
        }
      });
    });
    return out;
  }

  function monthlyDataHasSparkValues(monthly) {
    if (!Array.isArray(monthly) || !monthly.length) return false;
    return monthly.some(function (point) {
      return point && (point.fact != null || point.kpi_pct != null || point.plan != null);
    });
  }

  /**
   * Обход строк body["Таблицы"]: значение по ключу — { rows: [...] } или сразу массив строк.
   * @param {object|null|undefined} tables
   * @param {function(string tabKey, object row, object|Array): void} fn
   */
  function forEachTablesRow(tables, fn, filterYear, filterMonth) {
    var normalized = getTablesMapFromBody({ "\u0422\u0430\u0431\u043b\u0438\u0446\u044b": tables });
    if (!normalized || typeof normalized !== "object") return;
    Object.keys(normalized).forEach(function (tk) {
      if (isMonthKeyedTablesContainerKey(tk)) return;
      var tab = normalized[tk];
      var sourceTab = resolveTableSourceForPeriod(normalized, tk, tab, filterYear, filterMonth);
      var view = resolveTableTabView(sourceTab, filterYear, filterMonth);
      var rows = view.rows;
      if (!rows || !rows.length) return;
      var resolvedTab = {
        kpi_id: tab.kpi_id,
        name: view.name || tab.name,
        description: view.description || tab.description,
        columns: view.columns,
        period: view.period,
        monthly_data: tab.monthly_data,
        data_granularity: tab.data_granularity,
        rows: rows,
      };
      for (var i = 0; i < rows.length; i++) {
        fn(tk, rows[i], resolvedTab);
      }
    });
  }

  /** Только блоки Таблицы: plan/fact по строкам (например сводка за период). */
  function buildPlanFactLookupFromTablesOnly(body, filterYear, filterMonth) {
    var planFactLookup = {};
    if (!body) return planFactLookup;
    var tables = getTablesMapFromBody(body);
    var useMonthFilter =
      filterYear != null &&
      filterMonth != null &&
      !isNaN(filterYear) &&
      !isNaN(filterMonth) &&
      filterMonth >= 1 &&
      filterMonth <= 12;
    forEachTablesRow(
      tables,
      function (tk, row) {
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
    },
      filterYear,
      filterMonth
    );
    return planFactLookup;
  }

  function getClientAggregationMode() {
    if (
      typeof DashboardMonthNav !== "undefined" &&
      DashboardMonthNav &&
      typeof DashboardMonthNav.getPeriodState === "function"
    ) {
      var ps = DashboardMonthNav.getPeriodState();
      if (ps && ps.aggregationMode != null && String(ps.aggregationMode).trim()) {
        return String(ps.aggregationMode).trim();
      }
    }
    return "current";
  }

  function resolvePlanFactFromMonthlyPoint(point) {
    if (!point || typeof point !== "object") {
      return { plan: null, fact: null, kpi_pct: null };
    }
    var plan = point.plan;
    var fact = point.fact;
    var kpiPct = typeof point.kpi_pct === "number" && !isNaN(point.kpi_pct) ? point.kpi_pct : null;
    if (getClientAggregationMode() === "month" && point.plan_full != null) {
      plan = point.plan_full;
      var planNum = Number(plan);
      var factNum = Number(fact);
      if (isFinite(planNum) && !isNaN(planNum) && isFinite(factNum) && !isNaN(factNum) && Math.abs(planNum) > 0.000001) {
        kpiPct = (factNum / planNum) * 100;
      }
    }
    return { plan: plan, fact: fact, kpi_pct: kpiPct };
  }

  function buildPlanFactLookupFromTileMonthlyData(tiles, filterYear, filterMonth) {
    var out = {};
    if (!Array.isArray(tiles) || !tiles.length) return out;
    var useMonthFilter =
      filterYear != null &&
      filterMonth != null &&
      !isNaN(filterYear) &&
      !isNaN(filterMonth) &&
      filterMonth >= 1 &&
      filterMonth <= 12;
    tiles.forEach(function (tile) {
      if (!tile || !tile.kpi_id || !Array.isArray(tile.monthly_data) || !tile.monthly_data.length) return;
      var point = useMonthFilter
        ? findTileMonthlyDataPoint(tile.monthly_data, filterYear, filterMonth) ||
          pickMonthlyPointWithAnyPlanFactForYearMonth(tile.monthly_data, filterYear, filterMonth)
        : pickLatestMonthlyPointWithAnyPlanFact(tile.monthly_data);
      if (!point) return;
      var kid = String(tile.kpi_id || "").trim().toUpperCase();
      // LOG-M2: на плитке суммы в рублях, KPI% = (факт−план)/план; не подменять на display_*.
      var isLogM2RubAmounts = kid === "LOG-M2";
      var isWeightedDeviation =
        !isLogM2RubAmounts && point.aggregation === "weighted_delta_amount_div_project_amount";
      var resolved = resolvePlanFactFromMonthlyPoint(point);
      var kpiPct = resolved.kpi_pct;
      if (isLogM2RubAmounts && (kpiPct == null || point.aggregation === "weighted_delta_amount_div_project_amount")) {
        var planNumLog = Number(resolved.plan);
        var factNumLog = Number(resolved.fact);
        if (
          isFinite(planNumLog) &&
          !isNaN(planNumLog) &&
          isFinite(factNumLog) &&
          !isNaN(factNumLog) &&
          Math.abs(planNumLog) > 0.000001
        ) {
          kpiPct = ((factNumLog - planNumLog) / Math.abs(planNumLog)) * 100;
        } else if (typeof point.kpi_pct === "number" && !isNaN(point.kpi_pct)) {
          kpiPct = point.kpi_pct;
        }
      }
      out[String(tile.kpi_id)] = {
        plan:
          isWeightedDeviation && point.display_plan !== undefined ? point.display_plan : resolved.plan,
        fact: isWeightedDeviation && point.display_fact !== undefined ? point.display_fact : resolved.fact,
        expected_plan: point.expected_plan,
        kpi_pct: kpiPct,
        plan_fact_rows: Array.isArray(point.plan_fact_rows) ? point.plan_fact_rows : [],
        project_deviation_rows: Array.isArray(point.project_deviation_rows) ? point.project_deviation_rows : [],
        max_allowed_delay_workdays:
          point.max_allowed_delay_workdays != null ? point.max_allowed_delay_workdays : null,
        plan_fact_period_label: formatPlanFactPeriodFromMonthlyPoint(point),
        has_data: typeof point.has_data === "boolean" ? point.has_data : undefined,
        display_unit: isWeightedDeviation && point.display_unit != null ? point.display_unit : undefined,
        force_unit: isLogM2RubAmounts ? "руб." : undefined,
        color: point.color != null ? point.color : undefined,
      };
    });
    return out;
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

  function planFactLimitRag(plan, fact) {
    var planValue = Number(plan);
    var factValue = Number(fact);
    if (!isFinite(planValue) || isNaN(planValue) || !isFinite(factValue) || isNaN(factValue)) return null;
    if (factValue < planValue) return "green";
    if (Math.abs(factValue - planValue) < 0.000001) return "yellow";
    return "red";
  }

  function normalizeBackendTileColor(value) {
    if (value == null) return null;
    var normalized = String(value).toLowerCase().trim();
    return normalized ? normalized : null;
  }

  function clearStaleTileColorFields(tile) {
    if (!tile) return;
    tile.color = null;
    tile.rag = null;
    tile.backend_color = null;
    tile.status_color = null;
  }

  function monthlyPointPctForColor(point) {
    if (!point || typeof point !== "object") return null;
    if (typeof point.kpi_pct === "number" && !isNaN(point.kpi_pct)) return point.kpi_pct;
    var planN = Number(point.plan);
    var factN = Number(point.fact);
    if (isFinite(planN) && planN > 0 && isFinite(factN) && !isNaN(factN)) {
      return (factN / planN) * 100;
    }
    return null;
  }

  /**
   * Цвет плитки для выбранного месяца: monthly_data[].color, затем пороги/KPI-правила.
   * При явном месяце не оставляет color/rag с верхнего уровня (last_full_month).
   */
  function syncTileColorFromMonthlyPoint(tile, point, options) {
    options = options || {};
    var useMonthFilter = !!options.useMonthFilter;
    if (!tile || !point) return;

    if (point.color != null && String(point.color).trim() !== "") {
      applyBackendTileColor(tile, point.color);
      return;
    }

    var id = tile.kpi_id != null ? String(tile.kpi_id).trim().toUpperCase() : "";
    var pct = monthlyPointPctForColor(point);

    if (isBudgetFotLimitKpiId(id, tile) && !isHigherIsBetterKpiItem(tile)) {
      var pfRag = planFactLimitRag(point.plan, point.fact);
      if (pfRag) {
        applyBackendTileColor(tile, pfRag);
        return;
      }
    }
    if (isCommercialHigherIsBetterPlanFactKpiId(id)) {
      var commercialRag =
        higherBetterRagFromPlanFact(point.plan, point.fact) ||
        (pct != null ? higherBetterRagFromPct(pct) : null);
      if (commercialRag) {
        applyBackendTileColor(tile, commercialRag);
        return;
      }
    }
    if (isTurnoverKpiTile(tile) && pct != null) {
      var turnoverRag = turnoverLimitRagFromPct(pct);
      if (turnoverRag) {
        applyBackendTileColor(tile, turnoverRag);
        return;
      }
    }

    var MockData = global.MockData;
    if (
      pct != null &&
      MockData &&
      typeof MockData.deriveRagFromThresholds === "function"
    ) {
      var fromThresholds = MockData.deriveRagFromThresholds(tile, pct);
      if (fromThresholds) {
        applyBackendTileColor(tile, fromThresholds);
        return;
      }
    }

    if (useMonthFilter) {
      clearStaleTileColorFields(tile);
    }
  }

  function applyBackendTileColor(tile, color) {
    var normalized = normalizeBackendTileColor(color);
    if (!normalized || !tile) return;
    tile.color = normalized;
    tile.rag = normalized;
  }

  /** KD-M1 Деньги, KD-M2 Отгрузки, KD-M3 Договоры — чем выше факт относительно плана, тем лучше. */
  function isCommercialHigherIsBetterPlanFactKpiId(kpiId) {
    var id = kpiId != null ? String(kpiId).trim().toUpperCase() : "";
    return id === "KD-M1" || id === "KD-M2" || id === "KD-M3";
  }

  function higherBetterRagFromPct(pct) {
    var value = Number(pct);
    if (!isFinite(value) || isNaN(value)) return null;
    if (value >= 100) return "green";
    if (value >= 90) return "yellow";
    return "red";
  }

  function higherBetterRagFromPlanFact(plan, fact) {
    var planValue = Number(plan);
    var factValue = Number(fact);
    if (!isFinite(planValue) || isNaN(planValue) || !isFinite(factValue) || isNaN(factValue)) return null;
    if (factValue > planValue) return "green";
    if (Math.abs(factValue - planValue) < 0.000001) {
      return planValue > 0 ? "green" : "yellow";
    }
    if (planValue <= 0) return "red";
    return higherBetterRagFromPct((factValue / planValue) * 100);
  }

  function turnoverLimitRagFromPct(pct) {
    var value = Number(pct);
    if (!isFinite(value) || isNaN(value)) return null;
    if (value < 90) return "green";
    if (value <= 100) return "yellow";
    return "red";
  }

  function isTurnoverKpiTile(tile) {
    if (!tile || typeof tile !== "object") return false;
    var id = tile.kpi_id != null ? String(tile.kpi_id).trim().toUpperCase() : "";
    var title = tile.title != null ? String(tile.title).toLocaleLowerCase("ru-RU") : "";
    if (title.indexOf("текучесть") !== -1) return true;
    if (id === "LOG-Q2" || id === "OD-Q2" || id === "QD-Q2" || id === "RD-Q2" || id === "TD-Q2" || id === "ZKD-Q2") return true;
    if (id.indexOf("PD-Q2.") === 0) return true;
    return id.slice(-3) === "-Q5";
  }

  function isBudgetFotLimitKpiId(kpiId, item) {
    var id = kpiId != null ? String(kpiId).trim().toUpperCase() : "";
    if (!id) return false;
    if (id === "LOG-M3.B" || id === "LOG-M3.F" || id === "OD-M3.1" || id === "OD-M3.2") return true;
    if (id === "METD-M3.B" || id === "METD-M3.F") return true;
    if (id.indexOf("PD-M3.B") === 0 || id.indexOf("PD-M3.F") === 0) return true;
    if (/-M3-[12]$/.test(id) || /M3\.[12]$/.test(id)) {
      var title =
        item && item.title != null
          ? String(item.title)
          : item && item.name != null
            ? String(item.name)
            : "";
      title = title.trim().toLocaleLowerCase("ru-RU");
      return title.indexOf("фот") !== -1 || title.indexOf("бюджет") !== -1;
    }
    return false;
  }

  function isHigherIsBetterKpiItem(item) {
    if (!item || typeof item !== "object") return false;
    if (item.pct_higher_is_better === true) return true;
    var dir = item.rag_direction != null ? String(item.rag_direction).trim().toLowerCase() : "";
    return dir === "higher_better" || dir === "higher_is_better";
  }

  /**
   * Дополняет плитки полями `plan`, `fact`, подписью периода и `has_data`.
   * При явном месяце сначала берём точку из `monthly_data` самой плитки.
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
    var fromTileMonthly = buildPlanFactLookupFromTileMonthlyData(tiles, filterYear, filterMonth);
    var fromCharts = buildPlanFactFromChartsLastAvailable(body, filterYear, filterMonth);
    var monthlyFromCharts = buildMonthlyDataFromCharts(body);
    var fromTables = buildPlanFactLookupFromTablesOnly(body, filterYear, filterMonth);
    function isProductionDeputyOutputPeriodTile(id) {
      var normalized = id != null ? String(id).trim().toUpperCase() : "";
      return /^(PD-M1\.[12]\.)(W|M|T)$/.test(normalized);
    }
    tiles.forEach(function (tile) {
      var id = tile.kpi_id;
      if (!id) return;
      if (!monthlyDataHasSparkValues(tile.monthly_data) && Array.isArray(monthlyFromCharts[id])) {
        tile.monthly_data = monthlyFromCharts[id];
      }
      var ownMonthly = fromTileMonthly[id];
      var ch = fromCharts[id];
      var tb = fromTables[id];
      if (isProductionDeputyOutputPeriodTile(id)) {
        return;
      }
      if (ownMonthly && !isProductionDeputyOutputPeriodTile(id)) {
        tile.plan = ownMonthly.plan;
        tile.fact = ownMonthly.fact;
        if (ownMonthly.force_unit != null) {
          tile.units = ownMonthly.force_unit;
          tile.unit = ownMonthly.force_unit;
        } else if (ownMonthly.display_unit != null && !isQualdirPieceCountKpiId(id)) {
          tile.units = ownMonthly.display_unit;
          tile.unit = ownMonthly.display_unit;
        }
        if (String(id).trim().toUpperCase() === "LOG-M2") {
          tile.units = "руб.";
          tile.unit = "руб.";
          tile.kpi_pct_is_deviation = true;
        }
        ensureQualdirPieceCountUnits(tile);
        if (ownMonthly.expected_plan !== undefined) tile.expected_plan = ownMonthly.expected_plan;
        if (Array.isArray(ownMonthly.plan_fact_rows)) tile.plan_fact_rows = ownMonthly.plan_fact_rows;
        if (Array.isArray(ownMonthly.project_deviation_rows)) {
          tile.project_deviation_rows = ownMonthly.project_deviation_rows;
        }
        if (ownMonthly.max_allowed_delay_workdays != null) {
          tile.max_allowed_delay_workdays = ownMonthly.max_allowed_delay_workdays;
        }
        if (ownMonthly.kpi_pct != null) {
          tile.percent = ownMonthly.kpi_pct;
          tile.kpi_pct = ownMonthly.kpi_pct;
        } else if (useMonthFilter) {
          tile.kpi_pct = null;
          tile.percent = null;
        }
        syncTileColorFromMonthlyPoint(tile, ownMonthly, { useMonthFilter: useMonthFilter });
        if (ownMonthly.plan_fact_period_label) tile.plan_fact_period_label = String(ownMonthly.plan_fact_period_label);
        if (
          isCommercialHigherIsBetterPlanFactKpiId(id) &&
          (planFactValuePresent(ownMonthly.plan) || planFactValuePresent(ownMonthly.fact))
        ) {
          tile.has_data = true;
        } else if (typeof ownMonthly.has_data === "boolean") {
          tile.has_data = ownMonthly.has_data;
        } else {
          applyHasDataFromSource(tile, ownMonthly);
        }
        if (Array.isArray(ownMonthly.articles)) tile.articles = ownMonthly.articles.slice();
        syncDepartmentsForTile(tile, filterYear, filterMonth);
        syncDefectDirectionsForTile(tile, filterYear, filterMonth);
        return;
      }
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
        String(tile.data_granularity || "").toLowerCase() !== "quarterly" &&
        (planFactValuePresent(tile.plan) || planFactValuePresent(tile.fact))
      ) {
        tile.plan_fact_period_label = requestedPeriodLabel;
      }
      syncDepartmentsForTile(tile, filterYear, filterMonth);
      syncDefectDirectionsForTile(tile, filterYear, filterMonth);
      syncQualdirControlTileFieldsFromPoint(tile, findTileMonthlyDataPoint(tile.monthly_data, filterYear, filterMonth), filterYear, filterMonth);
      ensureQualdirPieceCountUnits(tile);
    });
  }

  /**
   * Из body["Графики"] строит индикаторы для графиков.
   * chart_type: "multi_line_plan_fact_monthly" → line, "column_plan_fact_monthly" → bar (один месяц из period).
   * Каждый series внутри графика = отдельный переключаемый показатель (кроме column_plan_fact_monthly).
   */
  function buildChartIndicatorsFromApiResponse(body, filterYear, filterMonth) {
    var out = { line: [], bar: [], donut: [] };
    if (!body) return out;
    var charts = body[KPI_JSON_KEY_CHARTS];
    if (!charts || typeof charts !== "object") return out;
    var tileLookup = buildTileLookupByKpiId(body);

    Object.keys(charts).forEach(function (key) {
      var chart = charts[key];
      var seriesList = getChartSeriesList(chart);
      if (!chart || !chart.chart_type || !seriesList.length) return;
      var target = classifyChartType(chart.chart_type);
      if (!target) return;

      if (target === "bar" && isMonthlyColumnChartType(chart.chart_type)) {
        var monthlyBar = buildMonthlyColumnBarIndicatorFromChart(
          chart,
          key,
          filterYear,
          filterMonth,
          tileLookup
        );
        if (monthlyBar) out.bar.push(monthlyBar);
        return;
      }

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
          if (Array.isArray(s.line_series) && s.line_series.length) {
            out.line.push({
              id: s.kpi_id || name,
              optionLabel: s.option_label || s.optionLabel || name,
              title: name,
              xAxisTitle: CHART_AXIS_MONTH,
              yAxisTitle: s.y_axis_title || s.yAxisTitle || "Значение",
              categories: categories,
              points: sorted,
              customLineSeries: true,
              disableAllOption: !!s.disable_all_option,
              series: s.line_series.map(function (line, idx) {
                return {
                  name: line.name || "Серия " + String(idx + 1),
                  data: Array.isArray(line.data) ? line.data.map(numberOrNull) : [],
                  color: line.color || null,
                  dashStyle: line.dashStyle || line.dash_style || null,
                  valueRole: line.value_role || line.valueRole || null,
                  metric: line.metric || null,
                  legendLabel: line.legend_label || line.legendLabel || line.name || null,
                };
              }),
            });
            return;
          }
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

    var tables = getTablesMapFromBody(body);
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
    if (row && row["\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b"] != null && String(row["\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b"]).trim() !== "") {
      var protocolPoint =
        row["\u041d\u043e\u043c\u0435\u0440\u041f\u0443\u043d\u043a\u0442\u0430\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u0430"] != null
          ? String(row["\u041d\u043e\u043c\u0435\u0440\u041f\u0443\u043d\u043a\u0442\u0430\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u0430"]).trim()
          : "";
      return (
        "protocol:" +
        String(row["\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b"]).trim() +
        (protocolPoint ? "|point:" + protocolPoint : "")
      );
    }
    if (row && row.name != null && String(row.name).trim() !== "") return "name:" + String(row.name).trim();
    if (row && row.partner != null && String(row.partner).trim() !== "") return "partner:" + String(row.partner).trim();
    if (row && row.nomer_proekta != null && String(row.nomer_proekta).trim() !== "") return "project-number:" + String(row.nomer_proekta).trim();
    if (row && row.number != null && String(row.number).trim() !== "") return "number:" + String(row.number).trim();
    if (row && row.counterparty != null && String(row.counterparty).trim() !== "") return "counterparty:" + String(row.counterparty).trim();
    if (row && row.client_key != null && String(row.client_key).trim() !== "") {
      return "client:" + String(row.client_key).trim();
    }
    if (row && row["\u041a\u043b\u0438\u0435\u043d\u0442"] != null && String(row["\u041a\u043b\u0438\u0435\u043d\u0442"]).trim() !== "") {
      return "client-name:" + String(row["\u041a\u043b\u0438\u0435\u043d\u0442"]).trim();
    }
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
      (row.rp != null && String(row.rp).trim() !== "") ||
      (row.sroki != null && String(row.sroki).trim() !== "") ||
      (row.partner != null && String(row.partner).trim() !== "") ||
      (row.code != null && String(row.code).trim() !== "") ||
      (row.nomer_proekta != null && String(row.nomer_proekta).trim() !== "") ||
      (row.number != null && String(row.number).trim() !== "") ||
      (row.counterparty != null && String(row.counterparty).trim() !== "") ||
      (row["\u041a\u043b\u0438\u0435\u043d\u0442"] != null && String(row["\u041a\u043b\u0438\u0435\u043d\u0442"]).trim() !== "") ||
      (row["\u0412\u0441\u0435\u0433\u043e \u043e\u0431\u0440\u0430\u0449\u0435\u043d\u0438\u0439"] !== undefined &&
        row["\u0412\u0441\u0435\u0433\u043e \u043e\u0431\u0440\u0430\u0449\u0435\u043d\u0438\u0439"] !== null &&
        String(row["\u0412\u0441\u0435\u0433\u043e \u043e\u0431\u0440\u0430\u0449\u0435\u043d\u0438\u0439"]).trim() !== "") ||
      (row["\u0412 \u0441\u0440\u043e\u043a"] !== undefined && row["\u0412 \u0441\u0440\u043e\u043a"] !== null) ||
      (row["\u041d\u0435 \u0432 \u0441\u0440\u043e\u043a"] !== undefined && row["\u041d\u0435 \u0432 \u0441\u0440\u043e\u043a"] !== null) ||
      (row.client_key != null && String(row.client_key).trim() !== "") ||
      (row.partner_name != null && String(row.partner_name).trim() !== "") ||
      (row.company != null && String(row.company).trim() !== "") ||
      (row.department != null && String(row.department).trim() !== "") ||
      (row.vacancy != null && String(row.vacancy).trim() !== "") ||
      (row.plan_close_date != null && String(row.plan_close_date).trim() !== "") ||
      (row.fact_close_date != null && String(row.fact_close_date).trim() !== "") ||
      (row["\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b"] != null && String(row["\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b"]).trim() !== "") ||
      (row["\u0417\u0430\u0434\u0430\u0447\u0430"] != null && String(row["\u0417\u0430\u0434\u0430\u0447\u0430"]).trim() !== "") ||
      (row["\u0421\u0440\u043e\u043a\u0418\u0441\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f"] != null &&
        String(row["\u0421\u0440\u043e\u043a\u0418\u0441\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f"]).trim() !== "") ||
      (row["\u0414\u0430\u0442\u0430\u041f\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0438\u0417\u0430\u0434\u0430\u0447\u0438"] != null &&
        String(row["\u0414\u0430\u0442\u0430\u041f\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0438\u0417\u0430\u0434\u0430\u0447\u0438"]).trim() !== "") ||
      (row["\u041e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439"] != null &&
        String(row["\u041e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439"]).trim() !== "") ||
      (row["\u0410\u0432\u0442\u043e\u0440"] != null && String(row["\u0410\u0432\u0442\u043e\u0440"]).trim() !== "") ||
      (row["\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442"] != null && String(row["\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442"]).trim() !== "") ||
      (row["\u041e\u0431\u044a\u0435\u043a\u0442 \u043d\u0435\u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044f"] != null &&
        String(row["\u041e\u0431\u044a\u0435\u043a\u0442 \u043d\u0435\u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044f"]).trim() !== "") ||
      (row["\u0412\u0438\u0434 \u043d\u0435\u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044f"] != null &&
        String(row["\u0412\u0438\u0434 \u043d\u0435\u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044f"]).trim() !== "") ||
      (row["\u041f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u0435"] != null &&
        String(row["\u041f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u0435"]).trim() !== "") ||
      (row.order_num != null && String(row.order_num).trim() !== "") ||
      (row["Этап"] != null && String(row["Этап"]).trim() !== "") ||
      (row["Начало"] != null && String(row["Начало"]).trim() !== "") ||
      (row["Окончание"] != null && String(row["Окончание"]).trim() !== "") ||
      (row["ЭтапФактическоеОкончание"] != null && String(row["ЭтапФактическоеОкончание"]).trim() !== "") ||
      (row["ЗаказНаПроизводствоТД_ОпросныйЛист"] != null && String(row["ЗаказНаПроизводствоТД_ОпросныйЛист"]).trim() !== "") ||
      (row.milestone_planned_finish_date != null && String(row.milestone_planned_finish_date).trim() !== "") ||
      (row.deviation_date != null && String(row.deviation_date).trim() !== "") ||
      row.otklonenie_summarnoe !== undefined ||
      row.delay_days !== undefined ||
      row.percent_complete !== undefined ||
      (row.progress != null && String(row.progress).trim() !== "") ||
      row.timeline !== undefined ||
      row.deviation !== undefined ||
      row.status !== undefined ||
      row.progress_pct !== undefined ||
      row.plan !== undefined ||
      row.fact !== undefined ||
      row.order_sum !== undefined ||
      row.amount !== undefined ||
      row.claim_amount !== undefined ||
      (row["\u041f\u0435\u0440\u0438\u043e\u0434"] != null && String(row["\u041f\u0435\u0440\u0438\u043e\u0434"]).trim() !== "") ||
      (row["\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f"] != null && String(row["\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f"]).trim() !== "") ||
      (row["\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0438\u043b\u0438 \u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a"] != null &&
        String(row["\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0438\u043b\u0438 \u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a"]).trim() !== "") ||
      (row["\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c \u043a \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0435\u043c\u0443 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u0447\u0435\u0441\u0442\u0432\u0443"] != null &&
        String(row["\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c \u043a \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0435\u043c\u0443 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u0447\u0435\u0441\u0442\u0432\u0443"]).trim() !== "")
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
  function buildTableRowsFromApiResponse(body, filterYear, filterMonth) {
    if (!body) return [];
    var tables = getTablesMapFromBody(body);
    if (!tables || typeof tables !== "object") return [];

    var periodYear = filterYear;
    var periodMonth = filterMonth;
    if (
      (periodYear == null || periodMonth == null) &&
      body.period &&
      typeof body.period === "object"
    ) {
      if (periodYear == null && body.period.year != null) periodYear = Number(body.period.year);
      if (periodMonth == null && body.period.month != null) periodMonth = Number(body.period.month);
    }

    var collected = [];
    forEachTablesRow(
      tables,
      function (tk, row, tab) {
        if (!row || typeof row !== "object") return;
        if (!tableRowHasDisplayableData(row)) return;
        collected.push({
          tk: tk,
          row: row,
          tableMeta: tab,
          index: collected.length,
          tableName: tab && tab.name != null ? String(tab.name) : "",
          tableColumns: tab && Array.isArray(tab.columns) ? tab.columns.slice() : [],
          tablePeriod: tab && tab.period && typeof tab.period === "object" ? tab.period : null,
          tableDescription: tab && tab.description != null ? String(tab.description) : "",
        });
      },
      periodYear,
      periodMonth
    );
    Object.keys(tables).forEach(function (tk) {
      if (isMonthKeyedTablesContainerKey(tk)) return;
      var tableMeta = tables[tk];
      var status = tableMeta && typeof tableMeta === "object" && !Array.isArray(tableMeta)
        ? tableMeta.cache_refresh_status
        : "";
      var refreshKpiId = tableMeta && typeof tableMeta === "object" && !Array.isArray(tableMeta)
        ? tableMeta.cache_refresh_kpi_id
        : "";
      var updatedAt = tableMeta && typeof tableMeta === "object" && !Array.isArray(tableMeta)
        ? tableMeta.cache_updated_at
        : "";
      var hasRowsForTable = collected.some(function (item) {
        return item && item.tk === tk;
      });
      if (hasRowsForTable) return;
      var sourceTab = resolveTableSourceForPeriod(tables, tk, tableMeta, periodYear, periodMonth);
      var view = resolveTableTabView(sourceTab, periodYear, periodMonth);
      var displayWhenEmpty = isServheadSurveysTableTabKey(tk);
      var hasCacheMeta = !!(status || refreshKpiId || updatedAt);
      if (!displayWhenEmpty && !hasCacheMeta) return;
      collected.push({
        tk: tk,
        row: displayWhenEmpty
          ? { __tableEmptyMarker: true }
          : {
              __tableCacheStatusMarker: true,
              cache_refresh_status: status != null ? String(status) : "",
              cache_refresh_kpi_id: refreshKpiId != null ? String(refreshKpiId) : "",
              cache_updated_at: updatedAt != null ? String(updatedAt) : "",
            },
        tableMeta: tableMeta,
        index: collected.length,
        tableName: view.name || (tableMeta.name != null ? String(tableMeta.name) : ""),
        tableColumns: Array.isArray(view.columns)
          ? view.columns.slice()
          : Array.isArray(tableMeta.columns)
            ? tableMeta.columns.slice()
            : [],
        tableDescription: view.description || (tableMeta.description != null ? String(tableMeta.description) : ""),
      });
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
        if (row && row.__tableEmptyMarker === true) {
          return {
            kpi: "\u2014",
            fact: "\u2014",
            plan: "\u2014",
            rag: "blue",
            deviation: "\u2014",
            comment: item.tableDescription != null ? String(item.tableDescription) : "",
            tableKey: tk != null ? String(tk).trim() : "",
            tableName: item.tableName != null ? String(item.tableName).trim() : "",
            tableColumns: Array.isArray(item.tableColumns) ? item.tableColumns.slice() : [],
            __tableEmptyMarker: true,
            raw: row,
          };
        }
        var tableMeta = item.tableMeta && typeof item.tableMeta === "object" && !Array.isArray(item.tableMeta)
          ? item.tableMeta
          : null;
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
          tableName: item.tableName != null ? String(item.tableName).trim() : "",
          tableColumns: Array.isArray(item.tableColumns) ? item.tableColumns.slice() : [],
          cache_refresh_kpi_id:
            row.cache_refresh_kpi_id != null
              ? String(row.cache_refresh_kpi_id)
              : tableMeta && tableMeta.cache_refresh_kpi_id != null
                ? String(tableMeta.cache_refresh_kpi_id)
                : "",
          cache_refresh_status:
            row.cache_refresh_status != null
              ? String(row.cache_refresh_status)
              : tableMeta && tableMeta.cache_refresh_status != null
                ? String(tableMeta.cache_refresh_status)
                : "",
          cache_updated_at:
            row.cache_updated_at != null
              ? String(row.cache_updated_at)
              : tableMeta && tableMeta.cache_updated_at != null
                ? String(tableMeta.cache_updated_at)
                : "",
          __tableCacheStatusMarker: row.__tableCacheStatusMarker === true,
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

  function performKpiCacheRefreshRequest(url, options, debugLabel) {
    var A = global.Auth;
    if (!A || typeof A.getAuthHeaders !== "function") {
      return Promise.resolve({ ok: false, error: "Модуль Auth не загружен" });
    }
    var authHeaders = A.getAuthHeaders();
    if (!authHeaders.Authorization) {
      return Promise.resolve({ ok: false, error: "Нет токена авторизации" });
    }
    var headers = Object.assign({ Accept: "application/json" }, authHeaders);
    var fetchOpts = options || { method: "GET" };
    fetchOpts.headers = Object.assign(headers, fetchOpts.headers || {});
    return fetch(url, fetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = null;
          }
          pushApiDebug(debugLabel || "KPI cache refresh", fetchOpts.method || "GET", url, res.status, data || {});
          if (res.status === 401) {
            return { ok: false, status: 401, unauthorized: true, error: "Требуется повторный вход" };
          }
          var payload = data && typeof data === "object" ? data : {};
          return Object.assign(
            {
              ok: res.ok || res.status === 202 || res.status === 429,
              status: res.status,
              error: res.ok || res.status === 202 || res.status === 429
                ? ""
                : parseErrorBody(text) || "Ошибка обновления кэша (" + res.status + ")",
            },
            payload
          );
        });
      })
      .catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        pushApiDebug(debugLabel || "KPI cache refresh", (options && options.method) || "GET", url, 0, { _networkError: m });
        return { ok: false, error: m || "Ошибка запроса обновления кэша" };
      });
  }

  function refreshKpiTileCache(options) {
    var payload = Object.assign({}, options || {});
    return performKpiCacheRefreshRequest(kpiCacheRefreshUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, "POST /api/kpi/cache-refresh/");
  }

  function fetchKpiTileCacheRefreshStatus(options) {
    var url = appendQueryParams(kpiCacheRefreshUrl(), options || {});
    if (options && options.kpi_id != null && String(options.kpi_id).trim() !== "") {
      url += (url.indexOf("?") === -1 ? "?" : "&") + "kpi_id=" + encodeURIComponent(String(options.kpi_id).trim());
    }
    return performKpiCacheRefreshRequest(url, { method: "GET" }, "GET /api/kpi/cache-refresh/");
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
    if (/^\s*</.test(text) || /<!DOCTYPE\s+html/i.test(text)) {
      var title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      var titleText = title && title[1] ? title[1].replace(/\s+/g, " ").trim() : "";
      if (titleText) return titleText;
      return "Сервер вернул HTML-страницу вместо JSON.";
    }
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
    kpiStructureUrl: kpiStructureUrl,
    kpiUsersUrl: kpiUsersUrl,
    searchUrl: searchUrl,
    assistantChatUrl: assistantChatUrl,
    fetchDepartments: fetchDepartments,
    submitRegistrationRequest: submitRegistrationRequest,
    submitPasswordResetRequest: submitPasswordResetRequest,
    fetchAccessRequests: fetchAccessRequests,
    approveAccessRequest: approveAccessRequest,
    rejectAccessRequest: rejectAccessRequest,
    submitFeedbackRequest: submitFeedbackRequest,
    fetchMyFeedbackRequests: fetchMyFeedbackRequests,
    fetchAdminFeedbackRequests: fetchAdminFeedbackRequests,
    processFeedbackRequest: processFeedbackRequest,
    fetchKpiUsers: fetchKpiUsers,
    fetchKpis: fetchKpis,
    fetchKpiAll: fetchKpiAll,
    refreshKpiTileCache: refreshKpiTileCache,
    fetchKpiTileCacheRefreshStatus: fetchKpiTileCacheRefreshStatus,
    clearKpiGetMemoryCache: clearKpiGetMemoryCache,
    fetchImmediateSubordinates: fetchImmediateSubordinates,
    fetchKpiStructure: fetchKpiStructure,
    fetchChairmanDashboardCatalog: fetchChairmanDashboardCatalog,
    sendAssistantMessageStream: sendAssistantMessageStream,
    streamAssistantJob: streamAssistantJob,
    stopAssistantJob: stopAssistantJob,
    searchDepartments: searchDepartments,
    normalizeKpiListFromApiResponse: normalizeKpiListFromApiResponse,
    buildChartIndicatorsFromApiResponse: buildChartIndicatorsFromApiResponse,
    processKpiResponseBodyAtPeriod: processKpiResponseBodyAtPeriod,
    hasProtocolOverdueTableInBody: hasProtocolOverdueTableInBody,
    hasQualdirDefectTablesInBody: hasQualdirDefectTablesInBody,
    isQualdirDefectTableTabKey: isQualdirDefectTableTabKey,
    hasServheadDashboardInBody: hasServheadDashboardInBody,
    hasServheadClientsTableInBody: hasServheadClientsTableInBody,
    hasServheadSurveysTableInBody: hasServheadSurveysTableInBody,
    isServheadClientsTableTabKey: isServheadClientsTableTabKey,
    isServheadSurveysTableTabKey: isServheadSurveysTableTabKey,
    getTableTabMetaFromBody: getTableTabMetaFromBody,
  };
})(typeof window !== "undefined" ? window : globalThis);
