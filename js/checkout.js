/**
 * checkout.js — drives customer/checkout.html end to end.
 */

// Standalone — deliberately does NOT reference any variable declared later
// in the main IIFE below (panels/steps are `const`, so calling into logic
// that touches them before that line runs would hit the temporal dead
// zone and throw). Used both for a fresh order and for restoring the
// confirmation screen after a refresh.
function lcpRenderOrderSuccess(data, user) {
  document
    .querySelectorAll(".checkout-panel")
    .forEach((p) => (p.hidden = Number(p.dataset.panel) !== 3));
  document.querySelectorAll(".checkout-steps__step").forEach((s, i) => {
    s.classList.toggle("active", i === 2);
    s.classList.toggle("done", i < 2);
  });
  document.getElementById("success-order-number").textContent =
    data.order_number;
  const etaText =
    data.order_type === "delivery"
      ? "Estimated delivery: up to 40 minutes."
      : data.order_type === "takeaway"
        ? "Estimated preparation: up to 20 minutes."
        : "Please proceed to your table — our staff will assist you.";

  if (data.status === "payment_verification") {
    document.getElementById("success-icon").textContent = "⏳";
    document.getElementById("success-title").textContent = "Payment Submitted";
    document.getElementById("success-meta").textContent =
      `Your payment is being verified. ${data.order_type.toUpperCase()} · Rs. ${data.total}`;
    document.getElementById("success-note").textContent =
      "Please wait for payment verification. Verification usually takes about 2 minutes. Your order cannot be cancelled after placement.";
  } else {
    document.getElementById("success-icon").textContent = "✓";
    document.getElementById("success-title").textContent =
      "Order Placed Successfully!";
    document.getElementById("success-meta").textContent =
      `${data.order_type.toUpperCase()} · Rs. ${data.total} · ${etaText}`;
    document.getElementById("success-note").textContent =
      "Your order cannot be cancelled after placement.";
  }
  document.getElementById("success-view-orders").hidden = !user;
  document.getElementById("success-continue").hidden = !!user;
}

