import { NextResponse } from "next/server";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const response = NextResponse.next();
  const accountContext = await getCurrentAccountContext({
    request,
    response,
    source: "api/me",
  });

  const jsonResponse = NextResponse.json(
    {
      user: accountContext.user,
      profile: accountContext.profile,
      accountContext: {
        role: accountContext.role,
        isRoleResolved: accountContext.isRoleResolved,
        businessRowExists: accountContext.businessRowExists,
        canPurchase: accountContext.canPurchase,
        isBusiness: accountContext.isBusiness,
      },
    },
    { status: accountContext.isAuthenticated ? 200 : 401 }
  );
  jsonResponse.headers.set("Cache-Control", "no-store");
  return jsonResponse;
}
