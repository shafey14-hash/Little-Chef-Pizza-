// api/_lib/email-template.js
//
// Shared email engine for every email Little Chef Pizza sends. Pure code —
// no database email service, no Supabase templates. All emails are built
// here as branded HTML (table-based, inline styles, MSO-safe) and sent
// through Gmail SMTP via Nodemailer, exactly like the SA Parties setup.
//
// Files starting with _ under /api are NOT routable on Vercel, so this
// module is only ever required by the actual endpoint files.

const nodemailer = require("nodemailer");

// ─────────────────────────────────────────────────────────────
// Brand — matches the website's design system (css/global.css)
// ─────────────────────────────────────────────────────────────
const BRAND = {
  name: "Little Chef Pizza",
  tagline: "Pizza & Fast Food",
  phone: "053-3521111",
  whatsapp: "0323-8677541",
  address: "Machli Chowk, Opp. Imam Bargah, East Circular Road, Gujrat",
  website: process.env.SITE_URL || "", // e.g. https://little-chef-pizza.vercel.app
  colors: {
    black: "#0c0b0a",
    black2: "#161311",
    gold: "#e7b93f",
    goldSoft: "#f4d37a",
    goldDark: "#8a6a10", // readable gold for text on light backgrounds
    cream: "#fbf6ee",
    pageBg: "#f5efe3",
    ink: "#1c1712",
    inkSoft: "#5c5347",
    line: "#ece4d6",
    success: "#2e9e5b",
    successBg: "#e8f7ee",
    warn: "#c67c11",
    warnBg: "#fdf2df",
    danger: "#c62828",
    dangerBg: "#fdeaea",
    info: "#1565c0",
    infoBg: "#e3f2fd",
    orange: "#ef7a22",
    orangeBg: "#fdece0",
  },
  year: new Date().getFullYear(),
};

const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

