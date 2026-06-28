import { MBO_TARGETS } from "@/lib/orchestrator";
import { SectionHeader } from "@/components/SectionHeader";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";

export default function MetricsPage() {
  const totalMetrics = MBO_TARGETS.reduce((sum, u) => sum + u.metrics.length, 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="MBO Metrics"
        description={`${totalMetrics} metrics across ${MBO_TARGETS.length} units — aligned with metrics/mbo-targets.yaml`}
      />

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Units" value={MBO_TARGETS.length} accent="brand" />
        <StatCard label="Total Metrics" value={totalMetrics} accent="info" />
        <StatCard label="Rollout Gates" value={MBO_TARGETS.length * 2} accent="success" />
      </div>

      {/* Per-unit breakdown */}
      {MBO_TARGETS.map((unit) => (
        <section key={unit.unit} className="card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{unit.unit}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{unit.objective}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Metric</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Target</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 hidden sm:table-cell">Measurement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {unit.metrics.map((m) => (
                  <tr key={m.name}>
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{m.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-brand-600 dark:text-brand-400">{m.target}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{m.measurement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
