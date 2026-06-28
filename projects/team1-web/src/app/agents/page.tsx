import { listAgents } from "@/lib/orchestrator";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface AgentRecord {
  instanceId: string;
  personaHandle: string;
  featureSlug: string;
  branch: string;
  status: string;
  activeTurns: number;
  pendingIntents: number;
  lastHeartbeatAt: string;
  createdAt: string;
}

export default async function AgentsPage() {
  let agents: AgentRecord[] = [];

  try {
    const res = await listAgents() as { agents?: AgentRecord[] };
    agents = res?.agents ?? [];
  } catch (_e) {
    // Services unavailable
  }

  const byPersona = new Map<string, number>();
  agents.forEach((a) => {
    byPersona.set(a.personaHandle, (byPersona.get(a.personaHandle) ?? 0) + 1);
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Agent Registry"
        description={`${agents.length} instance${agents.length !== 1 ? "s" : ""} across ${byPersona.size} persona${byPersona.size !== 1 ? "s" : ""}`}
      />

      {byPersona.size > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">By Persona</h2>
          <div className="flex flex-wrap gap-2">
            {Array.from(byPersona.entries()).map(([handle, count]) => (
              <span key={handle} className="badge-neutral">
                {handle} <span className="ml-1 font-bold">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <EmptyState
          title="No agent instances"
          description="Agent instances appear here when a feature is submitted and agents are spawned by the orchestrator."
          icon={
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
            </svg>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Instance</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 hidden md:table-cell">Feature</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 hidden lg:table-cell">Branch</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {agents.map((a) => (
                <tr key={a.instanceId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{a.instanceId}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{a.personaHandle}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-slate-600 dark:text-slate-400">{a.featureSlug}</td>
                  <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-slate-500 dark:text-slate-500">{a.branch}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
