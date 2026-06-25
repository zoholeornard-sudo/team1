import { OrchestrationService, ServiceConfig } from "@team1/bus-client";
import { IntentType } from "@team1/contracts";

// Service configuration – can be overridden via env vars
const config: ServiceConfig = {
  serviceName: "edit-coordinator",
  port: Number(process.env.PORT) || 3106,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};

const service = new OrchestrationService(config);

async function main() {
  await service.initialize();

  // Placeholder: set up bus subscriptions for edit intents
  const bus = service.getBusClient();
  await bus.ensureConsumerGroup("edit-coordination", config.serviceName);
  // TODO: consume and process EditIntent, AcquireCheckout, etc.

  await service.start();
}

main().catch((err) => {
  console.error(`[${config.serviceName}] Fatal error:`, err);
  process.exit(1);
});
