import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type CliOptions = {
  dryRun: boolean;
  cleanup: boolean;
};

type PreviewImageMode = "local-strict" | "hide";

type TableColumnMap = Record<string, Set<string>>;

type SeedListingTuple = [title: string, price: number, category: string];

type SeedBusinessInput = {
  key: string;
  business_name: string;
  category: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  description: string;
  listings: SeedListingTuple[];
};

type SeedOwner = {
  authUserId: string;
  email: string;
  publicId: string;
};

type Summary = {
  usersCreated: number;
  usersUpdated: number;
  usersSkipped: number;
  businessesCreated: number;
  businessesUpdated: number;
  businessesSkipped: number;
  listingsCreated: number;
  listingsUpdated: number;
  listingsSkipped: number;
  cleanupListingsHidden: number;
};

const MANAGED_TAG = "launch-preview-2026";
const DEFAULT_LOW_STOCK_THRESHOLD = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOCAL_IMAGE_EXTENSIONS = ["jpg", "jpeg", "webp", "png", "avif"] as const;
const KNOWN_COLUMN_MAP: TableColumnMap = {
  users: new Set([
    "id",
    "email",
    "public_id",
    "role",
    "full_name",
    "business_name",
    "business_type",
    "category",
    "description",
    "website",
    "phone",
    "address",
    "city",
    "state",
    "postal_code",
    "is_internal",
    "password_set",
    "account_status",
    "updated_at",
  ]),
  businesses: new Set([
    "owner_user_id",
    "public_id",
    "business_name",
    "business_type",
    "category",
    "description",
    "website",
    "phone",
    "address",
    "city",
    "state",
    "postal_code",
    "profile_photo_url",
    "cover_photo_url",
    "pickup_enabled_default",
    "local_delivery_enabled_default",
    "default_delivery_fee_cents",
    "delivery_radius_miles",
    "delivery_min_order_cents",
    "delivery_notes",
    "is_internal",
    "is_seeded",
    "verification_status",
    "account_status",
    "updated_at",
  ]),
  listings: new Set([
    "id",
    "public_id",
    "business_id",
    "title",
    "description",
    "price",
    "category",
    "listing_category",
    "listing_subcategory",
    "city",
    "photo_url",
    "photo_variants",
    "is_internal",
    "is_seeded",
    "inventory_quantity",
    "inventory_status",
    "low_stock_threshold",
    "inventory_last_updated_at",
    "pickup_enabled",
    "local_delivery_enabled",
    "delivery_fee_cents",
    "use_business_delivery_defaults",
    "status",
    "is_published",
    "created_at",
    "updated_at",
  ]),
};

const OPTIONAL_COLUMN_PROBES: Record<string, string[]> = {
  listings: ["is_published", "updated_at"],
};

