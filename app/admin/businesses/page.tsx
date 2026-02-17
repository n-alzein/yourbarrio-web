import AccountsList from "@/app/admin/_components/AccountsList";

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  return (
    <AccountsList
      title="Businesses"
      description="Business accounts only."
      basePath="/admin/businesses"
      searchParams={params}
      presetRole="business"
      showVerificationQueueBanner={false}
    />
  );
}