(async function () {
  const user = await LCP_NAV.mountCustomer(null);

  // If the page is refreshed right after a successful order (bucket is now
  // empty because it was just cleared), show the confirmation again instead
  // of bouncing to an "empty bucket" redirect and losing the order number.
  const lastOrderRaw = sessionStorage.getItem("lcp_last_order");
  if (lastOrderRaw) {
    try {
      const lastOrder = JSON.parse(lastOrderRaw);
      const ageMs = Date.now() - lastOrder._savedAt;
      const cartEmpty = LCP_CART.getState().itemCount === 0;
      if (cartEmpty && ageMs < 10 * 60 * 1000) {
        // still fresh (within 10 minutes)
        lcpRenderOrderSuccess(lastOrder, user);
        return;
      }
    } catch {
      /* ignore corrupt/old data */
    }
    sessionStorage.removeItem("lcp_last_order");
  }

  const state = LCP_CART.getState();
  if (state.items.length === 0 && state.deals.length === 0) {
    LCP_UTIL.requireGuard(
      false,
      "bucket.html",
      "Your bucket is empty. Add something tasty first!",
    );
    return;
  }
  if (state.hasIssue) {
    LCP_UTIL.requireGuard(
      false,
      "bucket.html",
      "Please remove unavailable items from your bucket before checking out.",
    );
    return;
  }

  await LCP_loadCatalogCache();
  const { data: deliveryChargeSetting } =
    await LCP_DB.settings.get("delivery_charge");
  const DELIVERY_CHARGE = Number(deliveryChargeSetting) || 250;
  const deliveryCardNote = document.querySelector(
    '.order-type-card[data-type="delivery"] .muted',
  );
  if (deliveryCardNote)
    deliveryCardNote.textContent = `Up to 40 minutes · within 5km · Rs. ${DELIVERY_CHARGE} delivery fee`;

  let orderType = null;
  let paymentMethod = "cod";
  let screenshotPath = null; // set once the EasyPaisa screenshot finishes uploading
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
      LCP_UTIL.qsa(".order-type-card").forEach((c) =>
        c.classList.remove("selected"),
      );
      card.classList.add("selected");
      orderType = card.dataset.type;
      document.getElementById("step1-next").disabled = false;
    });
  });
  document.getElementById("step1-next").addEventListener("click", () => {
    if (orderType === "delivery" && !storedLocation) {
      LCP_UTIL.toast(
        "Please select your delivery location again first.",
        "error",
      );
      setTimeout(() => {
        window.location.href = "../index.html";
      }, 1200);
      return;
    }
    document.getElementById("delivery-fields").hidden =
      orderType !== "delivery";
    document.getElementById("non-delivery-address-field").hidden =
      orderType === "delivery";
    prefillDetails();
    renderReview();
    updateCancellationNotice();
    goToStep(2);
  });
  document
    .getElementById("step2-back")
    .addEventListener("click", () => goToStep(1));

  const storedLocation = LCP_LOCATION.getStored();

  function prefillDetails() {
    if (user) {
      document.getElementById("co-name").value = user.full_name || "";
      document.getElementById("co-phone").value = user.phone || "";
      document.getElementById("co-email").value = user.email || "";
    }
    if (orderType === "delivery" && storedLocation) {
      document.getElementById("co-address").value = storedLocation.address;
    } else if (orderType === "delivery" && user?.address) {
      document.getElementById("co-address").value = user.address;
    }
    if (orderType !== "delivery") {
      document.getElementById("co-address-simple").value =
        user?.address || (storedLocation ? storedLocation.address : "");
    }
  }

  // ---------------- Payment method ----------------
  const easypaisaSection = document.getElementById("easypaisa-section");
  document
    .querySelector('.payment-method-card:has(input[value="cod"])')
    ?.classList.add("payment-method-card--selected");
  LCP_UTIL.qsa('input[name="payment-method"]').forEach((radio) => {
    radio.addEventListener("change", async () => {
      paymentMethod = radio.value;
      LCP_UTIL.qsa(".payment-method-card").forEach((c) =>
        c.classList.remove("payment-method-card--selected"),
      );
      radio
        .closest(".payment-method-card")
        .classList.add("payment-method-card--selected");
      easypaisaSection.hidden = paymentMethod !== "easypaisa";
      if (paymentMethod === "easypaisa") {
        const [{ data: acctNum }, { data: acctName }] = await Promise.all([
          LCP_DB.settings.get("easypaisa_account_number"),
          LCP_DB.settings.get("easypaisa_account_name"),
        ]);
        document.getElementById("ep-account-number").textContent =
          acctNum || "Not configured";
        document.getElementById("ep-account-name").textContent =
          acctName || "Not configured";
      }
      updatePlaceOrderEnabled();
    });
  });

  const screenshotInput = document.getElementById("ep-screenshot");
  const screenshotPreview = document.getElementById("ep-screenshot-preview");
  screenshotInput.addEventListener("change", async () => {
    const file = screenshotInput.files[0];
    screenshotPath = null;
    screenshotPreview.innerHTML = "";
    updatePlaceOrderEnabled();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      LCP_UTIL.toast("Screenshot must be 5MB or smaller.", "error");
      screenshotInput.value = "";
      return;
    }
    screenshotPreview.innerHTML = `<div class="muted">Uploading screenshot…</div>`;
    const { data, error } = await LCP_DB.storage.uploadPaymentScreenshot(file);
    if (error) {
      LCP_UTIL.toast(error, "error");
      screenshotPreview.innerHTML = "";
      screenshotInput.value = "";
      return;
    }
    screenshotPath = data.path;
    screenshotPreview.innerHTML = `<div class="location-status--ok">✓ Screenshot uploaded</div>`;
    updatePlaceOrderEnabled();
  });

  // ---------------- Delivery area / address (from the location gate) ----------------
  const addressInput = document.getElementById("co-address");

  function updateCancellationNotice() {
    const box = document.getElementById("cancellation-notice");
    if (orderType === "delivery") {
      box.textContent =
        "Important: Orders cannot be cancelled after they are placed. Estimated delivery time is up to 40 minutes for delivery orders.";
    } else if (orderType === "takeaway") {
      box.textContent =
        "Important: Orders cannot be cancelled after they are placed. Estimated preparation time is up to 20 minutes.";
    } else {
      box.textContent =
        "Important: Orders cannot be cancelled after they are placed.";
    }
  }

  function renderReview() {
    const lines = document.getElementById("review-lines");
    lines.innerHTML = "";
    const cur = LCP_CART.getState();
    [...cur.items, ...cur.deals].forEach((l) => {
      lines.appendChild(
        LCP_UTIL.el("div", { class: "summary-row" }, [
          document.createTextNode(`${l.name} × ${l.qty}`),
          document.createTextNode(LCP_UTIL.pkr(l.line_total)),
        ]),
      );
    });
    const deliveryCharge = orderType === "delivery" ? DELIVERY_CHARGE : 0;
    document.getElementById("rv-subtotal").textContent = LCP_UTIL.pkr(
      cur.subtotal,
    );
    document.getElementById("rv-delivery").textContent =
      orderType === "delivery" ? `Rs. ${deliveryCharge}` : "—";
    document.getElementById("rv-total").textContent = LCP_UTIL.pkr(
      cur.subtotal + deliveryCharge,
    );
  }

  // Enable "Place Order" once cancellation ack is checked AND (for
  // EasyPaisa) a screenshot has finished uploading.
  const ackCheckbox = document.getElementById("co-ack");
  function updatePlaceOrderEnabled() {
    const ackOk = ackCheckbox.checked;
    const paymentOk =
      paymentMethod === "cod" ||
      (paymentMethod === "easypaisa" && !!screenshotPath);
    document.getElementById("place-order-btn").disabled = !(ackOk && paymentOk);
  }
  ackCheckbox.addEventListener("change", updatePlaceOrderEnabled);

  // ---------------- SUBMIT ----------------
  let submitting = false;
  document
    .getElementById("checkout-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitting) return; // hard stop against double-clicks / double submits

      const name = document.getElementById("co-name").value.trim();
      const email = document.getElementById("co-email").value.trim();
      const phone = document.getElementById("co-phone").value.trim();
      const altPhone = document.getElementById("co-alt-phone").value.trim();
      const instructions = document
        .getElementById("co-instructions")
        .value.trim();
      const address =
        orderType === "delivery"
          ? addressInput.value.trim()
          : document.getElementById("co-address-simple").value.trim();
      const ack = ackCheckbox.checked;

      const errs = [LCP_VALID.fullName(name), LCP_VALID.phone(phone)].filter(
        Boolean,
      );
      if (altPhone) {
        const e2 = LCP_VALID.phone(altPhone);
        if (e2)
          errs.push("Alternative " + e2.charAt(0).toLowerCase() + e2.slice(1));
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errs.push("Please enter a valid email address, or leave it blank.");
      if (orderType === "delivery" && (!address || address.length < 5))
        errs.push("Please enter your full delivery address.");
      if (orderType === "delivery" && !storedLocation)
        errs.push(
          "Please select your delivery location again from the home page.",
        );
      if (!ack)
        errs.push("Please confirm you understand the cancellation policy.");
      if (paymentMethod === "easypaisa" && !screenshotPath)
        errs.push("Please upload your EasyPaisa payment screenshot.");
      if (errs.length) return LCP_UTIL.toast(errs[0], "error");

      submitting = true;
      const btn = document.getElementById("place-order-btn");
      LCP_UTIL.setLoading(btn, true, "Placing order…");

      const payload = {
        ...LCP_CART.toOrderPayload(),
        customer_name: name,
        customer_email: email || null,
        customer_phone: phone,
        alt_contact_phone: altPhone || null,
        order_type: orderType,
        delivery_address: orderType === "delivery" ? address : null,
        delivery_lat:
          orderType === "delivery" && storedLocation
            ? storedLocation.lat
            : null,
        delivery_lng:
          orderType === "delivery" && storedLocation
            ? storedLocation.lng
            : null,
        special_instructions: instructions || null,
        payment_method: paymentMethod,
        payment_screenshot_path:
          paymentMethod === "easypaisa" ? screenshotPath : null,
        cancellation_acknowledged: ack,
      };

      const { data, error } = await LCP_DB.orders.create(payload);
      LCP_UTIL.setLoading(btn, false);
      submitting = false;

      if (error) return LCP_UTIL.toast(LCP_UTIL.friendlyError(error), "error");

      LCP_CART.clear();
      sessionStorage.setItem(
        "lcp_last_order",
        JSON.stringify({ ...data, _savedAt: Date.now() }),
      );
      lcpRenderOrderSuccess(data, user);
    });
})();
