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
      tabindex: "0",
      role: "link",
      "aria-label": `View details for ${product.name}`,
    });

    // Whole card is clickable -> product detail page. Inner interactive
    // controls (size picker, Add to Bucket) call stopPropagation() so
    // tapping them doesn't also navigate away.
    const goToDetail = () => {
      window.location.href = `product.html?id=${product.id}`;
    };
    wrap.addEventListener("click", goToDetail);
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goToDetail();
      }
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
        b.addEventListener("click", (e) => {
          e.stopPropagation(); // don't navigate to the detail page when just picking a size
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
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // don't navigate to the detail page when adding to the bucket
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

  async function initProductPage() {
    const root = document.getElementById("product-detail-root");
    const loading = document.getElementById("product-detail-loading");
    const notFound = document.getElementById("product-detail-notfound");

    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      loading.hidden = true;
      notFound.hidden = false;
      return;
    }

    const { data: product, error } = await LCP_DB.catalog.getProduct(id);
    loading.hidden = true;
    if (error || !product) {
      notFound.hidden = false;
      return;
    }

    document.title = `${product.name} — Little Chef Pizza`;

    const hasSizes = !!product.sizes;
    const sizeKeys = hasSizes ? Object.keys(product.sizes) : null;
    let selectedSize = hasSizes ? sizeKeys[0] : null;
    let qty = 1;

    root.hidden = false;
    root.innerHTML = `
      <a href="menu.html" class="muted" style="display:inline-block; margin-bottom:16px;">← Back to Menu</a>
      <div class="product-detail">
        <div class="product-detail__img" id="pd-img"></div>
        <div class="product-detail__info">
          <span class="badge badge--muted">${LCP_NAV.escapeHtml(product.categories?.name || "")}</span>
          <h1>${LCP_NAV.escapeHtml(product.name)}</h1>
          <p>${LCP_NAV.escapeHtml(product.description || "")}</p>
          ${!product.available ? '<div class="notice-box">This item is currently unavailable.</div>' : ""}
          <div id="pd-sizes"></div>
          <div class="row gap-16" style="align-items:center; margin:18px 0;">
            <span class="price" id="pd-price" style="font-size:24px;"></span>
            <div class="qty-stepper" id="pd-qty-stepper">
              <button type="button" id="pd-qty-minus">−</button>
              <span id="pd-qty-value">1</span>
              <button type="button" id="pd-qty-plus">+</button>
            </div>
          </div>
          <button class="btn btn--primary btn--block" id="pd-add-btn" ${!product.available ? "disabled" : ""}>
            ${product.available ? "Add to Bucket" : "Currently Unavailable"}
          </button>
        </div>
      </div>
    `;

    // Image (large) — same real-photo-or-placeholder logic as the grid card.
    const imgHost = document.getElementById("pd-img");
    if (product.image_url) {
      imgHost.appendChild(
        LCP_UTIL.el("img", { src: product.image_url, alt: product.name }),
      );
    } else {
      imgHost.appendChild(LCP_UTIL.el("span", {}, product.name));
    }

    const priceEl = document.getElementById("pd-price");
    function updatePrice() {
      priceEl.textContent = LCP_UTIL.pkr(
        hasSizes ? product.sizes[selectedSize] : product.price,
      );
    }
    updatePrice();

    if (hasSizes) {
      const sizeHost = document.getElementById("pd-sizes");
      const row = LCP_UTIL.el("div", {
        class: "size-picker",
        style: "margin:14px 0;",
      });
      sizeKeys.forEach((sz, i) => {
        const b = LCP_UTIL.el(
          "button",
          { type: "button", class: i === 0 ? "active" : "" },
          `${sz} · ${LCP_UTIL.pkr(product.sizes[sz])}`,
        );
        b.addEventListener("click", () => {
          selectedSize = sz;
          LCP_UTIL.qsa("button", row).forEach((x) =>
            x.classList.remove("active"),
          );
          b.classList.add("active");
          updatePrice();
        });
        row.appendChild(b);
      });
      sizeHost.appendChild(row);
    }

    const qtyValueEl = document.getElementById("pd-qty-value");
    document.getElementById("pd-qty-minus").addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      qtyValueEl.textContent = qty;
    });
    document.getElementById("pd-qty-plus").addEventListener("click", () => {
      qty = Math.min(50, qty + 1);
      qtyValueEl.textContent = qty;
    });

    document.getElementById("pd-add-btn").addEventListener("click", (e) => {
      LCP_CART.addProduct(product, selectedSize, qty);
      LCP_UTIL.toast(`${product.name} added to your bucket.`, "success");
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.textContent = "Added ✓";
      setTimeout(() => {
        btn.textContent = original;
      }, 900);
    });
  }

  return {
    productCard,
    dealCard,
    initMenuPage,
    initDealsPage,
    renderFeatured,
    initProductPage,
  };
})();
