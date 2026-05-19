(function () {
  var STORAGE_KEY = "dashboard.feedback.requests.v1";
  var els = {};
  var attachedFiles = [];

  function $(id) {
    return document.getElementById(id);
  }

  function safeText(value) {
    return value == null ? "" : String(value).trim();
  }

  function readRequests() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveRequests(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
    } catch (e) {
      /* ignore */
    }
  }

  function currentPeriodText() {
    var label = $("month-nav-label");
    return safeText(label && label.textContent);
  }

  function currentDashboardTitle() {
    var title = $("dash-role-title");
    return safeText(title && title.textContent) || "Текущий дашборд";
  }

  function sessionDepartment() {
    var A = window.Auth;
    var session = A && typeof A.getSession === "function" ? A.getSession() : null;
    var user = session && session.user ? session.user : null;
    return safeText(user && user.department);
  }

  function renderDepartmentContext() {
    var department = sessionDepartment();
    if (els.sessionDepartment) {
      els.sessionDepartment.textContent = department || "Подразделение пользователя не указано";
    }
    if (els.relatedCardSubtitle) {
      els.relatedCardSubtitle.textContent = department
        ? "Подтянуто из активного сеанса пользователя"
        : "В активном сеансе нет подразделения";
    }
    renderChildDepartmentOptions([]);
    loadChildDepartments(department);
  }

  function renderChildDepartmentOptions(children) {
    var items = Array.isArray(children) ? children : [];
    if (!els.childDepartmentWrap || !els.childDepartment) return;
    if (!items.length) {
      els.childDepartmentWrap.hidden = true;
      els.childDepartment.innerHTML = "";
      return;
    }
    els.childDepartmentWrap.hidden = false;
    els.childDepartment.innerHTML =
      '<option value="">Относится к моему подразделению</option>' +
      items
        .map(function (item) {
          var name =
            safeText(item && item.department) ||
            safeText(item && item.name) ||
            safeText(item && item.label) ||
            safeText(item);
          if (!name) return "";
          return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + "</option>";
        })
        .join("");
  }

  function loadChildDepartments(department) {
    if (!department || !window.Api || typeof window.Api.fetchImmediateSubordinates !== "function") return;
    window.Api.fetchImmediateSubordinates({ department: department }).then(function (result) {
      if (!result || !result.ok || !Array.isArray(result.immediate_children)) {
        renderChildDepartmentOptions([]);
        return;
      }
      renderChildDepartmentOptions(result.immediate_children);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setActiveTab(tab) {
    var active = tab === "list" ? "list" : "new";
    document.querySelectorAll(".service-panel-tab").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-service-tab") === active);
    });
    if (els.form) els.form.hidden = active !== "new" || !els.docs.hidden;
    if (els.list) els.list.hidden = active !== "list" || !els.docs.hidden;
    if (active === "list") renderRequests();
  }

  function openPanel(mode) {
    if (!els.overlay) return;
    var actualMode = mode || "feedback";
    els.overlay.hidden = false;
    document.body.classList.add("service-panel-open");
    if (els.title) {
      els.title.textContent = actualMode === "docs" ? "Документация" : "Обратная связь";
    }
    if (els.docs) els.docs.hidden = actualMode !== "docs";
    if (els.form) els.form.hidden = actualMode === "docs";
    if (els.list) els.list.hidden = true;
    if (actualMode !== "docs") {
      renderDepartmentContext();
      if (els.topic) els.topic.value = actualMode === "question" ? "question" : "bug";
      setActiveTab("new");
      setTimeout(function () {
        if (els.description) els.description.focus();
      }, 80);
    }
  }

  function closePanel() {
    if (!els.overlay) return;
    els.overlay.hidden = true;
    document.body.classList.remove("service-panel-open");
    closeHelpMenu();
  }

  function openHelpMenu() {
    if (!els.helpMenu || !els.helpTrigger || !els.helpDropdown) return;
    els.helpMenu.classList.add("is-open");
    els.helpTrigger.setAttribute("aria-expanded", "true");
    els.helpDropdown.hidden = false;
  }

  function closeHelpMenu() {
    if (!els.helpMenu || !els.helpTrigger || !els.helpDropdown) return;
    els.helpMenu.classList.remove("is-open");
    els.helpTrigger.setAttribute("aria-expanded", "false");
    window.setTimeout(function () {
      if (!els.helpMenu.classList.contains("is-open")) {
        els.helpDropdown.hidden = true;
      }
    }, 180);
  }

  function toggleHelpMenu() {
    if (!els.helpMenu) return;
    if (els.helpMenu.classList.contains("is-open")) {
      closeHelpMenu();
    } else {
      openHelpMenu();
    }
  }

  function renderRequests() {
    if (!els.items || !els.empty) return;
    els.empty.hidden = false;
    els.empty.textContent = "Загрузка...";
    els.items.innerHTML = "";
    if (!window.Api || typeof window.Api.fetchMyFeedbackRequests !== "function") {
      renderRequestItems(readRequests());
      return;
    }
    window.Api.fetchMyFeedbackRequests().then(function (result) {
      if (!result || !result.ok) {
        els.empty.textContent = "Не удалось загрузить обращения.";
        return;
      }
      renderRequestItems(result.requests || []);
    });
  }

  function renderRequestItems(items) {
    var list = Array.isArray(items) ? items : [];
    if (!els.items || !els.empty) return;
    els.empty.textContent = "Обращений пока нет.";
    els.empty.hidden = list.length > 0;
    els.items.innerHTML = list
      .slice()
      .map(function (item) {
        var files = Array.isArray(item.attachment_names) ? item.attachment_names : item.files || [];
        return (
          '<article class="service-feedback-item">' +
          '<div><strong>' +
          escapeHtml(item.topic_label || topicLabel(item.topic)) +
          "</strong><span>" +
          escapeHtml(formatDate(item.created_at) || "") +
          "</span></div>" +
          "<p>" +
          escapeHtml(item.description || "") +
          "</p>" +
          "<small>" +
          escapeHtml(item.related_department || item.related_label || item.department || "Текущий дашборд") +
          (files.length ? " · файлов: " + escapeHtml(String(files.length)) : "") +
          "</small>" +
          "</article>"
        );
      })
      .join("");
  }

  function formatDate(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
  }

  function addAttachedFiles(fileList) {
    Array.prototype.forEach.call(fileList || [], function (file) {
      if (file) attachedFiles.push(file);
    });
    renderAttachmentChips();
  }

  function clipboardFiles(clipboardData) {
    if (!clipboardData) return [];
    if (clipboardData.files && clipboardData.files.length) {
      return Array.prototype.slice.call(clipboardData.files);
    }
    var out = [];
    Array.prototype.forEach.call(clipboardData.items || [], function (item) {
      if (item && item.kind === "file") {
        var file = item.getAsFile();
        if (file) out.push(file);
      }
    });
    return out;
  }

  function clearAttachedFiles() {
    attachedFiles = [];
    renderAttachmentChips();
  }

  function renderAttachmentChips() {
    if (!els.attachments) return;
    if (!attachedFiles.length) {
      els.attachments.hidden = true;
      els.attachments.innerHTML = "";
      return;
    }
    els.attachments.hidden = false;
    els.attachments.innerHTML = attachedFiles
      .map(function (file, index) {
        return (
          '<span class="service-attachment-chip">' +
          '<span title="' +
          escapeHtml(file.name || "Файл") +
          '">' +
          escapeHtml(file.name || "Файл") +
          "</span>" +
          '<button type="button" data-remove-attachment="' +
          index +
          '" aria-label="Удалить файл">×</button>' +
          "</span>"
        );
      })
      .join("");
  }

  function topicLabel(topic) {
    var map = {
      question: "Вопрос по показателю",
      bug: "Сообщить об ошибке",
      data: "Проблема с данными",
      feature: "Предложение по улучшению",
    };
    return map[topic] || "Обращение";
  }

  function submitFeedback(event) {
    event.preventDefault();
    if (!els.description || !safeText(els.description.value)) {
      if (els.status) {
        els.status.hidden = false;
        els.status.textContent = "Опишите вопрос или ситуацию.";
      }
      return;
    }
    var selectedChild = els.childDepartment && els.childDepartment.options[els.childDepartment.selectedIndex];
    var baseDepartment = sessionDepartment();
    var targetDepartment = selectedChild && els.childDepartment.value ? safeText(selectedChild.textContent) : baseDepartment;
    var formData = new FormData();
    formData.append("topic", els.topic ? els.topic.value : "question");
    formData.append("related_department", targetDepartment || "");
    formData.append("dashboard", currentDashboardTitle());
    formData.append("period", currentPeriodText());
    formData.append("description", safeText(els.description.value));
    formData.append("contact", els.contact ? safeText(els.contact.value) : "");
    attachedFiles.forEach(function (file) {
      formData.append("attachments", file, file.name || "file");
    });
    if (els.status) {
      els.status.hidden = false;
      els.status.textContent = "Отправляем обращение...";
    }
    window.Api.submitFeedbackRequest(formData).then(function (result) {
      if (!result || !result.ok) {
        if (els.status) {
          var status = result && result.status ? " (" + result.status + ")" : "";
          var message = result && result.status === 404
            ? "Backend не видит endpoint обратной связи. Нужно обновить/перезапустить backend после внесенных изменений."
            : (result && result.error) || "Не удалось отправить обращение.";
          els.status.textContent = message + status;
        }
        return;
      }
      if (els.status) {
        els.status.textContent = result.email_sent === false
          ? "Обращение сохранено, но письмо не отправилось. Администратор увидит его в панели."
          : "Обращение отправлено.";
      }
      if (els.form) els.form.reset();
      clearAttachedFiles();
      renderDepartmentContext();
    });
  }

  function toggleSidebarCollapsed() {
    var layout = document.querySelector(".dashboard-layout");
    if (!layout) return;
    layout.classList.toggle("dash-sidebar-collapsed");
  }

  function bind() {
    document.querySelectorAll("[data-support-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openPanel(btn.getAttribute("data-support-open"));
      });
    });
    document.querySelectorAll(".service-panel-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveTab(btn.getAttribute("data-service-tab"));
      });
    });
    if (els.close) els.close.addEventListener("click", closePanel);
    if (els.overlay) {
      els.overlay.addEventListener("click", function (event) {
        if (event.target === els.overlay) closePanel();
      });
    }
    if (els.helpTrigger) {
      els.helpTrigger.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleHelpMenu();
      });
    }
    if (els.helpMenu) {
      els.helpMenu.addEventListener("click", function (event) {
        var option = event.target.closest("[data-support-open]");
        if (!option || !els.helpMenu.contains(option)) return;
        closeHelpMenu();
      });
    }
    if (els.form) els.form.addEventListener("submit", submitFeedback);
    if (els.description) {
      els.description.addEventListener("paste", function (event) {
        var files = clipboardFiles(event.clipboardData);
        if (files && files.length) addAttachedFiles(files);
      });
      els.description.addEventListener("dragover", function (event) {
        event.preventDefault();
        els.description.classList.add("service-description-drop");
      });
      els.description.addEventListener("dragleave", function () {
        els.description.classList.remove("service-description-drop");
      });
      els.description.addEventListener("drop", function (event) {
        event.preventDefault();
        els.description.classList.remove("service-description-drop");
        var files = event.dataTransfer && event.dataTransfer.files;
        if (files && files.length) addAttachedFiles(files);
      });
    }
    if (els.attachments) {
      els.attachments.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-remove-attachment]");
        if (!btn) return;
        var index = Number(btn.getAttribute("data-remove-attachment"));
        if (!isNaN(index)) {
          attachedFiles.splice(index, 1);
          renderAttachmentChips();
        }
      });
    }
    if (els.collapse) els.collapse.addEventListener("click", toggleSidebarCollapsed);
    document.addEventListener("click", function (event) {
      if (els.helpMenu && !els.helpMenu.contains(event.target)) closeHelpMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeHelpMenu();
      if (event.key === "Escape" && els.overlay && !els.overlay.hidden) closePanel();
    });
  }

  function init() {
    els = {
      overlay: $("service-panel-overlay"),
      panel: $("service-panel"),
      close: $("service-panel-close"),
      title: $("service-panel-title"),
      docs: $("service-panel-docs"),
      form: $("service-feedback-form"),
      list: $("service-feedback-list"),
      empty: $("service-feedback-empty"),
      items: $("service-feedback-items"),
      topic: $("service-feedback-topic"),
      relatedCard: $("service-related-card"),
      sessionDepartment: $("service-feedback-session-department"),
      childDepartmentWrap: $("service-feedback-child-department-wrap"),
      childDepartment: $("service-feedback-child-department"),
      relatedCardSubtitle: $("service-related-card-subtitle"),
      description: $("service-feedback-description"),
      attachments: $("service-feedback-attachments"),
      contact: $("service-feedback-contact"),
      status: $("service-feedback-status"),
      helpMenu: $("service-help-menu"),
      helpTrigger: $("service-help-trigger"),
      helpDropdown: $("service-help-dropdown"),
      collapse: $("dash-sidebar-collapse-btn"),
    };
    bind();
  }

  init();
})();
