/**
 * Orchestrator API client layer.
 *
 * Connects to the team1 orchestrator bounded-context services:
 *   - orchestrator-api  :3099  (features, spawning)
 *   - agent-registry    :3107  (agent instances, ledger)
 *   - workflow          :3108  (workflow tasks, state)
 *   - metric-alert      :3112  (MBO metrics, alerts)
 *
 * In production these are direct calls; in the browser they route
 * through Next.js rewrites (see next.config.mjs).
 */

const ORCHESTRATOR_API = "/api/orchestrator";
const AGENT_REGISTRY = "/api/registry";
const WORKFLOW_API = "/api/workflow";
const METRIC_API = "/api/metrics";

// ── Types ──────────────────────────────────────────────────────────

export interface FeatureRecord {
  featureSlug: string;
  description: string;
  requestingManager: string;
  units: string[];
  status: "submitted" | "spawning" | "active" | "completed";
  instances: AgentInstance[];
  createdAt: string;
}

export interface AgentInstance {
  instanceId: string;
  personaHandle: string;
  branch: string;
  status: "launching" | "active" | "stalled" | "reaped";
}

export interface AgentInstanceRecord extends AgentInstance {
  featureSlug: string;
  activeTurns: number;
  pendingIntents: number;
  lastHeartbeatAt: string;
  createdAt: string;
}

