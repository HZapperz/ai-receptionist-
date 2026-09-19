// STUB: manager. Plain layout that works; restyle it for the projector.
import { BookingsPanel } from "@/components/BookingsPanel";
import { InboxPanel } from "@/components/InboxPanel";
import { LeadsPanel } from "@/components/LeadsPanel";
import { ManagerChat } from "@/components/ManagerChat";
import { TracePanel } from "@/components/TracePanel";

export default function Dashboard() {
  return (
    <main className="grid h-screen grid-cols-2 grid-rows-2 gap-3 bg-zinc-50 p-3 dark:bg-black">
      <ManagerChat />
      <LeadsPanel />
      <div className="grid min-h-0 grid-cols-2 gap-3">
        <InboxPanel />
        <TracePanel />
      </div>
      <BookingsPanel />
    </main>
  );
}
