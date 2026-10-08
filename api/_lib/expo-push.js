async function sendToExpoTokens(tokens, payload) {
  const list = (tokens || []).filter((t) => t.startsWith("ExpoPushToken") || t.startsWith("ExponentPushToken"));
  if (!list.length) return { sent: 0, removed: 0 };

  const messages = list.map((token) => ({
    to: token,
    sound: "default",
    title: String(payload.title || "Little Chef Pizza"),
    body: String(payload.body || "You have a new update."),
    data: {
      url: String(payload.url || "/customer/orders.html"),
      tag: String(payload.tag || "lcp-order"),
    },
  }));

  let sent = 0;
  let removed = 0;

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const data = await res.json();
    if (data && data.data && Array.isArray(data.data)) {
      data.data.forEach((receipt, index) => {
        if (receipt.status === "ok") {
          sent++;
        } else if (receipt.status === "error") {
          if (
            receipt.details &&
            receipt.details.error === "DeviceNotRegistered"
          ) {
            removed++;
            if (typeof payload.onDeadToken === "function") {
              try {
                payload.onDeadToken(list[index]);
              } catch (e) {}
            }
          } else {
            console.error("Expo push failed for token:", list[index], receipt);
          }
        }
      });
    }
  } catch (err) {
    console.error("Expo push request failed:", err.message);
  }

  return { sent, removed };
}

module.exports = { sendToExpoTokens };
