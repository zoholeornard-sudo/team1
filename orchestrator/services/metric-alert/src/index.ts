/**
 * metric-alert — bounded context service (ADR-0001, P5 of refinement plan)
 * Port: :3112
 *
 * Metrics-driven but actionable:
 * - Monitors MBO metrics against targets
 * - Emits MetricAlert when threshold breached
 * - Triggers concrete actions (ScopeChangeRequest, ReprioritizeTask)
 * - Ties every metric to a response
 */
import {
  IntentType,
  MetricAlertPayload,
  ScopeChangeRequestPayload,
} from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3112;
const SERVICE_NAME = "metric-alert";

// Configuration
const WARNING_THRESHOLD_PCT = Number(process.env.WARNING_THRESHOLD_PCT) || 80; // 80% of target
const CRITICAL_THRESHOLD_PCT = Number(process.env.CRITICAL_THRESHOLD_PCT) || 95; // 95% of target

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

// In-memory state for tracked metrics
interface MetricState {
  featureSlug: string;
  metricName: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  lastAlertAt?: string;
  alertCount: number;
}

// MBO metric definitions (loaded from metrics/mbo-targets.yaml in production)
const mboMetrics: Map<string, Array<{ name: string; target: string; unit: string }>> = new Map([
  ["SaaS Development Unit", [
    { name: "uptime", target: "99.9", unit: "percent" },
    { name: "api_response", target: "200", unit: "ms" },
    { name: "bug_escape_rate", target: "5", unit: "percent" },
  ]],
  ["Cloud Infrastructure Unit", [
    { name: "cost_utilization", target: "95", unit: "percent" },
    { name: "provisioning_time", target: "30", unit: "seconds" },
  ]],
  ["Security & Compliance Unit", [
    { name: "critical_vulns", target: "0", unit: "count" },
    { name: "ir_response_time", target: "60", unit: "minutes" },
  ]],
]);

const trackedMetrics: Map<string, MetricState> = new Map();
const alertHistory: MetricAlertPayload[] = [];

// --- Intent emission (stub — will use Redis in production) ---

function emitIntent<T extends IntentType>(type: T, payload: any) {
  const envelope = {
    type,
    idempotencyKey: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    featureSlug: payload.featureSlug || "unknown",
    timestamp: new Date().toISOString(),
    payload,
  };
  console.log(`[${SERVICE_NAME}] Emitting intent: ${type}`, JSON.stringify(envelope, null, 2));
  return envelope;
}

// --- Metric evaluation ---

function parseTarget(target: string): { value: number; operator: "lt" | "lte" | "gt" | "gte" | "eq" } {
  const trimmed = target.trim();

  if (trimmed.startsWith("<=")) return { value: parseFloat(trimmed.slice(2)), operator: "lte" };
  if (trimmed.startsWith(">=")) return { value: parseFloat(trimmed.slice(2)), operator: "gte" };
  if (trimmed.startsWith("<")) return { value: parseFloat(trimmed.slice(1)), operator: "lt" };
  if (trimmed.startsWith(">")) return { value: parseFloat(trimmed.slice(1)), operator: "gt" };
  return { value: parseFloat(trimmed), operator: "eq" };
}

function isOnTarget(current: number, target: string): boolean {
  const { value, operator } = parseTarget(target);
  switch (operator) {
    case "lt": return current < value;
    case "lte": return current <= value;
    case "gt": return current > value;
    case "gte": return current >= value;
    case "eq": return current === value;
  }
}

function getThreshold(current: number, target: string): "ok" | "warning" | "critical" {
  const { value, operator } = parseTarget(target);

  // For "higher is better" metrics (uptime, cost_utilization)
  if (operator === "gte" || operator === "gt") {
    const pct = (current / value) * 100;
    if (pct >= WARNING_THRESHOLD_PCT) return "ok";
    if (pct >= CRITICAL_THRESHOLD_PCT) return "warning";
    return "critical";
  }

  // For "lower is better" metrics (api_response, bug_escape_rate, provisioning_time)
  if (operator === "lte" || operator === "lt") {
    const pct = (current / value) * 100;
    if (pct <= WARNING_THRESHOLD_PCT) return "ok";
    if (pct <= CRITICAL_THRESHOLD_PCT) return "warning";
    return "critical";
  }

  return "ok";
}

