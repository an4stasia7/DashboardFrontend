/**
 * @fileoverview Страница входа: поиск по списку пользователей (GET Api.fetchKpiUsers), форма, «Продолжить как …».
 * Зависимости: `Auth`, `Api`, `AppConfig`.
 */
(function () {
  if (typeof Auth !== "undefined" && Auth.getSession()) {
    window.location.replace("dashboard.html");
    return;
  }

  var form = document.getElementById("login-form");
  var errorEl = document.getElementById("auth-error");
  var submitBtn = form.querySelector('button[type="submit"]');
  var continueWrap = document.getElementById("login-continue-wrap");
  var btnContinue = document.getElementById("btn-continue-as");
  var passwordInput = document.getElementById("password");
  var passwordToggle = document.getElementById("password-toggle");
  var nickHidden = document.getElementById("nickname");
  var nickSearch = document.getElementById("nickname-search");
  var nickPanel = document.getElementById("nickname-list");
  var nickCombo = document.getElementById("nickname-combo");
  var registerPanel = document.getElementById("register-panel");
  var resetPanel = document.getElementById("reset-panel");
  var loginScreen = document.getElementById("login-screen");
  var authTitle = document.getElementById("auth-title");
  var authSubtitle = document.getElementById("auth-subtitle");
  var registerForm = document.getElementById("register-request-form");
  var resetForm = document.getElementById("reset-request-form");
  var registerDepartment = document.getElementById("register-department");

  /** @type {Array<{nickname:string,department:string}>} */
  var usersCache = [];

  /** Подавление обработчика input при программной подстановке текста */
  var suppressSearchInput = false;

  var PLACEHOLDER_LOADING = "Загрузка списка…";
  var PLACEHOLDER_READY = "Введите логин или найдите по имени/отделу…";

  function setSubmitLabel(text) {
    var label = submitBtn ? submitBtn.querySelector(".auth-btn-text") : null;
    if (label) {
      label.textContent = text;
    } else if (submitBtn) {
      submitBtn.textContent = text;
    }
  }

  function setContinueLabel(text) {
    if (!btnContinue) return;
    btnContinue.innerHTML =
      '<span class="btn-continue-icon" aria-hidden="true"><img src="temp/icons/time.png" alt="" /></span>' +
      '<span class="btn-continue-text"></span>';
    var label = btnContinue.querySelector(".btn-continue-text");
    if (label) label.textContent = text;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("success");
    errorEl.classList.add("visible");
  }

  function showSuccess(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add("visible");
    errorEl.classList.add("success");
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
    errorEl.classList.remove("success");
  }

  function setupPasswordToggles() {
    var buttons = document.querySelectorAll("[data-password-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var inputId = this.getAttribute("aria-controls");
        var input = inputId ? document.getElementById(inputId) : null;
        if (!input) return;
        var shouldShow = input.type === "password";
        input.type = shouldShow ? "text" : "password";
        this.setAttribute("aria-pressed", shouldShow ? "true" : "false");
        this.setAttribute("aria-label", shouldShow ? "Скрыть пароль" : "Показать пароль");
      });
    }
  }

  function setMode(mode) {
    var isRegister = mode === "register";
    var isReset = mode === "reset";
    if (loginScreen) loginScreen.hidden = isRegister || isReset;
    if (registerPanel) registerPanel.hidden = !isRegister;
    if (resetPanel) resetPanel.hidden = !isReset;
    if (authTitle) {
      authTitle.textContent = isRegister ? "Регистрация" : isReset ? "Смена пароля" : "Вход в систему";
    }
    if (authSubtitle) {
      authSubtitle.textContent = isRegister
        ? "Отправьте заявку администратору"
        : isReset
          ? "Запросите новый пароль"
          : "Пожалуйста, выберите пользователя и введите пароль";
    }
    clearError();
  }

  function fillDepartments(departments) {
    if (!registerDepartment) return;
    registerDepartment.innerHTML = "";
    var empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Выберите подразделение";
    registerDepartment.appendChild(empty);
    (departments || []).forEach(function (dep) {
      var opt = document.createElement("option");
      opt.value = dep;
      opt.textContent = dep;
      registerDepartment.appendChild(opt);
    });
  }

  function formatUserLine(u) {
    if (!u || !u.nickname) return "";
    var meta = u.department != null && String(u.department).trim() ? String(u.department).trim() : "—";
    return String(u.nickname).trim() + " — " + meta;
  }

  function closeNicknamePanel() {
    if (!nickPanel || !nickSearch) return;
    nickPanel.hidden = true;
    nickSearch.setAttribute("aria-expanded", "false");
  }

  function openNicknamePanel() {
    if (!nickPanel || !nickSearch || nickSearch.disabled) return;
    nickPanel.hidden = false;
    nickSearch.setAttribute("aria-expanded", "true");
  }

  function toggleNicknamePanel() {
    if (!nickPanel || nickPanel.hidden) openNicknamePanel();
    else closeNicknamePanel();
  }

  function setSearchPlaceholder(text) {
    if (nickSearch) nickSearch.placeholder = text;
  }

  function setSearchValue(text) {
    suppressSearchInput = true;
    if (nickSearch) nickSearch.value = text != null ? String(text) : "";
    suppressSearchInput = false;
  }

  function getFilterQuery() {
    if (!nickSearch) return "";
    return String(nickSearch.value).trim().toLowerCase();
  }

  function getLoginNickname() {
    var selected = nickHidden ? String(nickHidden.value).trim() : "";
    if (selected) return selected;
    return nickSearch ? String(nickSearch.value || "").trim() : "";
  }

  function userMatchesQuery(u, q) {
    if (!q) return true;
    var nick = (u.nickname || "").toLowerCase();
    var dep = (u.department || "").toLowerCase();
    return nick.indexOf(q) !== -1 || dep.indexOf(q) !== -1;
  }

  /**
   * Записывает выбранного пользователя в hidden input и строку в поле поиска.
   * @param {string} nickname — значение для отправки формы
   * @param {string} nickLine — первая строка (ник)
   * @param {string} [metaLine] — отдел
   */
  function setSelection(nickname, nickLine, metaLine) {
    if (!nickHidden || !nickSearch) return;
    nickHidden.value = nickname || "";
    if (!nickname) {
      setSearchValue("");
      return;
    }
    var meta = metaLine != null && String(metaLine).trim() ? String(metaLine).trim() : "—";
    setSearchValue(String(nickLine).trim() + " — " + meta);
  }

  function renderOptionButton(u) {
    var nick = u.nickname;
    var meta = u.department || "—";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nickname-combo-option";
    btn.setAttribute("role", "option");
    btn.dataset.value = nick;
    btn.setAttribute("aria-selected", nickHidden && nickHidden.value === nick ? "true" : "false");
    var lineNick = document.createElement("span");
    lineNick.className = "nickname-combo-option-nick";
    lineNick.textContent = nick;
    var lineMeta = document.createElement("span");
    lineMeta.className = "nickname-combo-option-meta";
    lineMeta.textContent = meta;
    btn.appendChild(lineNick);
    btn.appendChild(lineMeta);
    btn.addEventListener("mousedown", function (e) {
      e.preventDefault();
    });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      setSelection(nick, nick, meta);
      syncOptionAriaSelected();
      closeNicknamePanel();
      try {
        nickSearch.focus();
      } catch (err) {
        /* ignore */
      }
    });
    return btn;
  }

  function syncOptionAriaSelected() {
    if (!nickPanel) return;
    var val = nickHidden ? String(nickHidden.value) : "";
    var opts = nickPanel.querySelectorAll(".nickname-combo-option");
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-selected", opts[i].dataset.value === val ? "true" : "false");
    }
  }

  function rebuildListFiltered() {
    if (!nickPanel) return;
    var q = getFilterQuery();
    nickPanel.innerHTML = "";
    var list = usersCache.filter(function (u) {
      if (!u.nickname) return false;
      return userMatchesQuery(u, q);
    });
    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "nickname-combo-empty";
      empty.textContent = usersCache.length ? "Никого не найдено. Измените запрос." : "";
      nickPanel.appendChild(empty);
    } else {
      list.forEach(function (u) {
        nickPanel.appendChild(renderOptionButton(u));
      });
    }
    syncOptionAriaSelected();
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    setSubmitLabel(loading ? "Вход…" : "Войти в систему");
    if (nickSearch) nickSearch.disabled = loading;
  }

  /**
   * Добавляет пользователя в список, если его ещё нет в кэше (например, из «Продолжить как …»).
   * @param {string} nickname
   * @param {string} [metaSecondLine] — подпись второй строки (отдел / ФИО)
   */
  function ensureNicknameOption(nickname, metaSecondLine) {
    if (!nickname || !nickPanel) return;
    var n = String(nickname).trim();
    if (!n) return;
    for (var i = 0; i < usersCache.length; i++) {
      if (usersCache[i].nickname === n) return;
    }
    usersCache.push({
      nickname: n,
      department: metaSecondLine != null ? String(metaSecondLine).trim() : "",
    });
    rebuildListFiltered();
  }

  function populateUserSelect(users) {
    if (!nickHidden || !nickSearch || !nickPanel) return;
    usersCache = users.slice();
    setSearchValue("");
    nickHidden.value = "";
    setSearchPlaceholder(PLACEHOLDER_READY);
    rebuildListFiltered();
    nickSearch.setAttribute("aria-busy", "false");
  }

  function trySelectSingleFilterMatch() {
    var q = getFilterQuery();
    var list = usersCache.filter(function (u) {
      if (!u.nickname) return false;
      return userMatchesQuery(u, q);
    });
    if (list.length !== 1) return;
    var u = list[0];
    setSelection(u.nickname, u.nickname, u.department || "—");
    closeNicknamePanel();
  }

  if (nickSearch && nickPanel) {
    nickSearch.addEventListener("focus", function () {
      if (nickSearch.disabled) return;
      rebuildListFiltered();
      openNicknamePanel();
    });
    nickSearch.addEventListener("input", function () {
      if (suppressSearchInput) return;
      if (nickHidden) nickHidden.value = "";
      rebuildListFiltered();
      openNicknamePanel();
    });
    nickSearch.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nickPanel && !nickPanel.hidden) {
        e.preventDefault();
        closeNicknamePanel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        trySelectSingleFilterMatch();
      }
    });
    document.addEventListener("click", function (e) {
      if (!nickCombo || !nickPanel || nickPanel.hidden) return;
      var t = e.target;
      if (nickCombo.contains(t)) return;
      closeNicknamePanel();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nickPanel && !nickPanel.hidden) {
        closeNicknamePanel();
        try {
          nickSearch.focus();
        } catch (err) {
          /* ignore */
        }
      }
    });
  }

  if (typeof Auth !== "undefined" && typeof Auth.getContinueAsInfo === "function") {
    var cont = Auth.getContinueAsInfo();
    if (cont && continueWrap && btnContinue) {
      setContinueLabel("Продолжить как " + cont.displayName);
      continueWrap.hidden = false;
      btnContinue.addEventListener("click", function () {
        if (typeof Auth.getSession === "function" && Auth.getSession()) {
          window.location.href = "dashboard.html";
          return;
        }
        if (typeof Auth.restoreRememberedSession === "function" && Auth.restoreRememberedSession()) {
          window.location.href = "dashboard.html";
          return;
        }
        var rememberEl = document.getElementById("remember-me");
        var passEl = document.getElementById("password");
        if (cont.nickname) {
          var metaCont = (cont.displayName || "").trim();
          ensureNicknameOption(cont.nickname, metaCont || "—");
          setSelection(cont.nickname, cont.nickname, metaCont || "—");
        }
        if (rememberEl) rememberEl.checked = true;
        if (passEl) {
          passEl.value = "";
          passEl.focus();
        }
        showError("Сохранённая сессия недоступна или истекла. Введите пароль.");
        try {
          if (passEl) passEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch (e) {
          /* ignore */
        }
      });
    }
  }

  if (passwordInput && passwordToggle) {
    passwordToggle.addEventListener("click", function () {
      var willShow = passwordInput.type === "password";
      passwordInput.type = willShow ? "text" : "password";
      passwordToggle.classList.toggle("is-visible", willShow);
      passwordToggle.setAttribute("aria-label", willShow ? "Скрыть пароль" : "Показать пароль");
      passwordToggle.setAttribute("aria-pressed", willShow ? "true" : "false");
      try {
        passwordInput.focus();
      } catch (err) {
        /* ignore */
      }
    });
  }

  if (typeof Api !== "undefined" && typeof Api.fetchKpiUsers === "function") {
    Api.fetchKpiUsers().then(function (res) {
      if (!nickHidden || !nickSearch) return;
      if (!res.ok) {
        usersCache = [];
        if (nickPanel) nickPanel.innerHTML = "";
        setSearchPlaceholder("Список недоступен");
        setSearchValue("");
        nickSearch.disabled = true;
        nickSearch.setAttribute("aria-busy", "false");
        showError(res.error || "Не удалось загрузить список пользователей");
        return;
      }
      var list = res.users || [];
      if (!list.length) {
        usersCache = [];
        if (nickPanel) nickPanel.innerHTML = "";
        setSearchPlaceholder("Нет пользователей");
        setSearchValue("");
        nickSearch.disabled = true;
        nickSearch.setAttribute("aria-busy", "false");
        showError("Список пользователей пуст");
        return;
      }
      list.sort(function (a, b) {
        var da = (a.department || "").localeCompare(b.department || "", "ru");
        if (da !== 0) return da;
        return (a.nickname || "").localeCompare(b.nickname || "", "ru");
      });
      populateUserSelect(list);
      nickSearch.disabled = false;
      var contInfo = typeof Auth.getContinueAsInfo === "function" ? Auth.getContinueAsInfo() : null;
      if (contInfo && contInfo.nickname) {
        var metaInfo = (contInfo.displayName || contInfo.nickname || "").trim();
        ensureNicknameOption(contInfo.nickname, metaInfo);
        setSelection(contInfo.nickname, contInfo.nickname, metaInfo || "—");
      }
    });
  } else {
    if (nickSearch) {
      nickSearch.disabled = true;
      nickSearch.setAttribute("aria-busy", "false");
      setSearchPlaceholder("Ошибка загрузки");
    }
    showError("Модуль Api не загружен");
  }

  if (typeof Api !== "undefined" && typeof Api.fetchDepartments === "function") {
    Api.fetchDepartments().then(function (res) {
      if (res.ok) {
        fillDepartments(res.departments || []);
      } else if (registerDepartment) {
        registerDepartment.innerHTML = '<option value="">Подразделения недоступны</option>';
      }
    });
  }

  var showRegister = document.getElementById("show-register-form");
  var showReset = document.getElementById("show-reset-form");
  if (showRegister) {
    showRegister.addEventListener("click", function () {
      setMode("register");
    });
  }
  if (showReset) {
    showReset.addEventListener("click", function () {
      setMode("reset");
    });
  }
  var closeButtons = document.querySelectorAll("[data-close-panel]");
  for (var ci = 0; ci < closeButtons.length; ci++) {
    closeButtons[ci].addEventListener("click", function () {
      setMode("login");
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", function (e) {
      e.preventDefault();
      clearError();
      var nickname = String(document.getElementById("register-login").value || "").trim();
      var password = document.getElementById("register-password").value || "";
      var department = registerDepartment ? String(registerDepartment.value || "").trim() : "";
      if (!nickname || !password || !department) {
        showError("Заполните логин, пароль и подразделение.");
        return;
      }
      Api.submitRegistrationRequest({ nickname: nickname, password: password, department: department }).then(function (res) {
        if (!res.ok) {
          showError(res.error || "Не удалось отправить заявку");
          return;
        }
        registerForm.reset();
        showSuccess("Заявка на регистрацию отправлена администратору.");
        setTimeout(function () { setMode("login"); }, 1200);
      });
    });
  }

  if (resetForm) {
    resetForm.addEventListener("submit", function (e) {
      e.preventDefault();
      clearError();
      var nickname = String(document.getElementById("reset-login").value || "").trim();
      var password = document.getElementById("reset-password").value || "";
      if (!nickname || !password) {
        showError("Заполните логин и новый пароль.");
        return;
      }
      Api.submitPasswordResetRequest({ nickname: nickname, password: password }).then(function (res) {
        if (!res.ok) {
          showError(res.error || "Не удалось отправить заявку");
          return;
        }
        resetForm.reset();
        showSuccess("Заявка на смену пароля отправлена администратору.");
        setTimeout(function () { setMode("login"); }, 1200);
      });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearError();
    var nickname = getLoginNickname();
    var password = document.getElementById("password").value;
    if (!nickname) {
      showError("Введите логин или выберите пользователя из списка");
      return;
    }
    var remember = document.getElementById("remember-me");
    var selectedUser = null;
    for (var ui = 0; ui < usersCache.length; ui++) {
      if (usersCache[ui].nickname === nickname) {
        selectedUser = usersCache[ui];
        break;
      }
    }
    var loginProfileExtras =
      selectedUser && selectedUser.department ? { department: selectedUser.department } : null;
    setLoading(true);
    Auth.login(nickname, password, remember && remember.checked, loginProfileExtras)
      .then(function (result) {
        if (result.ok) {
          window.location.href = "dashboard.html";
        } else {
          showError(result.error || "Ошибка входа");
        }
      })
      .finally(function () {
        setLoading(false);
      });
  });
})();
