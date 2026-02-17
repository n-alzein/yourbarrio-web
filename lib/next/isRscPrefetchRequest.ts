import { isRscFlightRequest } from "@/lib/next/requestKind";

export async function isRscPrefetchRequest() {
  return isRscFlightRequest();
}
