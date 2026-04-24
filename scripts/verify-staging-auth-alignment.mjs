import { randomUUID } from "node:crypto";

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("Missing required Supabase env vars.");
}

const projectRef = new URL(BASE_URL).hostname.split(".")[0];
if (projectRef !== "crskbfbleiubpkvyvvlf") {
  throw new Error(`Refusing to run against non-staging project ref: ${projectRef}`);
}

const runId = `stage-align-${Date.now()}`;
const password = `Yb!${Date.now()}Abc123`;

const state = {
  createdAuthUserIds: [],
  createdUserIds: [],
  createdReviewIds: [],
  createdConversationIds: [],
  createdMessageIds: [],
  results: [],
  identities: [],
  cleanup: {
    messages: false,
    conversations: false,
    reviews: false,
    users: false,
    authUsers: false,
    errors: [],
  },
};

function maskId(id) {
  return typeof id === "string" ? id.slice(0, 8) : null;
}

function pass(name, details = {}) {
  state.results.push({ name, ok: true, details });
}

function fail(name, details = {}) {
  state.results.push({ name, ok: false, details });
}

async function request(path, { method = "GET", headers = {}, body, bearer, key = ANON_KEY } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer || key}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { response, data, text };
}

async function adminCreateUser(label, role) {
  const email = `${runId}-${label}@example.test`;
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: SERVICE_ROLE_KEY,
    bearer: SERVICE_ROLE_KEY,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { label: runId, role_hint: role },
      app_metadata: { provider: "email" },
    },
  });

  if (!result.response.ok || !result.data?.id) {
    throw new Error(`Failed to create auth user for ${label}: ${result.text}`);
  }

  const userId = result.data.id;
  state.createdAuthUserIds.push(userId);
  state.identities.push({ label, email, role, userId });
  return { label, email, role, userId };
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });

  if (!result.response.ok || !result.data?.access_token) {
    throw new Error(`Failed to sign in ${email}: ${result.text}`);
  }

  return result.data.access_token;
}

async function upsertPublicUser(userId, patch) {
  const result = await request(`/rest/v1/users?id=eq.${userId}`, {
    method: "PATCH",
    key: SERVICE_ROLE_KEY,
    bearer: SERVICE_ROLE_KEY,
    headers: { Prefer: "return=representation" },
    body: patch,
  });

  if (!result.response.ok) {
    throw new Error(`Failed to patch public.users ${userId}: ${result.text}`);
  }
}

async function getRow(table, query, token = SERVICE_ROLE_KEY) {
  const result = await request(`/rest/v1/${table}?${query}`, {
    key: token,
    bearer: token,
    headers: { Prefer: "count=exact" },
  });
  if (!result.response.ok) {
    throw new Error(`Failed select ${table}: ${result.text}`);
  }
  return Array.isArray(result.data) ? result.data : [];
}

async function rpc(fn, args, token) {
  return request(`/rest/v1/rpc/${fn}`, {
    method: "POST",
    bearer: token,
    body: args,
  });
}

async function tableInsert(table, body, token, prefer = "return=representation") {
  return request(`/rest/v1/${table}`, {
    method: "POST",
    bearer: token,
    headers: { Prefer: prefer },
    body,
  });
}

async function tablePatch(table, filter, body, token, prefer = "return=representation") {
  return request(`/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    bearer: token,
    headers: { Prefer: prefer },
    body,
  });
}

async function tableDelete(table, filter, token, prefer = "return=representation") {
  return request(`/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    bearer: token,
    headers: { Prefer: prefer },
  });
}

