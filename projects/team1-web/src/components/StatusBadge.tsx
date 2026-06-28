interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_STYLES: Record<string, string> = {
  ok: "badge-ok",
  active: "badge-ok",
  done: "badge-ok",
  completed: "badge-ok",
  success: "badge-ok",
  spawning: "badge-warn",
  launching: "badge-warn",
  in_progress: "badge-warn",
  pending: "badge-neutral",
  ready: "badge-neutral",
  submitted: "badge-neutral",
  needs_review: "badge-neutral",
  degraded: "badge-warn",
  stalled: "badge-critical",
  blocked: "badge-critical",
  failed: "badge-critical",
  down: "badge-critical",
  reaped: "badge-neutral",
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "badge-neutral";
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "";

  return (
    <span className={`${style} ${sizeClass}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
