/**
 * @fileoverview Клиентская сессия и заголовки Authorization.
 * Хранение токена в sessionStorage или localStorage («Запомнить меня»), выход, «Продолжить как …».
 * Зависит от `global.Api.login` и опционально `global.AppConfig`.
 * @namespace Auth
 */
(function (global) {
  const SESSION_KEY = "dashboard_session";
  const REMEMBER_KEY = "dashboard_remember";
  /** Пользователь хотя бы раз успешно вошёл с «Запомнить меня» — показываем «Продолжить как …» */
  const REMEMBER_EVER_KEY = "dashboard_remember_ever";
  const CONTINUE_AS_NICKNAME_KEY = "dashboard_continue_as_nickname";
  const CONTINUE_AS_DISPLAY_KEY = "dashboard_continue_as_display";
  /** Копия сессии при «Запомнить меня» — не стирается при «Выйти», для входа без пароля */
  const REMEMBER_BACKUP_KEY = "dashboard_session_remember_backup";

  function getStorage() {
    try {
      return localStorage.getItem(REMEMBER_KEY) === "1" ? localStorage : sessionStorage;
    } catch (e) {
      return sessionStorage;
    }
  }

  function getSession() {
    try {
      var remember = localStorage.getItem(REMEMBER_KEY) === "1";
      var raw = remember ? localStorage.getItem(SESSION_KEY) : sessionStorage.getItem(SESSION_KEY);
      if (!raw) {
        raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      }
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function isJwtLikelyExpired(token) {
    if (!token || typeof token !== "string") return true;
    var parts = token.split(".");
    if (parts.length !== 3) return false;
    try {
      var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var json = decodeURIComponent(
        atob(b64)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      var payload = JSON.parse(json);
      if (payload.exp == null || typeof payload.exp !== "number") return false;
      return Date.now() / 1000 >= payload.exp;
    } catch (e) {
      return false;
    }
  }

  /**
   * Восстанавливает активную сессию из резервной копии (после «Выйти»).
   * @returns {boolean}
   */
  function restoreRememberedSession() {
    try {
      var raw = localStorage.getItem(REMEMBER_BACKUP_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      if (!s || !s.token || !s.user) return false;
      if (isJwtLikelyExpired(s.token)) return false;
      localStorage.setItem(REMEMBER_KEY, "1");
      localStorage.setItem(SESSION_KEY, raw);
      sessionStorage.removeItem(SESSION_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function login(nickname, password, remember, profileExtras) {
    if (!global.Api || typeof global.Api.login !== "function") {
      return Promise.resolve({ ok: false, error: "Модуль Api не загружен" });
    }
    return global.Api.login(nickname, password).then(function (result) {
      if (!result.ok) {
        return result;
      }
      var user = result.user && typeof result.user === "object" ? Object.assign({}, result.user) : {};
      var extraDept =
        profileExtras && profileExtras.department != null ? String(profileExtras.department).trim() : "";
      if (extraDept && (!user.department || !String(user.department).trim())) {
        user.department = extraDept;
      }
      var session = {
        token: result.token,
        user: user,
        apiMode: global.AppConfig && global.AppConfig.getApiMode ? global.AppConfig.getApiMode() : "live",
      };
      var json = JSON.stringify(session);
      try {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, "1");
          localStorage.setItem(SESSION_KEY, json);
          sessionStorage.removeItem(SESSION_KEY);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(SESSION_KEY);
          sessionStorage.setItem(SESSION_KEY, json);
        }
      } catch (e) {
        try {
          sessionStorage.setItem(SESSION_KEY, json);
        } catch (e2) {
          /* ignore */
        }
      }
      if (remember) {
        try {
          var nick = String(nickname || "").trim();
          var u = user;
          var display =
            (u.department != null && String(u.department).trim()) ||
            (u.nickname != null && String(u.nickname).trim()) ||
            (u.name != null && String(u.name).trim()) ||
            nick;
          localStorage.setItem(REMEMBER_EVER_KEY, "1");
          localStorage.setItem(CONTINUE_AS_NICKNAME_KEY, nick);
          localStorage.setItem(CONTINUE_AS_DISPLAY_KEY, display);
          localStorage.setItem(REMEMBER_BACKUP_KEY, json);
        } catch (e3) {
          /* ignore */
        }
      }
      return { ok: true, user: user };
    });
  }

  function logout() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(REMEMBER_KEY);
      /* REMEMBER_BACKUP_KEY, REMEMBER_EVER_KEY, CONTINUE_AS_* — для «Продолжить как» без пароля */
    } catch (e) { /* ignore */ }
  }

  /**
   * @returns {{ nickname: string, displayName: string } | null}
   */
  function getContinueAsInfo() {
    try {
      if (localStorage.getItem(REMEMBER_EVER_KEY) !== "1") return null;
      var nick = localStorage.getItem(CONTINUE_AS_NICKNAME_KEY) || "";
      var display = localStorage.getItem(CONTINUE_AS_DISPLAY_KEY) || nick;
      if (!nick && !display) return null;
      return { nickname: nick, displayName: display || nick };
    } catch (e) {
      return null;
    }
  }

  function requireAuth(redirectUrl) {
    var s = getSession();
    if (!s || !s.token || !s.user) {
      window.location.href = redirectUrl || "login.html";
      return false;
    }
    return true;
  }

  function getAuthHeaders() {
    var s = getSession();
    if (!s || !s.token) return {};
    var scheme = (global.AppConfig && global.AppConfig.AUTH_SCHEME) || "Bearer ";
    return { Authorization: scheme + s.token };
  }

  global.Auth = {
    login: login,
    logout: logout,
    getSession: getSession,
    requireAuth: requireAuth,
    getAuthHeaders: getAuthHeaders,
    getContinueAsInfo: getContinueAsInfo,
    restoreRememberedSession: restoreRememberedSession,
  };
})(typeof window !== "undefined" ? window : globalThis);
