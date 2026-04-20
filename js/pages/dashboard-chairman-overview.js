/**
 * @fileoverview Обзорный экран дашбордов председателя совета директоров.
 * Показывает карточки вида «Мой дашборд» / «Коммерческая служба» с кратким
 * перечислением плиток и их значений. Клик по карточке раскрывает её в полный
 * дашборд (плитки + графики + таблицы) через существующий data-loader.
 */
(function (global) {
  var ctx = {};
  var overviewEl = null;
  var overviewBarEl = null;
  var overviewBarTitleEl = null;
  var backBtnEl = null;
  var dashContentEl = null;
  var monthNavEl = null;
  var chairmanTabsEl = null;
  var dashLoadingEl = null;

  var state = {
    expandedCatalogId: null,
    cache: Object.create(null),
    requestSeq: 0,
  };

  function mergeContext(next) {
    ctx = Object.assign({}, ctx, next || {});
  }

  function call(name, args, fallback) {
    var fn = ctx && ctx[name];
    if (typeof fn !== "function") return fallback;
    try {
      return fn.apply(ctx, Array.isArray(args) ? args : []);
    } catch (e) {
      return fallback;
    }
  }

  function getTargets() {
    var list = call("getChairmanTargets", [], []);
    return Array.isArray(list) ? list.slice() : [];
  }

  function getSessionUser() {
    return call("getSessionUser", [], null);
  }

  function getPeriod() {
    return call("getPeriodState", [], null);
  }

  function isRootHierarchy() {
    var stack = call("getHierarchyStack", [], []);
    return !Array.isArray(stack) || stack.length <= 1;
  }

  function normalizeRole(value) {
    return value == null ? "" : String(value).trim().toLocaleLowerCase("ru-RU");
  }

  function isBoardChairUser(user) {
    if (!user || typeof user !== "object") return false;
    var role = normalizeRole(user.role);
    var dep = normalizeRole(user.department);
    return role === "председатель совета директоров" || dep === "председатель совета директоров";
  }

  function shouldShowOverview() {
    // Для ПСД на входе показываем 2 блока (Мой дашборд + Коммерческий блок) в виде карточек.
    // При drilldown в структуру обзор прячем и показываем полный дашборд.
    var user = getSessionUser();
    if (!isBoardChairUser(user)) return false;
    if (!isRootHierarchy()) return false;
    return true;
  }

  function ensureDom() {
    if (!overviewEl) overviewEl = document.getElementById("dash-chairman-overview");
    if (!overviewBarEl) overviewBarEl = document.getElementById("dash-chairman-overview-bar");
    if (!overviewBarTitleEl) overviewBarTitleEl = document.getElementById("dash-chairman-overview-bar-title");
    if (!backBtnEl) backBtnEl = document.getElementById("dash-chairman-overview-back");
    if (!dashContentEl) dashContentEl = document.getElementById("dash-content");
    if (!monthNavEl) monthNavEl = document.getElementById("month-navigator");
    if (!chairmanTabsEl) chairmanTabsEl = document.getElementById("dashboard-chairman-tabs");
    if (!dashLoadingEl) dashLoadingEl = document.getElementById("dash-loading");
    return !!overviewEl;
  }

  function bindBackButton() {
    if (!backBtnEl || backBtnEl.__chairmanOverviewBound) return;
    backBtnEl.__chairmanOverviewBound = true;
    backBtnEl.addEventListener("click", function () {
      backToOverview();
    });
  }

  function cacheKeyFor(catalogId) {
    var period = getPeriod();
    var m = period && period.currentPeriodMonth != null ? String(period.currentPeriodMonth) : "";
    var y = period && period.currentPeriodYear != null ? String(period.currentPeriodYear) : "";
    return String(catalogId || "") + "\0" + y + "-" + m;
  }

  function capitalizeTitle(value) {
    if (!value) return "";
    var text = String(value).trim();
    if (!text) return "";
    if (typeof global.DashUi !== "undefined" && global.DashUi && typeof global.DashUi.capitalizeHeaderTitle === "function") {
      return global.DashUi.capitalizeHeaderTitle(text);
    }
    return text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1);
  }

  function formatNumberRu(value, maxFractionDigits) {
    if (value == null || isNaN(Number(value))) return "";
    var digits = typeof maxFractionDigits === "number" ? maxFractionDigits : 1;
    try {
      return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: digits });
    } catch (e) {
      return String(value);
    }
  }

  function looksLikePercentUnit(unit) {
    if (unit == null) return false;
    var u = String(unit).trim().toLowerCase();
    if (!u) return false;
    return u === "%" || u.indexOf("%") !== -1 || u === "процент" || u === "проценты";
  }

  function formatTileValue(tile) {
    if (!tile) return "—";
    var unit = tile.units != null ? String(tile.units).trim() : "";
    var fact = tile.fact;
    if (fact != null && String(fact).trim() !== "" && !isNaN(Number(fact))) {
      var numeric = Number(fact);
      if (looksLikePercentUnit(unit)) {
        return formatNumberRu(numeric, 1) + "%";
      }
      // Для ПСД суммы показываем без сокращений (не "млн/млрд"), т.к. backend возвращает int в рублях.
      var suffix = unit ? " " + unit : "";
      return formatNumberRu(numeric, 0) + suffix;
    }
    var pct = tile.kpi_pct != null ? tile.kpi_pct : tile.kpi_pst != null ? tile.kpi_pst : tile.percent;
    if (pct != null && !isNaN(Number(pct))) {
      return formatNumberRu(Number(pct), 1) + "%";
    }
    return "—";
  }

  function makeTileElement(tile) {
    var li = document.createElement("li");
    li.className = "dash-chairman-overview-tile";

    var dot = document.createElement("span");
    var rag = tile && tile.rag ? String(tile.rag).toLowerCase() : "";
    dot.className = "dash-chairman-overview-tile-dot" + (rag ? " rag-" + rag : "");
    li.appendChild(dot);

    if (tile && tile.badge) {
      var badge = document.createElement("span");
      badge.className = "dash-chairman-overview-tile-badge";
      badge.textContent = String(tile.badge);
      li.appendChild(badge);
    }

    var text = document.createElement("span");
    text.className = "dash-chairman-overview-tile-text";

    var name = document.createElement("span");
    name.className = "dash-chairman-overview-tile-name";
    var nameText = tile && tile.title ? String(tile.title) : tile && tile.kpi_id ? String(tile.kpi_id) : "—";
    name.textContent = nameText;
    name.title = nameText;

    var value = document.createElement("span");
    value.className = "dash-chairman-overview-tile-value";
    value.textContent = formatTileValue(tile);

    text.appendChild(name);
    text.appendChild(value);
    li.appendChild(text);
    return li;
  }

  function buildCardHead(target) {
    var head = document.createElement("div");
    head.className = "dash-chairman-overview-card-head";

    var title = document.createElement("h2");
    title.className = "dash-chairman-overview-card-title";
    var rawTitle = target.label && String(target.label).trim()
      ? String(target.label).trim()
      : target.department && String(target.department).trim()
        ? String(target.department).trim()
        : target.id;
    title.textContent = capitalizeTitle(rawTitle);
    head.appendChild(title);

    var cta = document.createElement("span");
    cta.className = "dash-chairman-overview-card-cta";
    cta.setAttribute("aria-hidden", "true");
    cta.textContent = "Раскрыть";
    head.appendChild(cta);

    return head;
  }

  function buildCardBody(entry) {
    var body = document.createElement("div");
    body.className = "dash-chairman-overview-card-body";

    if (entry && entry.loading) {
      var loading = document.createElement("p");
      loading.className = "dash-chairman-overview-loading";
      var spinner = document.createElement("span");
      spinner.className = "dash-chairman-overview-skeleton-dot";
      loading.appendChild(spinner);
      var loadText = document.createElement("span");
      loadText.textContent = "Загрузка плиток…";
      loading.appendChild(loadText);
      body.appendChild(loading);
      return body;
    }

    if (entry && entry.error) {
      var err = document.createElement("p");
      err.className = "dash-chairman-overview-empty";
      err.textContent = entry.error === "unauthorized"
        ? "Требуется повторный вход"
        : "Не удалось загрузить данные.";
      body.appendChild(err);
      return body;
    }

    var tiles = entry && Array.isArray(entry.tiles) ? entry.tiles : [];
    if (!tiles.length) {
      var empty = document.createElement("p");
      empty.className = "dash-chairman-overview-empty";
      empty.textContent = "Нет данных за выбранный период.";
      body.appendChild(empty);
      return body;
    }

    var list = document.createElement("ul");
    list.className = "dash-chairman-overview-tiles";
    tiles.slice(0, 14).forEach(function (tile) {
      list.appendChild(makeTileElement(tile));
    });
    body.appendChild(list);
    return body;
  }

  function buildCard(target) {
    var catalogId = target.catalogId || target.id || "";
    var entry = state.cache[cacheKeyFor(catalogId)] || {};

    var card = document.createElement("article");
    card.className = "dash-chairman-overview-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("data-catalog-id", catalogId);
    card.setAttribute("data-target-id", target.id || "");

    var titleText =
      target.label && String(target.label).trim()
        ? String(target.label).trim()
        : target.department && String(target.department).trim()
          ? String(target.department).trim()
          : target.id;
    card.setAttribute("aria-label", "Раскрыть дашборд: " + capitalizeTitle(titleText));

    card.appendChild(buildCardHead(target));
    card.appendChild(buildCardBody(entry));

    function activate() {
      expandTarget(target);
    }

    card.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest(".dash-chairman-overview-tile")) {
        activate();
        return;
      }
      activate();
    });
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });

    return card;
  }

  function render() {
    if (!ensureDom()) return;
    var targets = getTargets();
    overviewEl.innerHTML = "";
    if (!targets.length) return;
    targets.forEach(function (target) {
      overviewEl.appendChild(buildCard(target));
    });
  }

  function fetchTilesFor(catalogId) {
    var fetcher = ctx && ctx.fetchOverviewTiles;
    if (typeof fetcher !== "function") {
      return Promise.resolve({ ok: false, tiles: [] });
    }
    try {
      var p = fetcher(catalogId);
      return p && typeof p.then === "function" ? p : Promise.resolve(p);
    } catch (e) {
      return Promise.resolve({ ok: false, tiles: [] });
    }
  }

  function loadTargetTiles(target, seq) {
    var catalogId = target.catalogId || target.id || "";
    var key = cacheKeyFor(catalogId);
    var cached = state.cache[key];
    if (cached && !cached.loading && Array.isArray(cached.tiles)) {
      return Promise.resolve();
    }
    state.cache[key] = { loading: true };
    render();
    return fetchTilesFor(catalogId).then(function (result) {
      if (seq !== state.requestSeq) return;
      if (!result) {
        state.cache[key] = { loading: false, tiles: [], error: "error" };
      } else if (result.unauthorized) {
        state.cache[key] = { loading: false, tiles: [], error: "unauthorized" };
      } else if (result.ok === false) {
        state.cache[key] = { loading: false, tiles: [], error: "error" };
      } else {
        state.cache[key] = {
          loading: false,
          tiles: Array.isArray(result.tiles) ? result.tiles : [],
        };
      }
      render();
    }).catch(function () {
      if (seq !== state.requestSeq) return;
      state.cache[key] = { loading: false, tiles: [], error: "error" };
      render();
    });
  }

  function loadAll() {
    var targets = getTargets();
    if (!targets.length) return Promise.resolve();
    var seq = ++state.requestSeq;
    return Promise.all(targets.map(function (t) { return loadTargetTiles(t, seq); }));
  }

  function show() {
    if (!ensureDom()) return;
    bindBackButton();
    state.expandedCatalogId = null;
    overviewEl.hidden = false;
    if (dashContentEl) dashContentEl.hidden = true;
    if (monthNavEl) monthNavEl.hidden = true;
    if (chairmanTabsEl) chairmanTabsEl.hidden = true;
    if (overviewBarEl) overviewBarEl.hidden = true;
    if (dashLoadingEl) dashLoadingEl.hidden = true;
    render();
    loadAll();
  }

  function hide() {
    if (!ensureDom()) return;
    overviewEl.hidden = true;
  }

  function setExpandedBar(target) {
    if (!overviewBarEl) return;
    overviewBarEl.hidden = false;
    if (overviewBarTitleEl) {
      var t =
        target && (target.label && String(target.label).trim()
          ? String(target.label).trim()
          : target.department || target.id || "");
      overviewBarTitleEl.textContent = t ? "Раскрыт раздел: " + capitalizeTitle(t) : "";
    }
  }

  function hideExpandedBar() {
    if (!overviewBarEl) return;
    overviewBarEl.hidden = true;
    if (overviewBarTitleEl) overviewBarTitleEl.textContent = "";
  }

  function expandTarget(target) {
    if (!target) return;
    state.expandedCatalogId = target.catalogId || target.id || "";
    if (overviewEl) overviewEl.hidden = true;
    setExpandedBar(target);
    call("onExpand", [target]);
  }

  function backToOverview() {
    show();
    hideExpandedBar();
    call("onBackToOverview", []);
  }

  function invalidate() {
    state.cache = Object.create(null);
  }

  function reload() {
    invalidate();
    if (overviewEl && !overviewEl.hidden) {
      render();
      loadAll();
    }
  }

  function showIfNeeded() {
    if (!shouldShowOverview()) {
      hide();
      hideExpandedBar();
      return false;
    }
    show();
    return true;
  }

  function isVisible() {
    return !!(overviewEl && !overviewEl.hidden);
  }

  function isExpanded() {
    return !!state.expandedCatalogId;
  }

  function getExpandedCatalogId() {
    return state.expandedCatalogId || "";
  }

  function init(options) {
    mergeContext(options);
    ensureDom();
    bindBackButton();
  }

  global.DashboardChairmanOverview = {
    init: init,
    show: show,
    hide: hide,
    showIfNeeded: showIfNeeded,
    isVisible: isVisible,
    isExpanded: isExpanded,
    getExpandedCatalogId: getExpandedCatalogId,
    backToOverview: backToOverview,
    reload: reload,
    invalidate: invalidate,
  };
})(typeof window !== "undefined" ? window : globalThis);
