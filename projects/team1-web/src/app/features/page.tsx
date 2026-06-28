import Link from "next/link";
import { listFeatures } from "@/lib/orchestrator";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function FeaturesPage() {
  let features: Array<{
    featureSlug: string;
    description: string;
    requestingManager: string;
    units: string[];
    status: string;
    createdAt: string;
    instances: Array<{ instanceId: string; personaHandle: string; status: string }>;
  }> = [];

  try {
    const res = await listFeatures();
    features = res.features ?? [];
  } catch (_e) {
    // Services unavailable
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Features"
        description={`${features.length} feature${features.length !== 1 ? "s" : ""} submitted to the orchestrator`}
        action={
          <Link href="/features/new" className="btn-primary">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Feature
          </Link>
        }
      />

      {features.length === 0 ? (
        <EmptyState
          title="No features submitted yet"
          description="Features are submitted by unit managers. Each feature mints a globally-unique slug and spawns agent instances across the involved units."
          action={<Link href="/features/new" className="btn-primary">Submit First Feature</Link>}
          icon={
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
            </svg>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Feature</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 hidden md:table-cell">Units</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 hidden sm:table-cell">Agents</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {features.map((f) => (
                <tr key={f.featureSlug} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/features/${f.featureSlug}`}
                      className="font-medium text-slate-900 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
                    >
                      {f.featureSlug}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{f.description}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {f.units.map((u) => (
                        <span key={u} className="badge-neutral text-xs">{u}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-600 dark:text-slate-400">
                    {f.instances?.length ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={f.status} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
