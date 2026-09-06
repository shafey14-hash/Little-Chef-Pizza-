/**
 * checkout.js — drives customer/checkout.html end to end.
 */
(async function () {
  await LCP_NAV.mountCustomer(null);

  const state = LCP_CART.getState();
  if (state.items.length === 0 && state.deals.length === 0) {
    LCP_UTIL.requireGuard(false, "bucket.html", "Your bucket is empty. Add something tasty first!");
    return;
  }
  if (state.hasIssue) {
    LCP_UTIL.requireGuard(false, "bucket.html", "Please remove unavailable items from your bucket before checking out.");
    return;
  }

  await LCP_loadCatalogCache();
  const user = LCP_NAV.currentUser();

  let orderType = null;
  const steps = LCP_UTIL.qsa(".checkout-steps__step");
  const panels = LCP_UTIL.qsa(".checkout-panel");

  function goToStep(n) {
    panels.forEach((p) => (p.hidden = Number(p.dataset.panel) !== n));
    steps.forEach((s, i) => {
      s.classList.toggle("active", i === n - 1);
      s.classList.toggle("done", i < n - 1);
    });
  }

  // ---------------- STEP 1: order type ----------------
  LCP_UTIL.qsa(".order-type-card").forEach((card) => {
    card.addEventListener("click", () => {
      LCP_UTIL.qsa(".order-type-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      orderType = card.dataset.type;
      document.getElementById("step1-next").disabled = false;
    });
  });
  document.getElementById("step1-next").addEventListener("click", () => {
    document.getElementById("delivery-fields").hidden = orderType !== "delivery";
    prefillDetails();
    renderReview();
    updateCancellationNotice();
    goToStep(2);
  });
  document.getElementById("step2-back").addEventListener("click", () => goToStep(1));

  function prefillDetails() {
    if (user) {
      document.getElementById("co-name").value = user.full_name || "";
      document.getElementById("co-phone").value = user.phone || "";
      if (orderType === "delivery" && user.area) {
        document.getElementById("co-area").value = user.area;
        document.getElementById("co-address").value = user.address || "";
      }
    }
  }

  // Populate Gujrat-city delivery area dropdown — selection only, no free typing.
  const areaSelect = document.getElementById("co-area");
  LCP_SEED.delivery_areas.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a; opt.textContent = a;
    areaSelect.appendChild(opt);
  });
  const addressInput = document.getElementById("co-address");
  const areaHint = document.getElementById("co-area-hint");
  areaSelect.addEventListener("change", () => {
    if (!areaSelect.value) {
      areaHint.textContent = "Sorry, delivery is currently unavailable at your selected location.";
      return;
    }
    areaHint.textContent = "";
    const rest = addressInput.value.replace(/^.*?,\s*/, "");
    addressInput.value = areaSelect.value + ", " + rest;
  });

  function updateCancellationNotice() {
    const box = document.getElementById("cancellation-notice");
    const ackText = document.getElementById("co-ack-text");
    if (orderType === "delivery") {
      box.textContent = "Important: Orders cannot be cancelled after they are placed. Estimated delivery time is up to 40 minutes for delivery orders.";
    } else if (orderType === "takeaway") {
      box.textContent = "Important: Orders cannot be cancelled after they are placed. Estimated preparation time is up to 20 minutes.";
    } else {
      box.textContent = "Important: Orders cannot be cancelled after they are placed.";
    }
    ackText.textContent = "I understand that this order cannot be cancelled after placement.";
  }

  function renderReview() {
    const lines = document.getElementById("review-lines");
    lines.innerHTML = "";
    const cur = LCP_CART.getState();
    [...cur.items, ...cur.deals].forEach((l) => {
      lines.appendChild(LCP_UTIL.el("div", { class: "summary-row" }, [
        document.createTextNode(`${l.name} × ${l.qty}`),
        document.createTextNode(LCP_UTIL.pkr(l.line_total)),
      ]));
    });
    document.getElementById("rv-subtotal").textContent = LCP_UTIL.pkr(cur.subtotal);
    document.getElementById("rv-delivery").textContent = orderType === "delivery" ? "TBD" : "—";
    document.getElementById("rv-total").textContent = LCP_UTIL.pkr(cur.subtotal);
  }

  // Enable "Place Order" only once the cancellation checkbox is checked.
  document.getElementById("co-ack").addEventListener("change", (e) => {
    document.getElementById("place-order-btn").disabled = !e.target.checked;
  });

  // ---------------- SUBMIT ----------------
  let submitting = false;
  document.getElementById("checkout-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return; // hard stop against double-clicks / double submits
    const name = document.getElementById("co-name").value.trim();
    const phone = document.getElementById("co-phone").value.trim();
    const area = orderType === "delivery" ? areaSelect.value : null;
    const address = orderType === "delivery" ? addressInput.value.trim() : null;
    const ack = document.getElementById("co-ack").checked;

    const errs = [LCP_VALID.fullName(name), LCP_VALID.phone(phone)].filter(Boolean);
    if (orderType === "delivery") {
      if (!area) errs.push("Sorry, delivery is currently unavailable at your selected location.");
      if (!address || address.length < 5) errs.push("Please enter your full delivery address.");
    }
    if (!ack) errs.push("Please confirm you understand the cancellation policy.");
    if (errs.length) return LCP_UTIL.toast(errs[0], "error");

    submitting = true;
    const btn = document.getElementById("place-order-btn");
    LCP_UTIL.setLoading(btn, true, "Placing order…");

    const payload = {
      ...LCP_CART.toOrderPayload(),
      user_id: user ? user.id : null,
      customer_name: name,
      customer_phone: phone,
      order_type: orderType,
      delivery_area: area,
      delivery_address: address,
      cancellation_acknowledged: ack,
    };

    const { data, error } = await LCP_DB.orders.create(payload);
    LCP_UTIL.setLoading(btn, false);
    submitting = false;

    if (error) return LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");

    LCP_CART.clear();
    document.getElementById("success-order-number").textContent = data.order_number;
    const etaText = orderType === "delivery" ? "Estimated delivery: up to 40 minutes."
                  : orderType === "takeaway" ? "Estimated preparation: up to 20 minutes."
                  : "Please proceed to your table — our staff will assist you.";
    document.getElementById("success-meta").textContent = `${data.order_type.toUpperCase()} · ${LCP_UTIL.pkr(data.total)} · ${etaText}`;
    document.getElementById("success-view-orders").hidden = !user;
    document.getElementById("success-continue").hidden = !!user;
    goToStep(3);
  });
})();
