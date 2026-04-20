(function (global) {
  var latestContext = {};
  var sidebarSearchQuery = "";
  var sidebarSearchRequestSeq = 0;
  var sidebarSearchLoading = false;
  var sidebarSearchError = "";
  var sidebarSearchResults = [];
  var rememberedChairmanCatalogId = "";

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
    if (rememberedChairmanCatalogId) {
      for (var j = 0; j < chairmanTargets.length; j++) {
        var mt = chairmanTargets[j];
        if (!mt) continue;
        var mcid = mt.catalogId != null ? String(mt.catalogId).trim() : "";
        if (mcid && mcid === rememberedChairmanCatalogId) return mt;
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
    if (!target || target.catalogId == null) return "";
    return String(target.catalogId).trim();
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
        var effDept = sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
        setHierarchyStack(effDept ? [effDept] : []);
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
      var raw;
      if (lastDep) {
        raw = lastDep;
      } else if (isBoardChairUser(sessionUser)) {
        /* У ПСД в role с API часто логин (User5); для шапки — подразделение / должность */
        var suDept =
          sessionUser && sessionUser.department != null ? String(sessionUser.department).trim() : "";
        var vcDept =
          viewContextUser && viewContextUser.department != null
            ? String(viewContextUser.department).trim()
            : "";
        var vcRole =
          viewContextUser && viewContextUser.role != null ? String(viewContextUser.role).trim() : "";
        raw = suDept || vcDept || vcRole || "—";
      } else {
        raw =
          viewContextUser && viewContextUser.role != null
            ? String(viewContextUser.role).trim()
            : "—";
      }
      titleEl.textContent = DashUi.capitalizeHeaderTitle(raw);
    }
    var elHint = document.getElementById("dash-user-hint");
    if (!elHint) return;
    elHint.removeAttribute("title");
    if (selectedViewId === "self") {
      var hint = sessionUser && sessionUser.nickname ? sessionUser.nickname : "";
      if (sessionUser && sessionUser.department) {
        var depSelf = DashUi.capitalizeHeaderTitle(String(sessionUser.department).trim());
        hint = hint ? hint + " · " + depSelf : depSelf;
      }
      elHint.textContent = hint || "—";
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
    var viewTargets = getViewTargets();
    var selectedViewId = getSelectedViewId();
    if (!nav) return;
    nav.innerHTML = "";
    renderChairmanDashboardTabs();
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
        setViewContextUser(t.user);
        if (t.id === "self") {
          if (sessionUser && sessionUser.department) {
            setHierarchyStack([String(sessionUser.department).trim()]);
          } else {
            setHierarchyStack([]);
          }
        } else {
          setHierarchyStack(getHierarchyStack().concat([t.department]));
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
