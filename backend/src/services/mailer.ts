import nodemailer from "nodemailer";
import { config } from "../config";
import { logger } from "../utils/logger";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter — 3 instances, 500 msgs/day",
  pro: "Pro — 10 instances, 2,000 msgs/day",
  business: "Business — Unlimited instances & messages",
};

const transporter = config.smtpUser
  ? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    })
  : null;

const FROM = config.smtpFrom || (config.smtpUser ? `"Botsab" <${config.smtpUser}>` : "");

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    logger.warn({ to, subject }, "SMTP not configured — email skipped");
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    logger.error({ to, subject, err }, "Failed to send email");
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

function base(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:#16a34a;padding:24px 32px">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-.3px">Botsab</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            ${bodyContent}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #e4e4e7;padding:20px 32px;background:#fafafa">
            <p style="margin:0;font-size:12px;color:#71717a;line-height:1.6">
              Botsab is an independent open-source project and is <strong>not</strong> affiliated with
              WhatsApp LLC or Meta Platforms, Inc. WhatsApp® is a registered trademark of WhatsApp LLC.<br><br>
              Questions? Reply to this email or contact us at
              <a href="mailto:${config.smtpUser}" style="color:#16a34a">${config.smtpUser}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#16a34a;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px">${label}</a>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#09090b">${text}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#3f3f46;line-height:1.6">${text}</p>`;
}

function pill(text: string): string {
  return `<span style="display:inline-block;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:999px;padding:4px 14px;font-size:13px;font-weight:600">${text}</span>`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function sendRegistrationPending(email: string, plan: string): Promise<void> {
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const subject = "Your Botsab account is under review";
  const html = base(`
    ${h1("Thanks for signing up!")}
    ${p("We've received your registration request. Our team will review your account shortly.")}
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:.5px">Your Selected Plan</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#14532d">${planLabel}</p>
    </div>
    ${p("Once approved, you'll receive another email and can sign in immediately.")}
    ${p("Most requests are reviewed within <strong>1–24 hours</strong>.")}
    ${btn(`${config.appUrl}/pending`, "Check account status")}
  `);
  await send(email, subject, html);
}

export async function sendAccountApproved(email: string, plan: string, instanceLimit: number): Promise<void> {
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const limitText = instanceLimit === -1 ? "Unlimited" : String(instanceLimit);
  const subject = "Your Botsab account has been approved!";
  const html = base(`
    ${h1("Your account is approved 🎉")}
    ${p("Great news — a Botsab admin has reviewed and approved your account. You can now sign in and start using the platform.")}
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0">
            <span style="font-size:13px;color:#15803d;font-weight:600">Plan</span><br>
            <span style="font-size:15px;font-weight:700;color:#14532d">${planLabel}</span>
          </td>
          <td style="padding:4px 0;text-align:right">
            <span style="font-size:13px;color:#15803d;font-weight:600">Instance Limit</span><br>
            <span style="font-size:15px;font-weight:700;color:#14532d">${limitText}</span>
          </td>
        </tr>
      </table>
    </div>
    ${p("Connect your first WhatsApp number and start building campaigns.")}
    ${btn(`${config.appUrl}/login`, "Sign in to Botsab")}
    <p style="margin:20px 0 0;font-size:13px;color:#71717a">
      If you didn't register for Botsab, you can safely ignore this email.
    </p>
  `);
  await send(email, subject, html);
}
