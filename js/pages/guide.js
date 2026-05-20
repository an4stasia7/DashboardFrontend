(function () {
  var search = document.getElementById("guide-search");
  var sections = Array.prototype.slice.call(document.querySelectorAll(".guide-section"));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".guide-nav-section"));

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

  if (search) {
    search.addEventListener("input", applySearch);
  }
  window.addEventListener("scroll", setActiveNav, { passive: true });
  setActiveNav();
})();