function evaluateMetric(featureSlug: string, metricName: string, currentValue: number): MetricAlertPayload | null {
  // Find MBO target
  let target: string | null = null;
  let unit = "";

  for (const [, metrics] of mboMetrics) {
    const metric = metrics.find(m => m.name === metricName);
    if (metric) {
      target = metric.target;
      unit = metric.unit;
      break;
    }
  }

  if (!target) return null;

  const threshold = getThreshold(currentValue, target);

  if (threshold === "ok") return null;

  const alert: MetricAlertPayload = {
    featureSlug,
    metricName,
    currentValue: `${currentValue}${unit === "percent" ? "%" : ""}`,
    targetValue: target,
    threshold,
    recommendedAction: threshold === "critical" ? "scope_change" : "reprioritize_task",
  };

  alertHistory.push(alert);
  emitIntent("MetricAlert", alert);

  // Trigger concrete action for critical alerts
  if (threshold === "critical") {
    const scopeChange: ScopeChangeRequestPayload = {
      workflowId: `wf-${featureSlug}`,
      requestedBy: "metric-alert",
      changeType: "modify_acceptance",
      details: {
        metricName,
        currentValue,
        target,
        reason: `Critical metric breach: ${metricName} at ${currentValue}, target ${target}`,
      },
    };
    emitIntent("ScopeChangeRequest", scopeChange);
  }

  return alert;
}

// --- HTTP API ---

async function submitMetric(req: Request): Promise<Response> {
  const body = await req.json() as {
    featureSlug: string;
    metricName: string;
    currentValue: number;
  };

  const alert = evaluateMetric(body.featureSlug, body.metricName, body.currentValue);

  // Track metric state
  const key = `${body.featureSlug}:${body.metricName}`;
  const existing = trackedMetrics.get(key);
  if (existing) {
    existing.currentValue = body.currentValue;
    existing.lastAlertAt = alert ? new Date().toISOString() : existing.lastAlertAt;
    existing.alertCount += alert ? 1 : 0;
  } else {
    trackedMetrics.set(key, {
      featureSlug: body.featureSlug,
      metricName: body.metricName,
      currentValue: body.currentValue,
      targetValue: "",
      unit: "",
      alertCount: alert ? 1 : 0,
      lastAlertAt: alert ? new Date().toISOString() : undefined,
    });
  }

  return Response.json({
    success: true,
    featureSlug: body.featureSlug,
    metricName: body.metricName,
    alertTriggered: !!alert,
    alert,
  });
}

async function getAlerts(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");
  const threshold = url.searchParams.get("threshold");

  let filtered = alertHistory;
  if (featureSlug) {
    filtered = filtered.filter(a => a.featureSlug === featureSlug);
  }
  if (threshold) {
    filtered = filtered.filter(a => a.threshold === threshold);
  }

  return Response.json({
    alerts: filtered,
    count: filtered.length,
    critical: filtered.filter(a => a.threshold === "critical").length,
    warning: filtered.filter(a => a.threshold === "warning").length,
  });
}

async function getTrackedMetrics(req: Request): Promise<Response> {
  const metrics = Array.from(trackedMetrics.values());
  return Response.json({
    metrics,
    count: metrics.length,
    atRisk: metrics.filter(m => m.alertCount > 0).length,
  });
}

async function registerMboMetrics(req: Request): Promise<Response> {
  const body = await req.json() as {
    unit: string;
    metrics: Array<{ name: string; target: string; unit: string }>;
  };

  mboMetrics.set(body.unit, body.metrics);
  return Response.json({
    success: true,
    unit: body.unit,
    metricsCount: body.metrics.length,
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        return Response.json({
          service: SERVICE_NAME,
          status: "ok",
          port: PORT,
          warningThresholdPct: WARNING_THRESHOLD_PCT,
          criticalThresholdPct: CRITICAL_THRESHOLD_PCT,
          trackedMetrics: trackedMetrics.size,
          totalAlerts: alertHistory.length,
          criticalAlerts: alertHistory.filter(a => a.threshold === "critical").length,
        });
      }

      if (url.pathname === "/metric" && req.method === "POST") {
        return submitMetric(req);
      }

      if (url.pathname === "/alerts" && req.method === "GET") {
        return getAlerts(req);
      }

      if (url.pathname === "/metrics" && req.method === "GET") {
        return getTrackedMetrics(req);
      }

      if (url.pathname === "/mbo/register" && req.method === "POST") {
        return registerMboMetrics(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);