const seedBusinesses: SeedBusinessInput[] = [
  {
    key: "seaside-threads",
    business_name: "Seaside Threads",
    category: "Clothing & Fashion",
    neighborhood: "Retro Row",
    city: "Long Beach",
    state: "CA",
    postal_code: "90814",
    description:
      "A coastal-inspired boutique featuring easy layers, denim, and everyday statement pieces.",
    listings: [
      ["Vintage Denim Jacket", 68, "Clothing & Fashion"],
      ["Linen Button-Up Shirt", 42, "Clothing & Fashion"],
      ["Washed Cotton Overshirt", 54, "Clothing & Fashion"],
      ["Relaxed Wide-Leg Pants", 58, "Clothing & Fashion"],
      ["Ribbed Everyday Tank", 24, "Clothing & Fashion"],
      ["Soft Knit Cardigan", 72, "Clothing & Fashion"],
      ["Canvas Weekend Tote", 38, "Clothing & Fashion"],
      ["Lightweight Utility Vest", 64, "Clothing & Fashion"],
      ["Striped Beach Sweater", 49, "Clothing & Fashion"],
    ],
  },
  {
    key: "oak-and-clay-home",
    business_name: "Oak & Clay Home",
    category: "Home & Decor",
    neighborhood: "Bixby Knolls",
    city: "Long Beach",
    state: "CA",
    postal_code: "90807",
    description:
      "Warm home accents, ceramics, candles, and small-space decor for thoughtful interiors.",
    listings: [
      ["Hand-Thrown Ceramic Vase", 44, "Home & Decor"],
      ["Textured Linen Pillow Cover", 32, "Home & Decor"],
      ["Amber Glass Table Lamp", 76, "Home & Decor"],
      ["Woven Storage Basket", 39, "Home & Decor"],
      ["Matte Stoneware Bowl", 28, "Home & Decor"],
      ["Minimal Wall Hook Set", 22, "Home & Decor"],
      ["Small Batch Soy Candle", 18, "Home & Decor"],
      ["Natural Cotton Throw", 62, "Home & Decor"],
    ],
  },
  {
    key: "shoreline-beauty",
    business_name: "Shoreline Beauty",
    category: "Beauty & Personal Care",
    neighborhood: "Downtown Long Beach",
    city: "Long Beach",
    state: "CA",
    postal_code: "90802",
    description:
      "Clean beauty essentials, body care, and small-batch self-care goods.",
    listings: [
      ["Botanical Body Oil", 26, "Beauty & Personal Care"],
      ["Rose Clay Face Mask", 22, "Beauty & Personal Care"],
      ["Citrus Hand Cream", 16, "Beauty & Personal Care"],
      ["Sea Salt Bath Soak", 18, "Beauty & Personal Care"],
      ["Daily Mineral Balm", 24, "Beauty & Personal Care"],
      ["Lavender Shower Steamers", 14, "Beauty & Personal Care"],
      ["Reusable Cotton Rounds", 12, "Beauty & Personal Care"],
      ["Hydrating Lip Butter", 9, "Beauty & Personal Care"],
    ],
  },
  {
    key: "pacific-bloom-studio",
    business_name: "Pacific Bloom Studio",
    category: "Flowers & Plants",
    neighborhood: "Belmont Heights",
    city: "Long Beach",
    state: "CA",
    postal_code: "90803",
    description:
      "Indoor plants, sculptural pots, and simple greenery for apartments and storefronts.",
    listings: [
      ["Small Monstera Plant", 34, "Flowers & Plants"],
      ["Snake Plant in Ceramic Pot", 46, "Flowers & Plants"],
      ["Trailing Pothos Basket", 28, "Flowers & Plants"],
      ["Mini Succulent Trio", 18, "Flowers & Plants"],
      ["Modern Terracotta Planter", 24, "Flowers & Plants"],
      ["Peace Lily Starter Plant", 32, "Flowers & Plants"],
      ["Brass Plant Mister", 21, "Flowers & Plants"],
      ["Slim Window Herb Planter", 29, "Flowers & Plants"],
    ],
  },
  {
    key: "silver-lagoon",
    business_name: "Silver Lagoon",
    category: "Jewelry & Accessories",
    neighborhood: "East Village",
    city: "Long Beach",
    state: "CA",
    postal_code: "90802",
    description:
      "Delicate jewelry, small accessories, and coastal-inspired everyday pieces.",
    listings: [
      ["Gold-Fill Hoop Earrings", 36, "Jewelry & Accessories"],
      ["Pearl Drop Necklace", 48, "Jewelry & Accessories"],
      ["Stacking Ring Set", 32, "Jewelry & Accessories"],
      ["Minimal Chain Bracelet", 29, "Jewelry & Accessories"],
      ["Soft Satin Hair Scarf", 18, "Jewelry & Accessories"],
      ["Small Leather Card Holder", 42, "Jewelry & Accessories"],
      ["Shell Charm Anklet", 24, "Jewelry & Accessories"],
      ["Textured Silver Studs", 27, "Jewelry & Accessories"],
      ["Everyday Canvas Pouch", 22, "Jewelry & Accessories"],
    ],
  },
  {
    key: "made-on-fourth",
    business_name: "Made on Fourth",
    category: "Gifts & Crafts",
    neighborhood: "4th Street Corridor",
    city: "Long Beach",
    state: "CA",
    postal_code: "90814",
    description:
      "Handmade gifts, art objects, cards, and locally inspired small goods.",
    listings: [
      ["Hand-Poured Concrete Tray", 31, "Gifts & Crafts"],
      ["Risograph Greeting Card Set", 14, "Gifts & Crafts"],
      ["Mini Framed Art Print", 38, "Gifts & Crafts"],
      ["Handmade Ceramic Incense Holder", 27, "Gifts & Crafts"],
      ["Local Landmark Sticker Pack", 8, "Gifts & Crafts"],
      ["Macrame Keychain", 12, "Gifts & Crafts"],
      ["Small Batch Wax Sachet", 16, "Gifts & Crafts"],
      ["Painted Wood Ornament", 19, "Gifts & Crafts"],
      ["Gift Wrap Bundle", 11, "Gifts & Crafts"],
    ],
  },
  {
    key: "paper-harbor",
    business_name: "Paper Harbor",
    category: "Books & Stationery",
    neighborhood: "Alamitos Beach",
    city: "Long Beach",
    state: "CA",
    postal_code: "90802",
    description:
      "Notebooks, desk goods, journals, and curated reading accessories.",
    listings: [
      ["Linen-Covered Journal", 24, "Books & Stationery"],
      ["Brass Bookmark", 13, "Books & Stationery"],
      ["Desk Notepad Set", 16, "Books & Stationery"],
      ["Softcover Weekly Planner", 28, "Books & Stationery"],
      ["Archival Pen Trio", 12, "Books & Stationery"],
      ["Canvas Book Sleeve", 26, "Books & Stationery"],
      ["Minimal Sticky Note Kit", 9, "Books & Stationery"],
      ["Reading Light Clip", 18, "Books & Stationery"],
      ["Local Poetry Zine", 15, "Books & Stationery"],
    ],
  },
];

