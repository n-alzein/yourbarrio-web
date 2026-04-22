import { describe, expect, it } from "vitest";
import { __normalizeSupabaseAuthStorageValue } from "@/lib/supabaseClient";

const storageKey = "sb-testproject-auth-token";

function session() {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    user: {
      id: "user-1",
      email: "user@example.com",
    },
  };
}

describe("Supabase auth storage normalization", () => {
  it("leaves a normal serialized session untouched", () => {
    const value = JSON.stringify(session());

    expect(__normalizeSupabaseAuthStorageValue(value, storageKey)).toEqual({
      value,
      changed: false,
      clear: false,
      reason: null,
    });
  });

  it("repairs a double-serialized session before Supabase recovers it", () => {
    const inner = JSON.stringify(session());
    const value = JSON.stringify(inner);

    expect(__normalizeSupabaseAuthStorageValue(value, storageKey)).toEqual({
      value: inner,
      changed: true,
      clear: false,
      reason: "double_serialized_session",
    });
  });

  it("clears malformed persisted auth state safely", () => {
    expect(__normalizeSupabaseAuthStorageValue("{not-json", storageKey)).toEqual({
      value: null,
      changed: true,
      clear: true,
      reason: "malformed_json",
    });
  });

  it("ignores unrelated storage keys", () => {
    expect(__normalizeSupabaseAuthStorageValue("{not-json", "yb-location")).toEqual({
      value: "{not-json",
      changed: false,
      clear: false,
      reason: null,
    });
  });
});
