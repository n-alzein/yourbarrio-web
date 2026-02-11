export default async function AdminFlash({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const resolved = searchParams ? await Promise.resolve(searchParams) : {};
  const ok = typeof resolved?.ok === "string" ? resolved.ok : "";
  const err = typeof resolved?.err === "string" ? resolved.err : "";
  const success = ok || (typeof resolved?.success === "string" ? resolved.success : "");
  const error = err || (typeof resolved?.error === "string" ? resolved.error : "");
  const successMessage = ({
    case_taken: "Case moved to in_review.",
    updated: "Moderation flag updated.",
    hidden_and_resolved: "Target hidden and flag resolved.",
  } as Record<string, string>)[success] || success;
  const errorMessage = error;

  if (!successMessage && !errorMessage) return null;

  return (
    <div className="space-y-2">
      {successMessage ? (
        <div className="rounded-md border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-200">
          {successMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-md border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
