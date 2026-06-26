/**
 * review-scheduler — bounded context service (ADR-0001, P3 of refinement plan)
 * Port: :3110
 *
 * Feedback & review loops:
 * - Emits ReviewRequested every N turns (configurable per unit)
 * - Managers consume, fetch metrics, write ReviewReport
 * - Reports update corresponding MBO entries
 */
import {
  IntentType,
  ReviewRequestedPayload,
  ReviewReportPayload,
} from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3110;
const SERVICE_NAME = "review-scheduler";

// Configuration
const DEFAULT_REVIEW_INTERVAL_TURNS = Number(process.env.REVIEW_INTERVAL_TURNS) || 5;

// Per-unit configuration (feature slug → interval)
const reviewIntervals: Map<string, number> = new Map();

// Track turn counts per feature
const featureTurns: Map<string, number> = new Map();

// Store review reports
const reviewReports: Map<string, ReviewReportPayload[]> = new Map();

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

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

// --- Review logic ---

function incrementTurn(featureSlug: string): ReviewRequestedPayload | null {
  const current = (featureTurns.get(featureSlug) || 0) + 1;
  featureTurns.set(featureSlug, current);

  const interval = reviewIntervals.get(featureSlug) || DEFAULT_REVIEW_INTERVAL_TURNS;

  if (current % interval === 0) {
    // Build metrics snapshot (in production, query workflow service + gate evaluator)
    const metricsSnapshot = [
      { name: "uptime", value: "99.8%", target: "99.9%", onTarget: false },
      { name: "api_response", value: "180ms", target: "sub-200ms", onTarget: true },
    ];

    const reviewPayload: ReviewRequestedPayload = {
      workflowId: `wf-${featureSlug}`,
      featureSlug,
      reviewTurn: current,
      metricsSnapshot,
    };

    return reviewPayload;
  }

  return null;
}

function generateReviewReport(featureSlug: string, reviewTurn: number): ReviewReportPayload {
  // In production, aggregate metrics from workflow service
  const reports = reviewReports.get(featureSlug) || [];

  const report: ReviewReportPayload = {
    workflowId: `wf-${featureSlug}`,
    featureSlug,
    reviewTurn,
    overallStatus: "on_track",
    findings: [
      "All tasks progressing normally",
      "No stalled agents detected",
    ],
    recommendations: [
      "Continue current velocity",
      "Monitor api_response metric (approaching threshold)",
    ],
  };

  reports.push(report);
  reviewReports.set(featureSlug, reports);

  return report;
}

// --- HTTP API ---

async function setReviewInterval(req: Request): Promise<Response> {
  const body = await req.json() as { featureSlug: string; intervalTurns: number };

  if (body.intervalTurns < 1) {
    return new Response("Interval must be >= 1", { status: 400 });
  }

  reviewIntervals.set(body.featureSlug, body.intervalTurns);
  return Response.json({
    success: true,
    featureSlug: body.featureSlug,
    intervalTurns: body.intervalTurns,
  });
}

async function recordTurn(req: Request): Promise<Response> {
  const body = await req.json() as { featureSlug: string };

  const reviewPayload = incrementTurn(body.featureSlug);

  if (reviewPayload) {
    emitIntent("ReviewRequested", reviewPayload);
    return Response.json({
      success: true,
      reviewTriggered: true,
      reviewTurn: reviewPayload.reviewTurn,
      metricsSnapshot: reviewPayload.metricsSnapshot,
    });
  }

  return Response.json({
    success: true,
    reviewTriggered: false,
    currentTurn: featureTurns.get(body.featureSlug) || 0,
  });
}

async function submitReviewReport(req: Request): Promise<Response> {
  const body = await req.json() as ReviewReportPayload;

  const reports = reviewReports.get(body.featureSlug) || [];
  reports.push(body);
  reviewReports.set(body.featureSlug, reports);

  emitIntent("ReviewReport", body);

  return Response.json({
    success: true,
    workflowId: body.workflowId,
    overallStatus: body.overallStatus,
  });
}

async function getReports(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");

  if (featureSlug) {
    const reports = reviewReports.get(featureSlug) || [];
    return Response.json({ featureSlug, reports, count: reports.length });
  }

  // Return all reports
  const allReports: ReviewReportPayload[] = [];
  for (const reports of reviewReports.values()) {
    allReports.push(...reports);
  }
  return Response.json({ reports: allReports, count: allReports.length });
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
          defaultIntervalTurns: DEFAULT_REVIEW_INTERVAL_TURNS,
          featuresTracked: featureTurns.size,
          totalReports: Array.from(reviewReports.values()).reduce((sum, r) => sum + r.length, 0),
        });
      }

      if (url.pathname === "/review/interval" && req.method === "POST") {
        return setReviewInterval(req);
      }

      if (url.pathname === "/review/turn" && req.method === "POST") {
        return recordTurn(req);
      }

      if (url.pathname === "/review/report" && req.method === "POST") {
        return submitReviewReport(req);
      }

      if (url.pathname === "/review/reports" && req.method === "GET") {
        return getReports(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);