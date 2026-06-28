import { listWorkflows } from "@/lib/orchestrator";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  let workflows: Array<{
    workflowId: string;
    featureSlug: string;
    status: string;
    createdAt?: string;
  }> = [];

  try {
    const res = await listWorkflows();
    workflows = (res as { workflows?: typeof workflows }).workflows ?? [];
  } catch (_e) {
    // Services unavailable
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Workflows"
        description="Workflow task decomposition and state management from the workflow service (:3108)"
      />

      {workflows.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          description="Workflows are created when features are submitted. Each workflow decomposes into phase-gated tasks assigned to agent instances."
          icon={
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Workflow ID</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 hidden md:table-cell">Feature</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {workflows.map((w) => (
                <tr key={w.workflowId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">{w.workflowId}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-600 dark:text-slate-400">{w.featureSlug}</td>
                  <td className="px-4 py-3"><StatusBadge status={w.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
