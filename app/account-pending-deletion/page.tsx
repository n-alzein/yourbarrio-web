import { redirect } from "next/navigation";

export default function AccountPendingDeletionPage() {
  redirect("/account-deleted");
}
