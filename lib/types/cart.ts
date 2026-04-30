export type FulfillmentType = "delivery" | "pickup";
export type CartStatus = "active" | "submitted" | "abandoned";

export type CartItem = {
  id: string;
  cart_id: string;
  listing_id: string;
  vendor_id: string;
  variant_id?: string | null;
  variant_label?: string | null;
  selected_options?: Record<string, string> | null;
  quantity: number;
  title: string;
  unit_price: number | null;
  image_url: string | null;
  reserved_quantity?: number | null;
  reservation_expires_at?: string | null;
  client_item_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Cart = {
  id: string;
  user_id: string | null;
  guest_id?: string | null;
  vendor_id: string;
  status: CartStatus;
  fulfillment_type: FulfillmentType | null;
  available_fulfillment_methods?: FulfillmentType[];
  delivery_fee_cents?: number;
  delivery_notes?: string | null;
  delivery_min_order_cents?: number | null;
  delivery_radius_miles?: number | null;
  delivery_unavailable_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  cart_items?: CartItem[];
};

export type VendorSummary = {
  id: string;
  business_name?: string | null;
  full_name?: string | null;
  profile_photo_url?: string | null;
  city?: string | null;
  address?: string | null;
};

export type CartResponse = {
  cart: Cart | null;
  vendor: VendorSummary | null;
  carts?: Cart[];
  vendors?: Record<string, VendorSummary>;
};