function parseArgs(argv: string[]): CliOptions {
  return {
    dryRun: argv.includes("--dry-run"),
    cleanup: argv.includes("--cleanup"),
  };
}

function requireEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "") || "";
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing required env: ${fallbackName ? `${name} or ${fallbackName}` : name}`);
  }
  return trimmed;
}

function getPreviewImageMode(): PreviewImageMode {
  const raw = String(process.env.SEED_PREVIEW_IMAGE_MODE || "local-strict")
    .trim()
    .toLowerCase();
  if (raw === "hide") return "hide";
  return "local-strict";
}

function assertExecutionAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEEDING !== "true") {
    throw new Error(
      "Refusing to run in production without ALLOW_PROD_SEEDING=true."
    );
  }
}

function getProjectRef(urlString: string): string {
  try {
    const hostname = new URL(urlString).hostname;
    return hostname.split(".")[0] || hostname;
  } catch {
    return "unknown-project";
  }
}

function slugify(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseLabel(value: string): string {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeListingCategory(categoryLabel: string) {
  const normalized = titleCaseLabel(categoryLabel);
  const slug = slugify(normalized);

  if (normalized === "Gifts & Crafts") {
    return {
      category: "art-handmade",
      listing_category: "Art & Handmade",
      listing_subcategory: "Gifts & Crafts",
    };
  }

  return {
    category: slug,
    listing_category: normalized,
    listing_subcategory: null,
  };
}

function normalizeBusinessType(categoryLabel: string) {
  switch (titleCaseLabel(categoryLabel)) {
    case "Clothing & Fashion":
      return { business_type: "boutique", category: "Boutique" };
    case "Home & Decor":
      return { business_type: "furniture-decor", category: "Furniture & Decor" };
    case "Beauty & Personal Care":
      return { business_type: "beauty-wellness", category: "Beauty & Wellness" };
    case "Flowers & Plants":
      return { business_type: "florist-plants", category: "Florist & Plants" };
    case "Jewelry & Accessories":
      return { business_type: "jewelry", category: "Jewelry" };
    case "Gifts & Crafts":
      return { business_type: "arts-crafts", category: "Arts & Crafts" };
    case "Books & Stationery":
      return { business_type: "bookstore", category: "Bookstore" };
    default:
      return { business_type: "specialty-retail", category: titleCaseLabel(categoryLabel) };
  }
}

function listingPublicId(businessKey: string, title: string): string {
  return `seed-${businessKey}-${slugify(title)}`.slice(0, 96);
}

function userPublicId(businessKey: string): string {
  return `seed-${businessKey}`.slice(0, 96);
}

function seedEmail(businessKey: string): string {
  return `launch-preview+${businessKey}@example.com`;
}

function businessAddress(seedBusiness: SeedBusinessInput): string {
  return `${seedBusiness.neighborhood} preview location`;
}

function seedWebsite(businessKey: string): string {
  return `https://${businessKey}.preview.yourbarrio.local`;
}