// ─────────────────────────────────────────────────────────────
// Master layout — used by ALL email types
// ─────────────────────────────────────────────────────────────
function masterLayout({
  previewText = "",
  bannerBg = BRAND.colors.warnBg,
  bannerBorderColor = BRAND.colors.gold,
  bannerTextColor = BRAND.colors.warn,
  bannerLabel = "",
  bodyHTML = "",
}) {
  const websiteRow = BRAND.website
    ? `
                <td align="right" style="font-size:0.8rem;color:${BRAND.colors.inkSoft};vertical-align:middle;">
                  <a href="${BRAND.website}" style="color:${BRAND.colors.goldDark};text-decoration:none;font-weight:700;">
                    Visit Website →
                  </a>
                </td>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <!--[if !mso]><!-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <!--<![endif]-->
  <title>${BRAND.name}</title>
  <style type="text/css">
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-wrapper { width: 100% !important; }
      .email-body-pad { padding: 24px 20px !important; }
      .email-header { padding: 28px 20px 24px !important; }
      .info-box { padding: 0 !important; }
      .order-num-text { font-size: 1rem !important; }
      .total-amount { font-size: 1.15rem !important; }
      .item-row td { font-size: 0.82rem !important; }
      .otp-code { font-size: 2.1rem !important; letter-spacing: 0.25em !important; }
      .footer-pad { padding: 16px 20px !important; }
      .support-row td { display: block !important; padding: 3px 0 !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.colors.pageBg};font-family:${FONT};">

  <!-- Preview text (hidden) -->
  <div style="display:none;font-size:1px;color:${BRAND.colors.pageBg};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND.colors.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">

        <!-- Email Card -->
        <table class="email-wrapper" role="presentation" border="0" cellpadding="0" cellspacing="0"
               style="max-width:580px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;
                      box-shadow:0 8px 40px rgba(140,106,16,0.14);">

          <!-- HEADER -->
          <tr>
            <td class="email-header" align="center"
                style="background:linear-gradient(135deg,${BRAND.colors.black} 0%,${BRAND.colors.black2} 60%,#241d12 100%);
                       padding:34px 40px 30px;border-bottom:3px solid ${BRAND.colors.gold};">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" width="64" height="64"
                            style="width:64px;height:64px;background:${BRAND.colors.gold};border-radius:50%;
                                   font-size:2rem;line-height:64px;mso-line-height-rule:exactly;">
                          🍕
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="margin:0;color:#ffffff;font-size:1.7rem;font-weight:800;
                               letter-spacing:-0.01em;line-height:1.1;font-family:${FONT};">
                      ${BRAND.name}
                    </h1>
                    <p style="margin:6px 0 0;color:${BRAND.colors.goldSoft};font-size:0.72rem;
                              letter-spacing:0.22em;text-transform:uppercase;font-weight:700;font-family:${FONT};">
                      ${BRAND.tagline}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- STATUS BANNER -->
          <tr>
            <td style="background:${bannerBg};border-left:5px solid ${bannerBorderColor};
                       padding:13px 32px;">
              <p style="margin:0;font-size:0.9rem;font-weight:700;color:${bannerTextColor};font-family:${FONT};">
                ${bannerLabel}
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td class="email-body-pad" style="padding:32px 36px 28px;">
              ${bodyHTML}
            </td>
          </tr>

          <!-- SUPPORT FOOTER -->
          <tr>
            <td style="background:${BRAND.colors.cream};border-top:1px solid ${BRAND.colors.line};padding:18px 36px;">
              <table class="support-row" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:0.8rem;color:${BRAND.colors.inkSoft};line-height:1.6;vertical-align:middle;">
                    <strong style="color:${BRAND.colors.ink};">Need help with your order?</strong><br/>
                    📞 ${BRAND.phone} &nbsp;·&nbsp; 💬 WhatsApp ${BRAND.whatsapp}
                  </td>${websiteRow}
                </tr>
              </table>
            </td>
          </tr>

          <!-- BOTTOM FOOTER -->
          <tr>
            <td class="footer-pad" align="center"
                style="background:#f8f2e6;border-top:1px dashed ${BRAND.colors.line};padding:18px 36px;">
              <p style="margin:0;font-size:0.75rem;color:${BRAND.colors.inkSoft};line-height:1.7;font-family:${FONT};">
                © ${BRAND.year} <strong style="color:${BRAND.colors.ink};">${BRAND.name}</strong>
                &nbsp;—&nbsp; ${esc(BRAND.address)}<br/>
                <span style="font-size:0.7rem;">This is an automated email, please do not reply directly.</span>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// Reusable components
// ─────────────────────────────────────────────────────────────

// Greeting + intro paragraph
function greeting(name, intro) {
  return `
  <h2 style="margin:0 0 8px;color:${BRAND.colors.ink};font-size:1.18rem;font-weight:800;font-family:${FONT};">
    Hi ${esc(name) || "there"}, 👋
  </h2>
  <p style="margin:0 0 24px;color:${BRAND.colors.inkSoft};font-size:0.92rem;line-height:1.7;font-family:${FONT};">
    ${intro}
  </p>`;
}

// Big verification-code box (OTP emails)
function otpCodeBox(code, minutes = 10) {
  return `
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
         style="background:${BRAND.colors.cream};border:2px dashed ${BRAND.colors.gold};border-radius:18px;
                margin-bottom:24px;text-align:center;">
    <tr>
      <td style="padding:28px 20px;">
        <p style="margin:0 0 12px;font-size:0.72rem;font-weight:700;letter-spacing:0.15em;
                  text-transform:uppercase;color:${BRAND.colors.inkSoft};font-family:${FONT};">
          Your Verification Code
        </p>
        <div class="otp-code"
             style="font-size:2.6rem;font-weight:800;letter-spacing:0.35em;color:${BRAND.colors.ink};
                    font-family:'Courier New',Courier,monospace;">
          ${esc(code)}
        </div>
        <p style="margin:14px 0 0;font-size:0.8rem;color:${BRAND.colors.inkSoft};font-family:${FONT};">
          This code expires in <strong>${minutes} minutes</strong>.
        </p>
      </td>
    </tr>
  </table>`;
}

// Order summary card: order number, items table, optional extra info
// rows, and a highlighted total. `lines` = [{ name, qty, total }]
function orderInfoBox({ orderNumber, orderType, lines = [], total, extraRows = "" }) {
  const itemsHtml = lines.length
    ? `
       <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
         <thead>
           <tr>
             <th style="padding:0 0 8px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.1em;color:${BRAND.colors.inkSoft};text-align:left;border-bottom:2px solid ${BRAND.colors.line};">
               Item
             </th>
             <th style="padding:0 0 8px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.1em;color:${BRAND.colors.inkSoft};text-align:center;border-bottom:2px solid ${BRAND.colors.line};">
               Qty
             </th>
             <th style="padding:0 0 8px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.1em;color:${BRAND.colors.inkSoft};text-align:right;border-bottom:2px solid ${BRAND.colors.line};">
               Price
             </th>
           </tr>
         </thead>
         <tbody>
           ${lines
             .map(
               (l) => `
           <tr class="item-row">
             <td style="padding:8px 0;border-bottom:1px solid ${BRAND.colors.line};font-size:0.85rem;
                        color:${BRAND.colors.ink};font-weight:600;vertical-align:top;font-family:${FONT};">
               ${esc(l.name)}
             </td>
             <td style="padding:8px 0;border-bottom:1px solid ${BRAND.colors.line};font-size:0.85rem;
                        color:${BRAND.colors.inkSoft};text-align:center;white-space:nowrap;vertical-align:top;font-family:${FONT};">
               ×${Number(l.qty) || 1}
             </td>
             <td style="padding:8px 0;border-bottom:1px solid ${BRAND.colors.line};font-size:0.85rem;
                        color:${BRAND.colors.goldDark};font-weight:700;text-align:right;white-space:nowrap;
                        vertical-align:top;font-family:${FONT};">
               ${pkr(l.total)}
             </td>
           </tr>`,
             )
             .join("")}
         </tbody>
       </table>`
    : `<p style="margin:0;font-size:0.85rem;color:${BRAND.colors.inkSoft};font-family:${FONT};">
         Item details are available in your order history.
       </p>`;

  return `
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="info-box"
         style="background:#fdfaf3;border:1.5px solid ${BRAND.colors.line};border-radius:16px;
                overflow:hidden;margin-bottom:22px;">
    <!-- Order number / type row -->
    <tr>
      <td style="padding:14px 20px;background:#f7efdd;border-bottom:1px solid ${BRAND.colors.line};">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
                       color:${BRAND.colors.inkSoft};font-family:${FONT};">
              Order Number
              <div class="order-num-text" style="margin-top:3px;font-size:1rem;font-weight:900;color:${BRAND.colors.ink};
                       font-family:'Courier New',Courier,monospace;letter-spacing:0.04em;">
                ${esc(orderNumber || "—")}
              </div>
            </td>
            <td align="right" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
                       color:${BRAND.colors.inkSoft};font-family:${FONT};">
              Order Type
              <div style="margin-top:3px;font-size:0.9rem;font-weight:800;color:${BRAND.colors.goldDark};
                          text-transform:capitalize;font-family:${FONT};">
                ${esc(orderType || "—")}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Items -->
    <tr>
      <td style="padding:14px 20px;">
        <p style="margin:0 0 10px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                  letter-spacing:0.1em;color:${BRAND.colors.inkSoft};font-family:${FONT};">Items Ordered</p>
        ${itemsHtml}
      </td>
    </tr>

    ${extraRows}

    <!-- Total -->
    <tr>
      <td style="padding:14px 20px;background:#f7efdd;border-top:1px solid ${BRAND.colors.line};">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="font-size:0.82rem;font-weight:700;color:${BRAND.colors.inkSoft};text-transform:uppercase;
                       letter-spacing:0.06em;font-family:${FONT};">Total Amount</td>
            <td align="right">
              <span class="total-amount" style="font-size:1.25rem;font-weight:900;color:${BRAND.colors.goldDark};font-family:${FONT};">
                ${pkr(total)}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

// Info row inside the order box (goes in `extraRows`)
function infoRow(label, value) {
  return `
  <tr>
    <td style="padding:10px 20px;border-top:1px solid ${BRAND.colors.line};">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;
                     color:${BRAND.colors.inkSoft};width:38%;vertical-align:top;padding-top:2px;font-family:${FONT};">
            ${label}
          </td>
          <td style="font-size:0.85rem;color:${BRAND.colors.ink};font-weight:600;text-align:right;font-family:${FONT};">
            ${value}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// Colored alert/callout box
function alertBox(bg, borderColor, textColor, content) {
  return `
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
         style="background:${bg};border-left:4px solid ${borderColor};border-radius:10px;
                margin-bottom:22px;overflow:hidden;">
    <tr>
      <td style="padding:14px 18px;font-size:0.85rem;color:${textColor};line-height:1.6;font-family:${FONT};">
        ${content}
      </td>
    </tr>
  </table>`;
}

// ─────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function pkr(n) {
  return `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;
}

function capitalize(s) {
  s = String(s || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────
// Mailer (shared cached transporter)
// ─────────────────────────────────────────────────────────────
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

async function sendMail({ to, subject, previewText = "", html, text = "" }) {
  if (!to || !String(to).includes("@")) {
    console.warn("⚠️ sendMail skipped: invalid email →", to);
    return;
  }
  const info = await getTransporter().sendMail({
    from: `"${BRAND.name}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
  console.log("✅ Email sent:", subject, "→", to, "| MsgID:", info.messageId);
}

module.exports = {
  BRAND,
  masterLayout,
  greeting,
  otpCodeBox,
  orderInfoBox,
  infoRow,
  alertBox,
  esc,
  pkr,
  capitalize,
  getTransporter,
  sendMail,
};
