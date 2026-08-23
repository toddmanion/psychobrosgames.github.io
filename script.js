(() => {
  "use strict";

  const root = document.documentElement;

  /* ------------------------------------------------------------- footer year */

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  /* ------------------------------------------------------------------ theme */

  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("psychobros-theme", next);
      } catch {
        /* private mode — theme just will not persist */
      }
    });
  }

  /* ------------------------------------------------------------ mobile menu */

  const menuToggle = document.querySelector("[data-menu-toggle]");
  const mobileNav = document.getElementById("mobile-nav");

  const setMenu = (open) => {
    if (!menuToggle || !mobileNav) return;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    mobileNav.classList.toggle("is-open", open);
    mobileNav.setAttribute("aria-hidden", String(!open));
    if (open) {
      mobileNav.removeAttribute("inert");
    } else {
      mobileNav.setAttribute("inert", "");
    }
  };

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener("click", () => {
      setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
    });

    mobileNav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        menuToggle.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 860) setMenu(false);
    });
  }

  /* ----------------------------------------------------------------- reveal */

  const revealables = document.querySelectorAll(".reveal");
  const showAll = () => revealables.forEach((node) => node.classList.add("is-in"));

  if (!("IntersectionObserver" in window) || revealables.length === 0) {
    showAll();
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    revealables.forEach((node) => observer.observe(node));

    // Safety net: nothing on this site is ever allowed to stay invisible.
    window.setTimeout(showAll, 2500);
  }

  /* --------------------------------------------------------- archive filter */

  const grid = document.querySelector("[data-grid]");
  if (grid) {
    const cards = Array.from(grid.querySelectorAll("[data-card]"));
    const search = document.querySelector("[data-search]");
    const chips = Array.from(document.querySelectorAll("[data-filter]"));
    const resultLine = document.querySelector("[data-result]");
    const empty = document.querySelector("[data-empty]");
    let activeGroup = "all";

    const apply = () => {
      const term = (search?.value || "").trim().toLowerCase();
      let visible = 0;

      cards.forEach((card) => {
        const tags = (card.dataset.tags || "").split("|");
        const matchesGroup = activeGroup === "all" || tags.includes(activeGroup);
        const haystack = `${card.dataset.title} ${card.dataset.studio} ${card.dataset.genre} ${card.dataset.year}`;
        const matchesTerm = !term || haystack.includes(term);
        const show = matchesGroup && matchesTerm;
        card.hidden = !show;
        if (show) visible += 1;
      });

      if (resultLine) {
        resultLine.textContent =
          visible === cards.length
            ? `Showing all ${cards.length} reviews`
            : `${visible} of ${cards.length} reviews`;
      }
      if (empty) empty.hidden = visible !== 0;
    };

    search?.addEventListener("input", apply);

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        activeGroup = chip.dataset.filter || "all";
        chips.forEach((other) => other.classList.toggle("is-active", other === chip));
        apply();
      });
    });

    apply();
  }
})();
