import { handleFinalizeOverdueDeletions } from "../_shared/finalize-overdue-deletions.ts";

Deno.serve((req) => handleFinalizeOverdueDeletions(req));
