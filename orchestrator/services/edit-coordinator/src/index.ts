/**
 * edit-coordinator — sole filesystem writer (ADR-0003)
 * No HTTP port — process-only service (consumes EditIntent stream, applies under lock).
 *
 * Milestone 1: bus boot only. Milestone 3: implement lock + applier.
 */
import { BusClient } from "@team1/bus-client";

const SERVICE_NAME = "edit-coordinator";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const bus = new BusClient({ redisUrl: REDIS_URL, serviceName: SERVICE_NAME });

bus.connect().then(() => {
  console.log("[edit-coordinator] connected to Redis bus — ready for M3 implementation");
}).catch((err) => {
  console.warn("[edit-coordinator] Redis connection failed:", err?.message);
  process.exit(1);
});

// Keep process alive
setInterval(() => {}, 1000);
