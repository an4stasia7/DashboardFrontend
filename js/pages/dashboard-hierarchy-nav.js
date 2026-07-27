(function (global) {
  var latestContext = {};
  var sidebarSearchQuery = "";
  var sidebarSearchRequestSeq = 0;
  var sidebarSearchLoading = false;
  var sidebarSearchError = "";
  var sidebarSearchResults = [];
  var rememberedChairmanCatalogId = "";
  var departmentsExpanded = false;
  var structureOpen = false;
  var structureLoading = false;
  var structureError = "";
  var structureCache = null;
  var structureHeadcount = null;

  function rememberChairmanCatalogId(value) {
    rememberedChairmanCatalogId = value != null ? String(value).trim() : "";
  }

  function clearRememberedChairmanCatalogId() {
    rememberedChairmanCatalogId = "";
  }

  function mergeContext(nextContext) {
    latestContext = Object.assign({}, latestContext || {}, nextContext || {});
    return latestContext;
  }

  function getContext() {
    return latestContext || {};
  }

  function getViewTargets() {
    var fn = getContext().getViewTargets;
    return typeof fn === "function" ? fn() : [];
  }

  function setViewTargets(value) {
    var fn = getContext().setViewTargets;
    if (typeof fn === "function") fn(value);
  }

  function getChairmanDashboardTargets() {
    var fn = getContext().getChairmanDashboardTargets;
    return typeof fn === "function" ? fn() : [];
  }

  function setChairmanDashboardTargets(value) {
    var fn = getContext().setChairmanDashboardTargets;
    if (typeof fn === "function") fn(value);
  }

  function getSelectedViewId() {
    var fn = getContext().getSelectedViewId;
    return typeof fn === "function" ? fn() : "self";
  }

  function setSelectedViewId(value) {
    var fn = getContext().setSelectedViewId;
    if (typeof fn === "function") fn(value);
  }

  function getHierarchyStack() {
    var fn = getContext().getHierarchyStack;
    return typeof fn === "function" ? fn() : [];
  }

  function setHierarchyStack(value) {
    var fn = getContext().setHierarchyStack;
    if (typeof fn === "function") fn(value);
  }

  function getViewContextUser() {
    var fn = getContext().getViewContextUser;
    return typeof fn === "function" ? fn() : null;
  }

  function setViewContextUser(value) {
    var fn = getContext().setViewContextUser;
    if (typeof fn === "function") fn(value);
  }

  function getSessionUser() {
    var fn = getContext().getSessionUser;
    return typeof fn === "function" ? fn() : null;
  }

  function getSessionApiMode() {
    var fn = getContext().getSessionApiMode;
    return typeof fn === "function" ? fn() : "mock";
  }

  function getLastKpiResponseDepartment() {
    var fn = getContext().getLastKpiResponseDepartment;
    return typeof fn === "function" ? fn() : "";
  }

  function navigateAfterViewChange() {
    var fn = getContext().onViewChanged;
    if (typeof fn === "function") fn();
  }

  function onUnauthorized() {
    var fn = getContext().onUnauthorized;
    if (typeof fn === "function") fn();
  }

  function fetchImmediateSubordinates(department) {
    var fn = getContext().fetchImmediateSubordinates;
    return typeof fn === "function"
      ? fn(department)
      : Promise.resolve({ ok: false, immediate_children: [] });
  }

  function fetchChairmanDashboardCatalog() {
    var fn = getContext().fetchChairmanDashboardCatalog;
    return typeof fn === "function"
      ? fn()
      : Promise.resolve({ ok: false, items: [], error: "Каталог ПСД недоступен" });
  }

  function fetchKpiStructure(options) {
    var fn = getContext().fetchKpiStructure;
    return typeof fn === "function"
      ? fn(options || {})
      : Promise.resolve({ ok: false, structure: {}, error: "Структура недоступна" });
  }

  function searchDepartments(query) {
    var fn = getContext().searchDepartments;
    return typeof fn === "function"
      ? fn(query)
      : Promise.resolve({ ok: false, results: [] });
  }

  function getMockViewableDashboardTargets() {
    var fn = getContext().getMockViewableDashboardTargets;
    return typeof fn === "function" ? fn() : [];
  }

  function normalizeDashboardRole(value) {
    return value == null ? "" : String(value).trim().toLocaleLowerCase("ru-RU");
  }

  function isBoardChairUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeDashboardRole(user.role);
    var department = normalizeDashboardRole(user.department);
    return role === "председатель совета директоров" || department === "председатель совета директоров";
  }

  function isChairmanTarget(target) {
    return !!(target && target.catalogKind === "chairman");
  }

  function normalizeSidebarSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function updateSidebarSearchEmptyState(hasVisibleTargets) {
    var dashSidebarSearchEmptyEl = document.getElementById("dash-sidebar-search-empty");
    if (!dashSidebarSearchEmptyEl) return;
    var q = normalizeSidebarSearchText(sidebarSearchQuery);
    var shouldShow = q.length > 0;
    var message = "";
    if (!shouldShow) {
      dashSidebarSearchEmptyEl.hidden = true;
      dashSidebarSearchEmptyEl.textContent = "";
      return;
    }
    if (sidebarSearchLoading) {
      message = "Поиск...";
    } else if (sidebarSearchError) {
      message = sidebarSearchError;
    } else if (!hasVisibleTargets) {
      message = "Ничего не найдено";
    }
    dashSidebarSearchEmptyEl.textContent = message;
    dashSidebarSearchEmptyEl.hidden = !message;
  }

  function getSidebarButton(id) {
    return document.getElementById(id);
  }

  function setSidebarButtonSelected(id, selected) {
    var btn = getSidebarButton(id);
    if (btn) btn.setAttribute("aria-selected", selected ? "true" : "false");
  }

  function getDepartmentViewTargets() {
    var viewTargets = getViewTargets();
    return Array.isArray(viewTargets)
      ? viewTargets.filter(function (target) {
          return target && target.id !== "self";
        })
      : [];
  }

  function normalizeDepartmentIconName(value) {
    return String(value || "")
      .toLocaleLowerCase("ru-RU")
      .replace(/[«»"']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function departmentSideIcon(name) {
    var text = normalizeDepartmentIconName(name);
    var icon = "";
    if (text === "одп" || text.indexOf(" одп") !== -1) icon = "odp";
    else if (text.indexOf("газпром") !== -1) icon = "gazprom";
    else if (text.indexOf("вэд") !== -1) icon = "fea";
    else if (text.indexOf("опэоиу") !== -1) icon = "opeoiu";
    else if (text.indexOf("бми") !== -1) icon = "bmi";
    else if (text.indexOf("ключев") !== -1) icon = "klyuchkli";
    else if (text.indexOf("коммерческ") !== -1 && text.indexOf("директор") !== -1) icon = "comdir";
    else if (text.indexOf("операцион") !== -1 && text.indexOf("директор") !== -1) icon = "operofficer";
    else if (text.indexOf("председатель совета директоров") !== -1) icon = "psd";
    if (icon) return "temp/iconsside/" + icon + ".png";
    return "";
  }

  function renderSidebarNavState() {
    var panel = document.getElementById("dash-sidebar-departments-panel");
    var departmentsBtn = getSidebarButton("dash-sidebar-departments-btn");
    var levelBackBtn = getSidebarButton("dash-sidebar-level-back-btn");
    var hasDepartmentChildren = getDepartmentViewTargets().length > 0;
    if (!hasDepartmentChildren) {
      departmentsExpanded = false;
    }
    if (departmentsBtn) {
      departmentsBtn.hidden = !hasDepartmentChildren;
    }
    if (panel) panel.hidden = !departmentsExpanded;
    if (departmentsBtn) {
      departmentsBtn.setAttribute("aria-expanded", departmentsExpanded ? "true" : "false");
    }
    var selectedViewId = getSelectedViewId();
    var hierarchyStack = getHierarchyStack();
    var inDepartmentView =
      (selectedViewId && selectedViewId !== "self") ||
      (Array.isArray(hierarchyStack) && hierarchyStack.length > 1);
    if (levelBackBtn) {
      levelBackBtn.hidden = !(Array.isArray(hierarchyStack) && hierarchyStack.length > 1);
    }
    setSidebarButtonSelected("dash-sidebar-home-btn", !departmentsExpanded && !structureOpen && !inDepartmentView);
    setSidebarButtonSelected("dash-sidebar-level-back-btn", false);
    setSidebarButtonSelected("dash-sidebar-departments-btn", !structureOpen && (departmentsExpanded || inDepartmentView));
    setSidebarButtonSelected("dash-sidebar-structure-btn", structureOpen);
  }

  function normalizeSidebarSearchResults(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result.slice();
    if (Array.isArray(result.results)) return result.results.slice();
    if (Array.isArray(result.items)) return result.items.slice();
    if (Array.isArray(result.data)) return result.data.slice();
    return [];
  }

  function normalizeSidebarSearchPath(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (part) {
          return part != null ? String(part).trim() : "";
        })
        .filter(Boolean);
    }
    if (value && typeof value === "object") {
      if (Array.isArray(value.path)) return normalizeSidebarSearchPath(value.path);
      if (Array.isArray(value.hierarchy)) return normalizeSidebarSearchPath(value.hierarchy);
      if (Array.isArray(value.breadcrumbs)) return normalizeSidebarSearchPath(value.breadcrumbs);
    }
    if (value == null) return [];
    var text = String(value).trim();
    if (!text) return [];
    if (text.indexOf("/") !== -1 || text.indexOf(">") !== -1 || text.indexOf("→") !== -1 || text.indexOf("|") !== -1) {
      return text
        .split(/\s*(?:\/|>|→|\|)\s*/)
        .map(function (part) {
          return part != null ? String(part).trim() : "";
        })
        .filter(Boolean);
    }
    return [text];
  }

  function buildSidebarSearchHierarchy(item) {
    if (!item) return [];
    var hierarchy =
      normalizeSidebarSearchPath(item.path || item.hierarchy || item.breadcrumbs || item.full_path || item.fullPath);
    if (!hierarchy.length && item.department != null && String(item.department).trim() !== "") {
      hierarchy = [String(item.department).trim()];
    }
    if (!hierarchy.length && item.viewDepartment != null && String(item.viewDepartment).trim() !== "") {
      hierarchy = [String(item.viewDepartment).trim()];
    }
    return hierarchy;
  }

  function updateSidebarBackButton() {
    var dashSidebarBackBtnEl = document.getElementById("dash-sidebar-back-btn");
    if (!dashSidebarBackBtnEl) return;
    dashSidebarBackBtnEl.hidden = getSessionApiMode() === "mock" || getHierarchyStack().length <= 1;
  }

  function getCurrentViewTarget() {
    var viewTargets = getViewTargets();
    var selectedViewId = getSelectedViewId();
    if (viewTargets && viewTargets.length) {
      for (var i = 0; i < viewTargets.length; i++) {
        if (viewTargets[i].id === selectedViewId) return viewTargets[i];
      }
    }
    var chairmanTargets = getChairmanDashboardTargets();
    for (var ci = 0; ci < chairmanTargets.length; ci++) {
      if (chairmanTargets[ci] && chairmanTargets[ci].id === selectedViewId) return chairmanTargets[ci];
    }
    var hierarchy = getHierarchyStack();
    if (Array.isArray(hierarchy) && hierarchy.length) {
      var root = hierarchy[0] != null ? String(hierarchy[0]).trim() : "";
      if (root) {
        var byRoot = findChairmanTargetByRootDepartment(root);
        if (byRoot) return byRoot;
      }
    }
    return viewTargets[0] || chairmanTargets[0] || null;
  }

  function buildTargetsFromChairmanCatalog(items) {
    var sessionUser = getSessionUser();
    var out = [];
    var hasSelf = false;
    (items || []).forEach(function (item, index) {
      if (!item || typeof item !== "object") return;
      var rawId = item.id != null ? String(item.id).trim() : "";
      if (!rawId) return;
      var rawLabel = item.label != null ? String(item.label).trim() : "";
      var aliases = Array.isArray(item.aliases)
        ? item.aliases
            .map(function (alias) {
              return alias != null ? String(alias).trim() : "";
            })
            .filter(Boolean)
        : [];
      if (rawId === "my_dashboard") {
        var selfDeptRaw =
          sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
        out.push({
          id: "self",
          label: "Мой дашборд",
          user: sessionUser,
          aliases: aliases,
          catalogKind: "chairman",
          catalogId: rawId,
          catalogIndex: index,
          department: selfDeptRaw,
        });
        hasSelf = true;
        return;
      }
      var department = rawLabel || rawId;
      out.push({
        id: "chairman:" + encodeURIComponent(rawId),
        label: department,
        department: department,
        viewDepartment: department,
        user: sessionUser,
        aliases: aliases,
        catalogKind: "chairman",
        catalogId: rawId,
        catalogIndex: index,
      });
    });
    if (!hasSelf) {
      var fallbackSelfDept =
        sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
      out.unshift({
        id: "self",
        label: "Мой дашборд",
        user: sessionUser,
        aliases: ["my_dashboard"],
        catalogKind: "chairman",
        catalogId: "my_dashboard",
        catalogIndex: -1,
        department: fallbackSelfDept,
      });
    }
    return out;
  }

  function isViewTargetActive(target, selectedViewId, hierarchyStack) {
    if (!target) return false;
    if (target.id === selectedViewId) return true;
    if (!isChairmanTarget(target)) return false;
    var tcid = target.catalogId != null ? String(target.catalogId).trim() : "";
    if (tcid && rememberedChairmanCatalogId && tcid === rememberedChairmanCatalogId) {
      return true;
    }
    if (target.id === "self") return false;
    if (!hierarchyStack || !hierarchyStack.length) return false;
    var root = hierarchyStack[0] != null ? String(hierarchyStack[0]).trim() : "";
    var dept = target.department != null ? String(target.department).trim() : "";
    return !!root && !!dept && root === dept;
  }

  function findChairmanTargetByRootDepartment(rootDepartment) {
    var root = rootDepartment != null ? String(rootDepartment).trim() : "";
    if (!root) return null;
    var chairmanTargets = getChairmanDashboardTargets();
    for (var i = 0; i < chairmanTargets.length; i++) {
      var target = chairmanTargets[i];
      var dept = target && target.department != null ? String(target.department).trim() : "";
      if (dept && dept === root) return target;
    }
    return null;
  }

  function resolveChairmanSelectedViewIdFromHierarchy(hierarchy) {
    var path = Array.isArray(hierarchy) ? hierarchy : [];
    if (!path.length) return "self";
    var target = findChairmanTargetByRootDepartment(path[0]);
    return target && target.id ? target.id : "self";
  }

  function getActiveChairmanCatalogTarget() {
    var chairmanTargets = getChairmanDashboardTargets();
    if (!Array.isArray(chairmanTargets) || !chairmanTargets.length) return null;
    var selectedViewId = getSelectedViewId();
    for (var i = 0; i < chairmanTargets.length; i++) {
      var t = chairmanTargets[i];
      if (t && t.id === selectedViewId) {
        if (t.catalogId != null) rememberedChairmanCatalogId = String(t.catalogId).trim();
        return t;
      }
    }
    /* selectedViewId = chairman:commerce, а в targets ещё старый снимок — берём catalogId из id */
    var viewId = selectedViewId != null ? String(selectedViewId) : "";
    if (viewId.indexOf("chairman:") === 0) {
      var fromView = "";
      try {
        fromView = decodeURIComponent(viewId.slice("chairman:".length)).trim();
      } catch (e) {
        fromView = viewId.slice("chairman:".length).trim();
      }
      if (fromView) {
        rememberedChairmanCatalogId = fromView;
        for (var vi = 0; vi < chairmanTargets.length; vi++) {
          var vt = chairmanTargets[vi];
          if (!vt) continue;
          var vcid = vt.catalogId != null ? String(vt.catalogId).trim() : "";
          if (vcid && vcid === fromView) return vt;
        }
      }
    }
    if (rememberedChairmanCatalogId) {
      for (var j = 0; j < chairmanTargets.length; j++) {
        var mt = chairmanTargets[j];
        if (!mt) continue;
        var mcid = mt.catalogId != null ? String(mt.catalogId).trim() : "";
        if (mcid && mcid === rememberedChairmanCatalogId) return mt;
      }
      /* Не сбрасываем commerce в my_dashboard через совпадение корня иерархии с отделом ПСД */
      if (rememberedChairmanCatalogId !== "my_dashboard") {
        return null;
      }
    }
    var hierarchy = getHierarchyStack();
    if (Array.isArray(hierarchy) && hierarchy.length) {
      var root = hierarchy[0] != null ? String(hierarchy[0]).trim() : "";
      if (root) {
        var byRoot = findChairmanTargetByRootDepartment(root);
        if (byRoot) return byRoot;
      }
    }
    return null;
  }

  function getActiveChairmanCatalogId() {
    var target = getActiveChairmanCatalogTarget();
    if (target && target.catalogId != null && String(target.catalogId).trim()) {
      return String(target.catalogId).trim();
    }
    if (rememberedChairmanCatalogId) return String(rememberedChairmanCatalogId).trim();
    var viewId = getSelectedViewId();
    viewId = viewId != null ? String(viewId) : "";
    if (viewId.indexOf("chairman:") === 0) {
      try {
        return decodeURIComponent(viewId.slice("chairman:".length)).trim();
      } catch (e) {
        return viewId.slice("chairman:".length).trim();
      }
    }
    return "";
  }

  function renderChairmanDashboardTabs() {
    var nav = document.getElementById("dashboard-chairman-tabs");
    var chairmanTargets = getChairmanDashboardTargets();
    var selectedViewId = getSelectedViewId();
    var hierarchyStack = getHierarchyStack();
    var sessionUser = getSessionUser();
    if (!nav) return;
    nav.innerHTML = "";
    if (!isBoardChairUser(sessionUser) || !chairmanTargets || chairmanTargets.length <= 1) {
      nav.hidden = true;
      return;
    }
    /* Не на корне иерархии (спуск по подразделениям) — без переключателя «Мой дашборд» / «Коммерческий блок» */
    if (Array.isArray(hierarchyStack) && hierarchyStack.length > 1) {
      nav.hidden = true;
      return;
    }
    /* У ПСД переключение «Мой дашборд / Коммерческий блок» теперь встроено в верхнюю плашку. */
    if (isBoardChairUser(sessionUser)) {
      nav.hidden = true;
      return;
    }
    var overviewEl = document.getElementById("dash-chairman-overview");
    if (overviewEl && !overviewEl.hidden) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    var inner = document.createElement("div");
    inner.className = "dash-view-tabs-inner";
    chairmanTargets.forEach(function (t) {
      if (!t) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dash-view-tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-target-id", t.id);
      btn.setAttribute("aria-selected", isViewTargetActive(t, selectedViewId, hierarchyStack) ? "true" : "false");
      var iconSrc = departmentSideIcon([t.label, t.department, t.viewDepartment].join(" "));
      if (iconSrc) {
        var iconImg = document.createElement("span");
        iconImg.className = "dash-view-tab-side-icon";
        iconImg.style.backgroundImage = "url('" + iconSrc + "')";
        iconImg.setAttribute("aria-hidden", "true");
        btn.appendChild(iconImg);
      } else {
        var icon = document.createElement("span");
        icon.className = "dash-view-tab-dot";
        var fallbackText =
          t.label != null && String(t.label).trim()
            ? String(t.label).trim()
            : t.department != null && String(t.department).trim()
              ? String(t.department).trim()
              : t.viewDepartment != null && String(t.viewDepartment).trim()
                ? String(t.viewDepartment).trim()
                : "?";
        icon.setAttribute("data-letter", fallbackText.charAt(0).toLocaleUpperCase("ru-RU"));
        icon.setAttribute("aria-hidden", "true");
        btn.appendChild(icon);
      }
      var span = document.createElement("span");
      span.className = "dash-view-tab-text";
      span.textContent =
        t.label != null && String(t.label).trim()
          ? DashUi.capitalizeHeaderTitle(String(t.label).trim())
          : t.id;
      btn.appendChild(span);
      btn.addEventListener("click", function () {
        if (t.id === getSelectedViewId()) return;
        rememberChairmanCatalogId(t.catalogId);
        setSelectedViewId(t.id);
        setViewContextUser(t.user || sessionUser);
        var catalogDept =
          t.viewDepartment != null && String(t.viewDepartment).trim()
            ? String(t.viewDepartment).trim()
            : t.department != null && String(t.department).trim()
              ? String(t.department).trim()
              : "";
        if (catalogDept) {
          setHierarchyStack([catalogDept]);
        } else {
          var effDept =
            sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
          setHierarchyStack(effDept ? [effDept] : []);
        }
        if (getSessionApiMode() === "mock") {
          renderChairmanDashboardTabs();
          renderViewTabs();
          updateTopBarForView();
          navigateAfterViewChange();
          return;
        }
        refreshSubordinateTabsFromApi().then(function () {
          renderChairmanDashboardTabs();
          updateTopBarForView();
          navigateAfterViewChange();
        });
      });
      inner.appendChild(btn);
    });
    nav.appendChild(inner);
  }

  function getDepartmentForCurrentKpiContext() {
    var hierarchyStack = getHierarchyStack();
    var sessionUser = getSessionUser();
    if (hierarchyStack.length > 0) {
      var last = hierarchyStack[hierarchyStack.length - 1];
      if (last != null && String(last).trim()) return String(last).trim();
    }
    if (sessionUser && sessionUser.department != null && String(sessionUser.department).trim()) {
      return String(sessionUser.department).trim();
    }
    return "";
  }

  function updateTopBarForView() {
    var sessionUser = getSessionUser();
    var viewContextUser = getViewContextUser();
    var selectedViewId = getSelectedViewId();
    var hierarchyStack = getHierarchyStack();
    var t = getCurrentViewTarget();
    var titleEl = document.getElementById("dash-role-title");
    if (titleEl) {
      var lastDep =
        getLastKpiResponseDepartment() && String(getLastKpiResponseDepartment()).trim()
          ? String(getLastKpiResponseDepartment()).trim()
          : "";
      var suDept =
        sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
      var vcDept =
        viewContextUser && viewContextUser.department != null
          ? String(viewContextUser.department).trim()
          : "";
      var vcRole =
        viewContextUser && viewContextUser.role != null ? String(viewContextUser.role).trim() : "";
      /* В role с API часто логин (User5); в шапке — подразделение сразу после входа */
      var raw = lastDep || suDept || vcDept || vcRole || "—";
      titleEl.textContent = DashUi.capitalizeHeaderTitle(raw);
    }
    var elHint = document.getElementById("dash-user-hint");
    if (!elHint) return;
    elHint.removeAttribute("title");
    if (selectedViewId === "self") {
      var depHint =
        sessionUser && sessionUser.department != null && String(sessionUser.department).trim()
          ? DashUi.capitalizeHeaderTitle(String(sessionUser.department).trim())
          : "";
      elHint.textContent =
        depHint ||
        (sessionUser && sessionUser.nickname ? String(sessionUser.nickname).trim() : "") ||
        "—";
    } else {
      var viewLabel = "";
      if (hierarchyStack.length > 0) {
        viewLabel = String(hierarchyStack[hierarchyStack.length - 1]).trim();
      }
      if (!viewLabel && t) {
        if (t.viewDepartment != null && String(t.viewDepartment).trim()) {
          viewLabel = String(t.viewDepartment).trim();
        } else if (t.label) {
          viewLabel = String(t.label).trim();
        }
      }
      if (!viewLabel) {
        viewLabel = viewContextUser && viewContextUser.nickname ? viewContextUser.nickname : "—";
      }
      elHint.textContent =
        "Вы: " +
        ((sessionUser && sessionUser.nickname) || "—") +
        " · просмотр: " +
        DashUi.capitalizeHeaderTitle(viewLabel);
    }
  }

  function clearSidebarSearchState() {
    sidebarSearchQuery = "";
    sidebarSearchResults = [];
    sidebarSearchLoading = false;
    sidebarSearchError = "";
    sidebarSearchRequestSeq++;
    var dashSidebarSearchInputEl = document.getElementById("dash-sidebar-search-input");
    if (dashSidebarSearchInputEl) dashSidebarSearchInputEl.value = "";
  }

  function renderSidebarSearchResults(results) {
    var nav = document.getElementById("dashboard-view-tabs");
    if (!nav) return;
    var q = normalizeSidebarSearchText(sidebarSearchQuery);
    if (!q) {
      updateSidebarSearchEmptyState(true);
      return;
    }
    if (sidebarSearchLoading) {
      nav.innerHTML = "";
      nav.hidden = false;
      updateSidebarSearchEmptyState(false);
      return;
    }
    var list = Array.isArray(results) ? results.slice() : [];
    nav.innerHTML = "";
    if (!list.length) {
      nav.hidden = true;
      updateSidebarSearchEmptyState(false);
      return;
    }
    nav.hidden = false;
    var inner = document.createElement("div");
    inner.className = "dash-view-tabs-inner";
    var hasVisible = false;
    list.forEach(function (item) {
      if (!item) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dash-view-tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-target-id", item.id);
      btn.setAttribute("aria-selected", "false");
      var span = document.createElement("span");
      span.className = "dash-view-tab-text";
      span.textContent =
        item.label != null && String(item.label).trim()
          ? DashUi.capitalizeHeaderTitle(String(item.label).trim())
          : item.department || item.viewDepartment || item.id;
      btn.appendChild(span);
      btn.addEventListener("click", function () {
        activateSidebarSearchResult(item);
      });
      inner.appendChild(btn);
      hasVisible = true;
    });
    nav.appendChild(inner);
    updateSidebarSearchEmptyState(hasVisible);
  }

  function hasStructureChildren(node) {
    return node && typeof node === "object" && !Array.isArray(node) && Object.keys(node).length > 0;
  }

  function structureNodeIcon(name) {
    var text = name != null ? String(name).toLocaleLowerCase("ru-RU") : "";
    if (text.indexOf("отдел") !== -1) return "temp/icons/modern-house.png";
    return "temp/icons/user.png";
  }

  function isCurrentStructureNode(name) {
    var label = name != null ? String(name).trim() : "";
    if (!label) return false;
    var hierarchyStack = getHierarchyStack();
    if (Array.isArray(hierarchyStack) && hierarchyStack.length) {
      var last = hierarchyStack[hierarchyStack.length - 1];
      return last != null && String(last).trim() === label;
    }
    var sessionUser = getSessionUser();
    var dept = sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
    return !!dept && dept === label;
  }

  function getAllowedStructurePathIndex(path) {
    var sessionUser = getSessionUser();
    if (isBoardChairUser(sessionUser)) return 0;
    var root = sessionUser && sessionUser.department != null ? normalizeDashboardRole(sessionUser.department) : "";
    if (!root || !Array.isArray(path)) return -1;
    for (var i = 0; i < path.length; i++) {
      if (normalizeDashboardRole(path[i]) === root) return i;
    }
    return -1;
  }

  function canNavigateToStructurePath(path) {
    var idx = getAllowedStructurePathIndex(path);
    return idx >= 0 && Array.isArray(path) && path.length - 1 >= idx;
  }

  function encodedStructurePath(path) {
    try {
      return encodeURIComponent(JSON.stringify(path || []));
    } catch (e) {
      return "";
    }
  }

  function headcountForStructureName(name) {
    return null;
    var counts =
      structureHeadcount &&
      structureHeadcount.countsByDepartment &&
      typeof structureHeadcount.countsByDepartment === "object"
        ? structureHeadcount.countsByDepartment
        : null;
    if (!counts) return null;
    var key = name != null ? String(name) : "";
    if (!key || counts[key] == null) return null;
    var value = parseInt(String(counts[key]), 10);
    return isNaN(value) ? null : value;
  }

  function structureHeadcountWarningHtml() {
    if (!structureHeadcount || typeof structureHeadcount !== "object") return "";
    var quality = structureHeadcount.quality && typeof structureHeadcount.quality === "object" ? structureHeadcount.quality : {};
    var warnings = Array.isArray(quality.warnings) ? quality.warnings : [];
    if (!warnings.length) return "";
    var first = warnings[0] || {};
    var message =
      first.code === "FIELD_NOT_AVAILABLE"
        ? "Численность рассчитана по ветке подразделения: поле непосредственного руководителя не опубликовано в OData."
        : first.message || first.code || "Численность рассчитана с ограничениями источника.";
    return '<p class="dash-structure-warning">' + DashUi.escapeHtml(String(message)) + "</p>";
  }

  function buildStructureListHtml(tree, parentPath) {
    var entries = tree && typeof tree === "object" && !Array.isArray(tree) ? Object.keys(tree) : [];
    if (!entries.length) return '<p class="dash-structure-state">Структура пуста.</p>';
    return (
      '<ul class="dash-structure-list">' +
      entries
        .map(function (name) {
          var child = tree[name];
          var path = (parentPath || []).concat([name]);
          var hasChildren = hasStructureChildren(child);
          var current = isCurrentStructureNode(name);
          var clickable = canNavigateToStructurePath(path);
          var headcount = headcountForStructureName(name);
          return (
            '<li class="dash-structure-node' + (hasChildren ? "" : " is-leaf") + '">' +
            '<div class="dash-structure-node-row' +
            (current ? " is-current" : "") +
            (clickable ? " is-clickable" : "") +
            '"' +
            (clickable ? ' data-structure-path="' + encodedStructurePath(path) + '"' : "") +
            ">" +
            (hasChildren
              ? '<button type="button" class="dash-structure-toggle" aria-label="Свернуть/развернуть" aria-expanded="true"></button>'
              : '<span class="dash-structure-toggle-placeholder" aria-hidden="true"></span>') +
            '<img class="dash-structure-node-icon" src="' + DashUi.escapeHtml(structureNodeIcon(name)) + '" alt="" aria-hidden="true" />' +
            '<span class="dash-structure-node-label">' + DashUi.escapeHtml(DashUi.capitalizeHeaderTitle(String(name))) + '</span>' +
            (headcount !== null
              ? '<span class="dash-structure-headcount" title="Работающие сотрудники">' +
                DashUi.escapeHtml(String(headcount)) +
                " чел.</span>"
              : "") +
            "</div>" +
            (hasChildren ? buildStructureListHtml(child, path) : "") +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderStructureTree() {
    var treeEl = document.getElementById("dash-structure-tree");
    if (!treeEl) return;
    if (structureLoading) {
      treeEl.innerHTML = '<p class="dash-structure-state">Загрузка структуры…</p>';
      return;
    }
    if (structureError) {
      treeEl.innerHTML = '<p class="dash-structure-state">' + DashUi.escapeHtml(structureError) + "</p>";
      return;
    }
    treeEl.innerHTML = structureHeadcountWarningHtml() + buildStructureListHtml(structureCache || {});
  }

  function openStructurePanel() {
    var overlay = document.getElementById("dash-structure-overlay");
    if (!overlay) return;
    structureOpen = true;
    departmentsExpanded = false;
    overlay.hidden = false;
    renderSidebarNavState();
    renderViewTabs();
    if (structureCache) {
      renderStructureTree();
      return;
    }
    structureLoading = true;
    structureError = "";
    renderStructureTree();
    fetchKpiStructure().then(function (result) {
      structureLoading = false;
      if (!result || result.unauthorized) {
        structureError = "Требуется повторный вход.";
        onUnauthorized();
        renderStructureTree();
        return;
      }
      if (!result.ok) {
        structureError = result.error || "Не удалось загрузить структуру.";
        renderStructureTree();
        return;
      }
      structureCache = result.structure || {};
      structureHeadcount = null;
      renderStructureTree();
    });
  }

  function closeStructurePanel() {
    var overlay = document.getElementById("dash-structure-overlay");
    structureOpen = false;
    if (overlay) overlay.hidden = true;
    renderSidebarNavState();
  }

  function decodeStructurePath(value) {
    try {
      var decoded = JSON.parse(decodeURIComponent(String(value || "")));
      return Array.isArray(decoded)
        ? decoded
            .map(function (part) {
              return part != null ? String(part).trim() : "";
            })
            .filter(Boolean)
        : [];
    } catch (e) {
      return [];
    }
  }

  function navigateToStructurePath(path) {
    if (!canNavigateToStructurePath(path)) return;
    var sessionUser = getSessionUser();
    var allowedIndex = getAllowedStructurePathIndex(path);
    var nextStack = isBoardChairUser(sessionUser) ? path.slice() : path.slice(allowedIndex);
    var dept = nextStack.length ? nextStack[nextStack.length - 1] : "";
    if (!dept) return;
    closeStructurePanel();
    clearSidebarSearchState();
    departmentsExpanded = false;
    if (isBoardChairUser(sessionUser)) {
      setSelectedViewId(resolveChairmanSelectedViewIdFromHierarchy(nextStack));
    } else if (nextStack.length <= 1) {
      setSelectedViewId("self");
    } else {
      setSelectedViewId("dept:" + encodeURIComponent(dept));
    }
    setViewContextUser(sessionUser);
    setHierarchyStack(nextStack);
    renderViewTabs();
    refreshSubordinateTabsFromApi().then(function () {
      updateTopBarForView();
      navigateAfterViewChange();
    });
  }

  function filterSidebarViewTabs() {
    renderSidebarSearchResults(sidebarSearchResults);
  }

  function renderHierarchyBreadcrumb() {
    var el = document.getElementById("dashboard-hierarchy-breadcrumb");
    var hierarchyStack = getHierarchyStack();
    updateSidebarBackButton();
    if (!el) return;
    if (getSessionApiMode() === "mock" || hierarchyStack.length <= 1) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = "";
    hierarchyStack.forEach(function (seg, i) {
      if (i > 0) {
        var sep = document.createElement("span");
        sep.className = "dash-hierarchy-sep";
        sep.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
          '<path d="M3.5 6L8 10.5L12.5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
          "</svg>";
        sep.setAttribute("aria-hidden", "true");
        el.appendChild(sep);
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dash-hierarchy-crumb";
      btn.textContent = DashUi.capitalizeHeaderTitle(String(seg));
      if (i === hierarchyStack.length - 1) {
        btn.setAttribute("aria-current", "page");
        btn.disabled = true;
      } else {
        (function (idx) {
          btn.addEventListener("click", function () {
            navigateToHierarchyLevel(idx);
          });
        })(i);
      }
      el.appendChild(btn);
    });
    filterSidebarViewTabs();
  }

  function buildTargetsFromChildren(children, includeSelf) {
    var sessionUser = getSessionUser();
    var rest = (children || []).map(function (name) {
      var n = name != null ? String(name).trim() : "";
      var id = "dept:" + encodeURIComponent(n || "unknown");
      return {
        id: id,
        label: n.length ? n : "—",
        department: n,
        viewDepartment: n,
        user: sessionUser,
      };
    });
    if (includeSelf === false) return rest;
    var selfEntry = { id: "self", label: "Мой дашборд", user: sessionUser };
    return [selfEntry].concat(rest);
  }

  function refreshSubordinateTabsFromApi() {
    return new Promise(function (resolve) {
      var hierarchyStack = getHierarchyStack();
      var sessionUser = getSessionUser();
      if (getSessionApiMode() === "mock") {
        resolve();
        return;
      }
      if (!hierarchyStack.length) {
        setViewTargets([]);
        renderViewTabs();
        renderHierarchyBreadcrumb();
        resolve();
        return;
      }
      var parent = hierarchyStack[hierarchyStack.length - 1];
      fetchImmediateSubordinates(parent)
        .then(function (r) {
          if (r && r.unauthorized) {
            onUnauthorized();
            return;
          }
          var currentStack = getHierarchyStack();
          var atRoot = currentStack.length <= 1;
          var includeSelfFlag = atRoot && !isBoardChairUser(sessionUser);
          if (r && r.ok && r.immediate_children && r.immediate_children.length) {
            setViewTargets(buildTargetsFromChildren(r.immediate_children, includeSelfFlag));
          } else {
            setViewTargets(
              includeSelfFlag
                ? [{ id: "self", label: "Мой дашборд", user: sessionUser }]
                : []
            );
          }
          renderViewTabs();
          renderHierarchyBreadcrumb();
          resolve();
        })
        .catch(function () {
          var currentStack = getHierarchyStack();
          var atRootCatch = currentStack.length <= 1;
          var includeSelfCatch = atRootCatch && !isBoardChairUser(sessionUser);
          setViewTargets(
            includeSelfCatch
              ? [{ id: "self", label: "Мой дашборд", user: sessionUser }]
              : []
          );
          renderViewTabs();
          renderHierarchyBreadcrumb();
          resolve();
        });
    });
  }

  function activateSidebarSearchResult(item) {
    var sessionUser = getSessionUser();
    var hierarchy = buildSidebarSearchHierarchy(item);
    if (!hierarchy.length) return;
    var dept = hierarchy[hierarchy.length - 1];
    setSelectedViewId(
      item && item.id != null && String(item.id).trim() ? String(item.id).trim() : "search:" + encodeURIComponent(dept)
    );
    setViewContextUser(item && item.user ? item.user : sessionUser);
    setHierarchyStack(hierarchy.slice());
    clearSidebarSearchState();
    renderViewTabs();
    refreshSubordinateTabsFromApi().then(function () {
      updateTopBarForView();
      navigateAfterViewChange();
    });
  }

  function resetSidebarSearch() {
    clearSidebarSearchState();
    updateSidebarSearchEmptyState(true);
    renderViewTabs();
  }

  function onSidebarSearchInput(value) {
    sidebarSearchQuery = value != null ? String(value) : "";
    var q = normalizeSidebarSearchText(sidebarSearchQuery);
    if (!q) {
      sidebarSearchResults = [];
      sidebarSearchLoading = false;
      sidebarSearchError = "";
      sidebarSearchRequestSeq++;
      renderViewTabs();
      return;
    }
    sidebarSearchLoading = true;
    sidebarSearchError = "";
    renderSidebarSearchResults(sidebarSearchResults);
    var seq = ++sidebarSearchRequestSeq;
    if (getSessionApiMode() === "mock") {
      sidebarSearchLoading = false;
      sidebarSearchResults = [];
      sidebarSearchError = "";
      renderSidebarSearchResults([]);
      return;
    }
    searchDepartments(q).then(function (result) {
      if (seq !== sidebarSearchRequestSeq) return;
      sidebarSearchLoading = false;
      if (!result || result.unauthorized) {
        sidebarSearchError = "Требуется повторный вход";
        sidebarSearchResults = [];
        renderSidebarSearchResults([]);
        return;
      }
      if (!result.ok) {
        sidebarSearchError = result.error || "Ошибка поиска";
        sidebarSearchResults = [];
        renderSidebarSearchResults([]);
        return;
      }
      sidebarSearchError = "";
      sidebarSearchResults = normalizeSidebarSearchResults(result.results);
      renderSidebarSearchResults(sidebarSearchResults);
    });
  }

  function navigateToHierarchyLevel(levelIndex) {
    var hierarchyStack = getHierarchyStack();
    var sessionUser = getSessionUser();
    if (levelIndex < 0 || levelIndex >= hierarchyStack.length) return;
    setHierarchyStack(hierarchyStack.slice(0, levelIndex + 1));
    if (levelIndex === 0) {
      var activeChairmanTarget = isBoardChairUser(sessionUser)
        ? getActiveChairmanCatalogTarget()
        : null;
      setSelectedViewId(activeChairmanTarget && activeChairmanTarget.id ? activeChairmanTarget.id : "self");
    } else {
      var currentStack = getHierarchyStack();
      var parent = currentStack[currentStack.length - 1];
      setSelectedViewId("dept:" + encodeURIComponent(parent));
    }
    setViewContextUser(sessionUser);
    refreshSubordinateTabsFromApi().then(function () {
      updateTopBarForView();
      navigateAfterViewChange();
    });
  }

  function navigateHomeFromSidebar() {
    var sessionUser = getSessionUser();
    var rootDept = sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
    departmentsExpanded = false;
    closeStructurePanel();
    clearSidebarSearchState();
    clearRememberedChairmanCatalogId();
    setSelectedViewId("self");
    setViewContextUser(sessionUser);
    setHierarchyStack(rootDept ? [rootDept] : []);
    renderViewTabs();
    updateTopBarForView();
    navigateAfterViewChange();
  }

  function toggleDepartmentsPanel() {
    departmentsExpanded = !departmentsExpanded;
    if (departmentsExpanded) {
      closeStructurePanel();
      renderSidebarNavState();
      refreshSubordinateTabsFromApi();
      return;
    }
    renderViewTabs();
  }

  function loadViewTargets() {
    return new Promise(function (resolve) {
      var sessionUser = getSessionUser();
      setHierarchyStack([]);
      clearRememberedChairmanCatalogId();
      resetSidebarSearch();
      if (getSessionApiMode() === "mock") {
        setChairmanDashboardTargets([]);
        resolve(getMockViewableDashboardTargets());
        return;
      }
      if (isBoardChairUser(sessionUser)) {
        fetchChairmanDashboardCatalog()
          .then(function (result) {
            if (result && result.unauthorized) {
              onUnauthorized();
              return;
            }
            if (result && result.ok && Array.isArray(result.items) && result.items.length) {
              var targets = buildTargetsFromChairmanCatalog(result.items);
              setChairmanDashboardTargets(targets);
              var selfDept = sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
              setHierarchyStack(selfDept ? [selfDept] : []);
              setSelectedViewId(resolveChairmanSelectedViewIdFromHierarchy(getHierarchyStack()));
              resolve([]);
              return;
            }
            setChairmanDashboardTargets([]);
            resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
          })
          .catch(function () {
            setChairmanDashboardTargets([]);
            resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
          });
        return;
      }
      setChairmanDashboardTargets([]);
      var rootDept = sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
      if (!rootDept) {
        resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
        return;
      }
      fetchImmediateSubordinates(rootDept)
        .then(function (r) {
          if (r && r.unauthorized) {
            onUnauthorized();
            return;
          }
          if (r && r.ok && r.immediate_children && r.immediate_children.length) {
            setHierarchyStack([rootDept]);
            resolve(buildTargetsFromChildren(r.immediate_children));
          } else {
            resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
          }
        })
        .catch(function () {
          resolve([{ id: "self", label: "Мой дашборд", user: sessionUser }]);
        });
    });
  }

  function renderViewTabs() {
    var nav = document.getElementById("dashboard-view-tabs");
    var sessionUser = getSessionUser();
    var viewTargets = getDepartmentViewTargets();
    var selectedViewId = getSelectedViewId();
    if (!nav) return;
    renderSidebarNavState();
    nav.innerHTML = "";
    renderChairmanDashboardTabs();
    if (!departmentsExpanded && !normalizeSidebarSearchText(sidebarSearchQuery)) {
      nav.hidden = true;
      updateSidebarSearchEmptyState(false);
      renderHierarchyBreadcrumb();
      return;
    }
    var onlySelf = viewTargets && viewTargets.length === 1 && viewTargets[0].id === "self";
    if (!viewTargets || viewTargets.length === 0 || onlySelf) {
      nav.hidden = true;
      updateSidebarSearchEmptyState(false);
      renderHierarchyBreadcrumb();
      return;
    }
    nav.hidden = false;
    var inner = document.createElement("div");
    inner.className = "dash-view-tabs-inner";
    var hierarchyStack = getHierarchyStack();
    viewTargets.forEach(function (t) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dash-view-tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-target-id", t.id);
      btn.setAttribute("aria-selected", isViewTargetActive(t, selectedViewId, hierarchyStack) ? "true" : "false");
      var iconSrc = departmentSideIcon([t.label, t.department, t.viewDepartment].join(" "));
      if (iconSrc) {
        btn.setAttribute("data-side-icon", iconSrc);
        var sideIcon = document.createElement("span");
        sideIcon.className = "dash-view-tab-side-icon";
        sideIcon.style.backgroundImage = "url('" + iconSrc + "')";
        sideIcon.setAttribute("aria-hidden", "true");
        btn.appendChild(sideIcon);
      } else {
        var icon = document.createElement("span");
        icon.className = "dash-view-tab-dot";
        icon.setAttribute("aria-hidden", "true");
        btn.appendChild(icon);
      }
      var span = document.createElement("span");
      span.className = "dash-view-tab-text";
      span.textContent =
        t.label != null && String(t.label).trim()
          ? DashUi.capitalizeHeaderTitle(String(t.label).trim())
          : t.label || t.id;
      btn.appendChild(span);
      btn.addEventListener("click", function () {
        if (!isChairmanTarget(t) && getSelectedViewId() === t.id) return;
        setSelectedViewId(t.id);
        setViewContextUser(t.user || sessionUser);
        if (t.id === "self") {
          if (sessionUser && sessionUser.department) {
            setHierarchyStack([String(sessionUser.department).trim()]);
          } else {
            setHierarchyStack([]);
          }
        } else if (isChairmanTarget(t)) {
          var catalogDept =
            t.viewDepartment != null && String(t.viewDepartment).trim()
              ? String(t.viewDepartment).trim()
              : t.department != null && String(t.department).trim()
                ? String(t.department).trim()
                : "";
          setHierarchyStack(catalogDept ? [catalogDept] : []);
          if (t.catalogId != null) rememberChairmanCatalogId(t.catalogId);
        } else {
          var deptName =
            t.viewDepartment != null && String(t.viewDepartment).trim()
              ? String(t.viewDepartment).trim()
              : t.department != null && String(t.department).trim()
                ? String(t.department).trim()
                : "";
          if (!deptName) return;
          var stack = getHierarchyStack().slice();
          if (!stack.length || stack[stack.length - 1] !== deptName) {
            setHierarchyStack(stack.concat([deptName]));
          }
        }
        if (getSessionApiMode() === "mock") {
          inner.querySelectorAll(".dash-view-tab").forEach(function (b) {
            b.setAttribute("aria-selected", b.getAttribute("data-target-id") === getSelectedViewId() ? "true" : "false");
          });
          updateTopBarForView();
          navigateAfterViewChange();
          return;
        }
        refreshSubordinateTabsFromApi().then(function () {
          updateTopBarForView();
          navigateAfterViewChange();
        });
      });
      inner.appendChild(btn);
    });
    nav.appendChild(inner);
    renderHierarchyBreadcrumb();
    filterSidebarViewTabs();
  }

  function bind() {
    var dashSidebarSearchInputEl = document.getElementById("dash-sidebar-search-input");
    var dashSidebarBackBtnEl = document.getElementById("dash-sidebar-back-btn");
    var dashSidebarHomeBtnEl = document.getElementById("dash-sidebar-home-btn");
    var dashSidebarLevelBackBtnEl = document.getElementById("dash-sidebar-level-back-btn");
    var dashSidebarDepartmentsBtnEl = document.getElementById("dash-sidebar-departments-btn");
    var dashSidebarStructureBtnEl = document.getElementById("dash-sidebar-structure-btn");
    var dashStructureCloseEl = document.getElementById("dash-structure-close");
    var dashStructureOverlayEl = document.getElementById("dash-structure-overlay");
    var dashStructureTreeEl = document.getElementById("dash-structure-tree");
    if (dashSidebarHomeBtnEl && !dashSidebarHomeBtnEl.__dashboardHierarchyNavBound) {
      dashSidebarHomeBtnEl.__dashboardHierarchyNavBound = true;
      dashSidebarHomeBtnEl.addEventListener("click", navigateHomeFromSidebar);
    }
    if (dashSidebarLevelBackBtnEl && !dashSidebarLevelBackBtnEl.__dashboardHierarchyNavBound) {
      dashSidebarLevelBackBtnEl.__dashboardHierarchyNavBound = true;
      dashSidebarLevelBackBtnEl.addEventListener("click", function () {
        var stack = getHierarchyStack();
        if (!Array.isArray(stack) || stack.length <= 1) return;
        departmentsExpanded = true;
        navigateToHierarchyLevel(stack.length - 2);
      });
    }
    if (dashSidebarDepartmentsBtnEl && !dashSidebarDepartmentsBtnEl.__dashboardHierarchyNavBound) {
      dashSidebarDepartmentsBtnEl.__dashboardHierarchyNavBound = true;
      dashSidebarDepartmentsBtnEl.addEventListener("click", toggleDepartmentsPanel);
    }
    if (dashSidebarStructureBtnEl && !dashSidebarStructureBtnEl.__dashboardHierarchyNavBound) {
      dashSidebarStructureBtnEl.__dashboardHierarchyNavBound = true;
      dashSidebarStructureBtnEl.addEventListener("click", openStructurePanel);
    }
    if (dashStructureCloseEl && !dashStructureCloseEl.__dashboardHierarchyNavBound) {
      dashStructureCloseEl.__dashboardHierarchyNavBound = true;
      dashStructureCloseEl.addEventListener("click", closeStructurePanel);
    }
    if (dashStructureOverlayEl && !dashStructureOverlayEl.__dashboardHierarchyNavBound) {
      dashStructureOverlayEl.__dashboardHierarchyNavBound = true;
      dashStructureOverlayEl.addEventListener("click", function (e) {
        if (e.target === dashStructureOverlayEl) closeStructurePanel();
      });
    }
    if (dashStructureTreeEl && !dashStructureTreeEl.__dashboardHierarchyNavBound) {
      dashStructureTreeEl.__dashboardHierarchyNavBound = true;
      dashStructureTreeEl.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest ? e.target.closest(".dash-structure-toggle") : null;
        if (btn) {
          var node = btn.closest(".dash-structure-node");
          if (!node) return;
          var collapsed = node.classList.toggle("is-collapsed");
          btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
          return;
        }
        var row = e.target && e.target.closest ? e.target.closest(".dash-structure-node-row[data-structure-path]") : null;
        if (!row) return;
        navigateToStructurePath(decodeStructurePath(row.getAttribute("data-structure-path")));
      });
    }
    if (dashSidebarSearchInputEl && !dashSidebarSearchInputEl.__dashboardHierarchyNavBound) {
      dashSidebarSearchInputEl.__dashboardHierarchyNavBound = true;
      dashSidebarSearchInputEl.addEventListener("input", function (e) {
        onSidebarSearchInput(e.target.value);
      });
    }
    if (dashSidebarBackBtnEl && !dashSidebarBackBtnEl.__dashboardHierarchyNavBound) {
      dashSidebarBackBtnEl.__dashboardHierarchyNavBound = true;
      dashSidebarBackBtnEl.addEventListener("click", function () {
        if (getHierarchyStack().length <= 1) return;
        navigateToHierarchyLevel(getHierarchyStack().length - 2);
      });
    }
  }

  function init(options) {
    mergeContext(options);
    bind();
  }

  global.DashboardHierarchyNav = {
    activateSidebarSearchResult: activateSidebarSearchResult,
    clearRememberedChairmanCatalogId: clearRememberedChairmanCatalogId,
    clearSidebarSearchState: clearSidebarSearchState,
    filterSidebarViewTabs: filterSidebarViewTabs,
    getActiveChairmanCatalogId: getActiveChairmanCatalogId,
    getActiveChairmanCatalogTarget: getActiveChairmanCatalogTarget,
    getCurrentViewTarget: getCurrentViewTarget,
    getDepartmentForCurrentKpiContext: getDepartmentForCurrentKpiContext,
    init: init,
    loadViewTargets: loadViewTargets,
    navigateToHierarchyLevel: navigateToHierarchyLevel,
    onSidebarSearchInput: onSidebarSearchInput,
    refreshSubordinateTabsFromApi: refreshSubordinateTabsFromApi,
    rememberChairmanCatalogId: rememberChairmanCatalogId,
    renderHierarchyBreadcrumb: renderHierarchyBreadcrumb,
    renderViewTabs: renderViewTabs,
    resetSidebarSearch: resetSidebarSearch,
    updateSidebarBackButton: updateSidebarBackButton,
    updateTopBarForView: updateTopBarForView,
  };
})(typeof window !== "undefined" ? window : globalThis);
