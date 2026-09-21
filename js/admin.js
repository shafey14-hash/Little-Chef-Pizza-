/**
 * admin.js — logic for every page under /admin. Route guarding happens via
 * LCP_NAV.mountAdmin(), which redirects non-admins straight back to login.
 */
const LCP_ADMIN = (() => {

  function isToday(iso) {
    const d = new Date(iso), t = new Date();
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
   * saveFn: async (patch) => { data, error } — e.g. LCP_DB.catalog.setMenuImage(id, patch.image_url)
   */
  function buildImageCell(entity, folder, saveFn) {
    const container = LCP_UTIL.el("div", { class: "img-cell" });
    const thumb = LCP_UTIL.el("img", { class: "img-cell__thumb", src: entity.image_url || "", alt: entity.name });
    thumb.style.display = entity.image_url ? "block" : "none";
    const placeholder = LCP_UTIL.el("span", { class: "img-cell__placeholder" }, "No image");
    placeholder.style.display = entity.image_url ? "none" : "flex";

    const fileInput = LCP_UTIL.el("input", { type: "file", accept: "image/*" });
    fileInput.hidden = true;
    const uploadBtn = LCP_UTIL.el("button", { class: "btn btn--sm btn--ghost", type: "button" }, entity.image_url ? "Change" : "Upload");
    const removeBtn = LCP_UTIL.el("button", { class: "btn btn--sm btn--danger", type: "button" }, "Remove");
    removeBtn.disabled = !entity.image_url;

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return LCP_UTIL.toast("Image must be 5MB or smaller.", "error");

      LCP_UTIL.setLoading(uploadBtn, true, "Uploading…");
      const { data, error } = await LCP_DB.storage.uploadImage(file, folder);
      if (error) { LCP_UTIL.toast(error, "error"); LCP_UTIL.setLoading(uploadBtn, false); return; }

      const oldUrl = entity.image_url;
      const { error: saveErr } = await saveFn({ image_url: data.url });
      LCP_UTIL.setLoading(uploadBtn, false);
      if (saveErr) { LCP_UTIL.toast(saveErr, "error"); await LCP_DB.storage.removeImage(data.path); return; }

      if (oldUrl) await LCP_DB.storage.removeImage(oldUrl); // clean up the file it's replacing
      entity.image_url = data.url;
      thumb.src = data.url; thumb.style.display = "block"; placeholder.style.display = "none";
      uploadBtn.textContent = "Change"; removeBtn.disabled = false;
      LCP_UTIL.toast("Image uploaded.", "success");
    });

    removeBtn.addEventListener("click", async () => {
      const ok = await LCP_UTIL.confirmDialog("Remove this image?", { confirmText: "Remove", danger: true });
      if (!ok) return;
      LCP_UTIL.setLoading(removeBtn, true, "Removing…");
      await LCP_DB.storage.removeImage(entity.image_url);
      const { error } = await saveFn({ image_url: null });
      LCP_UTIL.setLoading(removeBtn, false);
      if (error) return LCP_UTIL.toast(error, "error");
      entity.image_url = null;
      thumb.style.display = "none"; placeholder.style.display = "flex";
      uploadBtn.textContent = "Upload"; removeBtn.disabled = true;
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

    let knownOrderIds = null; // tracks which order ids we've already seen, so we can toast only for genuinely NEW orders

    async function loadAndRender() {
      const [{ data: orders, error: ordersErr }, { data: products, error: productsErr }] = await Promise.all([
        LCP_DB.orders.listAll(), LCP_DB.catalog.listProducts(),
      ]);
      if (ordersErr || productsErr) LCP_UTIL.toast("Some dashboard data couldn't be loaded. Please refresh.", "error");

      if (knownOrderIds) {
        const newOnes = orders.filter((o) => !knownOrderIds.has(o.id));
        newOnes.forEach((o) => LCP_UTIL.toast(`🔔 New order ${o.order_number} just came in!`, "info"));
      }
      knownOrderIds = new Set(orders.map((o) => o.id));

      const todays = orders.filter((o) => isToday(o.created_at));
      const revenueToday = todays.reduce((s, o) => s + o.total, 0);
      const awaitingPayment = orders.filter((o) => o.status === "payment_verification");
      const pending = orders.filter((o) => o.status === "pending");
      const outForDelivery = orders.filter((o) => o.status === "out_for_delivery");
      const delivered = orders.filter((o) => o.status === "delivered");
      const customers = new Set(orders.filter((o) => o.user_id).map((o) => o.user_id)).size;

      const kpis = [
        ["Today's Orders", todays.length],
        ["Today's Revenue", LCP_UTIL.pkr(revenueToday)],
        ["Awaiting Payment Verification", awaitingPayment.length],
        ["Pending Orders", pending.length],
        ["Out for Delivery", outForDelivery.length],
        ["Delivered Orders", delivered.length],
        ["Total Customers", customers],
      ];
      document.getElementById("kpi-grid").innerHTML = kpis.map(([l, v]) =>
        `<div class="kpi-card"><div class="kpi-card__label">${l}</div><div class="kpi-card__value">${v}</div></div>`).join("");

      const recentHtml = orders.slice(0, 6).map((o) => {
        const itemCount = [...o.items, ...o.deals].reduce((s, l) => s + l.quantity, 0);
        return `
        <div class="order-card order-card--${o.status}" style="margin-bottom:10px; padding:12px 14px;">
          <div class="order-card__top" style="margin-bottom:4px;">
            <span class="order-card__num">${o.order_number}</span>
            <span class="badge ${statusBadgeClass(o.status)}">${statusLabel(o.status, o.rejection_reason)}</span>
          </div>
          <div class="muted" style="font-size:12.5px;">${LCP_UTIL.timeAgo(o.created_at)} · ${LCP_NAV.escapeHtml(o.customer_name)} · ${o.order_type} · ${itemCount} item${itemCount === 1 ? "" : "s"}</div>
          <div class="summary-row" style="margin-top:6px;"><span></span><strong>${LCP_UTIL.pkr(o.total)}</strong></div>
        </div>`;
      }).join("") || `<p class="muted">No orders yet.</p>`;
      document.getElementById("dash-recent").innerHTML = recentHtml;

      const counts = {};
      orders.forEach((o) => o.items.forEach((i) => { counts[i.product_name_snapshot] = (counts[i.product_name_snapshot] || 0) + i.quantity; }));
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
      document.getElementById("dash-popular").innerHTML = top.length
        ? top.map(([name, qty]) => `<div class="summary-row"><span>${LCP_NAV.escapeHtml(name)}</span><strong>${qty} sold</strong></div>`).join("")
        : `<p class="muted">No sales data yet.</p>`;
    }

    await loadAndRender();

    // Live updates: new orders and status changes refresh the dashboard
    // automatically, no page reload needed.
    const unsubscribe = LCP_DB.orders.subscribeToChanges(loadAndRender);
    window.addEventListener("beforeunload", unsubscribe);
  }

  function statusLabel(s, rejectionReason) {
    if (s === "rejected") {
      return { cancelled: "Cancelled", failed_delivery: "Failed Delivery" }[rejectionReason] || "Rejected";
    }
    return { payment_verification: "Payment Verification", pending: "Pending", out_for_delivery: "Out for Delivery", delivered: "Delivered", rejected: "Rejected" }[s] || s;
  }
  function statusBadgeClass(s) {
    return { payment_verification: "badge--warn", pending: "badge--gold", out_for_delivery: "badge--warn", delivered: "badge--success", rejected: "badge--danger" }[s] || "badge--muted";
  }

  async function initOrders() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `
      <div class="admin-toolbar"><h2 style="margin:0;">Orders</h2></div>
      <input type="text" id="order-search" class="admin-search admin-orders-search" placeholder="Search by order #, customer name, or phone…" aria-label="Search all orders">
      <div class="chip-row" id="order-section-chips"></div>
      <div id="orders-section-wrap"></div>`;

    let orders = [];
    let knownOrderIds = null; // tracks which order ids we've already seen, so we can toast only for genuinely NEW orders
    let activeSection = "payment_verification";
    let searchTerm = "";

    async function loadOrders() {
      const { data, error: ordersErr } = await LCP_DB.orders.listAll();
      if (ordersErr) LCP_UTIL.toast("Unable to load orders: " + ordersErr, "error");
      orders = data;
      if (knownOrderIds) {
        const newOnes = orders.filter((o) => !knownOrderIds.has(o.id));
        newOnes.forEach((o) => LCP_UTIL.toast(`🔔 New order ${o.order_number} just came in!`, "info"));
      }
      knownOrderIds = new Set(orders.map((o) => o.id));
      renderChips();
      render();
    }

    const SECTIONS = [
      ["payment_verification", "Payment Verification"],
      ["pending", "Pending Orders"],
      ["out_for_delivery", "Out for Delivery"],
      ["delivered", "Delivered"],
      ["rejected", "Rejected Orders"],
    ];
    function renderChips() {
      const chipRow = document.getElementById("order-section-chips");
      chipRow.innerHTML = SECTIONS.map(([key, label]) => {
        const count = orders.filter((o) => o.status === key).length;
        return `<button class="chip ${!searchTerm && key === activeSection ? "active" : ""}" data-section="${key}">${label}${count ? ` <span class="chip__count">${count}</span>` : ""}</button>`;
      }).join("");
      LCP_UTIL.qsa("#order-section-chips .chip").forEach((c) => c.addEventListener("click", () => {
        activeSection = c.dataset.section;
        searchTerm = "";
        document.getElementById("order-search").value = "";
        renderChips();
        render();
      }));
    }

    document.getElementById("order-search").addEventListener("input", LCP_UTIL.debounce((e) => {
      searchTerm = e.target.value;
      renderChips(); // dims the active chip while a global search is in progress
      render();
    }, 200));

    function orderCard(o) {
      const lineItemsHtml = [...o.items, ...o.deals].map((l) =>
        `<li><span><span class="qty">${l.quantity}×</span>${LCP_NAV.escapeHtml(l.product_name_snapshot || l.deal_name_snapshot)}</span><span>${LCP_UTIL.pkr(l.line_total)}</span></li>`
      ).join("");
      const card = document.createElement("div");
      card.className = `order-card order-card--${o.status}`;
      card.innerHTML = `
        <div class="order-card__top">
          <span class="order-card__num">${o.order_number}</span>
          <span class="badge ${statusBadgeClass(o.status)}">${statusLabel(o.status, o.rejection_reason)}</span>
        </div>
        <div class="order-card__meta">
          <span>🕐 ${LCP_UTIL.timeAgo(o.created_at)}</span>
          <span class="dot">·</span>
          <span>${LCP_UTIL.fmtDate(o.created_at)}</span>
          <span class="dot">·</span>
          <span>${o.order_type.toUpperCase()}</span>
          ${o.delivery_address ? `<span class="dot">·</span><span>${LCP_NAV.escapeHtml(o.delivery_address)}</span>` : ""}
        </div>
        <div style="margin-bottom:10px;">
          <div><strong>${LCP_NAV.escapeHtml(o.customer_name)}</strong> <span class="badge badge--muted">${o.customer_type}</span></div>
          <div class="muted">📞 ${o.customer_phone}${o.alt_contact_phone ? " · Alt: " + LCP_NAV.escapeHtml(o.alt_contact_phone) : ""}${o.customer_email ? " · " + LCP_NAV.escapeHtml(o.customer_email) : ""}</div>
          ${o.special_instructions ? `<div class="muted">📝 ${LCP_NAV.escapeHtml(o.special_instructions)}</div>` : ""}
        </div>
        <ul class="order-card__line-items">${lineItemsHtml}</ul>
        <div class="summary-row"><span>Subtotal</span><span>${LCP_UTIL.pkr(o.subtotal)}</span></div>
        <div class="summary-row"><span>Delivery Charges</span><span>${o.delivery_charge ? LCP_UTIL.pkr(o.delivery_charge) : "—"}</span></div>
        <div class="summary-row summary-row--total"><span>Total</span><span>${LCP_UTIL.pkr(o.total)}</span></div>
        <div style="margin:8px 0;"><span class="badge badge--muted">${o.payment_method === "easypaisa" ? "EasyPaisa" : "Cash on Delivery"}</span></div>
        <div data-actions class="row gap-8" style="flex-wrap:wrap; margin-top:10px;"></div>`;

      const actionsHost = card.querySelector("[data-actions]");

      function screenshotButton(label = "View Screenshot") {
        const btn = document.createElement("button");
        btn.className = "btn btn--sm btn--ghost";
        btn.textContent = label;
        btn.addEventListener("click", async () => {
          LCP_UTIL.setLoading(btn, true, "Loading…");
          const { data: url, error } = await LCP_DB.orders.getScreenshotUrl(o.payment_screenshot_path);
          LCP_UTIL.setLoading(btn, false);
          if (error || !url) return LCP_UTIL.toast("Could not load screenshot.", "error");
          window.open(url, "_blank", "noopener");
        });
        return btn;
      }

      if (o.status === "payment_verification") {
        if (o.payment_screenshot_path) actionsHost.appendChild(screenshotButton());
        const approveBtn = document.createElement("button");
        approveBtn.className = "btn btn--sm btn--primary"; approveBtn.textContent = "Approve";
        approveBtn.addEventListener("click", async () => {
          const ok = await LCP_UTIL.confirmDialog("Approve this payment? The order will move to Pending Orders.", { confirmText: "Approve" });
          if (!ok) return;
          LCP_UTIL.setLoading(approveBtn, true, "Approving…");
          const { data, error } = await LCP_DB.orders.approvePayment(o.id);
          LCP_UTIL.setLoading(approveBtn, false);
          if (error) return LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");
          Object.assign(o, data);
          LCP_UTIL.toast(`${o.order_number} approved — moved to Pending Orders.`, "success");
          renderChips();
          render();
        });
        const rejectBtn = document.createElement("button");
        rejectBtn.className = "btn btn--sm btn--danger"; rejectBtn.textContent = "Reject";
        rejectBtn.addEventListener("click", async () => {
          const ok = await LCP_UTIL.confirmDialog("Reject this payment? The order will move to Rejected Orders.", { confirmText: "Reject", danger: true });
          if (!ok) return;
          LCP_UTIL.setLoading(rejectBtn, true, "Rejecting…");
          const { data, error } = await LCP_DB.orders.rejectPayment(o.id);
          LCP_UTIL.setLoading(rejectBtn, false);
          if (error) return LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");
          Object.assign(o, data);
          LCP_UTIL.toast(`${o.order_number} rejected.`, "success");
          renderChips();
          render();
        });
        actionsHost.append(approveBtn, rejectBtn);
      } else if (o.status === "pending") {
        const btn = document.createElement("button");
        btn.className = "btn btn--sm btn--primary"; btn.textContent = "Out for Delivery";
        btn.addEventListener("click", async () => {
          LCP_UTIL.setLoading(btn, true, "Updating…");
          const { data, error } = await LCP_DB.orders.markOutForDelivery(o.id);
          LCP_UTIL.setLoading(btn, false);
          if (error) return LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");
          Object.assign(o, data);
          LCP_UTIL.toast(`${o.order_number} is now out for delivery.`, "success");
          renderChips();
          render();
        });
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "btn btn--sm btn--danger"; cancelBtn.textContent = "Cancel Order";
        cancelBtn.addEventListener("click", async () => {
          const ok = await LCP_UTIL.confirmDialog("Cancel this order? It will move to Rejected Orders as Cancelled.", { confirmText: "Cancel Order", danger: true });
          if (!ok) return;
          LCP_UTIL.setLoading(cancelBtn, true, "Cancelling…");
          const { data, error } = await LCP_DB.orders.cancelOrder(o.id);
          LCP_UTIL.setLoading(cancelBtn, false);
          if (error) return LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");
          Object.assign(o, data);
          LCP_UTIL.toast(`${o.order_number} cancelled.`, "success");
          renderChips();
          render();
        });
        actionsHost.append(btn, cancelBtn);
      } else if (o.status === "out_for_delivery") {
        const btn = document.createElement("button");
        btn.className = "btn btn--sm btn--primary"; btn.textContent = "Marked as Delivered";
        btn.addEventListener("click", async () => {
          const ok = await LCP_UTIL.confirmDialog("Mark this order as delivered?", { confirmText: "Mark Delivered" });
          if (!ok) return;
          LCP_UTIL.setLoading(btn, true, "Updating…");
          const { data, error } = await LCP_DB.orders.markDelivered(o.id);
          LCP_UTIL.setLoading(btn, false);
          if (error) return LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");
          Object.assign(o, data);
          LCP_UTIL.toast(`${o.order_number} marked as delivered.`, "success");
          renderChips();
          render();
        });
        const failedBtn = document.createElement("button");
        failedBtn.className = "btn btn--sm btn--danger"; failedBtn.textContent = "Mark Failed Delivery";
        failedBtn.addEventListener("click", async () => {
          const ok = await LCP_UTIL.confirmDialog("Mark this delivery as failed? It will move to Rejected Orders as Failed Delivery.", { confirmText: "Mark Failed", danger: true });
          if (!ok) return;
          LCP_UTIL.setLoading(failedBtn, true, "Updating…");
          const { data, error } = await LCP_DB.orders.markFailedDelivery(o.id);
          LCP_UTIL.setLoading(failedBtn, false);
          if (error) return LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");
          Object.assign(o, data);
          LCP_UTIL.toast(`${o.order_number} marked as failed delivery.`, "success");
          renderChips();
          render();
        });
        actionsHost.append(btn, failedBtn);
      } else if (o.status === "rejected" && o.payment_screenshot_path) {
        actionsHost.appendChild(screenshotButton());
      }
      return card;
    }

    function render() {
      const wrap = document.getElementById("orders-section-wrap");
      wrap.innerHTML = "";

      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const results = orders.filter((o) =>
          o.order_number.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_phone.includes(q)
        );
        if (!results.length) {
          wrap.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔍</div><h3>No orders match "${LCP_NAV.escapeHtml(searchTerm)}"</h3><p>Searches order #, customer name, and phone — across every section.</p></div>`;
          return;
        }
        const note = document.createElement("p");
        note.className = "muted";
        note.style.marginBottom = "14px";
        note.textContent = `${results.length} result${results.length === 1 ? "" : "s"} across all sections for "${searchTerm}"`;
        wrap.appendChild(note);
        results.forEach((o) => wrap.appendChild(orderCard(o)));
        return;
      }

      const list = orders.filter((o) => o.status === activeSection);
      if (!list.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🧾</div><h3>Nothing here</h3><p>No orders in ${statusLabel(activeSection).toLowerCase()} right now.</p></div>`;
        return;
      }
      list.forEach((o) => wrap.appendChild(orderCard(o)));
    }

    await loadOrders();

    // Live updates: no page refresh needed to see a new order come in or
    // any order's status change.
    const unsubscribe = LCP_DB.orders.subscribeToChanges(loadOrders);
    window.addEventListener("beforeunload", unsubscribe);
  }

  function imageSaveFn(itemId) {
    return (patch) => patch.image_url
      ? LCP_DB.catalog.setMenuImage(itemId, patch.image_url)
      : LCP_DB.catalog.removeMenuImage(itemId);
  }

  async function initProducts() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `
      <div class="admin-toolbar admin-toolbar--wrap">
        <h2 style="margin:0;">Products</h2>
        <div class="row gap-8" style="flex:1; min-width:220px; max-width:360px;">
          <input type="text" id="product-search" class="admin-search" placeholder="🔍 Search products…" aria-label="Search products">
        </div>
        <button class="btn btn--primary btn--sm" id="new-product-btn">+ Create Product</button>
      </div>
      <p class="muted">Products from the menu file (<code>js/seed-data.js</code>) show a "Menu File" tag — their name/price are edited in code, only their photo is managed here. Products you create with the button above are fully yours to edit or remove anytime.</p>
      <div id="products-duplicate-banner"></div>
      <div id="products-table-wrap"></div>`;
    const { data: categories } = await LCP_DB.catalog.listCategories();
    const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    let allProducts = [];
    let searchTerm = "";

    function priceCell(p) {
      if (p.sizes) return Object.entries(p.sizes).map(([sz, price]) => `${sz}: ${LCP_UTIL.pkr(price)}`).join(" · ");
      return LCP_UTIL.pkr(p.price);
    }

    function row(p) {
      const isHardcoded = p.source === "hardcoded";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${p.name}</strong>${!p.verified ? ' <span class="badge badge--warn">Verify</span>' : ""}</td>
        <td>${catName[p.category_id] || ""} <span class="badge badge--muted" style="margin-left:4px;">${isHardcoded ? "Menu File" : "Custom"}</span></td>
        <td style="font-size:12.5px;" id="prod-price-${p.id}">${priceCell(p)}</td>
        <td><span class="badge ${p.available ? "badge--success" : "badge--muted"}">${p.available ? "Available" : "Unavailable"}</span></td>
        <td data-image-cell></td>
        <td>${!isHardcoded ? `<div class="row gap-6"><button class="btn btn--sm btn--gold" data-edit-price>Price</button><button class="btn btn--sm btn--ghost" data-toggle-avail>${p.available ? "Deactivate" : "Activate"}</button><button class="btn btn--sm btn--danger" data-delete>Delete</button></div>` : ""}</td>`;
      tr.querySelector("[data-image-cell]").appendChild(buildImageCell(p, "products", imageSaveFn(p.id)));

      if (!isHardcoded) {
        tr.querySelector("[data-edit-price]").addEventListener("click", async () => {
          const newPrice = Number(prompt(`New price for "${p.name}" (PKR):`, p.price));
          if (!newPrice || newPrice <= 0) return;
          const { error } = await LCP_DB.catalog.updateProduct(p.id, { price: newPrice });
          if (error) return LCP_UTIL.toast(error, "error");
          LCP_UTIL.toast(`${p.name} price updated.`, "success");
          renderAll();
        });
        tr.querySelector("[data-toggle-avail]").addEventListener("click", async () => {
          const { error } = await LCP_DB.catalog.updateProduct(p.id, { available: !p.available });
          if (error) return LCP_UTIL.toast(error, "error");
          LCP_UTIL.toast(`${p.name} ${p.available ? "deactivated" : "activated"}.`, "success");
          renderAll();
        });
        tr.querySelector("[data-delete]").addEventListener("click", async () => {
          const ok = await LCP_UTIL.confirmDialog(`Delete "${p.name}"? This can't be undone.`);
          if (!ok) return;
          const { error } = await LCP_DB.catalog.deleteProduct(p.id);
          if (error) return LCP_UTIL.toast(error, "error");
          LCP_UTIL.toast(`${p.name} deleted.`, "success");
          renderAll();
        });
      }
      return tr;
    }

    function renderDuplicateBanner() {
      const banner = document.getElementById("products-duplicate-banner");
      const byName = {};
      allProducts.forEach((p) => {
        const key = p.name.trim().toLowerCase();
        (byName[key] = byName[key] || []).push(p);
      });
      const dupeGroups = Object.values(byName).filter((g) => g.length > 1);
      if (!dupeGroups.length) { banner.innerHTML = ""; return; }

      banner.innerHTML = `<div class="notice-box" style="border-color:#e0c060; background:#fff8e0; color:#7a5c00; margin-bottom:16px;">
        <strong>⚠ ${dupeGroups.length} duplicate product name${dupeGroups.length === 1 ? "" : "s"} found</strong> — the same item exists more than once and will show twice on the site. We recommend keeping the "Menu File" version (always reliable) and removing the "Custom" one below.
        <div id="dupe-list-products" style="margin-top:10px;"></div>
      </div>`;
      const list = document.getElementById("dupe-list-products");
      dupeGroups.forEach((group) => {
        const customCopy = group.find((p) => p.source === "admin");
        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:10px; margin-top:6px; flex-wrap:wrap;";
        row.innerHTML = `<span>"${LCP_NAV.escapeHtml(group[0].name)}" appears ${group.length} times</span>`;
        if (customCopy) {
          const btn = document.createElement("button");
          btn.className = "btn btn--sm btn--danger";
          btn.textContent = "Delete the Custom duplicate";
          btn.addEventListener("click", async () => {
            const ok = await LCP_UTIL.confirmDialog(`Delete the duplicate "${customCopy.name}" (Custom copy)? The Menu File version will stay.`, { confirmText: "Delete Duplicate", danger: true });
            if (!ok) return;
            const { error } = await LCP_DB.catalog.deleteProduct(customCopy.id);
            if (error) return LCP_UTIL.toast(error, "error");
            LCP_UTIL.toast(`Duplicate "${customCopy.name}" removed.`, "success");
            renderAll();
          });
          row.appendChild(btn);
        }
        list.appendChild(row);
      });
    }

    function renderTable() {
      const wrap = document.getElementById("products-table-wrap");
      const q = searchTerm.trim().toLowerCase();
      const filtered = !q ? allProducts : allProducts.filter((p) =>
        p.name.toLowerCase().includes(q) || (catName[p.category_id] || "").toLowerCase().includes(q));
      if (filtered.length === 0) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔍</div><h3>No products match "${LCP_NAV.escapeHtml(searchTerm)}"</h3></div>`;
        return;
      }
      wrap.innerHTML = `<table class="admin-table">
        <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Availability</th><th>Image</th><th></th></tr></thead>
        <tbody id="products-tbody"></tbody></table>`;
      const tbody = document.getElementById("products-tbody");
      filtered.forEach((p) => tbody.appendChild(row(p)));
    }

    document.getElementById("product-search").addEventListener("input", LCP_UTIL.debounce((e) => {
      searchTerm = e.target.value;
      renderTable();
    }, 200));

    async function renderAll() {
      const { data: products, error } = await LCP_DB.catalog.listProducts();
      if (error) LCP_UTIL.toast("Unable to load products. Please refresh.", "error");
      allProducts = products;
      renderDuplicateBanner();
      renderTable();
    }
    renderAll();

    document.getElementById("new-product-btn").addEventListener("click", async () => {
      const name = prompt("Product name:");
      if (!name) return;
      const existing = allProducts.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (existing) {
        const isHardcoded = existing.source === "hardcoded";
        const ok = await LCP_UTIL.confirmDialog(
          `A product named "${existing.name}" already exists${isHardcoded ? " in the menu file" : ""}. Creating another one with the same name will show TWO separate entries on the site, which is confusing for customers. ` +
          (isHardcoded ? `If you just want to change its photo, cancel this and use the image button next to it in the list instead.` : `If you meant to edit its price, cancel this and use the Price button next to it in the list instead.`) +
          ` Create a duplicate anyway?`,
          { confirmText: "Create Duplicate Anyway", danger: true }
        );
        if (!ok) return;
      }
      const categoryOptions = categories.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
      const catIndex = Number(prompt(`Category — enter a number:\n${categoryOptions}`)) - 1;
      if (!categories[catIndex]) return LCP_UTIL.toast("Please pick a valid category number.", "error");
      const price = Number(prompt("Price (PKR):") || 0);
      if (!price || price <= 0) return LCP_UTIL.toast("Please enter a valid price.", "error");
      const description = prompt("Description (optional):") || "";
      const { error } = await LCP_DB.catalog.createProduct({
        name, description, price, category_id: categories[catIndex].id, available: true,
      });
      if (error) return LCP_UTIL.toast(error, "error");
      LCP_UTIL.toast(`${name} created.`, "success");
      renderAll();
    });
  }

  async function initDeals() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `
      <div class="admin-toolbar admin-toolbar--wrap">
        <h2 style="margin:0;">Deals</h2>
        <div class="row gap-8" style="flex:1; min-width:220px; max-width:360px;">
          <input type="text" id="deal-search" class="admin-search" placeholder="🔍 Search deals…" aria-label="Search deals">
        </div>
        <button class="btn btn--primary btn--sm" id="new-deal-btn">+ Create Deal</button>
      </div>
      <p class="muted">Deals from the menu file (<code>js/seed-data.js</code>) show a "Menu File" tag — their name/price are edited in code, only their photo is managed here. Deals you create with the button above are fully yours to edit or remove anytime.</p>
      <div id="deals-duplicate-banner"></div>
      <div id="deals-admin-list" class="stack gap-16"></div>`;

    let allDeals = [];
    let searchTerm = "";

    function renderDuplicateBanner() {
      const banner = document.getElementById("deals-duplicate-banner");
      const byName = {};
      allDeals.forEach((d) => {
        const key = d.name.trim().toLowerCase();
        (byName[key] = byName[key] || []).push(d);
      });
      const dupeGroups = Object.values(byName).filter((g) => g.length > 1);
      if (!dupeGroups.length) { banner.innerHTML = ""; return; }

      banner.innerHTML = `<div class="notice-box" style="border-color:#e0c060; background:#fff8e0; color:#7a5c00; margin-bottom:16px;">
        <strong>⚠ ${dupeGroups.length} duplicate deal name${dupeGroups.length === 1 ? "" : "s"} found</strong> — the same deal exists more than once and will show twice on the site. We recommend keeping the "Menu File" version (always reliable) and removing the "Custom" one below.
        <div id="dupe-list-deals" style="margin-top:10px;"></div>
      </div>`;
      const list = document.getElementById("dupe-list-deals");
      dupeGroups.forEach((group) => {
        const customCopy = group.find((d) => d.source === "admin");
        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:10px; margin-top:6px; flex-wrap:wrap;";
        row.innerHTML = `<span>"${LCP_NAV.escapeHtml(group[0].name)}" appears ${group.length} times</span>`;
        if (customCopy) {
          const btn = document.createElement("button");
          btn.className = "btn btn--sm btn--danger";
          btn.textContent = "Delete the Custom duplicate";
          btn.addEventListener("click", async () => {
            const ok = await LCP_UTIL.confirmDialog(`Delete the duplicate "${customCopy.name}" (Custom copy)? The Menu File version will stay.`, { confirmText: "Delete Duplicate", danger: true });
            if (!ok) return;
            const { error } = await LCP_DB.catalog.deleteDeal(customCopy.id);
            if (error) return LCP_UTIL.toast(error, "error");
            LCP_UTIL.toast(`Duplicate "${customCopy.name}" removed.`, "success");
            renderList();
          });
          row.appendChild(btn);
        }
        list.appendChild(row);
      });
    }

    function renderDealCards() {
      const wrap = document.getElementById("deals-admin-list");
      wrap.innerHTML = "";
      const q = searchTerm.trim().toLowerCase();
      const filtered = !q ? allDeals : allDeals.filter((d) =>
        d.name.toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q));

      if (filtered.length === 0) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔍</div><h3>No deals match "${LCP_NAV.escapeHtml(searchTerm)}"</h3></div>`;
        return;
      }

      filtered.forEach((d) => {
        const isHardcoded = d.source === "hardcoded";
        const card = LCP_UTIL.el("div", { class: "card" });
        card.innerHTML = `
          <div class="admin-toolbar" style="margin-bottom:8px;">
            <strong>${d.name}${!d.verified ? ' <span class="badge badge--warn">Verify</span>' : ""}</strong>
            <div class="row gap-8">
              <span class="badge badge--muted">${isHardcoded ? "Menu File" : "Custom"}</span>
              <span class="badge ${d.available ? "badge--success" : "badge--muted"}">${d.available ? "Active" : "Inactive"}</span>
            </div>
          </div>
          <p class="muted">${LCP_NAV.escapeHtml(d.description || "")}</p>
          <div class="row gap-12" style="flex-wrap:wrap; align-items:center;">
            <strong id="deal-price-${d.id}">${LCP_UTIL.pkr(d.price)}</strong>
            ${!isHardcoded ? `
              <button class="btn btn--sm btn--gold" data-edit-price>Edit Price</button>
              <button class="btn btn--sm btn--ghost" data-toggle-avail>${d.available ? "Deactivate" : "Activate"}</button>
              <button class="btn btn--sm btn--danger" data-delete-deal>Delete</button>` : ""}
          </div>
          <div data-deal-image-cell style="margin-top:12px;"></div>`;
        card.querySelector("[data-deal-image-cell]").appendChild(buildImageCell(d, "deals", imageSaveFn(d.id)));

        if (!isHardcoded) {
          card.querySelector("[data-edit-price]").addEventListener("click", async () => {
            const newPrice = Number(prompt(`New price for "${d.name}" (PKR):`, d.price));
            if (!newPrice || newPrice <= 0) return;
            const { error: err } = await LCP_DB.catalog.updateDeal(d.id, { price: newPrice });
            if (err) return LCP_UTIL.toast(err, "error");
            LCP_UTIL.toast(`${d.name} price updated.`, "success");
            renderList();
          });
          card.querySelector("[data-toggle-avail]").addEventListener("click", async () => {
            const { error: err } = await LCP_DB.catalog.updateDeal(d.id, { available: !d.available });
            if (err) return LCP_UTIL.toast(err, "error");
            LCP_UTIL.toast(`${d.name} ${d.available ? "deactivated" : "activated"}.`, "success");
            renderList();
          });
          card.querySelector("[data-delete-deal]").addEventListener("click", async () => {
            const ok = await LCP_UTIL.confirmDialog(`Delete "${d.name}"? This can't be undone.`);
            if (!ok) return;
            const { error: err } = await LCP_DB.catalog.deleteDeal(d.id);
            if (err) return LCP_UTIL.toast(err, "error");
            LCP_UTIL.toast(`${d.name} deleted.`, "success");
            renderList();
          });
        }
        wrap.appendChild(card);
      });
    }

    async function renderList() {
      const { data: deals, error } = await LCP_DB.catalog.listDeals();
      if (error) LCP_UTIL.toast("Unable to load deals: " + error, "error");
      allDeals = deals;
      renderDuplicateBanner();
      renderDealCards();
    }
    renderList();

    document.getElementById("deal-search").addEventListener("input", LCP_UTIL.debounce((e) => {
      searchTerm = e.target.value;
      renderDealCards();
    }, 200));

    document.getElementById("new-deal-btn").addEventListener("click", async () => {
      const name = prompt("Deal name (e.g. Deal 7):");
      if (!name) return;
      const existing = allDeals.find((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (existing) {
        const isHardcoded = existing.source === "hardcoded";
        const ok = await LCP_UTIL.confirmDialog(
          `A deal named "${existing.name}" already exists${isHardcoded ? " in the menu file" : ""}. Creating another one with the same name will show TWO separate entries on the site, which is confusing for customers. ` +
          (isHardcoded ? `If you just want to change its photo, cancel this and use the image button next to it in the list instead.` : `If you meant to edit its price, cancel this and use the Edit Price button next to it in the list instead.`) +
          ` Create a duplicate anyway?`,
          { confirmText: "Create Duplicate Anyway", danger: true }
        );
        if (!ok) return;
      }
      const description = prompt("Description (e.g. 1 Large Pizza + 1 Drink):") || "";
      const price = Number(prompt("Deal price (PKR):") || 0);
      if (!price || price <= 0) return LCP_UTIL.toast("Please enter a valid price.", "error");
      const { error } = await LCP_DB.catalog.createDeal({ name, description, price, available: true });
      if (error) return LCP_UTIL.toast(error, "error");
      LCP_UTIL.toast(`${name} created.`, "success");
      renderList();
    });
  }

  async function initHistory() {
    const host = document.getElementById("admin-content");
    host.innerHTML = `
      <h2>Order History</h2>
      <p class="muted">Delivered and rejected orders — permanently retained.</p>
      <div class="admin-toolbar">
        <input type="text" id="history-search" placeholder="Search by order #, customer or phone…" style="height:44px; border-radius:10px; border:1.5px solid var(--line); padding:0 14px; min-width:280px;">
      </div>
      <div id="history-list"></div>`;
    const { data: orders, error: histErr } = await LCP_DB.orders.listAll();
    if (histErr) LCP_UTIL.toast("Unable to load order history: " + histErr, "error");
    const finished = orders.filter((o) => o.status === "delivered" || o.status === "rejected");

    function render(list) {
      const wrap = document.getElementById("history-list");
      if (!list.length) { wrap.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🗂️</div><h3>No finished orders yet</h3></div>`; return; }
      wrap.innerHTML = `<table class="admin-table">
        <thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Phone</th><th>Type</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${list.map((o) => `<tr><td><strong>${o.order_number}</strong></td><td>${LCP_UTIL.fmtDate(o.delivered_at || o.rejected_at || o.created_at)}</td>
          <td>${LCP_NAV.escapeHtml(o.customer_name)}</td><td>${o.customer_phone}</td><td>${o.order_type}</td><td>${LCP_UTIL.pkr(o.total)}</td>
          <td><span class="badge ${statusBadgeClass(o.status)}">${statusLabel(o.status, o.rejection_reason)}</span></td></tr>`).join("")}</tbody></table>`;
    }
    render(finished);
    document.getElementById("history-search").addEventListener("input", LCP_UTIL.debounce((e) => {
      const q = e.target.value.trim().toLowerCase();
      render(finished.filter((o) => !q || o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q) || o.customer_phone.includes(q)));
    }, 200));
  }

  return { initDashboard, initOrders, initProducts, initDeals, initHistory };
})();