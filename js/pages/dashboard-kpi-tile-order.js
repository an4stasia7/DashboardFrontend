(function (global) {
  var STORAGE_KEY = "dashboard_kpi_tile_order_v1";

  function normalizePart(value) {
    return value != null ? String(value).trim() : "";
  }

  function getTileId(tile) {
    if (!tile || typeof tile !== "object") return "";
    if (tile.kpi_id != null && String(tile.kpi_id).trim()) return String(tile.kpi_id).trim();
    if (tile.badge != null && String(tile.badge).trim()) return String(tile.badge).trim();
    if (tile.title != null && String(tile.title).trim()) return String(tile.title).trim();
    return "";
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store || {}));
      return true;
    } catch (e) {
      return false;
    }
  }

  function buildScopeKey(scope) {
    scope = scope || {};
    var nickname = normalizePart(scope.nickname);
    if (!nickname) return "";
    var viewId = normalizePart(scope.viewId) || "self";
    var department = normalizePart(scope.department);
    return nickname + "|" + viewId + (department ? "|" + department : "");
  }

  function loadOrder(scopeKey) {
    if (!scopeKey) return null;
    var store = readStore();
    var order = store[scopeKey];
    return Array.isArray(order) ? order.slice() : null;
  }

  function saveOrder(scopeKey, orderIds) {
    if (!scopeKey || !Array.isArray(orderIds)) return false;
    var store = readStore();
    store[scopeKey] = orderIds.slice();
    return writeStore(store);
  }

  function extractOrderIds(tiles) {
    if (!Array.isArray(tiles)) return [];
    return tiles
      .map(getTileId)
      .filter(function (id) {
        return !!id;
      });
  }

  function applySavedOrder(tiles, scopeKey) {
    if (!Array.isArray(tiles) || !tiles.length) return tiles || [];
    var saved = loadOrder(scopeKey);
    if (!saved || !saved.length) return tiles.slice();

    var byId = Object.create(null);
    tiles.forEach(function (tile) {
      var id = getTileId(tile);
      if (id && !byId[id]) byId[id] = tile;
    });

    var used = Object.create(null);
    var ordered = [];
    saved.forEach(function (id) {
      if (!id || used[id] || !byId[id]) return;
      ordered.push(byId[id]);
      used[id] = true;
    });
    tiles.forEach(function (tile) {
      var id = getTileId(tile);
      if (!id || used[id]) return;
      ordered.push(tile);
      used[id] = true;
    });
    return ordered.length ? ordered : tiles.slice();
  }

  function reorderArray(items, fromIndex, toIndex) {
    if (!Array.isArray(items) || fromIndex === toIndex) return items ? items.slice() : [];
    var from = Number(fromIndex);
    var to = Number(toIndex);
    if (isNaN(from) || isNaN(to) || from < 0 || to < 0 || from >= items.length || to >= items.length) {
      return items.slice();
    }
    var next = items.slice();
    var moved = next.splice(from, 1)[0];
    next.splice(to, 0, moved);
    return next;
  }

  function swapArray(items, indexA, indexB) {
    if (!Array.isArray(items) || indexA === indexB) return items ? items.slice() : [];
    var a = Number(indexA);
    var b = Number(indexB);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a >= items.length || b >= items.length) {
      return items.slice();
    }
    var next = items.slice();
    var tmp = next[a];
    next[a] = next[b];
    next[b] = tmp;
    return next;
  }

  global.DashboardKpiTileOrder = {
    buildScopeKey: buildScopeKey,
    getTileId: getTileId,
    loadOrder: loadOrder,
    saveOrder: saveOrder,
    extractOrderIds: extractOrderIds,
    applySavedOrder: applySavedOrder,
    reorderArray: reorderArray,
    swapArray: swapArray,
  };
})(typeof window !== "undefined" ? window : globalThis);