export interface WorkflowTask {
  taskId: string;
  workflowId: string;
  taskOrder: number;
  phase: string;
  description: string;
  acceptanceCriteria: string[];
  mboMetrics: { name: string; target: string }[];
  assignedInstance: string;
  state: "pending" | "ready" | "in_progress" | "done" | "blocked" | "needs_review";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface MetricState {
  featureSlug: string;
  metricName: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  lastAlertAt?: string;
  alertCount: number;
}

export interface ServiceHealth {
  service: string;
  status: "ok" | "degraded" | "down";
  port: number;
  featuresTracked?: number;
  redis?: string;
}

export interface MboTarget {
  name: string;
  target: string;
  measurement: string;
  notes?: string;
}

export interface UnitMbo {
  unit: string;
  objective: string;
  metrics: MboTarget[];
}

// ── Service registry ───────────────────────────────────────────────

export const SERVICES = [
  { name: "orchestrator-api", port: 3099, description: "Feature submission, slug minting" },
  { name: "runtime", port: 3100, description: "Agent session supervisor" },
  { name: "task-management", port: 3101, description: "Task lifecycle tracking" },
  { name: "event-coordination", port: 3102, description: "Event bus coordination" },
  { name: "session-management", port: 3103, description: "Agent session state" },
  { name: "lifecycle-management", port: 3104, description: "Phase gate evaluation" },
  { name: "edit-coordinator", port: 3106, description: "Branch edit coordination" },
  { name: "agent-registry", port: 3107, description: "Instance ledger, personas" },
  { name: "workflow", port: 3108, description: "Workflow task persistence" },
  { name: "manager-loop", port: 3109, description: "Manager coordination loop" },
  { name: "review-scheduler", port: 3110, description: "Review cycle scheduling" },
  { name: "conflict-detector", port: 3111, description: "Conflict detection" },
  { name: "metric-alert", port: 3112, description: "MBO metric monitoring" },
] as const;

// ── API helpers ────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Feature APIs ───────────────────────────────────────────────────

export async function listFeatures(): Promise<{ features: FeatureRecord[]; count: number }> {
  return fetchJson(`${ORCHESTRATOR_API}/features`);
}

export async function getFeature(slug: string): Promise<FeatureRecord> {
  return fetchJson(`${ORCHESTRATOR_API}/features/${slug}`);
}

export async function submitFeature(input: {
  description: string;
  requestingManager: string;
  units: string[];
}): Promise<{ featureSlug: string; status: string; units: string[] }> {
  return fetchJson(`${ORCHESTRATOR_API}/features`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function spawnAgents(
  featureSlug: string,
  input: { personaHandle: string; count: number; managerToken: string },
): Promise<{ featureSlug: string; status: string; spawned: AgentInstance[]; count: number }> {
  return fetchJson(`${ORCHESTRATOR_API}/features/${featureSlug}/spawn`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Agent Registry APIs ────────────────────────────────────────────

export async function listAgents(): Promise<{ agents: AgentInstanceRecord[] }> {
  return fetchJson(`${AGENT_REGISTRY}/agents`);
}

export async function getAgent(instanceId: string): Promise<AgentInstanceRecord> {
  return fetchJson(`${AGENT_REGISTRY}/agents/${instanceId}`);
}

// ── Workflow APIs ──────────────────────────────────────────────────

export async function listWorkflows(): Promise<{ workflows: Array<{ workflowId: string; featureSlug: string; status: string }> }> {
  return fetchJson(`${WORKFLOW_API}/workflows`);
}

export async function getWorkflowTasks(workflowId: string): Promise<{ tasks: WorkflowTask[] }> {
  return fetchJson(`${WORKFLOW_API}/workflows/${workflowId}/tasks`);
}

// ── Metric APIs ────────────────────────────────────────────────────

export async function listMetrics(): Promise<{ metrics: MetricState[] }> {
  return fetchJson(`${METRIC_API}/metrics`);
}

export async function getMetricHistory(metricName: string): Promise<{ alerts: Array<{ featureSlug: string; metricName: string; value: number; timestamp: string }> }> {
  return fetchJson(`${METRIC_API}/metrics/${metricName}/history`);
}

// ── Health APIs ────────────────────────────────────────────────────

export async function checkServiceHealth(port: number): Promise<ServiceHealth | null> {
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<ServiceHealth>;
  } catch {
    return null;
  }
}

export async function checkAllServices(): Promise<Array<ServiceHealth & { port: number; name: string }>> {
  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      const health = await checkServiceHealth(svc.port);
      return {
        ...svc,
        status: health?.status === "ok" ? "ok" : health?.status === "degraded" ? "degraded" : "down",
        ...health,
      };
    }),
  );
  return results as Array<ServiceHealth & { port: number; name: string }>;
}

// ── MBO Targets (static from metrics/mbo-targets.yaml) ────────────

export const MBO_TARGETS: UnitMbo[] = [
  {
    unit: "SaaS Development Unit",
    objective: "99.9% uptime, sub-200ms API response under load",
    metrics: [
      { name: "Uptime", target: "99.9%", measurement: "Platform monitoring", notes: "Architect designs to 99.99% for buffer" },
      { name: "API Response", target: "sub-200ms p95", measurement: "Performance metrics" },
      { name: "Delivery Velocity", target: "On-time feature delivery", measurement: "Sprint completion rate" },
      { name: "Quality", target: "<5% bug escape rate", measurement: "Production incidents" },
      { name: "Feature Adoption", target: ">60% of target users", measurement: "Product analytics" },
      { name: "Test Coverage", target: ">80% code, 100% critical paths", measurement: "Coverage tools" },
      { name: "MTTR", target: "<15 minutes", measurement: "Incident tracking" },
      { name: "Deployment Success Rate", target: ">99%", measurement: "Deployment logs" },
    ],
  },
  {
    unit: "Mobile Development Unit",
    objective: "2-hour CI cycle; <1s cold launch; 4.5+ App Store rating",
    metrics: [
      { name: "CI Cycle Time", target: "<2 hours", measurement: "Pipeline metrics" },
      { name: "Cold Launch", target: "<1 second", measurement: "Performance monitoring" },
      { name: "App Store Rating", target: "4.5+ stars", measurement: "Store metrics" },
      { name: "Release Velocity", target: "Weekly releases", measurement: "Release cadence" },
      { name: "Crash-Free Rate", target: ">99.5%", measurement: "Crashlytics" },
    ],
  },
  {
    unit: "Web Development Unit",
    objective: "<1s TTFB at 100k users; WCAG 2.1 AA; SEO >90",
    metrics: [
      { name: "TTFB", target: "<1s at 100k concurrent users", measurement: "Load testing" },
      { name: "Accessibility", target: "WCAG 2.1 AA", measurement: "Automated audit + manual review" },
      { name: "SEO Score", target: ">90", measurement: "Lighthouse / third-party audit" },
      { name: "Lighthouse Score", target: ">90 across all categories", measurement: "Lighthouse CI" },
    ],
  },
  {
    unit: "Desktop Development Unit",
    objective: "Zero installer failures; MTTR <5 min for critical crashes",
    metrics: [
      { name: "Installer Success", target: "Zero failures", measurement: "Installer telemetry" },
      { name: "Crash MTTR", target: "<5 minutes for critical crashes", measurement: "Incident response logs" },
      { name: "Auto-Update Success", target: ">99%", measurement: "Update analytics" },
    ],
  },
  {
    unit: "Cloud Infrastructure Unit",
    objective: "95% cost utilization; <30s average provisioning",
    metrics: [
      { name: "Cost Utilization", target: "95% efficiency", measurement: "FinOps dashboard" },
      { name: "Provisioning Time", target: "<30s average", measurement: "IaC pipeline metrics" },
      { name: "IaC Coverage", target: "100% resources", measurement: "IaC audit" },
      { name: "Drift Detection Coverage", target: "100% IaC-managed resources", measurement: "Drift detection logs" },
    ],
  },
  {
    unit: "ML/Ops Unit",
    objective: "<0.5% drift false positives; model deployment <15 min",
    metrics: [
      { name: "Drift False Positives", target: "<0.5%", measurement: "Drift detection logs" },
      { name: "Deployment Time", target: "<15 minutes", measurement: "ML deployment pipeline" },
      { name: "Model Freshness", target: "<1 hour lag", measurement: "Data freshness metrics" },
    ],
  },
  {
    unit: "AI Research Unit",
    objective: "4 prototypes per quarter; 2 publications per year",
    metrics: [
      { name: "Prototypes", target: "4 per quarter", measurement: "Prototype registry" },
      { name: "Publications", target: "2 per year", measurement: "Publication tracking" },
      { name: "Papers Reviewed", target: "50/quarter", measurement: "Literature database" },
    ],
  },
  {
    unit: "Data Science Unit",
    objective: "5 actionable insights per month; A/B test lift >10%",
    metrics: [
      { name: "Actionable Insights", target: "5 per month", measurement: "Insight tracker" },
      { name: "A/B Test Lift", target: ">10%", measurement: "Experiment results" },
      { name: "Pipeline Reliability", target: ">99% successful runs", measurement: "Pipeline monitoring" },
    ],
  },
  {
    unit: "Security & Compliance Unit",
    objective: "Zero critical vulnerabilities; <1-hour incident response",
    metrics: [
      { name: "Critical Vulnerabilities", target: "Zero", measurement: "Vulnerability scanner" },
      { name: "Incident Response", target: "<1 hour", measurement: "IR timeline tracking" },
      { name: "Alert Latency", target: "<5 minutes", measurement: "Alert tracking" },
    ],
  },
];
