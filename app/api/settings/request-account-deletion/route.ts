import { handleRequestAccountDeletion } from "@/lib/accountDeletion/requestDeletion";

export async function POST(request: Request) {
  return handleRequestAccountDeletion(request);
}
