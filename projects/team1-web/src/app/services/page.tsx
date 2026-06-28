import { checkAllServices, SERVICES } from "@/lib/orchestrator";
import { StatCard } from "@/components/StatCard";
import { SectionHeader } from "@/components/SectionHeader";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const rawServices = await checkAllServices();
  const services = rawServices.map((s) => {
    const svc = SERVICES.find((x) => x.port === s.port);
    return { ...s, description: svc?.description ?? "" };
  });

  const ok = services.filter((s) => s.status === "ok").length;
  const degraded = services.filter((s) => s.status === "degraded").length;
  const down = services.filter((s) => s.status === "down").length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Service Health"
        description="Real-time health checks for all 13 orchestrator bounded-context services"
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Healthy" value={ok} accent="success" />
        <StatCard label="Degraded" value={degraded} accent="warning" />
        <StatCard label="Down" value={down} accent="critical" />
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((svc) => (
          <div key={svc.name} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{svc.name}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">:{svc.port}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 truncate">{svc.description}</p>
              </div>
              <div className={`h-3 w-3 rounded-full flex-shrink-0 mt-1 ${
                svc.status === "ok" ? "bg-emerald-500" :
                svc.status === "degraded" ? "bg-amber-500" :
                "bg-red-500"
              }`} aria-label={`Status: ${svc.status}`} />
            </div>
            <div className="mt-3">
              <span className={`badge ${
                svc.status === "ok" ? "badge-ok" :
                svc.status === "degraded" ? "badge-warn" :
                "badge-critical"
              }`}>
                {svc.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Architecture note */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Architecture</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Services communicate via Redis streams (ADR-0002). Each service is a bounded context with its own
          data store and intent emission contract. The orchestrator-api (:3099) is the REST entry point;
          the runtime (:3100) manages agent sessions via the polling model (ADR-0004).
        </p>
      </div>
    </div>
  );
}
