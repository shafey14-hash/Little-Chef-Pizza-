// api/send-order-email.js
//
// A Vercel serverless function — Vercel auto-detects any file under /api
// as an endpoint, so this becomes:
//   https://<your-site>.vercel.app/api/send-order-email
//
// Called by a Postgres trigger (see supabase/order_email_notifications_trigger.sql)
// whenever an order is created or its status changes. Sends the customer a
// fully branded HTML email — built entirely in code, no database email
// service, no Supabase templates — via Gmail (Nodemailer + an App Password).
// Skips silently if the order has no email on file.

const {
  BRAND,
  masterLayout,
  greeting,
  orderInfoBox,
  infoRow,
  alertBox,
  esc,
  pkr,
  capitalize,
  sendMail,
} = require("./_lib/email-template");

const C = BRAND.colors;
const FONT_F = "'Segoe UI',Helvetica,Arial,sans-serif";

// ─────────────────────────────────────────────────────────────
// Email content per event
// ─────────────────────────────────────────────────────────────
function subjectAndBody(event, order) {
  const name = order.customer_name || "there";
  const orderNum = order.order_number || "—";
  const isEasypaisa = (order.payment_method || "").toLowerCase() === "easypaisa";

  const orderBox = (extraRows = "") =>
    orderInfoBox({
      orderNumber: orderNum,
      orderType: capitalize(order.order_type),
      lines: [...(order.items || []), ...(order.deals || [])].map((l) => ({
        name: l.name,
        qty: l.qty || l.quantity || 1,
        total: l.total ?? l.line_total ?? l.price,
      })),
      total: order.total,
      extraRows,
    });

  const detailRows = `
    ${infoRow("Payment Method", isEasypaisa ? "📱 EasyPaisa" : "💵 Cash on Delivery")}
    ${infoRow("Contact Number", esc(order.phone || order.customer_phone || "—"))}
    ${order.order_type === "delivery" ? infoRow("Delivery Address", esc(order.address || order.delivery_address || "—")) : ""}
  `;

  // ── 1. New order placed ──
  if (event === "order_placed") {
    if (isEasypaisa) {
      return {
        subject: `Order ${orderNum} received — verifying your payment | ${BRAND.name}`,
        text: `Hi ${name},\n\nWe've received your order ${orderNum} and are verifying your EasyPaisa payment. This usually takes a few minutes — we'll email you again once it's confirmed.\n\nTotal: ${pkr(order.total)}\n\n${BRAND.name} — ${BRAND.phone}`,
        html: masterLayout({
          previewText: `Order ${orderNum} received — we're verifying your payment.`,
          bannerBg: C.warnBg,
          bannerBorderColor: C.warn,
          bannerTextColor: C.warn,
          bannerLabel: "⏳ &nbsp; Payment Being Verified",
          bodyHTML: `
            ${greeting(name, `We've received your order and are <strong>verifying your EasyPaisa payment</strong>. This usually takes a few minutes — we'll email you again once it's confirmed.`)}
            ${orderBox(detailRows)}
            ${alertBox(
              C.infoBg,
              C.info,
              C.info,
              `<strong>🧾 What's next?</strong><br/>
               Our team checks the payment screenshot you sent, then confirms your order. No need to do anything else — just keep an eye on your inbox.`,
            )}
            <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
              Thank you for choosing ${BRAND.name}! 🍕
            </p>`,
        }),
      };
    }
    return {
      subject: `Order ${orderNum} received! | ${BRAND.name}`,
      text: `Hi ${name},\n\nThanks for your order ${orderNum}! We've received it — our team will confirm it shortly and the kitchen will start preparing it.\n\nTotal: ${pkr(order.total)}\nPayment: Cash on Delivery\n\n${BRAND.name} — ${BRAND.phone}`,
      html: masterLayout({
        previewText: `Order ${orderNum} received — we'll confirm it shortly.`,
        bannerBg: C.warnBg,
        bannerBorderColor: C.gold,
        bannerTextColor: C.warn,
        bannerLabel: "🧾 &nbsp; Order Received — Awaiting Confirmation",
        bodyHTML: `
          ${greeting(name, `Thank you for your order! We've received your <strong>Cash on Delivery</strong> order — our team will <strong>confirm it shortly</strong> and the kitchen will get started. 🍕`)}
          ${orderBox(detailRows)}
          ${alertBox(
            C.warnBg,
            C.gold,
            C.warn,
            `<strong>⏳ What's next?</strong><br/>
             We'll confirm your order in a few minutes. Once it's confirmed, our chefs will prepare your food fresh — please keep <strong>${pkr(order.total)}</strong> ready for the rider.`,
          )}
          <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
            Thank you for choosing ${BRAND.name}! 🍕
          </p>`,
      }),
    };
  }

  // ── 2. Status changed ──
  if (event === "status_changed") {
    switch (order.status) {
      case "pending": // easypaisa payment approved
        return {
          subject: `Payment confirmed for order ${orderNum} | ${BRAND.name}`,
          text: `Hi ${name},\n\nYour payment for order ${orderNum} has been confirmed. We're preparing your order now!\n\nTotal: ${pkr(order.total)}\n\n${BRAND.name} — ${BRAND.phone}`,
          html: masterLayout({
            previewText: `Payment confirmed — order ${orderNum} is being prepared!`,
            bannerBg: C.successBg,
            bannerBorderColor: C.success,
            bannerTextColor: C.success,
            bannerLabel: "✅ &nbsp; Payment Verified & Approved!",
            bodyHTML: `
              ${greeting(name, `Great news! Your payment has been <strong style="color:${C.success};">verified and approved</strong>. Your order is now being prepared fresh in our kitchen.`)}
              ${orderBox(detailRows)}
              ${alertBox(
                C.successBg,
                C.success,
                C.success,
                `<strong>👨‍🍳 Order Status</strong><br/>
                 ✅ Payment Verified &nbsp;→&nbsp; ⏳ Being Prepared &nbsp;→&nbsp; 🚚 Out for Delivery Soon`,
              )}
              <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
                Thank you for choosing ${BRAND.name}! 🍕
              </p>`,
          }),
        };

      case "confirmed":
        return {
          subject: `Order ${orderNum} confirmed! | ${BRAND.name}`,
          text: `Hi ${name},\n\nGreat news — ${isEasypaisa ? "your payment has been verified and your order" : "your order"} ${orderNum} is confirmed and our kitchen is preparing it fresh now!\n\nTotal: ${pkr(order.total)}\nPayment: ${isEasypaisa ? "EasyPaisa" : "Cash on Delivery"}\n\n${BRAND.name} — ${BRAND.phone}`,
          html: masterLayout({
            previewText: `Order ${orderNum} confirmed — our kitchen is on it!`,
            bannerBg: C.successBg,
            bannerBorderColor: C.success,
            bannerTextColor: C.success,
            bannerLabel: "✅ &nbsp; Order Confirmed!",
            bodyHTML: `
              ${greeting(name, isEasypaisa
                ? `Great news! Your payment has been <strong style="color:${C.success};">verified</strong> and your order is <strong>confirmed</strong> — our kitchen is on it! 🍕`
                : `Great news! Your order has been <strong style="color:${C.success};">confirmed</strong> by our team — our kitchen is on it! 🍕`)}
              ${orderBox(detailRows)}
              ${alertBox(
                C.successBg,
                C.success,
                C.success,
                `<strong>👨‍🍳 Order Status</strong><br/>
                 ✅ Confirmed &nbsp;→&nbsp; 👨‍🍳 Being Prepared &nbsp;→&nbsp; 🚚 Out for Delivery Soon${isEasypaisa ? "" : `<br/>Please keep <strong>${pkr(order.total)}</strong> ready for the rider.`}`,
              )}
              <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
                Thank you for choosing ${BRAND.name}! 🍕
              </p>`,
          }),
        };

      case "out_for_delivery":
        return {
          subject: `Order ${orderNum} is on its way! | ${BRAND.name}`,
          text: `Hi ${name},\n\nYour order ${orderNum} is out for delivery and should arrive soon. Please keep your phone nearby.\n\nTotal: ${pkr(order.total)}\n\n${BRAND.name} — ${BRAND.phone}`,
          html: masterLayout({
            previewText: `Order ${orderNum} is out for delivery!`,
            bannerBg: C.orangeBg,
            bannerBorderColor: C.orange,
            bannerTextColor: C.orange,
            bannerLabel: "🚚 &nbsp; Your Order Is Out for Delivery!",
            bodyHTML: `
              ${greeting(name, `Your order has been <strong style="color:${C.orange};">handed to our rider</strong> and is on its way to you! 🛵`)}
              ${orderBox(detailRows)}
              ${alertBox(
                C.orangeBg,
                C.orange,
                C.orange,
                `<strong>📦 Almost there!</strong><br/>
                 The rider will call <strong>${esc(order.phone || order.customer_phone || "you")}</strong> on arrival. Please keep your phone nearby and the exact amount ready if you chose Cash on Delivery.`,
              )}
              <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
                Hot and fresh, straight to your door! 🍕
              </p>`,
          }),
        };

      case "delivered":
        return {
          subject: `Order ${orderNum} delivered — enjoy! | ${BRAND.name}`,
          text: `Hi ${name},\n\nYour order ${orderNum} has been delivered. We hope you enjoy it!\n\nThank you for choosing ${BRAND.name}. 🍕\n\n${BRAND.phone}`,
          html: masterLayout({
            previewText: `Order ${orderNum} delivered — bon appétit!`,
            bannerBg: C.successBg,
            bannerBorderColor: C.success,
            bannerTextColor: C.success,
            bannerLabel: "🎉 &nbsp; Order Delivered Successfully!",
            bodyHTML: `
              ${greeting(name, `Your order has been <strong style="color:${C.success};">delivered</strong>. We hope you love every bite! 🍕`)}
              ${orderBox()}
              ${alertBox(
                C.successBg,
                C.success,
                C.success,
                `<strong>🎊 Thank you for choosing ${BRAND.name}!</strong><br/>
                 Craving something else? A cheesy deal is always one tap away. See you again soon!`,
              )}
              <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
                Made fresh, served hot — every single time.
              </p>`,
          }),
        };

      case "rejected": {
        const reason = order.rejection_reason;
        const isCancelled = reason === "cancelled";
        const isFailedDelivery = reason === "failed_delivery";
        const isRejected = reason === "rejected";
        const title = isCancelled
          ? "Order Cancelled"
          : isFailedDelivery
            ? "Delivery Failed"
            : isRejected
              ? "Order Rejected"
              : "Payment Could Not Be Verified";
        const intro = isCancelled
          ? `Unfortunately, your order has been <strong style="color:${C.danger};">cancelled</strong> as requested.`
          : isFailedDelivery
            ? `Unfortunately, our rider was unable to complete the delivery for this order.`
            : isRejected
              ? `Unfortunately, our restaurant <strong style="color:${C.danger};">couldn't accept this order</strong>. This can happen if an item just went out of stock or we're at full capacity.`
              : `Unfortunately, we were unable to verify your payment. Your order has been <strong style="color:${C.danger};">cancelled</strong>.`;
        return {
          subject: `${title} — Order ${orderNum} | ${BRAND.name}`,
          text: `Hi ${name},\n\n${title} — order ${orderNum}.\n\n${isCancelled || isFailedDelivery || isRejected ? "Please contact us if this doesn't sound right." : "Please contact us or try placing the order again with correct payment details."}\n\n${BRAND.name} — ${BRAND.phone} / WhatsApp ${BRAND.whatsapp}`,
          html: masterLayout({
            previewText: `${title} — order ${orderNum}.`,
            bannerBg: C.dangerBg,
            bannerBorderColor: C.danger,
            bannerTextColor: C.danger,
            bannerLabel: `⚠️ &nbsp; ${title}`,
            bodyHTML: `
              ${greeting(name, intro)}
              ${orderBox(detailRows)}
              ${alertBox(
                C.warnBg,
                C.warn,
                C.warn,
                `<strong>💡 What to do next?</strong><br/>
                 ${isCancelled || isFailedDelivery || isRejected
                   ? `Please call us at <strong>${BRAND.phone}</strong> or WhatsApp <strong>${BRAND.whatsapp}</strong> if this doesn't sound right — we'll sort it out straight away.`
                   : `Please contact our team at <strong>${BRAND.phone}</strong> or WhatsApp <strong>${BRAND.whatsapp}</strong>. You're welcome to place a new order with correct payment details.`}`,
              )}
              <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
                We apologize for the inconvenience and hope to serve you again soon.
              </p>`,
          }),
        };
      }

      default:
        return null; // no email defined for this status
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Shared-secret check — this endpoint is public on the internet, this
  // stops a stranger from spamming your Gmail account through it. The
  // Postgres trigger sends this same secret in a header.
  if (req.headers["x-webhook-secret"] !== process.env.EMAIL_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { event, order } = req.body || {};
    if (!order || !order.customer_email) {
      return res.status(200).json({ skipped: "no email on file" });
    }

    const content = subjectAndBody(event, order);
    if (!content) return res.status(200).json({ skipped: "no message for this event" });

    await sendMail({
      to: order.customer_email,
      subject: content.subject,
      previewText: content.subject,
      html: content.html,
      text: content.text,
    });

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error("send-order-email failed:", err);
    return res.status(500).json({ error: String(err) });
  }
};
