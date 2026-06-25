import { OrchestrationService, ServiceConfig } from "@team1/bus-client";

const config: ServiceConfig = {
  serviceName: "session-management",
  port: Number(process.env.PORT) || 3105,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};

const service = new OrchestrationService(config);

async function main() {
  await service.initialize();
  const bus = service.getBusClient();
  // Placeholder: subscribe to heartbeat and instance tracking streams
  await bus.ensureConsumerGroup("health-monitoring", config.serviceName);
  await service.start();
}

main().catch((err) => {
  console.error(`[${config.serviceName}] Fatal error:`, err);
  process.exit(1);
});/**
 * session-management — bounded context service (ADR-0001)
 * Port: :3102
 *
 * Stub. Milestone 1 will implement bus boot + health ping.
 * See orchestrator/docs/adr/ for design decisions.
 */
import { IntentType } from "@team1/contracts";

const PORT = Number(process.env.PORT) || 3102;
const SERVICE_NAME = "session-management";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

// Milestone 1: subscribe to relevant intent streams (see infra/redis-keyspaces.md)
// Milestone 1: respond to health ping from event-coordination
// Milestone 2+: implement domain logic

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ service: SERVICE_NAME, status: "booting", port: PORT });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
