/**
 * @team1/bus-client — Intent Event Bus
 *
 * Shared client for all 6 services to publish and consume intents via Redis Streams.
 * Features:
 * - Idempotency deduplication (24h TTL per idempotencyKey)
 * - Consumer group creation with offset tracking (at-least-once delivery per ADR-0002)
 * - Typed intent envelope validation
 * - Automatic reconnect on Redis connection loss
 *
 * Usage (Publisher):
 *   const bus = new BusClient({ redisUrl: 'redis://localhost:6379' });
 *   await bus.publish('feature-lifecycle', {
 *     type: 'FeatureSubmitted',
 *     idempotencyKey: 'feature-acme-2026-01-15-v1',
 *     featureSlug: 'feature-acme',
 *     branch: 'main',
 *     timestamp: new Date().toISOString(),
 *     payload: { ... }
 *   });
 *
 * Usage (Consumer):
 *   const bus = new BusClient({ ... });
 *   await bus.ensureConsumerGroup('feature-lifecycle', 'orchestrator-api');
 *   for await (const [intentId, intent] of bus.consume('feature-lifecycle', 'orchestrator-api')) {
 *     await handleIntent(intent);
 *     await bus.ack('feature-lifecycle', 'orchestrator-api', intentId);
 *   }
 */

import { createClient, RedisClientType } from "redis";
import { v4 as uuid } from "uuid";
import type { IntentEnvelope, IntentType } from "@team1/contracts";

export interface BusClientConfig {
  redisUrl: string; // e.g. "redis://localhost:6379"
  serviceName: string; // e.g. "orchestrator-api" or "runtime-supervisor"
  idempotencyTtlSeconds?: number; // default 86400 (24h)
  maxReconnectAttempts?: number; // default 5
  reconnectDelayMs?: number; // default 1000
}

export interface PublishOptions {
  stream?: string; // default: derived from intent type (see streamMapping below)
}

export class BusClient {
  private redis: RedisClientType;
  private config: Required<BusClientConfig>;
  private isConnected = false;
  private reconnectAttempts = 0;

  // Intent type → Redis Stream name mapping (ADR-0002)
  private static readonly STREAM_MAP: Record<IntentType, string> = {
    // Feature + spawn lifecycle
    FeatureSubmitted: "feature-lifecycle",
    SpawnAgents: "feature-lifecycle",
    AgentAssigned: "feature-lifecycle",
    SessionStarted: "feature-lifecycle",
    ReapInstance: "feature-lifecycle",
    // Task lifecycle
    TaskCreated: "task-lifecycle",
    TaskCompleted: "task-lifecycle",
    // Edit coordination
    EditIntent: "edit-coordination",
    AcquireCheckout: "edit-coordination",
    EditApplied: "edit-coordination",
    CheckoutDenied: "edit-coordination",
    // Lifecycle gating
    PhaseGateCheck: "lifecycle-gating",
    PhaseGatePassed: "lifecycle-gating",
    PhaseGateFailed: "lifecycle-gating",
    // Health
    Heartbeat: "health-monitoring",
    InstanceStalled: "health-monitoring",
    // Cross-feature
    MergeConflictDetected: "cross-feature-coordination",
    // Async test coordination (v1.1.0)
    TestNeeded: "edit-coordination",
    TestFailed: "edit-coordination",
    EditReverted: "edit-coordination",
    // Lifecycle escalation (v1.1.0)
    PhaseEscalation: "lifecycle-gating",
    // Lifecycle loop extraction (2026-06-22) — gstack /office-hours → /canary protocols
    PhaseReviewScore: "lifecycle-gating",
    ScopeChangeRequest: "edit-coordination",
    DeployVerified: "lifecycle-gating",
    // Bus hygiene
    DeadLetter: "dead-letter-queue",
  };

  constructor(config: BusClientConfig) {
    this.config = {
      idempotencyTtlSeconds: 86400, // 24h default
      maxReconnectAttempts: 5,
      reconnectDelayMs: 1000,
      ...config,
    };

    this.redis = createClient({
      url: this.config.redisUrl,
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    this.redis.on("connect", () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log(`[BusClient] Connected to Redis (${this.config.serviceName})`);
    });

    this.redis.on("error", (err) => {
      console.error(`[BusClient] Redis error (${this.config.serviceName}):`, err);
      this.isConnected = false;
      this.attemptReconnect();
    });

    this.redis.on("end", () => {
      console.warn(`[BusClient] Redis connection ended (${this.config.serviceName})`);
      this.isConnected = false;
    });
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`[BusClient] Max reconnect attempts reached (${this.config.serviceName})`);
      return;
    }

