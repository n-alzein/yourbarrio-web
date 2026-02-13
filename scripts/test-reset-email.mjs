#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Resend } from "resend";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function shouldFallbackToInline(errorMessage) {
  const message = String(errorMessage || "").toLowerCase();
  return (
    message.includes("variable") ||
    message.includes("template") ||
    message.includes("missing") ||
    message.includes("invalid") ||
    message.includes("render")
  );
}

function maskEmail(input) {
  const [localPart, domain = ""] = String(input || "").split("@");
  if (!localPart) return "***";
  return `${localPart.slice(0, 2)}***@${domain}`;
}

async function main() {
  loadEnvLocal();

  const to = (process.argv[2] || "").trim();
  if (!to || !to.includes("@")) {
    console.error("Usage: node scripts/test-reset-email.mjs you@example.com");
    process.exit(1);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Missing RESEND_API_KEY");
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || "YourBarrio <support@yourbarrio.com>";
  const alias = process.env.RESEND_TEMPLATE_ALIAS || "reset-your-password";
  const productName = "YourBarrio";
  const supportEmail = "support@yourbarrio.com";
  const subject = `Reset your ${productName} password`;
  const resetUrl = "https://yourbarrio.com/auth/confirm?next=/set-password&dev_test=1";

  const sendInlineFallback = async () => {
    const text = [
      `Reset your ${productName} password`,
      "",
      `Use this link to set your password: ${resetUrl}`,
      "",
      `If you did not request this, contact ${supportEmail}.`,
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;padding:24px;">
        <h1 style="margin:0 0 12px;">Reset your ${productName} password</h1>
        <p style="margin:0 0 16px;">Click below to set your password.</p>
        <p style="margin:0 0 16px;"><a href="${resetUrl}">Set Password</a></p>
        <p style="margin:0 0 8px;">Fallback link:</p>
        <p style="margin:0 0 16px;word-break:break-word;"><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="margin:0;color:#475569;">If you did not request this, contact ${supportEmail}.</p>
      </div>
    `;

    const result = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
    });

    if (result.error) {
      throw new Error(result.error.message || "Fallback send failed");
    }
    return result;
  };

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      template: {
        id: alias,
        variables: {
          resetUrl,
          productName,
          supportEmail,
        },
      },
    });

    if (result.error) {
      if (!shouldFallbackToInline(result.error.message || "")) {
        throw new Error(result.error.message || "Template send failed");
      }
      console.warn("Template send failed; testing inline fallback", {
        to: maskEmail(to),
        reason: result.error.message || "template_error",
      });
      await sendInlineFallback();
      console.log("Fallback inline email sent.");
      return;
    }

    console.log("Template alias email sent.");
  } catch (error) {
    if (!shouldFallbackToInline(error?.message || "")) {
      console.error("Send failed (no fallback):", {
        to: maskEmail(to),
        reason: error?.message || "unknown_error",
      });
      process.exit(1);
    }

    console.warn("Template send threw; testing inline fallback", {
      to: maskEmail(to),
      reason: error?.message || "template_exception",
    });
    await sendInlineFallback();
    console.log("Fallback inline email sent.");
  }
}

main().catch((error) => {
  console.error("Unexpected failure:", error?.message || "unknown_error");
  process.exit(1);
});
