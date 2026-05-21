(function () {
  var search = document.getElementById("guide-search");
  var sections = Array.prototype.slice.call(document.querySelectorAll(".guide-section"));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".guide-nav-section"));
  var supportForm = document.getElementById("guide-support-form");
  var supportStatus = document.getElementById("guide-support-status");
  var supportDepartment = document.getElementById("guide-support-department");

  function normalize(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function applySearch() {
    var query = normalize(search && search.value);
    sections.forEach(function (section) {
      if (!query) {
        section.hidden = false;
        return;
      }
      var haystack = normalize(section.textContent + " " + (section.getAttribute("data-guide-search") || ""));
      section.hidden = haystack.indexOf(query) === -1;
    });
  }

  function setActiveNav() {
    var current = "";
    sections.forEach(function (section) {
      if (section.hidden) return;
      var rect = section.getBoundingClientRect();
      if (rect.top <= 160) current = section.id;
    });
    if (!current) {
      var hero = document.getElementById("quick-start");
      current = hero ? hero.id : "";
    }
    navLinks.forEach(function (link) {
      var href = (link.getAttribute("href") || "").replace("#", "");
      var active =
        href === current ||
        (href === "quick-start" && ["account-register", "dashboard-blocks", "first-login"].indexOf(current) !== -1) ||
        (href === "read-metrics" && ["metric-cards", "colors-statuses", "details-flow"].indexOf(current) !== -1) ||
        (href === "faq" && current.indexOf("faq") === 0);
      link.classList.toggle("is-active", active);
    });
  }

  function apiBaseUrl() {
    var cfg = window.AppConfig || {};
    return String(cfg.API_BASE_URL || "").replace(/\/+$/, "");
  }

  function supportUrl() {
    return apiBaseUrl() + "/api/feedback-requests/support/";
  }

  function departmentsUrl() {
    return apiBaseUrl() + "/api/user/departments/";
  }

  function fillDepartments(departments) {
    if (!supportDepartment) return;
    supportDepartment.innerHTML = "";
    var empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Выберите отдел";
    supportDepartment.appendChild(empty);
    (Array.isArray(departments) ? departments : []).forEach(function (department) {
      var value = String(department || "").trim();
      if (!value) return;
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      supportDepartment.appendChild(option);
    });
  }

  function loadDepartments() {
    if (!supportDepartment) return;
    fetch(departmentsUrl(), { method: "GET", headers: { Accept: "application/json" } })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error("Не удалось загрузить отделы.");
          fillDepartments(data && data.departments);
        });
      })
      .catch(function () {
        supportDepartment.innerHTML = '<option value="">Не удалось загрузить отделы</option>';
      });
  }

  function showSupportStatus(text, kind) {
    if (!supportStatus) return;
    supportStatus.hidden = false;
    supportStatus.textContent = text;
    supportStatus.classList.toggle("is-success", kind === "success");
    supportStatus.classList.toggle("is-error", kind === "error");
  }

  function submitSupport(event) {
    event.preventDefault();
    if (!supportForm) return;
    var fullName = document.getElementById("guide-support-full-name");
    var question = document.getElementById("guide-support-question");
    var submit = supportForm.querySelector('button[type="submit"]');
    var payload = {
      department: supportDepartment ? supportDepartment.value.trim() : "",
      full_name: fullName ? fullName.value.trim() : "",
      question: question ? question.value.trim() : "",
    };
    if (!payload.department || !payload.full_name || !payload.question) {
      showSupportStatus("Заполните отдел, ФИО и вопрос.", "error");
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Отправляем...";
    }
    showSupportStatus("Отправляем вопрос...", "");
    fetch(supportUrl(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = null;
        }
        if (!res.ok) {
          throw new Error((data && data.error) || "Не удалось отправить вопрос.");
        }
        supportForm.reset();
        showSupportStatus("Вопрос отправлен на почту поддержки.", "success");
      });
    }).catch(function (err) {
      showSupportStatus((err && err.message) || "Не удалось отправить вопрос.", "error");
    }).finally(function () {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Отправить вопрос";
      }
    });
  }

  if (search) {
    search.addEventListener("input", applySearch);
  }
  if (supportForm) {
    supportForm.addEventListener("submit", submitSupport);
    loadDepartments();
  }
  window.addEventListener("scroll", setActiveNav, { passive: true });
  setActiveNav();
})();