async function cleanup() {
  const msgIds = state.createdMessageIds;
  const convoIds = state.createdConversationIds;
  const reviewIds = state.createdReviewIds;
  const userIds = state.createdUserIds;

  try {
    if (msgIds.length) {
      const filter = `id=in.(${msgIds.join(",")})`;
      await tableDelete("messages", filter, SERVICE_ROLE_KEY, "return=minimal");
    }
    state.cleanup.messages = true;
  } catch (error) {
    state.cleanup.errors.push(`messages:${error.message}`);
  }

  try {
    if (convoIds.length) {
      const filter = `id=in.(${convoIds.join(",")})`;
      await tableDelete("conversations", filter, SERVICE_ROLE_KEY, "return=minimal");
    }
    state.cleanup.conversations = true;
  } catch (error) {
    state.cleanup.errors.push(`conversations:${error.message}`);
  }

  try {
    if (reviewIds.length) {
      const filter = `id=in.(${reviewIds.join(",")})`;
      await tableDelete("business_reviews", filter, SERVICE_ROLE_KEY, "return=minimal");
    }
    state.cleanup.reviews = true;
  } catch (error) {
    state.cleanup.errors.push(`reviews:${error.message}`);
  }

  try {
    if (userIds.length) {
      const filter = `id=in.(${userIds.join(",")})`;
      await tableDelete("users", filter, SERVICE_ROLE_KEY, "return=minimal");
    }
    state.cleanup.users = true;
  } catch (error) {
    state.cleanup.errors.push(`users:${error.message}`);
  }

  for (const userId of state.createdAuthUserIds) {
    try {
      const result = await request(`/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        key: SERVICE_ROLE_KEY,
        bearer: SERVICE_ROLE_KEY,
      });
      if (!result.response.ok) {
        throw new Error(result.text);
      }
    } catch (error) {
      state.cleanup.errors.push(`auth:${maskId(userId)}:${error.message}`);
    }
  }
  if (state.cleanup.errors.length === 0) {
    state.cleanup.authUsers = true;
  }
}

async function main() {
  const customerA = await adminCreateUser("customer-a", "customer");
  const customerB = await adminCreateUser("customer-b", "customer");
  const businessA = await adminCreateUser("business-a", "business");
  const businessB = await adminCreateUser("business-b", "business");

  state.createdUserIds.push(customerA.userId, customerB.userId, businessA.userId, businessB.userId);

  await upsertPublicUser(customerA.userId, {
    role: "customer",
    full_name: `${runId} customer a`,
  });
  await upsertPublicUser(customerB.userId, {
    role: "customer",
    full_name: `${runId} customer b`,
  });
  await upsertPublicUser(businessA.userId, {
    role: "business",
    business_name: `${runId} business a`,
    full_name: `${runId} business a`,
  });
  await upsertPublicUser(businessB.userId, {
    role: "business",
    business_name: `${runId} business b`,
    full_name: `${runId} business b`,
  });

  const customerAToken = await signIn(customerA.email);
  const customerBToken = await signIn(customerB.email);
  const businessAToken = await signIn(businessA.email);
  const businessBToken = await signIn(businessB.email);

  const reviewBody = {
    business_id: businessA.userId,
    customer_id: customerA.userId,
    rating: 5,
    title: `${runId} review`,
    body: `${runId} customer review body`,
  };

  const anonInsert = await tableInsert("business_reviews", reviewBody, ANON_KEY);
  if (anonInsert.response.status >= 400) {
    pass("anon_cannot_insert_business_reviews", { status: anonInsert.response.status });
  } else {
    fail("anon_cannot_insert_business_reviews", { status: anonInsert.response.status, data: anonInsert.data });
  }

  const createReview = await tableInsert("business_reviews", reviewBody, customerAToken);
  const createdReview = Array.isArray(createReview.data) ? createReview.data[0] : null;
  if (createReview.response.ok && createdReview?.id) {
    state.createdReviewIds.push(createdReview.id);
    pass("customer_can_insert_own_review", { reviewId: maskId(createdReview.id) });
  } else {
    throw new Error(`Failed creating customer review: ${createReview.text}`);
  }

  const anonUpdate = await tablePatch(
    "business_reviews",
    `id=eq.${createdReview.id}`,
    { title: "anon update attempt" },
    ANON_KEY
  );
  const afterAnonUpdate = (await getRow("business_reviews", `id=eq.${createdReview.id}&select=title`))[0];
  if (
    anonUpdate.response.status >= 400 ||
    (Array.isArray(anonUpdate.data) && anonUpdate.data.length === 0 && afterAnonUpdate?.title !== "anon update attempt")
  ) {
    pass("anon_cannot_update_business_reviews", { status: anonUpdate.response.status });
  } else {
    fail("anon_cannot_update_business_reviews", { status: anonUpdate.response.status, data: anonUpdate.data, row: afterAnonUpdate });
  }

  const anonDelete = await tableDelete("business_reviews", `id=eq.${createdReview.id}`, ANON_KEY);
  const afterAnonDelete = await getRow("business_reviews", `id=eq.${createdReview.id}&select=id`);
  if (
    anonDelete.response.status >= 400 ||
    (Array.isArray(anonDelete.data) && anonDelete.data.length === 0 && afterAnonDelete.length === 1)
  ) {
    pass("anon_cannot_delete_business_reviews", { status: anonDelete.response.status });
  } else {
    fail("anon_cannot_delete_business_reviews", { status: anonDelete.response.status, data: anonDelete.data, remaining: afterAnonDelete.length });
  }

  const customerOwnUpdate = await tablePatch(
    "business_reviews",
    `id=eq.${createdReview.id}`,
    { rating: 4, title: `${runId} review updated`, body: `${runId} updated body` },
    customerAToken
  );
  const ownUpdated = Array.isArray(customerOwnUpdate.data) ? customerOwnUpdate.data[0] : null;
  if (
    customerOwnUpdate.response.ok &&
    ownUpdated?.rating === 4 &&
    ownUpdated?.title === `${runId} review updated`
  ) {
    pass("customer_can_update_own_review_fields", { reviewId: maskId(createdReview.id) });
  } else {
    fail("customer_can_update_own_review_fields", { status: customerOwnUpdate.response.status, data: customerOwnUpdate.data });
  }

  const customerReplyBlocked = await tablePatch(
    "business_reviews",
    `id=eq.${createdReview.id}`,
    { business_reply: "not allowed", business_reply_at: new Date().toISOString() },
    customerAToken
  );
  if (customerReplyBlocked.response.status >= 400) {
    pass("customer_cannot_update_business_reply_fields", { status: customerReplyBlocked.response.status });
  } else {
    const row = (await getRow("business_reviews", `id=eq.${createdReview.id}&select=business_reply,business_reply_at`))[0];
    if (!row?.business_reply) {
      pass("customer_cannot_update_business_reply_fields", { status: customerReplyBlocked.response.status, blockedBy: "unchanged_row" });
    } else {
      fail("customer_cannot_update_business_reply_fields", { status: customerReplyBlocked.response.status, row });
    }
  }

  const otherCustomerUpdate = await tablePatch(
    "business_reviews",
    `id=eq.${createdReview.id}`,
    { title: "other customer edit" },
    customerBToken
  );
  const afterOtherCustomer = (await getRow("business_reviews", `id=eq.${createdReview.id}&select=title`))[0];
  if (
    otherCustomerUpdate.response.status >= 400 ||
    afterOtherCustomer?.title !== "other customer edit"
  ) {
    pass("customer_cannot_update_another_customers_review", { status: otherCustomerUpdate.response.status });
  } else {
    fail("customer_cannot_update_another_customers_review", { status: otherCustomerUpdate.response.status, row: afterOtherCustomer });
  }

  const businessReplyAllowed = await tablePatch(
    "business_reviews",
    `id=eq.${createdReview.id}`,
    { business_reply: `${runId} owner reply`, business_reply_at: new Date().toISOString() },
    businessAToken
  );
  const repliedRow = Array.isArray(businessReplyAllowed.data) ? businessReplyAllowed.data[0] : null;
  if (businessReplyAllowed.response.ok && repliedRow?.business_reply === `${runId} owner reply`) {
    pass("business_owner_can_reply_to_own_review", { reviewId: maskId(createdReview.id) });
  } else {
    fail("business_owner_can_reply_to_own_review", { status: businessReplyAllowed.response.status, data: businessReplyAllowed.data });
  }

  const businessOwnerContentBlocked = await tablePatch(
    "business_reviews",
    `id=eq.${createdReview.id}`,
    { rating: 1, title: "owner edited title", body: "owner edited body" },
    businessAToken
  );
  const afterOwnerBlocked = (await getRow("business_reviews", `id=eq.${createdReview.id}&select=rating,title,body`))[0];
  if (
    businessOwnerContentBlocked.response.status >= 400 &&
    afterOwnerBlocked?.rating === 4
  ) {
    pass("business_owner_cannot_edit_customer_review_fields", { status: businessOwnerContentBlocked.response.status });
  } else {
    fail("business_owner_cannot_edit_customer_review_fields", { status: businessOwnerContentBlocked.response.status, row: afterOwnerBlocked });
  }

  const unrelatedBusinessReply = await tablePatch(
    "business_reviews",
    `id=eq.${createdReview.id}`,
    { business_reply: "other business reply" },
    businessBToken
  );
  const afterOtherBusiness = (await getRow("business_reviews", `id=eq.${createdReview.id}&select=business_reply`))[0];
  if (
    unrelatedBusinessReply.response.status >= 400 ||
    afterOtherBusiness?.business_reply !== "other business reply"
  ) {
    pass("unrelated_business_cannot_reply_to_other_business_review", { status: unrelatedBusinessReply.response.status });
  } else {
    fail("unrelated_business_cannot_reply_to_other_business_review", { status: unrelatedBusinessReply.response.status, row: afterOtherBusiness });
  }

  const convoRpc = await rpc("get_or_create_conversation", {
    p_customer_id: customerA.userId,
    p_business_id: businessA.userId,
  }, customerAToken);
  const conversationId = convoRpc.data;
  if (convoRpc.response.ok && conversationId) {
    state.createdConversationIds.push(conversationId);
    pass("customer_can_get_or_create_conversation", { conversationId: maskId(conversationId) });
  } else {
    throw new Error(`Failed get_or_create_conversation: ${convoRpc.text}`);
  }

  const longBody = `${runId} ` + "x".repeat(190);
  const sendCustomerMessage = await tableInsert("messages", {
    conversation_id: conversationId,
    sender_id: customerA.userId,
    recipient_id: businessA.userId,
    body: longBody,
  }, customerAToken);
  const customerMsg = Array.isArray(sendCustomerMessage.data) ? sendCustomerMessage.data[0] : null;
  if (sendCustomerMessage.response.ok && customerMsg?.id) {
    state.createdMessageIds.push(customerMsg.id);
    pass("participant_can_send_message", { messageId: maskId(customerMsg.id) });
  } else {
    throw new Error(`Failed sending customer message: ${sendCustomerMessage.text}`);
  }

  const conversationRow = (await getRow(
    "conversations",
    `id=eq.${conversationId}&select=id,last_message_preview,customer_unread_count,business_unread_count`
  ))[0];
  if (
    conversationRow?.last_message_preview &&
    conversationRow.last_message_preview.length === 140 &&
    conversationRow.business_unread_count >= 1
  ) {
    pass("last_message_preview_updates_and_truncates", {
      previewLength: conversationRow.last_message_preview.length,
      businessUnread: conversationRow.business_unread_count,
    });
  } else {
    fail("last_message_preview_updates_and_truncates", { row: conversationRow });
  }

  const businessUnreadBeforeRead = await rpc("unread_total", {
    p_role: "business",
    p_uid: businessA.userId,
  }, businessAToken);
  if (Number(businessUnreadBeforeRead.data || 0) >= 1) {
    pass("unread_total_returns_real_business_count", { count: Number(businessUnreadBeforeRead.data || 0) });
  } else {
    fail("unread_total_returns_real_business_count", { data: businessUnreadBeforeRead.data, status: businessUnreadBeforeRead.response.status });
  }

  const otherMarksRead = await rpc("mark_conversation_read", {
    conversation_id: conversationId,
  }, businessBToken);
  if (otherMarksRead.response.status >= 400) {
    pass("non_participant_cannot_mark_conversation_read", { status: otherMarksRead.response.status });
  } else {
    fail("non_participant_cannot_mark_conversation_read", { status: otherMarksRead.response.status, data: otherMarksRead.data });
  }

  const businessMarksRead = await rpc("mark_conversation_read", {
    conversation_id: conversationId,
  }, businessAToken);
  if (businessMarksRead.response.ok) {
    pass("participant_can_mark_conversation_read", { actor: "business_a" });
  } else {
    fail("participant_can_mark_conversation_read", { status: businessMarksRead.response.status, data: businessMarksRead.data });
  }

  const businessUnreadAfterRead = await rpc("unread_total", {
    p_role: "business",
    p_uid: businessA.userId,
  }, businessAToken);
  if (Number(businessUnreadAfterRead.data || 0) === 0) {
    pass("unread_total_drops_after_read", { count: 0 });
  } else {
    fail("unread_total_drops_after_read", { count: Number(businessUnreadAfterRead.data || 0) });
  }

  const sendBusinessMessage = await tableInsert("messages", {
    conversation_id: conversationId,
    sender_id: businessA.userId,
    recipient_id: customerA.userId,
    body: `${runId} business reply message`,
  }, businessAToken);
  const businessMsg = Array.isArray(sendBusinessMessage.data) ? sendBusinessMessage.data[0] : null;
  if (sendBusinessMessage.response.ok && businessMsg?.id) {
    state.createdMessageIds.push(businessMsg.id);
    pass("business_participant_can_send_message", { messageId: maskId(businessMsg.id) });
  } else {
    fail("business_participant_can_send_message", { status: sendBusinessMessage.response.status, data: sendBusinessMessage.data });
  }

  const customerUnreadBeforeRead = await rpc("unread_total", {
    p_role: "customer",
    p_uid: customerA.userId,
  }, customerAToken);
  if (Number(customerUnreadBeforeRead.data || 0) >= 1) {
    pass("unread_total_returns_real_customer_count", { count: Number(customerUnreadBeforeRead.data || 0) });
  } else {
    fail("unread_total_returns_real_customer_count", { count: Number(customerUnreadBeforeRead.data || 0) });
  }

  const customerMarksRead = await rpc("mark_conversation_read", {
    conversation_id: conversationId,
  }, customerAToken);
  if (customerMarksRead.response.ok) {
    pass("customer_participant_can_mark_read", { actor: "customer_a" });
  } else {
    fail("customer_participant_can_mark_read", { status: customerMarksRead.response.status, data: customerMarksRead.data });
  }

  const home = await fetch("http://127.0.0.1:3000/api/home-listings?city=Long%20Beach&state=CA&limit=5");
  home.ok ? pass("smoke_home_listings_200", { status: home.status }) : fail("smoke_home_listings_200", { status: home.status });

  const search = await fetch("http://127.0.0.1:3000/api/search?q=gift");
  search.ok ? pass("smoke_search_200", { status: search.status }) : fail("smoke_search_200", { status: search.status });

  const listings = await fetch("http://127.0.0.1:3000/listings");
  listings.ok ? pass("smoke_listings_200", { status: listings.status }) : fail("smoke_listings_200", { status: listings.status });

  const publicReviews = await fetch("http://127.0.0.1:3000/api/public-business-reviews?businessId=2b89dfb9-42e7-4101-a598-4dd966f22b88&limit=10");
  const publicReviewsData = publicReviews.ok ? await publicReviews.json() : null;
  const firstReview = Array.isArray(publicReviewsData?.reviews) ? publicReviewsData.reviews[0] : null;
  if (
    publicReviews.ok &&
    firstReview?.author_profile &&
    Object.prototype.hasOwnProperty.call(firstReview.author_profile, "display_name") &&
    Object.prototype.hasOwnProperty.call(firstReview.author_profile, "avatar_url")
  ) {
    pass("smoke_public_business_reviews_200_safe_profile_fields", { status: publicReviews.status });
  } else {
    fail("smoke_public_business_reviews_200_safe_profile_fields", { status: publicReviews.status, sample: firstReview || null });
  }
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  fail("script_error", { message: error.message });
} finally {
  await cleanup();
}

const summary = {
  projectRef,
  runId,
  identities: state.identities.map((item) => ({
    label: item.label,
    role: item.role,
    email: item.email,
    userIdPrefix: maskId(item.userId),
  })),
  created: {
    reviewIdPrefixes: state.createdReviewIds.map(maskId),
    conversationIdPrefixes: state.createdConversationIds.map(maskId),
    messageIdPrefixes: state.createdMessageIds.map(maskId),
  },
  results: state.results,
  cleanup: state.cleanup,
  productionReadyForTheseThree:
    state.results.every((item) => item.ok) &&
    state.cleanup.errors.length === 0,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(exitCode);
