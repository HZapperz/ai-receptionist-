import { PageHeader } from "@/components/dashboard/PageHeader";
import { TasksPanel } from "@/components/dashboard/TasksPanel";
import { TracePanel } from "@/components/TracePanel";

export default function ActivityPage() {
  return (
    <div className="flex flex-col gap-5 p-6 lg:h-full">
      <PageHeader
        title="Activity"
        description="Every tool call, reply and error as it happens, and the tasks the agents hand to each other."
      />
      <div className="grid gap-4 max-lg:*:h-[32rem] lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[minmax(0,1fr)]">
        <TracePanel filters />
        <TasksPanel />
      </div>
    </div>
  );
}