function seedPhone(index: number): string {
  return `562-555-${String(1200 + index).padStart(4, "0")}`;
}

function dryRunOwnerUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function computeCreatedAt(seedIndex: number): string {
  const dayOffset = seedIndex % 10;
  const intraDayHours = (seedIndex * 3) % 18;
  return new Date(Date.now() - dayOffset * MS_PER_DAY - intraDayHours * 60 * 60 * 1000).toISOString();
}

function computeInventoryStatus(seedIndex: number): "in_stock" | "low_stock" {
  return seedIndex % 5 === 0 ? "low_stock" : "in_stock";
}

function computeInventoryQuantity(seedIndex: number): number {
  const base = 4 + (seedIndex % 9);
  return base;
}

function localSeedImageUrls(businessKey: string): string[] {
  const root = path.join(process.cwd(), "public", "images", "seed", businessKey);
  if (!existsSync(root)) return [];

  return readdirSync(root)
    .filter((entry) => /\.(avif|gif|jpe?g|png|webp)$/i.test(entry))
    .sort()
    .map((entry) => `/images/seed/${businessKey}/${entry}`);
}

function localPublicAssetExists(publicPath: string): boolean {
  const normalized = String(publicPath || "").trim();
  if (!normalized.startsWith("/")) return false;
  const absolutePath = path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
  return existsSync(absolutePath);
}

function findLocalSeedImagePath(businessKey: string, title: string): string | null {
  const slug = slugify(title);
  for (const extension of LOCAL_IMAGE_EXTENSIONS) {
    const publicPath = `/images/seed/${businessKey}/${slug}.${extension}`;
    if (localPublicAssetExists(publicPath)) {
      return publicPath;
    }
  }
  return null;
}

function getBusinessListingImageUrls(seedBusiness: SeedBusinessInput): string[] {
  return seedBusiness.listings.map(([title]) => findLocalSeedImagePath(seedBusiness.key, title) || "");
}

function getListingImageUrl(seedBusiness: SeedBusinessInput, title: string): string | null {
  return findLocalSeedImagePath(seedBusiness.key, title);
}

function serializeListingPhotoUrl(url: string | null): string | null {
  if (!url) return null;
  return JSON.stringify([url]);
}

function validateImageCoverage(options: CliOptions, imageMode: PreviewImageMode) {
  const coverageRows = seedBusinesses.map((seedBusiness) => {
    const imageUrls = getBusinessListingImageUrls(seedBusiness);
    const uniqueCount = new Set(imageUrls.filter(Boolean)).size;
    const missingTitles = seedBusiness.listings
      .map(([title], index) => ({ title, url: imageUrls[index] || null }))
      .filter((entry) => !entry.url)
      .map((entry) => entry.title);
    const missingLocalAssets = seedBusiness.listings
      .map(([title], index) => ({ title, url: imageUrls[index] || null }))
      .filter((entry) => entry.url && entry.url.startsWith("/images/seed/"))
      .filter((entry) => !localPublicAssetExists(entry.url))
      .map((entry) => `${entry.title} (${entry.url})`);

    return {
      businessName: seedBusiness.business_name,
      listingCount: seedBusiness.listings.length,
      uniqueCount,
      missingTitles,
      missingLocalAssets,
    };
  });

  for (const row of coverageRows) {
    console.info(
      `[launch-preview] image coverage ${row.businessName}: ${row.uniqueCount}/${row.listingCount} unique`
    );
  }

  const failingRows = coverageRows.filter(
    (row) =>
      row.uniqueCount < row.listingCount ||
      row.missingTitles.length > 0 ||
      row.missingLocalAssets.length > 0
  );

  if (failingRows.length === 0) return;

  for (const row of failingRows) {
    console.warn(
      `[launch-preview] image coverage issue ${row.businessName}: unique=${row.uniqueCount}/${row.listingCount} missing=${row.missingTitles.join(", ") || "none"} missingLocalAssets=${row.missingLocalAssets.join(", ") || "none"}`
    );
  }

  if (!options.dryRun && imageMode === "local-strict") {
    throw new Error("Launch preview image coverage is incomplete. Refusing to seed.");
  }
}

