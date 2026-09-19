import { InboxView } from "@/components/dashboard/InboxView";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <PageHeader
        title="Inbox"
        description="Every conversation the AI handled on the demo line. Real customers' texts go straight to the team and never show up here."
      />
      <InboxView linked={m} />
    </div>
  );
}
