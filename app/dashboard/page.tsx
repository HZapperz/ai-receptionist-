import { BookingsPanel } from "@/components/BookingsPanel";
import { KpiStrip } from "@/components/dashboard/KpiStrip";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InboxPanel } from "@/components/InboxPanel";
import { LeadsPanel } from "@/components/LeadsPanel";
import { ManagerChat } from "@/components/ManagerChat";
import { TracePanel } from "@/components/TracePanel";

// The demo screen: fits a 1440x900 projector with no page scroll. Each panel scrolls on its own.
// Below lg the panels stack at a fixed height and the page scrolls instead.
export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-4 p-5 lg:h-full">
      <PageHeader title="Overview" description="What your AI team is doing today, updating live." />
      <KpiStrip />
      <div className="grid gap-4 max-lg:*:h-[26rem] lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <ManagerChat />
        <LeadsPanel />
        <div className="grid min-h-0 gap-4 sm:grid-cols-2 sm:grid-rows-[minmax(0,1fr)]">
          <InboxPanel />
          <TracePanel />
        </div>
        <BookingsPanel />
      </div>
    </div>
  );
}