function shouldHideListingForMissingImage(imageMode: PreviewImageMode, imageUrl: string | null) {
  return imageMode === "hide" && !imageUrl;
}

async function canSelectColumn(
  client: SupabaseClient,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const { error } = await client
    .from(tableName)
    .select(columnName, { head: true, count: "exact" })
    .limit(1);

  if (!error) return true;
  return false;
}

async function getTableColumns(client: SupabaseClient, tableNames: string[]): Promise<TableColumnMap> {
  const columnMap: TableColumnMap = {};
  for (const tableName of tableNames) {
    const knownColumns = KNOWN_COLUMN_MAP[tableName];
    if (!knownColumns) {
      throw new Error(`Unsupported table for launch preview seeding: ${tableName}`);
    }
    columnMap[tableName] = new Set(knownColumns);
  }

  for (const [tableName, optionalColumns] of Object.entries(OPTIONAL_COLUMN_PROBES)) {
    if (!columnMap[tableName]) continue;
    for (const columnName of optionalColumns) {
      const exists = await canSelectColumn(client, tableName, columnName);
      if (!exists) {
        columnMap[tableName].delete(columnName);
      }
    }
  }

  return columnMap;
}

function filterPayload<T extends Record<string, unknown>>(
  payload: T,
  supportedColumns: Set<string>
): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => supportedColumns.has(key) && value !== undefined)
  ) as Partial<T>;
}

function shallowEqualRecord(
  current: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>
): boolean {
  if (!current) return false;

  return Object.entries(next).every(([key, value]) => {
    const currentValue = current[key];
    if (value === null || currentValue === null) return value === currentValue;
    if (typeof value === "object") {
      return JSON.stringify(currentValue) === JSON.stringify(value);
    }
    return String(currentValue) === String(value);
  });
}

async function ensureSeedOwnerUser(
  client: SupabaseClient,
  columns: Set<string>,
  seedBusiness: SeedBusinessInput,
  businessIndex: number,
  options: CliOptions,
  summary: Summary
): Promise<SeedOwner> {
  const email = seedEmail(seedBusiness.key);
  const publicId = userPublicId(seedBusiness.key);
  const { data: existingUserRow, error: existingUserError } = await client
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (existingUserError) {
    throw new Error(existingUserError.message || `Failed to read seeded user for ${email}`);
  }

  let authUserId = String(existingUserRow?.id || "").trim();

  if (!authUserId) {
    if (options.dryRun) {
      authUserId = dryRunOwnerUuid(businessIndex);
      summary.usersCreated += 1;
    } else {
      const password = `Seed-${randomUUID()}-Aa1!`;
      const { data: createdAuthUser, error: createAuthError } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          source: MANAGED_TAG,
          business_key: seedBusiness.key,
        },
        app_metadata: {
          provider: "email",
          providers: ["email"],
        },
      });

      if (createAuthError || !createdAuthUser.user?.id) {
        throw new Error(createAuthError?.message || `Failed to create auth user for ${email}`);
      }
      authUserId = createdAuthUser.user.id;
      summary.usersCreated += 1;
    }
  }

  const businessTaxonomy = normalizeBusinessType(seedBusiness.category);
  const userBasePayload = filterPayload(
    {
      id: authUserId,
      email,
      public_id: publicId,
      role: "business",
      full_name: seedBusiness.business_name,
      business_name: seedBusiness.business_name,
      business_type: businessTaxonomy.business_type,
      category: businessTaxonomy.category,
      description: seedBusiness.description,
      website: seedWebsite(seedBusiness.key),
      phone: seedPhone(businessIndex),
      address: businessAddress(seedBusiness),
      city: seedBusiness.city,
      state: seedBusiness.state,
      postal_code: seedBusiness.postal_code,
      is_internal: false,
      password_set: false,
      account_status: "active",
    },
    columns
  );

  if (!existingUserRow) {
    if (!options.dryRun) {
      const { error: upsertUserError } = await client
        .from("users")
        .upsert(
          {
            ...userBasePayload,
            ...(columns.has("updated_at") ? { updated_at: new Date().toISOString() } : {}),
          },
          { onConflict: "id", ignoreDuplicates: false }
        );
      if (upsertUserError) {
        throw new Error(upsertUserError.message || `Failed to provision public user for ${email}`);
      }
    }
  } else if (!shallowEqualRecord(existingUserRow as Record<string, unknown>, userBasePayload)) {
    if (!options.dryRun) {
      const { error: updateUserError } = await client
        .from("users")
        .update({
          ...userBasePayload,
          ...(columns.has("updated_at") ? { updated_at: new Date().toISOString() } : {}),
        })
        .eq("id", authUserId);
      if (updateUserError) {
        throw new Error(updateUserError.message || `Failed to update public user for ${email}`);
      }
    }
    summary.usersUpdated += 1;
  } else if (existingUserRow) {
    summary.usersSkipped += 1;
  }

  return {
    authUserId,
    email,
    publicId,
  };
}

