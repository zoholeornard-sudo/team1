/**
 * team1 Orchestrator — Service Health Test (Gate Tier)
 *
 * Extracted from gstack's /healthz pattern: each service exposes a health endpoint
 * that reports readiness. This test boots each service and asserts 200 OK.
 *
 * Requires: services running (docker compose up)
 * Run: bun test orchestrator/test/service-health.test.ts
 *
 * Skips automatically if services are not reachable (free-test compatibility).
 */

import { describe, it, expect } from "bun:test";

const SERVICES = [
  { name: "task-management", port: 3101 },
  { name: "session-management", port: 3102 },
  { name: "health-monitoring", port: 3103 },
  { name: "lifecycle-management", port: 3104 },
  { name: "event-coordination", port: 3105 },
  { name: "agent-registry", port: 3106 },
  { name: "orchestrator-api", port: 3099 },
];

async function isReachable(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://localhost:${port}/healthz`, {
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

const anyServiceUp = await isReachable(3099);

describe.skipIf(!anyServiceUp)("Service health checks (requires docker compose up)", () => {
  for (const svc of SERVICES) {
    it(`${svc.name} (:${svc.port}) responds 200 on /healthz`, async () => {
      const resp = await fetch(`http://localhost:${svc.port}/healthz`, {
        signal: AbortSignal.timeout(3000),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("ok");
      expect(body.service).toBe(svc.name);
    });
  }

  it("all 6 services + api are reachable", async () => {
    const results = await Promise.all(
      SERVICES.map(async (svc) => ({
        name: svc.name,
        up: await isReachable(svc.port),
      }))
    );
    const down = results.filter((r) => !r.up);
    expect(down.length).toBe(0);
  });
});

if (!anyServiceUp) {
  console.log("ℹ️  Service health tests skipped — no services running. Run `docker compose up` to enable.");
}
