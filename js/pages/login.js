/**
 * @fileoverview Страница входа: combobox пользователей (GET Api.fetchKpiUsers), форма, «Продолжить как …».
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
  var nickHidden = document.getElementById("nickname");
  var nickTrigger = document.getElementById("nickname-trigger");
  var nickTriggerLabel = document.getElementById("nickname-trigger-label");
  var nickPanel = document.getElementById("nickname-list");
  var nickCombo = document.getElementById("nickname-combo");

  /** @type {Array<{nickname:string,department:string}>} */
  var usersCache = [];

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add("visible");
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
  }

  function closeNicknamePanel() {
    if (!nickPanel || !nickTrigger) return;
    nickPanel.hidden = true;
    nickTrigger.setAttribute("aria-expanded", "false");
  }

  function openNicknamePanel() {
    if (!nickPanel || !nickTrigger || nickTrigger.disabled) return;
    nickPanel.hidden = false;
    nickTrigger.setAttribute("aria-expanded", "true");
  }

  function toggleNicknamePanel() {
    if (!nickPanel || nickPanel.hidden) openNicknamePanel();
    else closeNicknamePanel();
  }

  function setTriggerPlaceholder(text) {
    if (nickTriggerLabel) nickTriggerLabel.textContent = text;
    if (nickHidden) nickHidden.value = "";
  }

  /**
   * Записывает выбранного пользователя в hidden input и обновляет текст на кнопке-триггере.
   * @param {string} nickname — значение для отправки формы
   * @param {string} nickLine — первая строка на кнопке
   * @param {string} [metaLine] — вторая строка (отдел)
   */
  function setSelection(nickname, nickLine, metaLine) {
    if (!nickHidden || !nickTriggerLabel) return;
    nickHidden.value = nickname || "";
    if (!nickname) {
      nickTriggerLabel.textContent = "Выберите пользователя…";
      return;
    }
    nickTriggerLabel.textContent = "";
    var sn = document.createElement("span");
    sn.className = "nickname-combo-option-nick";
    sn.textContent = nickLine;
    nickTriggerLabel.appendChild(sn);
    var sm = document.createElement("span");
    sm.className = "nickname-combo-option-meta";
    sm.textContent = metaLine != null && String(metaLine).trim() ? String(metaLine).trim() : "—";
    nickTriggerLabel.appendChild(sm);
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
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      setSelection(nick, nick, meta);
      syncOptionAriaSelected();
      closeNicknamePanel();
      try {
        nickTrigger.focus();
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

  function rebuildListFromCache() {
    if (!nickPanel) return;
    nickPanel.innerHTML = "";
    usersCache.forEach(function (u) {
      if (!u.nickname) return;
      nickPanel.appendChild(renderOptionButton(u));
    });
    syncOptionAriaSelected();
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Вход…" : "Войти";
    if (nickTrigger) nickTrigger.disabled = loading;
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
    nickPanel.appendChild(
      renderOptionButton({
        nickname: n,
        department: metaSecondLine != null ? String(metaSecondLine).trim() : "—",
      })
    );
    syncOptionAriaSelected();
  }

  function populateUserSelect(users) {
    if (!nickHidden || !nickTrigger || !nickPanel) return;
    usersCache = users.slice();
    rebuildListFromCache();
    setTriggerPlaceholder("Выберите пользователя…");
    nickTrigger.setAttribute("aria-busy", "false");
  }

  if (nickTrigger && nickPanel) {
    nickTrigger.addEventListener("click", function () {
      if (nickTrigger.disabled) return;
      toggleNicknamePanel();
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
          nickTrigger.focus();
        } catch (err) {
          /* ignore */
        }
      }
    });
  }

  if (typeof Auth !== "undefined" && typeof Auth.getContinueAsInfo === "function") {
    var cont = Auth.getContinueAsInfo();
    if (cont && continueWrap && btnContinue) {
      btnContinue.textContent = "Продолжить как " + cont.displayName;
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

  if (typeof Api !== "undefined" && typeof Api.fetchKpiUsers === "function") {
    Api.fetchKpiUsers().then(function (res) {
      if (!nickHidden || !nickTrigger) return;
      if (!res.ok) {
        usersCache = [];
        if (nickPanel) nickPanel.innerHTML = "";
        setTriggerPlaceholder("Список недоступен");
        nickTrigger.disabled = true;
        nickTrigger.setAttribute("aria-busy", "false");
        showError(res.error || "Не удалось загрузить список пользователей");
        return;
      }
      var list = res.users || [];
      if (!list.length) {
        usersCache = [];
        if (nickPanel) nickPanel.innerHTML = "";
        setTriggerPlaceholder("Нет пользователей");
        nickTrigger.disabled = true;
        nickTrigger.setAttribute("aria-busy", "false");
        showError("Список пользователей пуст");
        return;
      }
      list.sort(function (a, b) {
        var da = (a.department || "").localeCompare(b.department || "", "ru");
        if (da !== 0) return da;
        return (a.nickname || "").localeCompare(b.nickname || "", "ru");
      });
      populateUserSelect(list);
      nickTrigger.disabled = false;
      var contInfo = typeof Auth.getContinueAsInfo === "function" ? Auth.getContinueAsInfo() : null;
      if (contInfo && contInfo.nickname) {
        var metaInfo = (contInfo.displayName || contInfo.nickname || "").trim();
        ensureNicknameOption(contInfo.nickname, metaInfo);
        setSelection(contInfo.nickname, contInfo.nickname, metaInfo);
      }
    });
  } else {
    if (nickTrigger) {
      nickTrigger.disabled = true;
      nickTrigger.setAttribute("aria-busy", "false");
    }
    if (nickTriggerLabel) nickTriggerLabel.textContent = "Ошибка загрузки";
    showError("Модуль Api не загружен");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearError();
    var nickname = nickHidden ? String(nickHidden.value).trim() : "";
    var password = document.getElementById("password").value;
    if (!nickname) {
      showError("Выберите пользователя из списка");
      return;
    }
    var remember = document.getElementById("remember-me");
    setLoading(true);
    Auth.login(nickname, password, remember && remember.checked)
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