async function upsertSeedBusiness(
  client: SupabaseClient,
  columns: Set<string>,
  owner: SeedOwner,
  seedBusiness: SeedBusinessInput,
  businessIndex: number,
  options: CliOptions,
  summary: Summary
): Promise<void> {
  const existingBusinessQuery = client
    .from("businesses")
    .select("*")
    .eq("owner_user_id", owner.authUserId)
    .maybeSingle();
  const { data: existingBusiness, error: existingBusinessError } = await existingBusinessQuery;

  if (existingBusinessError) {
    throw new Error(
      existingBusinessError.message || `Failed to read business for ${seedBusiness.business_name}`
    );
  }

  const businessTaxonomy = normalizeBusinessType(seedBusiness.category);
  const businessProfileImage = getListingImageUrl(seedBusiness, seedBusiness.listings[0]?.[0] || "");
  const businessCoverImage = getListingImageUrl(seedBusiness, seedBusiness.listings[1]?.[0] || "");
  const businessBasePayload = filterPayload(
    {
      owner_user_id: owner.authUserId,
      public_id: owner.publicId,
      business_name: seedBusiness.business_name,
      business_type: businessTaxonomy.business_type,
      category: businessTaxonomy.category,
      description: seedBusiness.description,
      website: seedWebsite(seedBusiness.key),
      phone: seedPhone(businessIndex),
      address: businessAddress(seedBusiness),
      city: seedBusiness.city,
      state: seedBusiness.state,
      postal_code: seedBusiness.postal_code,
      profile_photo_url: businessProfileImage,
      cover_photo_url: businessCoverImage,
      pickup_enabled_default: true,
      local_delivery_enabled_default: false,
      default_delivery_fee_cents: null,
      delivery_radius_miles: null,
      delivery_min_order_cents: null,
      delivery_notes: null,
      is_internal: false,
      is_seeded: true,
      verification_status: "auto_verified",
      account_status: "active",
    },
    columns
  );

  if (!existingBusiness) {
    if (!options.dryRun) {
      const { error: createBusinessError } = await client
        .from("businesses")
        .upsert(
          {
            ...businessBasePayload,
            ...(columns.has("updated_at") ? { updated_at: new Date().toISOString() } : {}),
          },
          { onConflict: "owner_user_id", ignoreDuplicates: false }
        );
      if (createBusinessError) {
        throw new Error(
          createBusinessError.message || `Failed to create business ${seedBusiness.business_name}`
        );
      }
    }
    summary.businessesCreated += 1;
    return;
  }

  if (!shallowEqualRecord(existingBusiness as Record<string, unknown>, businessBasePayload)) {
    if (!options.dryRun) {
      const { error: updateBusinessError } = await client
        .from("businesses")
        .update({
          ...businessBasePayload,
          ...(columns.has("updated_at") ? { updated_at: new Date().toISOString() } : {}),
        })
        .eq("owner_user_id", owner.authUserId);
      if (updateBusinessError) {
        throw new Error(
          updateBusinessError.message || `Failed to update business ${seedBusiness.business_name}`
        );
      }
    }
    summary.businessesUpdated += 1;
    return;
  }

  summary.businessesSkipped += 1;
}