    this.reconnectAttempts++;
    const delayMs = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    console.log(
      `[BusClient] Reconnecting in ${delayMs}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      await this.redis.connect();
    } catch (err) {
      console.error(`[BusClient] Reconnect attempt ${this.reconnectAttempts} failed:`, err);
      await this.attemptReconnect();
    }
  }

  /**
   * Connect to Redis (must be called before any pub/sub operations).
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;
    await this.redis.connect();
  }

  /**
   * Disconnect gracefully.
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }

  /**
   * Publish an intent to the appropriate stream.
   * Implements idempotency: if idempotencyKey is already known (within TTL), publish is skipped.
   * Returns true if published, false if skipped due to duplicate.
   */
  async publish<T extends IntentType>(
    intent: IntentEnvelope<T>,
    opts: PublishOptions = {}
  ): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error("BusClient not connected");
    }

    const stream = opts.stream || BusClient.STREAM_MAP[intent.type];
    const dedupKey = `idempotency:${intent.idempotencyKey}`;

    // Attempt to acquire idempotency lock (SET NX = set if not exists)
    const acquired = await this.redis.set(dedupKey, "1", {
      NX: true,
      EX: this.config.idempotencyTtlSeconds,
    });

    if (!acquired) {
      // Duplicate detected; silently skip
      console.warn(
        `[BusClient] Duplicate intent (${intent.type}, key=${intent.idempotencyKey}) on stream=${stream}`
      );
      return false;
    }

    // Publish to stream
    const messageId = await this.redis.xAdd(stream, "*", {
      payload: JSON.stringify(intent),
    });

    console.log(
      `[BusClient] Published ${intent.type} (key=${intent.idempotencyKey}) to ${stream} → ${messageId}`
    );
    return true;
  }

  /**
   * Ensure a consumer group exists on a stream.
   * If group already exists, this is a no-op.
   * If stream doesn't exist yet, Redis creates it automatically on first message.
   */
  async ensureConsumerGroup(stream: string, groupName: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error("BusClient not connected");
    }

    try {
      await this.redis.xGroupCreate(stream, groupName, "$", {
        MKSTREAM: true, // Create stream if it doesn't exist
      });
      console.log(`[BusClient] Created consumer group ${groupName} on stream ${stream}`);
    } catch (err: any) {
      if (err.message?.includes("BUSYGROUP")) {
        // Group already exists; no-op
        console.log(`[BusClient] Consumer group ${groupName} already exists on ${stream}`);
      } else {
        throw err;
      }
    }
  }

  /**
   * Consume intents from a stream as an async generator.
   * Yields [intentId, parsedIntent] tuples.
   * Blocks until messages are available (BLOCK 1000ms = 1s timeout per read).
   */
  async *consume(stream: string, groupName: string) {
    if (!this.isConnected) {
      throw new Error("BusClient not connected");
    }

    const consumerName = `${this.config.serviceName}-${uuid()}`;

    while (true) {
      try {
        // Read new messages from the consumer group
        const messages = await (this.redis as any).xReadGroup(
          groupName,
          consumerName,
          { key: stream, id: ">" },
          { BLOCK: 1000 }
        );

        if (!messages) {
          // Timeout; continue polling
          continue;
        }

        // messages is an array of [stream, [[id, [field, value, ...]], ...]]
        for (const [, streamMessages] of messages) {
          for (const [intentId, fields] of streamMessages) {
            try {
              // Redis returns fields as a flat array: [field1, val1, field2, val2, ...]
              // Convert to object: { field1: val1, field2: val2, ... }
              const payload = fields[0] || "{}"; // payload field
              const intent = JSON.parse(payload) as IntentEnvelope<any>;
              yield [intentId, intent] as const;
            } catch (parseErr) {
              console.error(
                `[BusClient] Failed to parse intent from ${stream}:${intentId}:`,
                parseErr
              );
              // Send to dead-letter queue (optional; for now, just log)
              await this.ack(stream, groupName, intentId);
            }
          }
        }
      } catch (err) {
        console.error(`[BusClient] Error consuming from ${stream}:`, err);
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Acknowledge a message in a consumer group (mark as processed).
   */
  async ack(stream: string, groupName: string, messageId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error("BusClient not connected");
    }

    await this.redis.xAck(stream, groupName, messageId);
  }

  /**
   * Get the status of a consumer group (for debugging / health checks).
   */
  async getConsumerGroupInfo(
    stream: string,
    groupName: string
  ): Promise<Record<string, any> | null> {
    if (!this.isConnected) {
      return null;
    }

    try {
      const groups = await this.redis.xInfoGroups(stream);
      return groups.find((g: any) => g.name === groupName) || null;
    } catch (err: any) {
      if (err.message?.includes("no such key")) {
        return null; // Stream doesn't exist yet
      }
      throw err;
    }
  }

  /**
   * Check if client is connected to Redis.
   */
  getConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get Redis client directly (advanced usage).
   */
  getRedisClient(): RedisClientType {
    return this.redis;
  }
}

export { OrchestrationService } from "./service-base";
export type { ServiceConfig, ServiceState } from "./service-base";

export default BusClient;
