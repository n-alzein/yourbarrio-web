import "server-only";

import { buildConfirmStartUrl } from "@/lib/auth/confirmStart";
import { supabaseAdmin } from "@/lib/auth/supabaseAdmin";
import { sendResetPasswordEmail } from "@/lib/email/sendResetPasswordEmail";

function getInviteRedirectUrl(siteUrl: string) {
  return new URL("/auth/confirm?next=/set-password", siteUrl).toString();
}

export async function sendAdminInvite(
  email: string,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
): Promise<{ userId: string; inviteLink: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: getInviteRedirectUrl(siteUrl),
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to generate invite link");
  }

  const tokenHash = data?.properties?.hashed_token;
  const verificationType = (data?.properties?.verification_type || "invite") as
    | "recovery"
    | "invite"
    | "email"
    | "email_change";
  const userId = data?.user?.id;

  if (!tokenHash || !userId) {
    throw new Error("Invite link generation returned incomplete data");
  }

  const inviteLink = buildConfirmStartUrl(tokenHash, verificationType, "/set-password", siteUrl);

  await sendResetPasswordEmail({
    to: email,
    resetUrl: inviteLink,
    productName: "YourBarrio",
    supportEmail: "support@yourbarrio.com",
    subject: "Set your YourBarrio password",
  });

  return { userId, inviteLink };
}
