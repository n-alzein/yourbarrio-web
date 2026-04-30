import CartPageClient from "./CartPageClient";
import { getCartReorderSuggestions } from "@/lib/cart/getReorderSuggestions.server";
import { getSupabaseServerClient, getUserCached, getProfileCached } from "@/lib/supabaseServer";

export default async function CartPage() {
  let initialReorderItems = [];

  try {
    const supabase = await getSupabaseServerClient();
    const { user } = await getUserCached(supabase);

    if (user?.id) {
      const profile = await getProfileCached(user.id, supabase);
      initialReorderItems = await getCartReorderSuggestions({
        supabase,
        userId: user.id,
        isCustomer: String(profile?.role || "").trim().toLowerCase() === "customer",
      });
    }
  } catch {
    initialReorderItems = [];
  }

  return <CartPageClient initialReorderItems={initialReorderItems} />;
}
