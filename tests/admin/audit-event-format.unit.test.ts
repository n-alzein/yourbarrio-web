import { describe, expect, it } from "vitest";
import {
  formatAuditActorDisplay,
  formatAuditEvent,
  formatAuditTargetDisplay,
  type AdminAuditRow,
} from "@/lib/admin/auditEventFormat";

const baseRow: AdminAuditRow = {
  id: "11111111-1111-1111-1111-111111111111",
  created_at: new Date().toISOString(),
  actor_user_id: "22222222-2222-2222-2222-222222222222",
  actor_name: "Jane Admin",
  actor_email: "jane@example.com",
  action: "user_internal_note_deleted",
  target_type: "user",
  target_id: "33333333-3333-3333-3333-333333333333",
  target_name: "Target User",
  target_email: "target@example.com",
  target_label: "Target User <target@example.com>",
  meta: {
    admin_user_note_id: "44444444-4444-4444-4444-444444444444",
    deleted_by_super: true,
  },
};

describe("formatAuditEvent", () => {
  it("formats known note-delete events with human summary and details", () => {
    const formatted = formatAuditEvent(baseRow);

    expect(formatted.title).toBe("Internal note deleted");
    expect(formatted.summary).toBe("Deleted an internal note");
    expect(formatted.details).toEqual([
      { label: "Deleted by super admin", value: "Yes" },
      { label: "Note ID", value: "44444444-4444-4444-4444-444444444444" },
    ]);
  });

  it("handles unknown actions gracefully", () => {
    const formatted = formatAuditEvent({
      ...baseRow,
      action: "something_new_happened",
      meta: { ticket_id: "abc-123", reason: "manual" },
    });

    expect(formatted.title).toBe("something_new_happened");
    expect(formatted.summary).toBe("something_new_happened");
    expect(formatted.details.some((detail) => detail.label === "ticket id")).toBe(true);
  });
});

describe("audit display helpers", () => {
  it("prefers full name and email for actor display", () => {
    expect(formatAuditActorDisplay(baseRow)).toBe("Jane Admin - jane@example.com");
  });

  it("uses target labels for non-user targets", () => {
    expect(
      formatAuditTargetDisplay({
        ...baseRow,
        target_type: "business",
        target_label: "business: Acme Bikes",
        target_name: null,
        target_email: null,
      })
    ).toBe("business: Acme Bikes");
  });
});
