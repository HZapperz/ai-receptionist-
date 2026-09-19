import { KpiStrip } from "@/components/dashboard/KpiStrip";
import { OverviewPanels } from "@/components/dashboard/OverviewPanels";
import { PageHeader } from "@/components/dashboard/PageHeader";

// The demo screen: fits a 1440x900 projector with no page scroll. Each panel scrolls on its own.
// Below lg the panels stack at a fixed height and the page scrolls instead.
// The manager chat has its own page (/dashboard/manager); leads have theirs (/dashboard/leads).
export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-4 p-5 lg:h-full">
      <PageHeader title="Overview" description="Who is texting, what the AI did about it, and what needs you. Updates live." />
      <KpiStrip />
      <OverviewPanels />
    </div>
  );
}
