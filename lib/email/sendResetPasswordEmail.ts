import "server-only";

import { resend } from "@/lib/email/resendClient";

type SendResetPasswordEmailInput = {
  to: string;
  resetUrl: string;
  productName?: string;
  supportEmail?: string;
  subject?: string;
};

export async function sendResetPasswordEmail({
  to,
  resetUrl,
  productName = "YourBarrio",
  supportEmail = "support@yourbarrio.com",
  subject,
}: SendResetPasswordEmailInput) {
  const alias = process.env.RESEND_TEMPLATE_ALIAS || "reset-your-password";
  const from = process.env.RESEND_FROM || "YourBarrio <support@yourbarrio.com>";
  const finalSubject = subject || `Reset your ${productName} password`;
  if (process.env.NODE_ENV !== "production" && resetUrl.includes("&amp;")) {
    console.warn("[email.reset-password] resetUrl appears HTML-escaped before send");
  }

  const shouldFallbackToInline = (errorMessage: string) => {
    const message = String(errorMessage || "").toLowerCase();
    return (
      message.includes("variable") ||
      message.includes("template") ||
      message.includes("missing") ||
      message.includes("invalid") ||
      message.includes("render")
    );
  };

  const maskEmail = (input: string) => {
    const [localPart, domain = ""] = String(input || "").split("@");
    if (!localPart) return "***";
    return `${localPart.slice(0, 2)}***@${domain}`;
  };

  const sendInlineFallback = async () => {
    const text = [
      `Reset your ${productName} password`,
      "",
      `Use this link to set your password: ${resetUrl}`,
      "",
      `If you did not request this, contact ${supportEmail}.`,
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;color:#0f172a;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
          <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">Reset your ${productName} password</h1>
          <p style="margin:0 0 16px;line-height:1.6;color:#334155;">
            Click the button below to set your password.
          </p>
          <p style="margin:0 0 18px;">
            <a href="${resetUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
              Set Password
            </a>
          </p>
          <p style="margin:0 0 8px;line-height:1.6;color:#334155;">
            If the button doesn’t work, copy and paste this link:
          </p>
          <p style="margin:0 0 16px;word-break:break-word;">
            <a href="${resetUrl}" style="color:#2563eb;">${resetUrl}</a>
          </p>
          <p style="margin:0;line-height:1.6;color:#64748b;font-size:13px;">
            If you did not request this, contact ${supportEmail}.
          </p>
        </div>
      </div>
    `;

    const inlineResult = await resend.emails.send({
      from,
      to,
      subject: finalSubject,
      text,
      html,
    });

    if (inlineResult.error) {
      throw new Error(inlineResult.error.message || "Failed to send reset password fallback email");
    }

    return inlineResult;
  };

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject: finalSubject,
      template: {
        id: alias,
        variables: {
          resetUrl,
          productName,
          supportEmail,
        },
      },
    });

    if (!result.error) {
      return result;
    }

    if (!shouldFallbackToInline(result.error.message || "")) {
      console.error("[email.reset-password] template send failed", {
        to: maskEmail(to),
        reason: result.error.message || "unknown_error",
      });
      throw new Error(result.error.message || "Failed to send reset password email");
    }

    console.warn("[email.reset-password] template send failed; falling back to inline content", {
      to: maskEmail(to),
      reason: result.error.message || "template_error",
    });
    return await sendInlineFallback();
  } catch (error: any) {
    if (!shouldFallbackToInline(error?.message || "")) {
      console.error("[email.reset-password] non-template send failure", {
        to: maskEmail(to),
        reason: error?.message || "unknown_error",
      });
      throw error instanceof Error ? error : new Error("Failed to send reset password email");
    }

    console.warn("[email.reset-password] template send threw; falling back to inline content", {
      to: maskEmail(to),
      reason: error?.message || "template_exception",
    });

    return await sendInlineFallback();
  }
}
