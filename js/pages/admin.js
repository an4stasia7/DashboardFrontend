(function () {
  if (!Auth.requireAuth("login.html")) return;

  var session = Auth.getSession();
  var user = session && session.user ? session.user : {};
  if (user.role !== "User1") {
    window.location.replace("dashboard.html");
    return;
  }

  var body = document.getElementById("admin-requests-body");
  var feedbackBody = document.getElementById("admin-feedback-body");
  var feedbackArchiveBody = document.getElementById("admin-feedback-archive-body");
  var errorEl = document.getElementById("admin-error");
  var btnRefresh = document.getElementById("admin-refresh");
  var statPending = document.getElementById("stat-pending");
  var statRegistration = document.getElementById("stat-registration");
  var statReset = document.getElementById("stat-reset");
  var statFeedback = document.getElementById("stat-feedback");

  function showError(message, success) {
    if (!errorEl) return;
    errorEl.textContent = message || "";
    errorEl.classList.toggle("success", !!success);
    errorEl.classList.toggle("visible", !!message);
  }

  function fmtDate(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
  }

  function badge(text) {
    return '<span class="admin-badge">' + String(text || "—") + "</span>";
  }

  function renderEmpty(text) {
    body.innerHTML = '<tr><td colspan="6" class="admin-empty">' + text + "</td></tr>";
  }

  function renderFeedbackEmpty(text) {
    if (!feedbackBody) return;
    feedbackBody.innerHTML = '<tr><td colspan="8" class="admin-empty">' + text + "</td></tr>";
  }

  function renderFeedbackArchiveEmpty(text) {
    if (!feedbackArchiveBody) return;
    feedbackArchiveBody.innerHTML = '<tr><td colspan="7" class="admin-empty">' + text + "</td></tr>";
  }

  function requestTypeLabel(req) {
    if (req.request_type_label) return req.request_type_label;
    if (req.request_type === "registration") return "Регистрация";
    if (req.request_type === "password_reset") return "Сброс пароля";
    return req.request_type || "—";
  }

  function updateStats(requests) {
    var pending = requests.filter(function (r) { return r.status === "pending"; });
    statPending.textContent = String(pending.length);
    statRegistration.textContent = String(pending.filter(function (r) { return r.request_type === "registration"; }).length);
    statReset.textContent = String(pending.filter(function (r) { return r.request_type === "password_reset"; }).length);
  }

  function renderRequests(requests) {
    updateStats(requests);
    var pending = requests.filter(function (r) { return r.status === "pending"; });
    if (!pending.length) {
      renderEmpty("Нет ожидающих заявок");
      return;
    }
    body.innerHTML = "";
    pending.forEach(function (req) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + badge(requestTypeLabel(req)) + "</td>" +
        "<td><strong>" + escapeHtml(req.nickname) + "</strong></td>" +
        "<td>" + escapeHtml(req.department || "—") + "</td>" +
        "<td>" + fmtDate(req.created_at) + "</td>" +
        "<td>" + escapeHtml(req.status_label || req.status || "—") + "</td>" +
        '<td><div class="admin-actions">' +
        '<button type="button" class="btn btn-soft" data-action="approve">Принять</button>' +
        '<button type="button" class="btn btn-danger" data-action="reject">Отклонить</button>' +
        "</div></td>";
      tr.querySelector('[data-action="approve"]').addEventListener("click", function () {
        processRequest(req.id, "approve");
      });
      tr.querySelector('[data-action="reject"]').addEventListener("click", function () {
        processRequest(req.id, "reject");
      });
      body.appendChild(tr);
    });
  }

  function renderFeedbackRequests(requests) {
    var items = Array.isArray(requests) ? requests : [];
    if (statFeedback) statFeedback.textContent = String(items.length);
    if (!feedbackBody) return;
    if (!items.length) {
      renderFeedbackEmpty("Обращений пока нет");
      return;
    }
    feedbackBody.innerHTML = "";
    items.forEach(function (req) {
      var files = Array.isArray(req.attachment_names) ? req.attachment_names : [];
      var tr = document.createElement("tr");
      var actions =
        '<div class="admin-actions">' +
        (req.status === "failed"
          ? '<button type="button" class="btn btn-danger" data-feedback-action="delete">Удалить</button>'
          : '<button type="button" class="btn btn-soft" data-feedback-action="complete">Выполнено</button>' +
            '<button type="button" class="btn btn-danger" data-feedback-action="reject">Отклонить</button>') +
        "</div>";
      tr.innerHTML =
        "<td>" + badge(req.topic_label || req.topic || "Обращение") + "</td>" +
        "<td><strong>" + escapeHtml(req.user || "—") + "</strong></td>" +
        "<td>" + escapeHtml(req.related_department || req.department || "—") + "</td>" +
        "<td>" + fmtDate(req.created_at) + "</td>" +
        "<td>" + escapeHtml(req.status_label || req.status || "—") + "</td>" +
        '<td class="admin-feedback-description">' + escapeHtml(req.description || "—") + "</td>" +
        "<td>" + escapeHtml(files.length ? files.join(", ") : "—") + "</td>" +
        "<td>" + actions + "</td>";
      tr.querySelectorAll("[data-feedback-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          processFeedback(req.id, btn.getAttribute("data-feedback-action"));
        });
      });
      feedbackBody.appendChild(tr);
    });
  }

  function renderFeedbackArchive(requests) {
    var items = Array.isArray(requests) ? requests : [];
    if (!feedbackArchiveBody) return;
    if (!items.length) {
      renderFeedbackArchiveEmpty("В архиве пока нет обращений");
      return;
    }
    feedbackArchiveBody.innerHTML = "";
    items.forEach(function (req) {
      var files = Array.isArray(req.attachment_names) ? req.attachment_names : [];
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + badge(req.topic_label || req.topic || "Обращение") + "</td>" +
        "<td><strong>" + escapeHtml(req.user || "—") + "</strong></td>" +
        "<td>" + escapeHtml(req.related_department || req.department || "—") + "</td>" +
        "<td>" + fmtDate(req.created_at) + "</td>" +
        "<td>" + escapeHtml(req.status_label || req.status || "—") + "</td>" +
        '<td class="admin-feedback-description">' + escapeHtml(req.description || "—") + "</td>" +
        "<td>" + escapeHtml(files.length ? files.join(", ") : "—") + "</td>";
      feedbackArchiveBody.appendChild(tr);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadRequests() {
    showError("");
    renderEmpty("Загрузка…");
    renderFeedbackEmpty("Загрузка…");
    renderFeedbackArchiveEmpty("Загрузка…");
    Api.fetchAccessRequests("pending").then(function (res) {
      if (!res.ok) {
        if (res.unauthorized) {
          Auth.logout();
          window.location.href = "login.html";
          return;
        }
        showError(res.error || "Не удалось загрузить заявки");
        renderEmpty("Ошибка загрузки");
        return;
      }
      renderRequests(res.requests || []);
    });
    Api.fetchAdminFeedbackRequests().then(function (res) {
      if (!res.ok) {
        if (res.unauthorized) {
          Auth.logout();
          window.location.href = "login.html";
          return;
        }
        renderFeedbackEmpty("Ошибка загрузки");
        return;
      }
      renderFeedbackRequests(res.requests || []);
    });
    Api.fetchAdminFeedbackRequests(true).then(function (res) {
      if (!res.ok) {
        renderFeedbackArchiveEmpty("Ошибка загрузки");
        return;
      }
      renderFeedbackArchive(res.requests || []);
    });
  }

  function processRequest(id, action) {
    var op = action === "approve" ? Api.approveAccessRequest(id) : Api.rejectAccessRequest(id, "");
    op.then(function (res) {
      if (!res.ok) {
        showError(res.error || "Не удалось обработать заявку");
        return;
      }
      showError(action === "approve" ? "Заявка одобрена" : "Заявка отклонена", true);
      loadRequests();
    });
  }

  function processFeedback(id, action) {
    Api.processFeedbackRequest(id, action).then(function (res) {
      if (!res.ok) {
        showError(res.error || "Не удалось обработать обращение");
        return;
      }
      var msg = action === "delete" ? "Обращение удалено" : action === "reject" ? "Обращение отклонено" : "Обращение выполнено";
      showError(msg, true);
      loadRequests();
    });
  }

  if (btnRefresh) btnRefresh.addEventListener("click", loadRequests);
  loadRequests();
})();
