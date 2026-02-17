import "server-only";

import { redirect } from "next/navigation";
import { canUseServerRedirect } from "@/lib/next/requestKind";

export async function redirectIfAllowed(targetPath: string): Promise<boolean> {
  if (!(await canUseServerRedirect())) return false;
  redirect(targetPath);
  return true;
}
