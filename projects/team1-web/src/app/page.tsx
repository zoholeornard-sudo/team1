import Link from "next/link";
import { listFeatures, listAgents, checkAllServices, MBO_TARGETS } from "@/lib/orchestrator";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let features: Array<{ featureSlug: string; status: string; description: string; units: string[]; createdAt: string }> = [];
  let agents: Array<{ instanceId: string; personaHandle: string; featureSlug: string; status: string }> = [];
  let services: Array<{ name: string; port: number; status: string }> = [];

  try {
    const [featuresRes, agentsRes, servicesRes] = await Promise.allSettled([
      listFeatures(),
      listAgents(),
      checkAllServices(),
    ]);

    if (featuresRes.status === "fulfilled") features = featuresRes.value.features ?? [];
    if (agentsRes.status === "fulfilled") agents = (agentsRes.value as { agents?: typeof agents }).agents ?? [];
    if (servicesRes.status === "fulfilled") services = servicesRes.value;
  } catch {
    // Services may not be running yet; show empty state
  }

  const okServices = services.filter((s) => s.status === "ok").length;
  const degradedServices = services.filter((s) => s.status === "degraded").length;
  const downServices = services.filter((s) => s.status === "down").length;

  const activeFeatures = features.filter((f) => f.status === "active").length;
  const activeAgents = agents.filter((a) => a.status === "active").length;

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Dashboard"
        description="Real-time overview of the team1 orchestrator platform"
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Features"
          value={features.length}
          accent="brand"
          trend={activeFeatures > 0 ? { direction: "up", label: `${activeFeatures} active` } : undefined}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
            </svg>
          }
        />
        <StatCard
          label="Agent Instances"
          value={agents.length}
          accent="success"
          trend={activeAgents > 0 ? { direction: "up", label: `${activeAgents} active` } : undefined}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
            </svg>
          }
        />
        <StatCard
          label="Services Healthy"
          value={services.length > 0 ? `${okServices}/${services.length}` : "—"}
          accent={downServices > 0 ? "critical" : degradedServices > 0 ? "warning" : "success"}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7" />
            </svg>
          }
        />
        <StatCard
          label="MBO Units"
          value={MBO_TARGETS.length}
          accent="info"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.12125Z" />
            </svg>
          }
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Features */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Features</h2>
            <Link href="/features" className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              View all →
            </Link>
          </div>
          {features.length === 0 ? (
            <EmptyState
              title="No features yet"
              description="Submit a feature to spawn agent instances and begin the rollout lifecycle."
              action={
                <Link href="/features/new" className="btn-primary">Submit Feature</Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800" role="list">
              {features.slice(0, 5).map((f) => (
                <li key={f.featureSlug} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/features/${f.featureSlug}`}
                      className="text-sm font-medium text-slate-900 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400 truncate block"
                    >
                      {f.featureSlug}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{f.description}</p>
                  </div>
                  <StatusBadge status={f.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Service Health */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Service Health</h2>
            <Link href="/services" className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              View all →
            </Link>
          </div>
          {services.length === 0 ? (
            <EmptyState
              title="Services unreachable"
              description="The orchestrator services may not be started. Run `bun --filter './services/*' dev` to boot them."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800" role="list">
              {services.slice(0, 6).map((s) => (
                <li key={s.name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">:{s.port}</p>
                  </div>
                  <StatusBadge status={s.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* MBO Units overview */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">MBO Units</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MBO_TARGETS.map((unit) => (
            <div
              key={unit.unit}
              className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"
            >
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{unit.unit}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{unit.objective}</p>
              <p className="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">{unit.metrics.length} metrics</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
