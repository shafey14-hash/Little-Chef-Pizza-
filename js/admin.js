/**
 * admin.js — logic for every page under /admin. Route guarding happens via
 * LCP_NAV.mountAdmin(), which redirects non-admins straight back to login.
 */
const LCP_ADMIN = (() => {
  function isToday(iso) {
    const d = new Date(iso),
      t = new Date();
    return d.toDateString() === t.toDateString();
  }

  /**
   * Builds a small "thumbnail + Upload + Remove" widget. Uploads go
   * straight into Supabase Storage (max 5MB, enforced in db.js), and the
   * resulting public URL is saved via `saveFn`. The old file is deleted
   * from Storage automatically when replaced or removed, so the bucket
   * doesn't accumulate orphaned images.
   *
   * entity: the product/deal object (mutated in place on success)
   * folder: "products" | "deals" — just keeps the Storage bucket tidy
   * saveFn: async (patch) => { data, error } — e.g. LCP_DB.catalog.updateProduct(id, patch)
   */
  function buildImageCell(entity, folder, saveFn) {
    const container = LCP_UTIL.el("div", { class: "img-cell" });
    const thumb = LCP_UTIL.el("img", {
      class: "img-cell__thumb",
      src: entity.image_url || "",
      alt: entity.name,
    });
    thumb.style.display = entity.image_url ? "block" : "none";
    const placeholder = LCP_UTIL.el(
      "span",
      { class: "img-cell__placeholder" },
      "No image",
    );
    placeholder.style.display = entity.image_url ? "none" : "flex";

    const fileInput = LCP_UTIL.el("input", { type: "file", accept: "image/*" });
    fileInput.hidden = true;
    const uploadBtn = LCP_UTIL.el(
      "button",
      { class: "btn btn--sm btn--ghost", type: "button" },
      entity.image_url ? "Change" : "Upload",
    );
    const removeBtn = LCP_UTIL.el(
      "button",
      { class: "btn btn--sm btn--danger", type: "button" },
      "Remove",
    );
    removeBtn.disabled = !entity.image_url;

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      if (file.size > 5 * 1024 * 1024)
        return LCP_UTIL.toast("Image must be 5MB or smaller.", "error");

      LCP_UTIL.setLoading(uploadBtn, true, "Uploading…");
      const { data, error } = await LCP_DB.storage.uploadImage(file, folder);
      if (error) {
        LCP_UTIL.toast(error, "error");
        LCP_UTIL.setLoading(uploadBtn, false);
        return;
      }

      const oldUrl = entity.image_url;
      const { error: saveErr } = await saveFn({ image_url: data.url });
      LCP_UTIL.setLoading(uploadBtn, false);
      if (saveErr) {
        LCP_UTIL.toast(saveErr, "error");
        await LCP_DB.storage.removeImage(data.path);
        return;
      }

      if (oldUrl) await LCP_DB.storage.removeImage(oldUrl); // clean up the file it's replacing
      entity.image_url = data.url;
      thumb.src = data.url;
      thumb.style.display = "block";
      placeholder.style.display = "none";
      uploadBtn.textContent = "Change";
      removeBtn.disabled = false;
      LCP_UTIL.toast("Image uploaded.", "success");
    });

    removeBtn.addEventListener("click", async () => {
      const ok = await LCP_UTIL.confirmDialog("Remove this image?", {
        confirmText: "Remove",
        danger: true,
      });
      if (!ok) return;
      LCP_UTIL.setLoading(removeBtn, true, "Removing…");
      await LCP_DB.storage.removeImage(entity.image_url);
      const { error } = await saveFn({ image_url: null });
      LCP_UTIL.setLoading(removeBtn, false);
      if (error) return LCP_UTIL.toast(error, "error");
      entity.image_url = null;
      thumb.style.display = "none";
      placeholder.style.display = "flex";
      uploadBtn.textContent = "Upload";
      removeBtn.disabled = true;
      LCP_UTIL.toast("Image removed.", "success");
    });

    container.append(thumb, placeholder, fileInput, uploadBtn, removeBtn);
    return container;
  }

  async function initDashboard() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `<div class="kpi-grid" id="kpi-grid"></div>
      <div style="display:grid; grid-template-columns:1.4fr 1fr; gap:22px;">
        <div class="card"><h3>Recent Orders</h3><div id="dash-recent"></div></div>
        <div class="card"><h3>Popular Products</h3><div id="dash-popular"></div></div>
      </div>`;

    const [{ data: orders }, { data: products }] = await Promise.all([
      LCP_DB.orders.listAll(),
      LCP_DB.catalog.listProducts(),
    ]);

    const todays = orders.filter((o) => isToday(o.created_at));
    const revenueToday = todays.reduce((s, o) => s + o.total, 0);
    const pending = orders.filter((o) => o.status === "pending");
    const delivered = orders.filter((o) => o.status === "delivered");
    const customers = new Set(
      orders.filter((o) => o.user_id).map((o) => o.user_id),
    ).size;

    const kpis = [
      ["Today's Orders", todays.length],
      ["Today's Revenue", LCP_UTIL.pkr(revenueToday)],
      ["Pending Orders", pending.length],
      ["Delivered Orders", delivered.length],
      ["Total Customers", customers],
    ];
    document.getElementById("kpi-grid").innerHTML = kpis
      .map(
        ([l, v]) =>
          `<div class="kpi-card"><div class="kpi-card__label">${l}</div><div class="kpi-card__value">${v}</div></div>`,
      )
      .join("");

    const recentHtml =
      orders
        .slice(0, 6)
        .map(
          (o) => `
      <div class="order-card" style="margin-bottom:10px;">
        <div class="order-card__top">
          <span class="order-card__num">${o.order_number}</span>
          <span class="badge ${o.status === "delivered" ? "badge--success" : "badge--warn"}">${o.status}</span>
        </div>
        <div class="muted">${LCP_UTIL.fmtDate(o.created_at)} · ${o.customer_name} · ${o.order_type}</div>
        <div class="summary-row" style="margin-top:6px;"><span></span><strong>${LCP_UTIL.pkr(o.total)}</strong></div>
      </div>`,
        )
        .join("") || `<p class="muted">No orders yet.</p>`;
    document.getElementById("dash-recent").innerHTML = recentHtml;

    const counts = {};
    orders.forEach((o) =>
      o.items.forEach((i) => {
        counts[i.product_name_snapshot] =
          (counts[i.product_name_snapshot] || 0) + i.quantity;
      }),
    );
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    document.getElementById("dash-popular").innerHTML = top.length
      ? top
          .map(
            ([name, qty]) =>
              `<div class="summary-row"><span>${LCP_NAV.escapeHtml(name)}</span><strong>${qty} sold</strong></div>`,
          )
          .join("")
      : `<p class="muted">No sales data yet.</p>`;
  }

  async function initOrders() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `
      <div class="admin-toolbar">
        <h2 style="margin:0;">Orders</h2>
        <div class="chip-row" style="margin:0;" id="order-filter-chips">
          <button class="chip active" data-filter="all">All</button>
          <button class="chip" data-filter="pending">Pending</button>
          <button class="chip" data-filter="delivered">Delivered</button>
        </div>
      </div>
      <div id="orders-table-wrap"></div>`;

    const { data: orders } = await LCP_DB.orders.listAll();
    let filter = "all";

    function render() {
      const rows = orders.filter(
        (o) => filter === "all" || o.status === filter,
      );
      const wrap = document.getElementById("orders-table-wrap");
      if (!rows.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🧾</div><h3>No orders</h3></div>`;
        return;
      }
      wrap.innerHTML = `<table class="admin-table">
        <thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Phone</th><th>Type</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            (o) => `
          <tr>
            <td><strong>${o.order_number}</strong></td>
            <td>${LCP_UTIL.fmtDate(o.created_at)}</td>
            <td>${LCP_NAV.escapeHtml(o.customer_name)} <span class="badge badge--muted">${o.customer_type}</span></td>
            <td>${o.customer_phone}</td>
            <td>${o.order_type}${o.delivery_area ? " · " + o.delivery_area : ""}</td>
            <td>${[...o.items, ...o.deals].map((l) => (l.product_name_snapshot || l.deal_name_snapshot) + " ×" + l.quantity).join(", ")}</td>
            <td><strong>${LCP_UTIL.pkr(o.total)}</strong></td>
            <td><span class="badge ${o.status === "delivered" ? "badge--success" : "badge--warn"}">${o.status}</span></td>
            <td>${o.status === "pending" ? `<button class="btn btn--sm btn--primary" data-mark="${o.id}">Mark as Delivered</button>` : ""}</td>
          </tr>`,
          )
          .join("")}</tbody></table>`;

      LCP_UTIL.qsa("[data-mark]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const ok = await LCP_UTIL.confirmDialog(
            "Mark this order as delivered?",
            { confirmText: "Mark Delivered" },
          );
          if (!ok) return;
          LCP_UTIL.setLoading(btn, true, "Updating…");
          const { data, error } = await LCP_DB.orders.markDelivered(
            btn.dataset.mark,
          );
          if (error) {
            LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");
            LCP_UTIL.setLoading(btn, false);
            return;
          }
          Object.assign(
            orders.find((o) => o.id === data.id),
            data,
          );
          LCP_UTIL.toast(
            `${data.order_number} marked as delivered.`,
            "success",
          );
          render();
        }),
      );
    }

    LCP_UTIL.qsa("#order-filter-chips .chip").forEach((c) =>
      c.addEventListener("click", () => {
        LCP_UTIL.qsa("#order-filter-chips .chip").forEach((x) =>
          x.classList.remove("active"),
        );
        c.classList.add("active");
        filter = c.dataset.filter;
        render();
      }),
    );
    render();
  }

  async function initProducts() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `<h2>Products &amp; Prices</h2><div id="products-table-wrap"></div>`;
    const [{ data: products }, { data: categories }] = await Promise.all([
      LCP_DB.catalog.listProducts(),
      LCP_DB.catalog.listCategories(),
    ]);
    const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    function priceCell(p) {
      if (p.sizes) {
        return Object.entries(p.sizes)
          .map(
            ([sz, price]) =>
              `<div class="price-edit"><span class="muted" style="width:40px;">${sz}</span>
           <input type="number" min="0" value="${price}" data-price-size="${sz}"></div>`,
          )
          .join("");
      }
      return `<div class="price-edit"><input type="number" min="0" value="${p.price}" data-price-flat="1"></div>`;
    }

    function row(p) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${p.name}</strong>${!p.verified ? ' <span class="badge badge--warn">Verify</span>' : ""}</td>
        <td>${catName[p.category_id] || ""}</td>
        <td>${priceCell(p)}</td>
        <td>
          <div class="availability-toggle">
            <button class="${p.available ? "active-available" : ""}" data-avail="true">Available</button>
            <button class="${!p.available ? "active-unavailable" : ""}" data-avail="false">Unavailable</button>
          </div>
        </td>
        <td data-image-cell></td>
        <td><button class="btn btn--sm btn--gold" data-save>Save Price</button></td>`;

      tr.querySelector("[data-image-cell]").appendChild(
        buildImageCell(p, "products", (patch) =>
          LCP_DB.catalog.updateProduct(p.id, patch),
        ),
      );

      tr.querySelectorAll("[data-avail]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const val = btn.dataset.avail === "true";
          await LCP_DB.catalog.updateProduct(p.id, { available: val });
          p.available = val;
          LCP_UTIL.toast(
            `${p.name} marked ${val ? "available" : "unavailable"}.`,
            "success",
          );
          renderAll();
        }),
      );
      tr.querySelector("[data-save]").addEventListener("click", async (e) => {
        let patch = {};
        if (p.sizes) {
          const sizes = {};
          tr.querySelectorAll("[data-price-size]").forEach(
            (inp) => (sizes[inp.dataset.priceSize] = Number(inp.value)),
          );
          patch.sizes = sizes;
        } else {
          patch.price = Number(tr.querySelector("[data-price-flat]").value);
        }
        LCP_UTIL.setLoading(e.target, true, "Saving…");
        await LCP_DB.catalog.updateProduct(p.id, patch);
        Object.assign(p, patch);
        LCP_UTIL.setLoading(e.target, false);
        LCP_UTIL.toast(`${p.name} price updated.`, "success");
      });
      return tr;
    }

    function renderAll() {
      const wrap = document.getElementById("products-table-wrap");
      wrap.innerHTML = `<table class="admin-table">
        <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Availability</th><th>Image</th><th></th></tr></thead>
        <tbody id="products-tbody"></tbody></table>`;
      const tbody = document.getElementById("products-tbody");
      products.forEach((p) => tbody.appendChild(row(p)));
    }
    renderAll();
  }

  async function initDeals() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `
      <div class="admin-toolbar"><h2 style="margin:0;">Deals</h2>
        <button class="btn btn--primary btn--sm" id="new-deal-btn">+ Create Deal</button></div>
      <div id="deals-admin-list" class="stack gap-16"></div>`;

    const { data: products } = await LCP_DB.catalog.listProducts();
    let { data: deals } = await LCP_DB.catalog.listDeals();

    function renderList() {
      const wrap = document.getElementById("deals-admin-list");
      wrap.innerHTML = "";
      deals.forEach((d) => {
        const card = LCP_UTIL.el("div", { class: "card" });
        card.innerHTML = `
          <div class="admin-toolbar" style="margin-bottom:8px;">
            <strong>${d.name}${!d.verified ? ' <span class="badge badge--warn">Verify</span>' : ""}</strong>
            <span class="badge ${d.available ? "badge--success" : "badge--muted"}">${d.available ? "Active" : "Deactivated"}</span>
          </div>
          <p class="muted">${LCP_NAV.escapeHtml(d.description)}</p>
          <div class="row gap-12" style="flex-wrap:wrap; align-items:center;">
            <div class="price-edit"><span>Rs.</span><input type="number" min="0" value="${d.price}" data-deal-price></div>
            <button class="btn btn--sm btn--gold" data-deal-save="${d.id}">Save Price</button>
            <button class="btn btn--sm btn--ghost" data-deal-toggle="${d.id}">${d.available ? "Deactivate" : "Activate"}</button>
          </div>
          <div data-deal-image-cell style="margin-top:12px;"></div>`;

        card
          .querySelector("[data-deal-image-cell]")
          .appendChild(
            buildImageCell(d, "deals", (patch) =>
              LCP_DB.catalog.updateDeal(d.id, patch),
            ),
          );

        card
          .querySelector("[data-deal-save]")
          .addEventListener("click", async (e) => {
            const price = Number(card.querySelector("[data-deal-price]").value);
            LCP_UTIL.setLoading(e.target, true, "Saving…");
            await LCP_DB.catalog.updateDeal(d.id, { price });
            d.price = price;
            LCP_UTIL.setLoading(e.target, false);
            LCP_UTIL.toast(`${d.name} price updated.`, "success");
          });
        card
          .querySelector("[data-deal-toggle]")
          .addEventListener("click", async () => {
            const { data } = await LCP_DB.catalog.updateDeal(d.id, {
              available: !d.available,
            });
            d.available = data.available;
            LCP_UTIL.toast(
              `${d.name} ${d.available ? "activated" : "deactivated"}.`,
              "success",
            );
            renderList();
          });
        wrap.appendChild(card);
      });
    }
    renderList();

    document
      .getElementById("new-deal-btn")
      .addEventListener("click", async () => {
        const name = prompt("Deal name (e.g. Deal 7):");
        if (!name) return;
        const description =
          prompt("Description (e.g. 1 Large Pizza + 1 Drink):") || "";
        const price = Number(prompt("Deal price (PKR):") || 0);
        if (!price)
          return LCP_UTIL.toast("Please enter a valid price.", "error");
        const { data } = await LCP_DB.catalog.createDeal({
          name,
          description,
          price,
          items: [],
        });
        deals.unshift(data);
        LCP_UTIL.toast(`${name} created.`, "success");
        renderList();
      });
  }

  async function initHistory() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `
      <h2>Order History</h2>
      <div class="admin-toolbar">
        <input type="text" id="history-search" placeholder="Search by order #, customer or phone…" style="height:44px; border-radius:10px; border:1.5px solid var(--line); padding:0 14px; min-width:280px;">
      </div>
      <div id="history-list"></div>`;
    const { data: orders } = await LCP_DB.orders.listAll();
    const delivered = orders.filter((o) => o.status === "delivered");

    function render(list) {
      const wrap = document.getElementById("history-list");
      if (!list.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🗂️</div><h3>No delivered orders yet</h3></div>`;
        return;
      }
      wrap.innerHTML = `<table class="admin-table">
        <thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Phone</th><th>Type</th><th>Total</th></tr></thead>
        <tbody>${list
          .map(
            (
              o,
            ) => `<tr><td><strong>${o.order_number}</strong></td><td>${LCP_UTIL.fmtDate(o.delivered_at || o.created_at)}</td>
          <td>${LCP_NAV.escapeHtml(o.customer_name)}</td><td>${o.customer_phone}</td><td>${o.order_type}</td><td>${LCP_UTIL.pkr(o.total)}</td></tr>`,
          )
          .join("")}</tbody></table>`;
    }
    render(delivered);
    document.getElementById("history-search").addEventListener(
      "input",
      LCP_UTIL.debounce((e) => {
        const q = e.target.value.trim().toLowerCase();
        render(
          delivered.filter(
            (o) =>
              !q ||
              o.order_number.toLowerCase().includes(q) ||
              o.customer_name.toLowerCase().includes(q) ||
              o.customer_phone.includes(q),
          ),
        );
      }, 200),
    );
  }

  return { initDashboard, initOrders, initProducts, initDeals, initHistory };
})();