async function upsertSeedListings(
  client: SupabaseClient,
  columns: Set<string>,
  owner: SeedOwner,
  seedBusiness: SeedBusinessInput,
  imageMode: PreviewImageMode,
  options: CliOptions,
  summary: Summary
): Promise<void> {
  const listingPublicIds = seedBusiness.listings.map(([title]) =>
    listingPublicId(seedBusiness.key, title)
  );
  const { data: existingRows, error: existingRowsError } = await client
    .from("listings")
    .select("*")
    .in("public_id", listingPublicIds);

  if (existingRowsError) {
    throw new Error(
      existingRowsError.message || `Failed to read listings for ${seedBusiness.business_name}`
    );
  }

  const existingByPublicId = new Map(
    (existingRows || []).map((row) => [String(row.public_id || ""), row])
  );

  for (const [listingIndex, [title, price, categoryLabel]] of seedBusiness.listings.entries()) {
    const publicId = listingPublicId(seedBusiness.key, title);
    const existing = existingByPublicId.get(publicId) || null;
    const taxonomy = normalizeListingCategory(categoryLabel);
    const createdAt = computeCreatedAt(
      seedBusinesses
        .slice(0, seedBusinesses.findIndex((item) => item.key === seedBusiness.key))
        .reduce((sum, item) => sum + item.listings.length, 0) + listingIndex
    );
    const inventoryStatus = computeInventoryStatus(listingIndex);
    const inventoryQuantity = computeInventoryQuantity(listingIndex);
    const imageUrl = getListingImageUrl(seedBusiness, title);
    const hiddenForMissingImage = shouldHideListingForMissingImage(imageMode, imageUrl);

    const listingBasePayload = filterPayload(
      {
        public_id: publicId,
        business_id: owner.authUserId,
        title,
        description: `${seedBusiness.description} Preview item from ${seedBusiness.business_name} in ${seedBusiness.neighborhood}.`,
        price,
        category: taxonomy.category,
        listing_category: taxonomy.listing_category,
        listing_subcategory: taxonomy.listing_subcategory,
        city: seedBusiness.city,
        photo_url: serializeListingPhotoUrl(imageUrl),
        photo_variants: null,
        is_internal: false,
        is_seeded: true,
        inventory_quantity: inventoryQuantity,
        inventory_status: inventoryStatus,
        low_stock_threshold: DEFAULT_LOW_STOCK_THRESHOLD,
        inventory_last_updated_at: new Date().toISOString(),
        pickup_enabled: true,
        local_delivery_enabled: false,
        delivery_fee_cents: null,
        use_business_delivery_defaults: true,
        status: hiddenForMissingImage ? "draft" : "published",
        is_published: hiddenForMissingImage ? false : true,
        created_at: createdAt,
      },
      columns
    );

    if (!existing) {
      if (!options.dryRun) {
        const { error: insertListingError } = await client
          .from("listings")
          .insert({
            ...listingBasePayload,
            ...(columns.has("updated_at") ? { updated_at: new Date().toISOString() } : {}),
          });
        if (insertListingError) {
          throw new Error(
            insertListingError.message || `Failed to create listing ${title}`
          );
        }
      }
      summary.listingsCreated += 1;
      continue;
    }

    if (!shallowEqualRecord(existing as Record<string, unknown>, listingBasePayload)) {
      if (!options.dryRun) {
        const { error: updateListingError } = await client
          .from("listings")
          .update({
            ...listingBasePayload,
            ...(columns.has("updated_at") ? { updated_at: new Date().toISOString() } : {}),
          })
          .eq("id", existing.id);
        if (updateListingError) {
          throw new Error(
            updateListingError.message || `Failed to update listing ${title}`
          );
        }
      }
      summary.listingsUpdated += 1;
      continue;
    }

    summary.listingsSkipped += 1;
  }
}

