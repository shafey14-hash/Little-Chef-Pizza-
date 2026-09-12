/**
 * auth.js — drives index.html: the location gate (shown first), the
 * welcome modal, customer login/signup, and guest mode. Redirects on
 * success. Admin login now lives entirely at admin/login.html — this file
 * never touches admin authentication.
 */
(async function () {
  // NOTE: we deliberately do NOT redirect immediately here even if a
  // Supabase session already exists — Supabase persists sessions in
  // localStorage, so an already-logged-in visitor must still see (or have
  // already completed) the location gate before landing on their portal.
  // The redirect only happens once location is established, further down.
  const existingProfile = await LCP_DB.auth.init();

  const modal = document.getElementById("auth-modal");

  function showView(name) {
    LCP_UTIL.qsa(".auth-view", modal).forEach(
      (v) => (v.hidden = v.dataset.view !== name),
    );
    modal.classList.toggle("auth-modal--wide", name === "location-gate");
  }
  LCP_UTIL.qsa("[data-goto]", modal).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showView(btn.dataset.goto);
    });
  });

  function proceedPastLocationGate() {
    if (existingProfile) {
      window.location.href =
        existingProfile.role === "admin"
          ? "admin/index.html"
          : "customer/home.html";
      return;
    }
    showView("welcome");
  }

  const storedLocation = LCP_LOCATION.getStored();
  if (storedLocation) {
    proceedPastLocationGate();
  } else {
    showView("location-gate");
  }

  // =====================================================================
  // WELCOME / GUEST / LOGIN / SIGNUP — wired unconditionally, BEFORE the
  // location-gate's map/geocoding setup below. If Leaflet, Nominatim, or
  // browser geolocation ever misbehaves, these buttons must still work;
  // that's why this block comes first and the riskier code is isolated
  // in its own try/catch further down instead of running before this.
  // =====================================================================
  document.getElementById("btn-guest").addEventListener("click", () => {
    sessionStorage.setItem("lcp_guest", "1");
    window.location.href = "customer/home.html";
  });

  LCP_UTIL.qsa("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.toggle);
      const isPwd = input.type === "password";
      input.type = isPwd ? "text" : "password";
      btn.textContent = isPwd ? "Hide" : "Show";
    });
  });

  // Signup's address field defaults to whatever location was selected in
  // the gate above (still fully editable).
  const suAddressInput = document.getElementById("su-address");
  LCP_UTIL.qsa('[data-goto="customer-signup"]').forEach((el) => {
    el.addEventListener("click", () => {
      const loc = LCP_LOCATION.getStored();
      if (loc && !suAddressInput.value) suAddressInput.value = loc.address;
    });
  });

  document
    .getElementById("form-customer-login")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      const username = document.getElementById("cl-username").value.trim();
      const password = document.getElementById("cl-password").value;
      if (!username || !password)
        return LCP_UTIL.toast(
          "Please enter your username and password.",
          "error",
        );
      LCP_UTIL.setLoading(btn, true, "Logging in…");
      const { data, error } = await LCP_DB.auth.signIn({
        username,
        password,
        expectRole: "customer",
      });
      LCP_UTIL.setLoading(btn, false);
      if (error) return LCP_UTIL.toast(error, "error");
      sessionStorage.removeItem("lcp_guest");
      window.location.href = "customer/home.html";
    });

  document.getElementById("cl-forgot").addEventListener("click", (e) => {
    e.preventDefault();
    LCP_UTIL.toast(
      "Please contact the restaurant to reset your password: " +
        LCP_SEED.restaurant.phone_primary,
      "info",
    );
  });

  document
    .getElementById("form-customer-signup")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      const full_name = document.getElementById("su-fullname").value.trim();
      const username = document.getElementById("su-username").value.trim();
      const password = document.getElementById("su-password").value;
      const phone = document.getElementById("su-phone").value.trim();
      const email = document.getElementById("su-email").value.trim() || null;
      const address =
        document.getElementById("su-address").value.trim() || null;

      const errors = [
        LCP_VALID.fullName(full_name),
        LCP_VALID.username(username),
        LCP_VALID.password(password),
        LCP_VALID.phone(phone),
      ].filter(Boolean);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.push("Please enter a valid email address, or leave it blank.");
      if (errors.length) return LCP_UTIL.toast(errors[0], "error");

      LCP_UTIL.setLoading(btn, true, "Creating account…");
      const loc = LCP_LOCATION.getStored();
      const { data, error } = await LCP_DB.auth.signUp({
        username,
        password,
        full_name,
        phone,
        email,
        address,
        area: loc ? loc.address : null,
      });
      LCP_UTIL.setLoading(btn, false);
      if (error) return LCP_UTIL.toast(error, "error");
      sessionStorage.removeItem("lcp_guest");
      LCP_UTIL.toast(
        "Account created! Welcome, " + full_name.split(" ")[0] + ".",
        "success",
      );
      setTimeout(() => (window.location.href = "customer/home.html"), 500);
    });

  // =====================================================================
  // LOCATION GATE — map, Locate Me, address geocoding. Isolated in its
  // own try/catch: if this throws for any reason, the buttons above have
  // already been wired and keep working.
  // =====================================================================
  try {
    let mapHandles;
    try {
      mapHandles = LCP_LOCATION.mountMap("location-map");
    } catch (err) {
      console.error("Map failed to load:", err);
      mapHandles = { setUserMarker: () => {} };
      const mapEl = document.getElementById("location-map");
      if (mapEl)
        mapEl.innerHTML =
          '<div class="muted" style="padding:16px; text-align:center;">Map preview unavailable — you can still select your location below.</div>';
    }

    const locAddressInput = document.getElementById("loc-address");
    const locStatus = document.getElementById("location-status");
    const locContinueBtn = document.getElementById("btn-location-continue");
    const locateMeBtn = document.getElementById("btn-locate-me");

    let currentSelection = storedLocation; // { lat, lng, address }
    if (storedLocation) {
      locAddressInput.value = storedLocation.address;
      mapHandles.setUserMarker(storedLocation.lat, storedLocation.lng);
    }

    function renderLocationStatus() {
      if (!currentSelection) {
        locStatus.innerHTML = "";
        locContinueBtn.disabled = true;
        return;
      }
      const distance = LCP_LOCATION.haversineKm(
        LCP_LOCATION.CENTER.lat,
        LCP_LOCATION.CENTER.lng,
        currentSelection.lat,
        currentSelection.lng,
      );
      if (distance <= LCP_LOCATION.RADIUS_KM) {
        locStatus.innerHTML = `<div class="location-status--ok">✓ Within delivery range (${distance.toFixed(1)} km away)</div>`;
        locContinueBtn.disabled = false;
      } else {
        locStatus.innerHTML = `<div class="location-status--error">Delivery is only available within 5 km. You are too far.</div>`;
        locContinueBtn.disabled = true;
      }
    }
    if (storedLocation) renderLocationStatus();

    async function useLocation(lat, lng, address) {
      currentSelection = { lat, lng, address };
      locAddressInput.value = address;
      mapHandles.setUserMarker(lat, lng);
      renderLocationStatus();
    }

    locateMeBtn.addEventListener("click", () => {
      if (!navigator.geolocation) {
        locStatus.innerHTML = `<div class="location-status--error">Your browser doesn't support location access. Please type your address instead.</div>`;
        return;
      }
      LCP_UTIL.setLoading(locateMeBtn, true, "Locating…");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const address = await LCP_LOCATION.reverseGeocode(
              latitude,
              longitude,
            );
            await useLocation(latitude, longitude, address);
          } catch {
            await useLocation(
              latitude,
              longitude,
              `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
            );
          }
          LCP_UTIL.setLoading(locateMeBtn, false);
        },
        () => {
          LCP_UTIL.setLoading(locateMeBtn, false);
          locStatus.innerHTML = `<div class="location-status--error">Location access denied. Please allow location access, or type your address below.</div>`;
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

    const geocodeAddress = LCP_UTIL.debounce(async (query) => {
      if (!query || query.trim().length < 3) return;
      locStatus.innerHTML = `<div class="muted">Checking location…</div>`;
      try {
        const result = await LCP_LOCATION.forwardGeocode(query.trim());
        if (!result) {
          locStatus.innerHTML = `<div class="location-status--error">Couldn't find that address. Try being more specific, or use Locate Me.</div>`;
          locContinueBtn.disabled = true;
          return;
        }
        await useLocation(
          result.lat,
          result.lng,
          locAddressInput.value.trim() || result.address,
        );
      } catch {
        locStatus.innerHTML = `<div class="location-status--error">Couldn't check that address right now. Please try again.</div>`;
        locContinueBtn.disabled = true;
      }
    }, 900);
    locAddressInput.addEventListener("input", (e) =>
      geocodeAddress(e.target.value),
    );

    locContinueBtn.addEventListener("click", () => {
      if (!currentSelection) return;
      LCP_LOCATION.save(currentSelection);
      proceedPastLocationGate();
    });
  } catch (err) {
    console.error("Location gate failed to initialize:", err);
    LCP_UTIL.toast(
      "The location picker couldn't load. Please refresh the page.",
      "error",
    );
  }
})();
