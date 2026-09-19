import { PageHeader } from "@/components/dashboard/PageHeader";
import { ManagerChat } from "@/components/ManagerChat";

export default function ManagerPage() {
  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <PageHeader title="Manager" description="Ask what happened, or hand work to the team. The manager reads everything and delegates through tasks." />
      {/* ManagerChat belongs to the manager lane; stretch whatever it renders to the full height. */}
      <div className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1">
        <ManagerChat />
      </div>
    </div>
  );
}