async function cleanupSeededContent(
  client: SupabaseClient,
  columns: Set<string>,
  options: CliOptions,
  summary: Summary
) {
  const { count, error: countError } = await client
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("is_seeded", true);

  if (countError) {
    throw new Error(countError.message || "Failed to count seeded listings");
  }

  const updates = filterPayload(
    {
      is_published: false,
      status: "draft",
      updated_at: new Date().toISOString(),
    },
    columns
  );

  if (!options.dryRun && Object.keys(updates).length > 0) {
    const { error: cleanupError } = await client
      .from("listings")
      .update(updates)
      .eq("is_seeded", true);
    if (cleanupError) {
      throw new Error(cleanupError.message || "Failed to hide seeded listings");
    }
  }

  summary.cleanupListingsHidden = Number(count || 0);
}

function printSummary(summary: Summary, options: CliOptions) {
  const mode = options.cleanup
    ? options.dryRun
      ? "dry-run cleanup"
      : "cleanup"
    : options.dryRun
      ? "dry-run seed"
      : "seed";

  console.info(`\n[launch-preview] Summary (${mode})`);
  console.info(`users created: ${summary.usersCreated}`);
  console.info(`users updated: ${summary.usersUpdated}`);
  console.info(`users skipped: ${summary.usersSkipped}`);
  console.info(`businesses created: ${summary.businessesCreated}`);
  console.info(`businesses updated: ${summary.businessesUpdated}`);
  console.info(`businesses skipped: ${summary.businessesSkipped}`);
  console.info(`listings created: ${summary.listingsCreated}`);
  console.info(`listings updated: ${summary.listingsUpdated}`);
  console.info(`listings skipped: ${summary.listingsSkipped}`);
  if (options.cleanup) {
    console.info(`seeded listings hidden: ${summary.cleanupListingsHidden}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertExecutionAllowed();
  const imageMode = getPreviewImageMode();

  const supabaseUrl = requireEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = getProjectRef(supabaseUrl);

  console.info(`[launch-preview] Target Supabase URL: ${supabaseUrl}`);
  console.info(`[launch-preview] Target project ref: ${projectRef}`);
  console.info(
    `[launch-preview] Mode: ${options.cleanup ? "cleanup" : "seed"}${options.dryRun ? " (dry-run)" : ""}`
  );
  console.info(`[launch-preview] Image mode: ${imageMode}`);

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const summary: Summary = {
    usersCreated: 0,
    usersUpdated: 0,
    usersSkipped: 0,
    businessesCreated: 0,
    businessesUpdated: 0,
    businessesSkipped: 0,
    listingsCreated: 0,
    listingsUpdated: 0,
    listingsSkipped: 0,
    cleanupListingsHidden: 0,
  };

  const columnMap = await getTableColumns(client, ["users", "businesses", "listings"]);

  if (options.cleanup) {
    await cleanupSeededContent(client, columnMap.listings, options, summary);
    printSummary(summary, options);
    return;
  }

  validateImageCoverage(options, imageMode);

  const expectedListingCount = seedBusinesses.reduce((sum, business) => sum + business.listings.length, 0);
  if (seedBusinesses.length !== 7 || expectedListingCount !== 60) {
    throw new Error(
      `Seed dataset mismatch. Expected 7 businesses / 60 listings, got ${seedBusinesses.length} / ${expectedListingCount}.`
    );
  }

  for (const [businessIndex, seedBusiness] of seedBusinesses.entries()) {
    console.info(`[launch-preview] Processing ${seedBusiness.business_name}`);
    const owner = await ensureSeedOwnerUser(
      client,
      columnMap.users,
      seedBusiness,
      businessIndex,
      options,
      summary
    );
    await upsertSeedBusiness(
      client,
      columnMap.businesses,
      owner,
      seedBusiness,
      businessIndex,
      options,
      summary
    );
    await upsertSeedListings(
      client,
      columnMap.listings,
      owner,
      seedBusiness,
      imageMode,
      options,
      summary
    );
  }

  printSummary(summary, options);
}

main().catch((error) => {
  console.error("[launch-preview] failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
