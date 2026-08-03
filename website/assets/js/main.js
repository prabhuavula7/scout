(function () {
  "use strict";

  // Theme toggle - same localStorage/prefers-color-scheme convention as the Scout web app.
  function initTheme() {
    var btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;

    function setIcon(theme) {
      btn.innerHTML =
        theme === "dark"
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
    }

    setIcon(document.documentElement.classList.contains("dark") ? "dark" : "light");

    btn.addEventListener("click", function () {
      var isDark = document.documentElement.classList.toggle("dark");
      window.localStorage.setItem("theme", isDark ? "dark" : "light");
      setIcon(isDark ? "dark" : "light");
    });
  }

  // Mobile nav
  function initMobileNav() {
    var toggle = document.querySelector("[data-menu-toggle]");
    var links = document.querySelector("[data-nav-links]");
    if (!toggle || !links) return;
    toggle.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
      });
    });
  }

  // Copy-to-clipboard for code blocks and the hero install command
  function initCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        navigator.clipboard.writeText(text).then(function () {
          var original = btn.innerHTML;
          btn.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5"/></svg>';
          setTimeout(function () {
            btn.innerHTML = original;
          }, 1400);
        });
      });
    });
  }

  // Before/after compare sliders (drag to reveal dark vs. light screenshots)
  function initCompareSliders() {
    document.querySelectorAll("[data-compare]").forEach(function (el) {
      var overlay = el.querySelector(".compare-overlay");
      var handle = el.querySelector(".compare-handle");
      var dragging = false;

      function setPos(pct) {
        pct = Math.max(0, Math.min(100, pct));
        overlay.style.clipPath = "inset(0 " + (100 - pct) + "% 0 0)";
        handle.style.left = pct + "%";
        el.setAttribute("aria-valuenow", Math.round(pct));
      }

      function pctFromClientX(clientX) {
        var rect = el.getBoundingClientRect();
        return ((clientX - rect.left) / rect.width) * 100;
      }

      el.addEventListener("dragstart", function (e) {
        e.preventDefault();
      });

      el.addEventListener("pointerdown", function (e) {
        dragging = true;
        e.preventDefault();
        setPos(pctFromClientX(e.clientX));
      });
      document.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        setPos(pctFromClientX(e.clientX));
      });
      document.addEventListener("pointerup", function () {
        dragging = false;
      });
      document.addEventListener("pointercancel", function () {
        dragging = false;
      });
      el.addEventListener("keydown", function (e) {
        var current = parseFloat(el.getAttribute("aria-valuenow")) || 50;
        if (e.key === "ArrowLeft") setPos(current - 5);
        if (e.key === "ArrowRight") setPos(current + 5);
      });

      setPos(50);
    });
  }

  // Scroll-reveal: fade/rise elements in as they enter the viewport
  function initScrollReveal() {
    var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    if (prefersReduced || !("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        el.classList.add("in-view");
      });
      return;
    }

    var groups = {};
    els.forEach(function (el) {
      var group = el.getAttribute("data-reveal-group") || "";
      groups[group] = groups[group] || 0;
      var index = groups[group]++;
      el.style.setProperty("--reveal-delay", Math.min(index * 0.08, 0.4) + "s");
    });

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            obs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );

    els.forEach(function (el) {
      observer.observe(el);
    });
  }

  // Fade in images once they've actually finished loading
  function initImageFade() {
    document.querySelectorAll("img[data-fade]").forEach(function (img) {
      if (img.complete) {
        img.classList.add("loaded");
        return;
      }
      img.addEventListener("load", function () {
        img.classList.add("loaded");
      });
    });
  }

  // Scroll-to-top button
  function initScrollTop() {
    var btn = document.querySelector("[data-scroll-top]");
    if (!btn) return;
    var ticking = false;

    function update() {
      btn.classList.toggle("visible", window.scrollY > 600);
      ticking = false;
    }

    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    });

    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    update();
  }

  // Docs page: highlight active sidebar link on scroll
  function initDocsScrollSpy() {
    var sections = document.querySelectorAll(".docs-section[id]");
    var links = document.querySelectorAll(".docs-sidebar a");
    if (!sections.length || !links.length) return;

    var byId = {};
    links.forEach(function (l) {
      byId[l.getAttribute("href").replace("#", "")] = l;
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            links.forEach(function (l) {
              l.classList.remove("active");
            });
            var active = byId[entry.target.id];
            if (active) active.classList.add("active");
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    sections.forEach(function (s) {
      observer.observe(s);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initMobileNav();
    initCopyButtons();
    initCompareSliders();
    initScrollReveal();
    initImageFade();
    initScrollTop();
    initDocsScrollSpy();
  });
})();
