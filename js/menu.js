/**
 * menu.js — renders product/deal cards and drives the Menu & Deals pages.
 */
const LCP_MENU = (() => {
  function sizeLabel(size) {
    return size;
  }

  function productCard(product, categoryName) {
    const hasSizes = !!product.sizes;
    const sizeKeys = hasSizes ? Object.keys(product.sizes) : null;
    const wrap = LCP_UTIL.el("div", {
      class: "card card--hover product-card",
      "data-product-id": product.id,
    });

    // Renders the real photo once product.image_url is set (via admin panel or
    // directly in the database) — falls back to a plain text placeholder,
    // per the "// IMAGE PROMPT" comments in seed-data.js, until then.
    const imgChildren = product.image_url
      ? [
          LCP_UTIL.el("img", {
            src: product.image_url,
            alt: product.name,
            loading: "lazy",
          }),
        ]
      : [LCP_UTIL.el("span", {}, product.name)];
    const img = LCP_UTIL.el("div", { class: "product-card__img" }, [
      ...imgChildren,
      !product.available
        ? LCP_UTIL.el(
            "div",
            { class: "product-card__unavailable" },
            "Currently Unavailable",
          )
        : null,
    ]);
    wrap.appendChild(img);
    wrap.appendChild(LCP_UTIL.el("h3", {}, product.name));
    wrap.appendChild(
      LCP_UTIL.el("p", {}, product.description || categoryName || ""),
    );

    let selectedSize = hasSizes ? sizeKeys[0] : null;
    let sizeRow = null;
    if (hasSizes) {
      sizeRow = LCP_UTIL.el("div", { class: "size-picker" });
      sizeKeys.forEach((sz, i) => {
        const b = LCP_UTIL.el(
          "button",
          { type: "button", class: i === 0 ? "active" : "" },
          `${sz} · ${LCP_UTIL.pkr(product.sizes[sz])}`,
        );
        b.addEventListener("click", () => {
          selectedSize = sz;
          LCP_UTIL.qsa("button", sizeRow).forEach((x) =>
            x.classList.remove("active"),
          );
          b.classList.add("active");
          priceEl.textContent = LCP_UTIL.pkr(product.sizes[sz]);
        });
        sizeRow.appendChild(b);
      });
      wrap.appendChild(sizeRow);
    }

    const footer = LCP_UTIL.el("div", { class: "product-card__footer" });
    const priceEl = LCP_UTIL.el(
      "span",
      { class: "price" },
      LCP_UTIL.pkr(hasSizes ? product.sizes[selectedSize] : product.price),
    );
    const addBtn = LCP_UTIL.el(
      "button",
      { class: "btn btn--primary btn--sm" },
      "Add to Bucket",
    );
    if (!product.available) {
      addBtn.disabled = true;
      addBtn.textContent = "Unavailable";
    }
    addBtn.addEventListener("click", () => {
      LCP_CART.addProduct(product, selectedSize, 1);
      addBtn.textContent = "Added ✓";
      addBtn.classList.add("btn--gold");
      LCP_UTIL.toast(`${product.name} added to your bucket.`, "success");
      setTimeout(() => {
        addBtn.textContent = "Add to Bucket";
        addBtn.classList.remove("btn--gold");
      }, 900);
    });
    footer.appendChild(priceEl);
    footer.appendChild(addBtn);
    wrap.appendChild(footer);
    return wrap;
  }

  function dealCard(deal) {
    const wrap = LCP_UTIL.el("div", { class: "card card--hover deal-card" });
    const badge = deal.image_url
      ? LCP_UTIL.el("img", {
          src: deal.image_url,
          alt: deal.name,
          loading: "lazy",
          class: "deal-card__badge deal-card__badge--img",
        })
      : LCP_UTIL.el(
          "div",
          { class: "deal-card__badge" },
          deal.name.replace("Deal ", "#"),
        );
    wrap.appendChild(badge);
    const mid = LCP_UTIL.el("div", {}, [
      LCP_UTIL.el("h3", {}, deal.name),
      LCP_UTIL.el("p", {}, deal.description),
      !deal.verified
        ? LCP_UTIL.el(
            "span",
            { class: "badge badge--warn" },
            "Ask staff to confirm exact details",
          )
        : null,
    ]);
    wrap.appendChild(mid);
    const right = LCP_UTIL.el("div", {
      class: "stack",
      style: "align-items:flex-end;",
    });
    right.appendChild(
      LCP_UTIL.el(
        "span",
        { class: "price", style: "font-size:19px;" },
        LCP_UTIL.pkr(deal.price),
      ),
    );
    const btn = LCP_UTIL.el(
      "button",
      { class: "btn btn--gold btn--sm", style: "margin-top:8px;" },
      deal.available ? "Add Deal" : "Unavailable",
    );
    if (!deal.available) btn.disabled = true;
    btn.addEventListener("click", () => {
      LCP_CART.addDeal(deal, 1);
      LCP_UTIL.toast(`${deal.name} added to your bucket.`, "success");
    });
    right.appendChild(btn);
    wrap.appendChild(right);
    return wrap;
  }

  async function initMenuPage() {
    const grid = document.getElementById("menu-grid");
    const chipRow = document.getElementById("menu-categories");
    const searchInput = document.getElementById("menu-search");
    const emptyState = document.getElementById("menu-empty");

    await LCP_loadCatalogCache();
    const { products, categories } = LCP_CATALOG_CACHE;
    const catById = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    let activeCategory = "all";
    let query = "";

    function renderChips() {
      chipRow.innerHTML = "";
      const all = LCP_UTIL.el(
        "button",
        { class: "chip active", type: "button" },
        "All",
      );
      all.addEventListener("click", () => setCategory("all", all));
      chipRow.appendChild(all);
      categories.forEach((c) => {
        const hasProducts = products.some((p) => p.category_id === c.id);
        if (!hasProducts) return;
        const chip = LCP_UTIL.el(
          "button",
          { class: "chip", type: "button" },
          c.name,
        );
        chip.addEventListener("click", () => setCategory(c.id, chip));
        chipRow.appendChild(chip);
      });
    }
    function setCategory(id, btn) {
      activeCategory = id;
      LCP_UTIL.qsa(".chip", chipRow).forEach((c) =>
        c.classList.remove("active"),
      );
      btn.classList.add("active");
      renderGrid();
    }
    function renderGrid() {
      grid.innerHTML = "";
      const q = query.trim().toLowerCase();
      const filtered = products.filter((p) => {
        const catMatch =
          activeCategory === "all" || p.category_id === activeCategory;
        const qMatch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          (catById[p.category_id] || "").toLowerCase().includes(q);
        return catMatch && qMatch;
      });
      emptyState.hidden = filtered.length > 0;
      filtered.forEach((p) =>
        grid.appendChild(productCard(p, catById[p.category_id])),
      );
    }

    renderChips();
    renderGrid();
    searchInput.addEventListener(
      "input",
      LCP_UTIL.debounce((e) => {
        query = e.target.value;
        renderGrid();
      }, 200),
    );
  }

  async function initDealsPage() {
    const list = document.getElementById("deals-list");
    await LCP_loadCatalogCache();
    list.innerHTML = "";
    LCP_CATALOG_CACHE.deals.forEach((d) => list.appendChild(dealCard(d)));
  }

  async function renderFeatured(containerId, kind = "products", limit = 4) {
    const el = document.getElementById(containerId);
    if (!el) return;
    await LCP_loadCatalogCache();
    el.innerHTML = "";
    if (kind === "products") {
      LCP_CATALOG_CACHE.products
        .filter((p) => p.featured && p.available)
        .slice(0, limit)
        .forEach((p) => el.appendChild(productCard(p)));
    } else {
      LCP_CATALOG_CACHE.deals
        .filter((d) => d.featured && d.available)
        .slice(0, limit)
        .forEach((d) => el.appendChild(dealCard(d)));
    }
  }

  return { productCard, dealCard, initMenuPage, initDealsPage, renderFeatured };
})();
