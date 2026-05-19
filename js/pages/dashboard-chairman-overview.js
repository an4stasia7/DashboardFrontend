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
  var commercialSummaryEl = null;
  var commercialSummaryScrollBound = false;

  /** Сколько карточек дашбордов показывать на одном «экране» (ряд в сетке). */
  var CHAIRMAN_OVERVIEW_CARDS_PER_PAGE = 2;
  /** Иконки коммерческого блока лежат в DashboardFrontend/temp/comblock. */
  var COMMERCIAL_ICON_BASE_PATH = "/temp/comblock";
  var COMMERCIAL_ICON_FOLDERS_BY_INDEX = ["otgruzki", "dogovorplan", "plandeneg", "otntoshenie"];

  var state = {
    expandedCatalogId: null,
    cache: Object.create(null),
    /** Страница среди карточек каталога (не строк KPI внутри карточки) */
    cardPageIndex: 0,
    requestSeq: 0,
    commercialRequestSeq: 0,
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

  function getSelectedViewId() {
    return call("getSelectedViewId", [], "self");
  }

  function shouldShowChairmanLanding() {
    var user = getSessionUser();
    if (!isBoardChairUser(user)) return false;
    if (!isRootHierarchy()) return false;
    return getSelectedViewId() === "self";
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
    ensureCommercialSummaryElement();
    return !!overviewEl;
  }

  function ensureCommercialSummaryElement() {
    if (commercialSummaryEl && document.body.contains(commercialSummaryEl)) return commercialSummaryEl;
    var anchor = document.querySelector(".dash-kpi-tiles-block");
    if (!anchor || !anchor.parentNode) return null;
    commercialSummaryEl = document.createElement("section");
    commercialSummaryEl.id = "dash-chairman-commercial-summary";
    commercialSummaryEl.className = "dash-chairman-commercial-summary";
    commercialSummaryEl.setAttribute("aria-label", "Коммерческий блок");
    commercialSummaryEl.hidden = true;
    anchor.parentNode.insertBefore(commercialSummaryEl, anchor);
    bindCommercialSummaryScroll();
    return commercialSummaryEl;
  }

  function bindCommercialSummaryScroll() {
    if (commercialSummaryScrollBound) return;
    commercialSummaryScrollBound = true;
    var update = function () {
      if (!commercialSummaryEl || commercialSummaryEl.hidden) return;
      var main = document.querySelector(".dash-main");
      var content = document.getElementById("dash-content");
      var workspace = document.querySelector(".dash-workspace");
      var scrollTop = Math.max(
        window.pageYOffset || document.documentElement.scrollTop || 0,
        main && main.scrollTop ? main.scrollTop : 0,
        content && content.scrollTop ? content.scrollTop : 0,
        workspace && workspace.scrollTop ? workspace.scrollTop : 0
      );
      commercialSummaryEl.classList.toggle("is-collapsed", scrollTop > 90);
    };
    window.addEventListener("scroll", update, { passive: true });
    ["dash-main", "dash-content", "dash-workspace"].forEach(function (className) {
      var el = className === "dash-content" ? document.getElementById(className) : document.querySelector("." + className);
      if (el) el.addEventListener("scroll", update, { passive: true });
    });
  }

  /** Убирает «липкий» футер (margin-top: auto), иначе между карточками и «Для разработчика» — пустая полоса на всю высоту экрана. */
  function setWorkspaceChairmanOverviewMode(on) {
    var ws = document.querySelector(".dash-workspace");
    if (!ws) return;
    if (on) ws.classList.add("dash-workspace--chairman-overview");
    else ws.classList.remove("dash-workspace--chairman-overview");
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
    var mode = period && period.aggregationMode != null ? String(period.aggregationMode).trim() : "";
    var quarters = period && Array.isArray(period.selectedQuarters)
      ? period.selectedQuarters
          .slice()
          .map(function (v) {
            return parseInt(String(v), 10);
          })
          .filter(function (q) {
            return !isNaN(q) && q >= 1 && q <= 4;
          })
          .sort(function (a, b) {
            return a - b;
          })
          .join(",")
      : "";
    return String(catalogId || "") + "\0" + y + "-" + m + "|" + (mode || "current") + "|" + quarters;
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

  function getKpiTileException(tile) {
    var cfg = global.KPI_TILE_EXCEPTIONS || null;
    if (!cfg || !tile) return null;
    var key = tile.kpi_id != null && String(tile.kpi_id).trim()
      ? String(tile.kpi_id).trim()
      : tile.badge != null && String(tile.badge).trim()
        ? String(tile.badge).trim()
        : "";
    return key && cfg[key] ? cfg[key] : null;
  }

  function planFactValuePresent(value) {
    if (global.DashUi && typeof global.DashUi.kpiTilePlanFactValuePresent === "function") {
      return global.DashUi.kpiTilePlanFactValuePresent(value);
    }
    if (value === undefined || value === null) return false;
    if (typeof value === "number") return !isNaN(value);
    if (typeof value === "string") return String(value).trim() !== "";
    return true;
  }

  function formatPlanFactPair(plan, fact, units) {
    if (global.DashUi && typeof global.DashUi.formatKpiTilePlanFactPair === "function") {
      return global.DashUi.formatKpiTilePlanFactPair(plan, fact, units);
    }
    return formatNumberRu(plan, 1) + "/" + formatNumberRu(fact, 1) + (units ? " " + units : "");
  }

  function formatFactWithUnits(fact, units) {
    if (global.DashUi && typeof global.DashUi.formatKpiTileFactValueWithUnits === "function") {
      return global.DashUi.formatKpiTileFactValueWithUnits(fact, units);
    }
    return formatNumberRu(fact, 1) + (units ? " " + units : "");
  }

  function formatPercentLabel(value) {
    if (global.MockData && typeof global.MockData.formatKpiPercentLabel === "function") {
      return global.MockData.formatKpiPercentLabel(value) + "%";
    }
    return formatNumberRu(value, 1) + "%";
  }

  function readNumber(tile, key) {
    if (!tile || tile[key] == null || tile[key] === "") return 0;
    var n = Number(tile[key]);
    return isFinite(n) && !isNaN(n) ? n : 0;
  }

  function ratioPercent(numerator, denominator) {
    var num = Number(numerator);
    var den = Number(denominator);
    if (!isFinite(num) || isNaN(num) || !isFinite(den) || isNaN(den) || den <= 0) return null;
    return (num / den) * 100;
  }

  function formatDualRatioOverviewValue(tile) {
    var dzClient = readNumber(tile, "dz_client");
    var kzClient = readNumber(tile, "kz_client");
    var dzSupplier = readNumber(tile, "dz_supplier");
    var kzSupplier = readNumber(tile, "kz_supplier");
    var dzTotal = readNumber(tile, "dz_total");
    var kzTotal = readNumber(tile, "kz_total");
    if (!dzTotal && !kzTotal) {
      dzTotal = dzClient + dzSupplier;
      kzTotal = kzClient + kzSupplier;
    }
    var pctTotal =
      tile && tile.pct_total != null && !isNaN(Number(tile.pct_total))
        ? Number(tile.pct_total)
        : ratioPercent(dzTotal, kzTotal);
    var pctClient =
      tile && tile.pct_client != null && !isNaN(Number(tile.pct_client))
        ? Number(tile.pct_client)
        : ratioPercent(dzClient, kzClient);
    var pctSupplier =
      tile && tile.pct_supplier != null && !isNaN(Number(tile.pct_supplier))
        ? Number(tile.pct_supplier)
        : ratioPercent(dzSupplier, kzSupplier);
    return [pctTotal, pctClient, pctSupplier]
      .map(formatPercentLabel)
      .join(" / ");
  }

  function formatTenderStatusOverviewValue(tile) {
    var found = Math.round(readNumber(tile, "found") || readNumber(tile, "plan"));
    var notParticipating = Math.round(readNumber(tile, "not_participating"));
    var won = Math.round(readNumber(tile, "won") || readNumber(tile, "fact"));
    return found + " / " + notParticipating + " / " + won + " шт.";
  }

  function normalizeRag(tile) {
    var pres =
      global.MockData && typeof global.MockData.getKpiTilePresentation === "function"
        ? global.MockData.getKpiTilePresentation(tile)
        : null;
    var rag = pres && pres.rag ? String(pres.rag).toLowerCase() : tile && tile.rag ? String(tile.rag).toLowerCase() : "";
    if (!rag && tile && tile.color) rag = String(tile.color).toLowerCase();
    if (rag === "amber") rag = "yellow";
    if (rag === "grey") rag = "gray";
    if (rag !== "green" && rag !== "yellow" && rag !== "red" && rag !== "blue" && rag !== "gray") {
      rag = "gray";
    }
    return rag;
  }

  function titleEqualsKpiId(text, kpiId) {
    if (text == null || text === "" || kpiId == null || kpiId === "") return false;
    return String(text).trim().toLowerCase() === String(kpiId).trim().toLowerCase();
  }

  /** Заголовок строки в обзоре: без подстановки kpi_id (в т.ч. когда API кладёт id в title). */
  function tileDisplayTitle(tile) {
    if (!tile || typeof tile !== "object") return "—";
    var kid = tile.kpi_id != null ? String(tile.kpi_id).trim() : "";
    var t = tile.title != null ? String(tile.title).trim() : "";
    if (titleEqualsKpiId(t, kid)) t = "";
    var n = tile.name != null ? String(tile.name).trim() : "";
    if (titleEqualsKpiId(n, kid)) n = "";
    if (t) return t;
    if (n) return n;
    return "—";
  }

  function formatTileValue(tile) {
    if (!tile) return "—";
    var rule = getKpiTileException(tile);
    var unit = tile.units != null ? String(tile.units).trim() : "";
    if (rule && rule.dualRatioOverview) return formatDualRatioOverviewValue(tile);
    if (rule && rule.tenderStatusOverview) return formatTenderStatusOverviewValue(tile);

    var hasPlan = planFactValuePresent(tile.plan);
    var hasFact = planFactValuePresent(tile.fact);
    if (hasPlan && hasFact && !(rule && rule.kpiPctOnly)) {
      return formatPlanFactPair(tile.plan, tile.fact, unit);
    }
    if (rule && rule.allowPartialPlanFact && (hasPlan || hasFact) && !(rule && rule.kpiPctOnly)) {
      return formatPlanFactPair(tile.plan, tile.fact, unit);
    }
    if ((rule && rule.factOnly) && hasFact) return formatFactWithUnits(tile.fact, unit);

    var pct = tile.kpi_pct != null ? tile.kpi_pct : tile.kpi_pst != null ? tile.kpi_pst : tile.percent;
    if (pct != null && !isNaN(Number(pct))) {
      return formatPercentLabel(Number(pct));
    }
    if (hasFact) {
      if (looksLikePercentUnit(unit)) return formatPercentLabel(tile.fact);
      return formatFactWithUnits(tile.fact, unit);
    }
    return "—";
  }

  function makeTileElement(tile) {
    var li = document.createElement("li");
    li.className = "dash-chairman-overview-tile";

    var dot = document.createElement("span");
    var pres =
      global.MockData && typeof global.MockData.getKpiTilePresentation === "function"
        ? global.MockData.getKpiTilePresentation(tile)
        : null;
    var rag = normalizeRag(tile);
    var fillColor = pres && pres.fillColor ? String(pres.fillColor).trim() : "";
    dot.className = "dash-chairman-overview-tile-dot" + (rag ? " rag-" + rag : "");
    if (fillColor) {
      dot.style.backgroundColor = fillColor;
      dot.style.boxShadow = "0 0 0 2px " + fillColor + "33";
    }
    li.appendChild(dot);

    var text = document.createElement("span");
    text.className = "dash-chairman-overview-tile-text";

    var name = document.createElement("span");
    name.className = "dash-chairman-overview-tile-name";
    var nameText = tileDisplayTitle(tile);
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

  function normalizeIconFolderPart(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-z0-9а-я]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function commercialIconFoldersForTile(tile, index) {
    var title = normalizeIconFolderPart(tileDisplayTitle(tile));
    var kpiId = normalizeIconFolderPart(tile && (tile.kpi_id || tile.badge || tile.id));
    var forcedByIndex = COMMERCIAL_ICON_FOLDERS_BY_INDEX[index] || "";
    var raw = [forcedByIndex, tile && tile.iconFolder, tile && tile.icon_folder, tile && tile.slug, kpiId, title]
      .map(normalizeIconFolderPart)
      .filter(Boolean);
    var text = title + " " + kpiId;
    var aliases = [];
    if (text.indexOf("отнош") !== -1 || text.indexOf("2026_2025") !== -1 || text.indexOf("2026/2025") !== -1) {
      aliases = aliases.concat(["otntoshenie"]);
    } else if (text.indexOf("день") !== -1 || text.indexOf("ден") !== -1 || text.indexOf("money") !== -1) {
      aliases = aliases.concat(["plandeneg"]);
    } else if (text.indexOf("договор") !== -1 || text.indexOf("contract") !== -1) {
      aliases = aliases.concat(["dogovorplan"]);
    } else if (text.indexOf("отгруз") !== -1 || text.indexOf("ship") !== -1) {
      aliases = aliases.concat(["otgruzki"]);
    }
    if (text.indexOf("отгруз") !== -1 || text.indexOf("ship") !== -1) {
      aliases = aliases.concat(["shipments", "shipment", "shipping", "otgruzka"]);
    } else if (text.indexOf("договор") !== -1 || text.indexOf("contract") !== -1) {
      aliases = aliases.concat(["contracts", "contract", "dogovory", "dogovor"]);
    } else if (text.indexOf("день") !== -1 || text.indexOf("ден") !== -1 || text.indexOf("money") !== -1) {
      aliases = aliases.concat(["money", "cash", "dengi"]);
    } else if (text.indexOf("кассов") !== -1 || text.indexOf("разрыв") !== -1 || text.indexOf("gap") !== -1) {
      aliases = aliases.concat(["cash_gap", "cashgap", "cash-gap", "kassovyi_razryv", "kassovy_razryv"]);
    }
    aliases.push("tile_" + (index + 1));
    return raw.concat(aliases).filter(function (value, i, arr) {
      return value && arr.indexOf(value) === i;
    });
  }

  function setImageCandidates(img, candidates, fallbackEl) {
    var list = Array.isArray(candidates) ? candidates.slice() : [];
    var idx = 0;
    var tryNext = function () {
      if (idx >= list.length) {
        img.hidden = true;
        if (fallbackEl) fallbackEl.hidden = false;
        return;
      }
      img.hidden = true;
      if (fallbackEl) fallbackEl.hidden = false;
      img.src = list[idx++];
    };
    img.addEventListener("load", function () {
      img.hidden = false;
      if (fallbackEl) fallbackEl.hidden = true;
    });
    img.addEventListener("error", tryNext);
    tryNext();
  }

  function makeCommercialSummaryTile(tile, index) {
    var item = document.createElement("article");
    var rag = normalizeRag(tile);
    item.className = "dash-chairman-commercial-tile rag-" + rag;

    var iconBox = document.createElement("span");
    iconBox.className = "dash-chairman-commercial-icon";
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    var fallback = document.createElement("span");
    fallback.className = "dash-chairman-commercial-icon-fallback";
    fallback.hidden = true;
    iconBox.appendChild(img);
    iconBox.appendChild(fallback);
    item.appendChild(iconBox);

    var body = document.createElement("span");
    body.className = "dash-chairman-commercial-tile-body";
    var name = document.createElement("span");
    name.className = "dash-chairman-commercial-tile-name";
    var title = tileDisplayTitle(tile);
    name.textContent = title;
    name.title = title;
    var value = document.createElement("span");
    value.className = "dash-chairman-commercial-tile-value";
    value.textContent = formatTileValue(tile);
    body.appendChild(name);
    body.appendChild(value);
    item.appendChild(body);

    var color = rag === "gray" ? "grey" : rag;
    var folders = commercialIconFoldersForTile(tile, index);
    var candidates = [];
    var colors = [color];
    ["red", "yellow", "green"].forEach(function (fallbackColor) {
      if (colors.indexOf(fallbackColor) === -1) colors.push(fallbackColor);
    });
    folders.forEach(function (folder) {
      colors.forEach(function (candidateColor) {
        ["png", "svg", "webp"].forEach(function (ext) {
          candidates.push(COMMERCIAL_ICON_BASE_PATH + "/" + folder + "/" + candidateColor + "." + ext);
        });
      });
    });
    setImageCandidates(img, candidates, fallback);
    return item;
  }

  function findCommercialTarget() {
    var targets = getTargets();
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t) continue;
      var cid = t.catalogId != null ? String(t.catalogId).trim().toLowerCase() : "";
      var id = t.id != null ? String(t.id).trim().toLowerCase() : "";
      var label = t.label != null ? String(t.label).trim().toLowerCase() : "";
      if (cid === "commerce" || id.indexOf("commerce") !== -1 || label.indexOf("коммер") !== -1) return t;
    }
    return null;
  }

  function commercialSummaryCacheKey(target) {
    var catalogId = target && (target.catalogId || target.id) ? String(target.catalogId || target.id) : "commerce";
    return "commercial-summary\0" + cacheKeyFor(catalogId);
  }

  function renderCommercialSummary(entry) {
    var root = ensureCommercialSummaryElement();
    if (!root) return;
    var commercialTarget = findCommercialTarget();
    if (!shouldShowChairmanLanding() || !commercialTarget) {
      root.hidden = true;
      root.innerHTML = "";
      root.classList.remove("is-collapsed");
      return;
    }
    root.hidden = false;
    root.innerHTML = "";

    var head = document.createElement("div");
    head.className = "dash-chairman-commercial-head";
    var titleWrap = document.createElement("div");
    titleWrap.className = "dash-chairman-commercial-title-wrap";
    var eyebrow = document.createElement("span");
    eyebrow.className = "dash-chairman-commercial-eyebrow";
    eyebrow.textContent = "Коммерческий блок";
    titleWrap.appendChild(eyebrow);
    head.appendChild(titleWrap);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dash-chairman-commercial-action";
    btn.textContent = "Перейти в коммерческий блок";
    btn.addEventListener("click", function () {
      expandTarget(commercialTarget);
    });
    head.appendChild(btn);
    root.appendChild(head);

    var tilesRoot = document.createElement("div");
    tilesRoot.className = "dash-chairman-commercial-tiles";
    if (entry && entry.loading) {
      for (var i = 0; i < 4; i++) {
        var skeleton = document.createElement("span");
        skeleton.className = "dash-chairman-commercial-tile dash-chairman-commercial-tile--loading";
        tilesRoot.appendChild(skeleton);
      }
    } else if (entry && entry.error) {
      var err = document.createElement("p");
      err.className = "dash-chairman-commercial-empty";
      err.textContent = "Не удалось загрузить коммерческий блок.";
      tilesRoot.appendChild(err);
    } else {
      var tiles = entry && Array.isArray(entry.tiles) ? entry.tiles.slice(0, 4) : [];
      if (!tiles.length) {
        var empty = document.createElement("p");
        empty.className = "dash-chairman-commercial-empty";
        empty.textContent = "Нет данных коммерческого блока.";
        tilesRoot.appendChild(empty);
      } else {
        tiles.forEach(function (tile, index) {
          tilesRoot.appendChild(makeCommercialSummaryTile(tile, index));
        });
      }
    }
    root.appendChild(tilesRoot);
  }

  function hideCommercialSummary() {
    var root = ensureCommercialSummaryElement();
    if (!root) return;
    root.hidden = true;
    root.innerHTML = "";
    root.classList.remove("is-collapsed");
  }

  function loadCommercialSummary() {
    var target = findCommercialTarget();
    if (!target || !shouldShowChairmanLanding()) {
      hideCommercialSummary();
      return Promise.resolve();
    }
    var key = commercialSummaryCacheKey(target);
    var cached = state.cache[key];
    if (cached && !cached.loading && Array.isArray(cached.tiles)) {
      renderCommercialSummary(cached);
      return Promise.resolve();
    }
    var seq = ++state.commercialRequestSeq;
    state.cache[key] = { loading: true };
    renderCommercialSummary(state.cache[key]);
    var catalogId = target.catalogId || target.id || "";
    return fetchTilesFor(catalogId)
      .then(function (result) {
        if (seq !== state.commercialRequestSeq) return;
        if (!result || result.unauthorized || result.ok === false) {
          state.cache[key] = { loading: false, tiles: [], error: "error" };
        } else {
          state.cache[key] = {
            loading: false,
            tiles: Array.isArray(result.tiles) ? result.tiles.slice(0, 4) : [],
          };
        }
        renderCommercialSummary(state.cache[key]);
      })
      .catch(function () {
        if (seq !== state.commercialRequestSeq) return;
        state.cache[key] = { loading: false, tiles: [], error: "error" };
        renderCommercialSummary(state.cache[key]);
      });
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
    tiles.forEach(function (tile) {
      list.appendChild(makeTileElement(tile));
    });

    var tilesWrap = document.createElement("div");
    tilesWrap.className = "dash-chairman-overview-tiles-wrap";
    tilesWrap.appendChild(list);
    body.appendChild(tilesWrap);
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

    var perPage = CHAIRMAN_OVERVIEW_CARDS_PER_PAGE;
    var totalPages = Math.max(1, Math.ceil(targets.length / perPage));
    var idx = state.cardPageIndex;
    if (idx < 0 || isNaN(idx)) idx = 0;
    if (idx > totalPages - 1) idx = totalPages - 1;
    state.cardPageIndex = idx;

    var start = idx * perPage;
    var visibleTargets = targets.slice(start, start + perPage);

    var layout = document.createElement("div");
    layout.className = "dash-chairman-overview-layout";

    var cardsRoot = document.createElement("div");
    cardsRoot.className = "dash-chairman-overview-cards";
    visibleTargets.forEach(function (target) {
      cardsRoot.appendChild(buildCard(target));
    });
    layout.appendChild(cardsRoot);

    if (targets.length > perPage) {
      var nav = document.createElement("nav");
      nav.className = "dash-chairman-overview-cards-pager";
      nav.setAttribute("aria-label", "Страницы карточек дашбордов");

      var prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "dash-chairman-overview-cards-pager-btn";
      prevBtn.setAttribute("aria-label", "Предыдущие карточки");
      prevBtn.disabled = idx <= 0;
      prevBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      var label = document.createElement("span");
      label.className = "dash-chairman-overview-cards-pager-label";
      label.textContent = idx + 1 + " / " + totalPages;

      var nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "dash-chairman-overview-cards-pager-btn";
      nextBtn.setAttribute("aria-label", "Следующие карточки");
      nextBtn.disabled = idx >= totalPages - 1;
      nextBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      prevBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (state.cardPageIndex <= 0) return;
        state.cardPageIndex--;
        render();
      });
      nextBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (state.cardPageIndex >= totalPages - 1) return;
        state.cardPageIndex++;
        render();
      });

      nav.appendChild(prevBtn);
      nav.appendChild(label);
      nav.appendChild(nextBtn);
      layout.appendChild(nav);
    }

    overviewEl.appendChild(layout);
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
    setWorkspaceChairmanOverviewMode(true);
    render();
    loadAll();
  }

  function hide() {
    if (!ensureDom()) return;
    overviewEl.hidden = true;
    setWorkspaceChairmanOverviewMode(false);
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
    hideCommercialSummary();
    setWorkspaceChairmanOverviewMode(false);
    setExpandedBar(target);
    call("onExpand", [target]);
  }

  function backToOverview() {
    if (overviewEl) overviewEl.hidden = true;
    setWorkspaceChairmanOverviewMode(false);
    hideExpandedBar();
    call("onBackToOverview", []);
    renderCommercialSummary({ loading: true });
    loadCommercialSummary();
  }

  function invalidate() {
    state.cache = Object.create(null);
    state.cardPageIndex = 0;
  }

  function reload() {
    invalidate();
    if (overviewEl && !overviewEl.hidden) {
      render();
      loadAll();
    }
    loadCommercialSummary();
  }

  function showIfNeeded() {
    if (!shouldShowOverview()) {
      hide();
      hideExpandedBar();
      hideCommercialSummary();
      return false;
    }
    if (!shouldShowChairmanLanding()) {
      hide();
      hideExpandedBar();
      hideCommercialSummary();
      return false;
    }
    /* На входе ПСД больше не показываем две обзорные карточки:
       оставляем обычный my_dashboard и добавляем компактный коммерческий блок сверху. */
    hide();
    hideExpandedBar();
    renderCommercialSummary({ loading: true });
    loadCommercialSummary();
    return false;
  }

  /**
   * При уходе ПСД с корня иерархии (дочерние отделы) — скрыть обзорные карточки и панель «К обзору».
   * Не вызывать show(): при раскрытом дашборде на корне он вернёт бы обзор.
   */
  function leaveOverviewIfNotAtRoot() {
    if (shouldShowOverview()) return;
    state.expandedCatalogId = null;
    hide();
    hideExpandedBar();
    hideCommercialSummary();
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
    leaveOverviewIfNotAtRoot: leaveOverviewIfNotAtRoot,
    isVisible: isVisible,
    isExpanded: isExpanded,
    getExpandedCatalogId: getExpandedCatalogId,
    backToOverview: backToOverview,
    reload: reload,
    reloadCommercialSummary: loadCommercialSummary,
    invalidate: invalidate,
  };
})(typeof window !== "undefined" ? window : globalThis);
