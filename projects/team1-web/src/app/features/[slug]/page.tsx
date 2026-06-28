import Link from "next/link";
import { notFound } from "next/navigation";
import { getFeature } from "@/lib/orchestrator";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionHeader } from "@/components/SectionHeader";

export const dynamic = "force-dynamic";

export default async function FeatureDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  let feature: {
    featureSlug: string;
    description: string;
    requestingManager: string;
    units: string[];
    status: string;
    createdAt: string;
    instances: Array<{
      instanceId: string;
      personaHandle: string;
      branch: string;
      status: string;
    }>;
  } | null = null;

  try {
    feature = await getFeature(params.slug);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link href="/features" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to Features
      </Link>

      <SectionHeader
        title={feature.featureSlug}
        description={feature.description}
        action={<StatusBadge status={feature.status} />}
      />

      {/* Metadata */}
      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Details</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Manager</dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">{feature.requestingManager}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Created</dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
              {new Date(feature.createdAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Units</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {feature.units.map((u) => (
                <span key={u} className="badge-neutral text-xs">{u}</span>
              ))}
            </dd>
          </div>
        </dl>
      </div>

      {/* Agent Instances */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Agent Instances ({feature.instances?.length ?? 0})
        </h2>
        {feature.instances && feature.instances.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Instance</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Persona</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 hidden md:table-cell">Branch</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {feature.instances.map((inst) => (
                  <tr key={inst.instanceId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100">{inst.instanceId}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{inst.personaHandle}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-500 hidden md:table-cell">{inst.branch}</td>
                    <td className="px-3 py-2"><StatusBadge status={inst.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No agent instances spawned yet.</p>
        )}
      </section>
    </div>
  );
}
