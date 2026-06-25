import { OrchestrationService, ServiceConfig } from "@team1/bus-client";

const config: ServiceConfig = {
  serviceName: "orchestrator-api",
  port: Number(process.env.PORT) || 3099,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};

const service = new OrchestrationService(config);

async function main() {
  await service.initialize();
  const bus = service.getBusClient();
  // Placeholder: expose HTTP endpoints for feature submission, spawning, etc.
  // For now we just ensure a consumer group exists.
  await bus.ensureConsumerGroup("feature-lifecycle", config.serviceName);
  await service.start();
}

main().catch((err) => {
  console.error(`[${config.serviceName}] Fatal error:`, err);
  process.exit(1);
});/**
 * orchestrator-api — REST entry point
 * Port: :3108
 *
 * Mints featureSlug (globally-unique kebab-case) at FeatureSubmitted time.
 * Emits FeatureSubmitted + SpawnAgents intents.
 */
const PORT = Number(process.env.PORT) || 3108;
console.log("[orchestrator-api] booting on :" + PORT);

// Milestone 2: POST /features -> mint featureSlug -> emit FeatureSubmitted
// Milestone 2: POST /features/:slug/spawn -> emit SpawnAgents

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ service: "orchestrator-api", status: "booting" });
    }
    return new Response("Not found", { status: 404 });
  },
});
