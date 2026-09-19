import { PageHeader } from "@/components/dashboard/PageHeader";
import { LeadsPanel } from "@/components/LeadsPanel";

export default function LeadsPage() {
  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <PageHeader
        title="Leads"
        description="Partners the outbound agent found and wrote to. Open one to read the draft; nothing is emailed until you click Send."
      />
      <LeadsPanel className="flex-1" />
    </div>
  );
}
