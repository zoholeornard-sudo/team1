"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitFeature } from "@/lib/orchestrator";

const UNITS = [
  "SaaS Development Unit",
  "Mobile Development Unit",
  "Web Development Unit",
  "Desktop Development Unit",
  "Cloud Infrastructure Unit",
  "ML/Ops Unit",
  "AI Research Unit",
  "Data Science Unit",
  "Security & Compliance Unit",
];

const MANAGERS = [
  "@saas-delivery-manager",
  "@mobile-platform-manager",
  "@web-delivery-manager",
  "@desktop-solutions-manager",
  "@cloud-operations-manager",
  "@mlops-manager",
  "@research-innovation-manager",
  "@data-science-manager",
  "@security-compliance-manager",
];

export default function NewFeaturePage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [manager, setManager] = useState(MANAGERS[0]);
  const [units, setUnits] = useState<string[]>(["SaaS Development Unit"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleUnit(unit: string) {
    setUnits((prev) =>
      prev.includes(unit) ? prev.filter((u) => u !== unit) : [...prev, unit],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await submitFeature({
        description,
        requestingManager: manager,
        units,
      });
      router.push(`/features/${result.featureSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feature");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Submit Feature</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Mint a globally-unique feature slug and begin the rollout lifecycle.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Description */}
        <div>
          <label htmlFor="description" className="label">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={3}
            className="input resize-none"
            placeholder="Describe the feature to be built…"
          />
        </div>

        {/* Manager */}
        <div>
          <label htmlFor="manager" className="label">Requesting Manager</label>
          <select
            id="manager"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            className="input"
          >
            {MANAGERS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Units */}
        <div>
          <span className="label">Involved Units</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {UNITS.map((unit) => {
              const checked = units.includes(unit);
              return (
                <label
                  key={unit}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    checked
                      ? "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUnit(unit)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {unit}
                </label>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400" role="alert">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || !description.trim() || units.length === 0}
          >
            {submitting ? "Submitting…" : "Submit Feature"}
          </button>
        </div>
      </form>
    </div>
  );
}
