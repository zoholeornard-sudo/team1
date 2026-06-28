interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  accent?: "brand" | "success" | "warning" | "critical" | "info";
}

const ACCENT_COLORS: Record<string, string> = {
  brand: "text-brand-600 dark:text-brand-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
};

export function StatCard({ label, value, icon, trend, accent = "brand" }: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${ACCENT_COLORS[accent]}`}>{value}</p>
          {trend && (
            <p className={`mt-1 text-xs font-medium ${
              trend.direction === "up" ? "text-emerald-600 dark:text-emerald-400" :
              trend.direction === "down" ? "text-red-600 dark:text-red-400" :
              "text-slate-500 dark:text-slate-400"
            }`}>
              {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className={`rounded-lg bg-slate-100 p-2 dark:bg-slate-800 ${ACCENT_COLORS[accent]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
