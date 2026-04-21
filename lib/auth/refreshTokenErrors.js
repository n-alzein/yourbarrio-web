export function isRefreshTokenAlreadyUsedError(error) {
  if (!error) return false;
  if (error?.code === "refresh_token_already_used") return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("refresh_token_already_used");
}
