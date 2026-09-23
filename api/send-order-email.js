// api/send-order-email.js
//
// A Vercel serverless function — Vercel auto-detects any file under /api
// as an endpoint, so this becomes:
//   https://<your-site>.vercel.app/api/send-order-email
//
// Called by a Postgres trigger (see supabase/order_email_notifications_trigger.sql)
// whenever an order is created or its status changes. Sends the customer
// an email via Gmail (using Nodemailer + an App Password) explaining
// what just happened. Skips silently if the order has no email on file.

const nodemailer = require("nodemailer");

const RESTAURANT_NAME = "Little Chef Pizza";

function subjectAndBody(event, order) {
  const name = order.customer_name || "there";
  const orderNum = order.order_number;
  const total = `Rs. ${order.total}`;

  if (event === "order_placed") {
    if (order.payment_method === "easypaisa") {
      return {
        subject: `Order ${orderNum} received — verifying your payment`,
        html: `<p>Hi ${name},</p><p>We've received your order <strong>${orderNum}</strong> (${total}) and are verifying your EasyPaisa payment. This usually takes about 2 minutes — we'll email you again once it's confirmed.</p>`,
      };
    }
    return {
      subject: `Order ${orderNum} received!`,
      html: `<p>Hi ${name},</p><p>Thanks for your order! <strong>${orderNum}</strong> (${total}) has been received and is being prepared.</p>`,
    };
  }

  if (event === "status_changed") {
    switch (order.status) {
      case "pending":
        return {
          subject: `Payment confirmed for order ${orderNum}`,
          html: `<p>Hi ${name},</p><p>Your payment for order <strong>${orderNum}</strong> (${total}) has been confirmed. We're preparing it now!</p>`,
        };
      case "out_for_delivery":
        return {
          subject: `Order ${orderNum} is on its way!`,
          html: `<p>Hi ${name},</p><p>Your order <strong>${orderNum}</strong> is now out for delivery. It should arrive soon!</p>`,
        };
      case "delivered":
        return {
          subject: `Order ${orderNum} delivered — enjoy!`,
          html: `<p>Hi ${name},</p><p>Your order <strong>${orderNum}</strong> has been delivered. We hope you enjoy it! Thanks for choosing ${RESTAURANT_NAME}.</p>`,
        };
      case "rejected":
        if (order.rejection_reason === "cancelled") {
          return {
            subject: `Order ${orderNum} was cancelled`,
            html: `<p>Hi ${name},</p><p>Unfortunately your order <strong>${orderNum}</strong> (${total}) has been cancelled. Please contact us if you have any questions.</p>`,
          };
        }
        if (order.rejection_reason === "failed_delivery") {
          return {
            subject: `Delivery issue with order ${orderNum}`,
            html: `<p>Hi ${name},</p><p>We were unable to deliver order <strong>${orderNum}</strong>. Please contact us so we can sort this out.</p>`,
          };
        }
        return {
          subject: `Payment issue with order ${orderNum}`,
          html: `<p>Hi ${name},</p><p>We couldn't verify the payment for order <strong>${orderNum}</strong> (${total}). Please contact us or try placing the order again.</p>`,
        };
      default:
        return null; // no email defined for this status
    }
  }
  return null;
}

let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

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
    if (!content)
      return res.status(200).json({ skipped: "no message for this event" });

    await getTransporter().sendMail({
      from: `"${RESTAURANT_NAME}" <${process.env.GMAIL_USER}>`,
      to: order.customer_email,
      subject: content.subject,
      html: content.html,
    });

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error("send-order-email failed:", err);
    return res.status(500).json({ error: String(err) });
  }
};
