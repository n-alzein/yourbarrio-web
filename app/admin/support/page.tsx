import { redirect } from "next/navigation";

export default function AdminSupportPageDisabled() {
  redirect("/admin?error=support-section-disabled");
}
