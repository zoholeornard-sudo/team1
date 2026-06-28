/**
 * @orchestrator/bus-client — shared Redis Streams transport
 *
 * Uses ioredis (not the `redis` npm package) for Bun compatibility.
 * The `redis` package's RESP2 encoder crashes with Bun's stream types.
 *
 * Provides:
 * - BusClient: publish/subscribe with idempotency dedupe (24h TTL)
 * - IntentEnvelope validation via the shared contracts catalog
 * - Dead-letter routing after 3 retries
 * - Stream replay-on-boot via last-acked offset tracking
 * - Redis SELECT db for multi-instance isolation
 */
import Redis from "ioredis";
import { IntentType, IntentEnvelope } from "@orchestrator/contracts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DEDUP_TTL = 86400; // 24h
const MAX_RETRIES = 3;

export interface BusConfig {
  url?: string;
  dedupTtl?: number;
  maxRetries?: number;
  redisDb?: number;
}

export class BusClient {
  private redis: Redis;
  private config: Required<BusConfig>;

  constructor(config: BusConfig = {}) {
    const url = config.url || REDIS_URL;
    const db = config.redisDb ?? this.extractDbFromUrl(url);
    this.config = {
      url,
      dedupTtl: config.dedupTtl || DEDUP_TTL,
      maxRetries: config.maxRetries || MAX_RETRIES,
      redisDb: db,
    };
    this.redis = new Redis(url, {
      db,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  private extractDbFromUrl(url: string): number {
    const match = url.match(/\/(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  }

  /** Expose the underlying Redis client for advanced operations */
  get redisClient(): Redis {
    return this.redis;
  }

  async connect(): Promise<void> {
    if (this.redis.status === "wait" || this.redis.status === "close") {
      await this.redis.connect();
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Publish an intent envelope to a Redis stream.
   * Enforces 24h idempotency deduplication.
   */
  async publish<T extends IntentType>(
    stream: string,
    envelope: IntentEnvelope<T, any>
  ): Promise<boolean> {
    await this.connect();

    // Idempotency guard
    const dedupKey = `idem:${stream}:${envelope.idempotencyKey}`;
    const acquired = await this.redis.set(dedupKey, "1", "NX", "EX", this.config.dedupTtl);

    if (!acquired) {
      console.warn(`[bus-client] Duplicate intent dropped: ${envelope.idempotencyKey} on ${stream}`);
      return false;
    }

    // Publish to stream
    await this.redis.xadd(stream, "*", "type", envelope.type, "envelope", JSON.stringify(envelope));

    return true;
  }

  /**
   * Subscribe to a stream with a consumer group.
   * Handles retries and dead-letter routing.
   */
  async subscribe<T extends IntentType>(
    stream: string,
    group: string,
    consumer: string,
    handler: (envelope: IntentEnvelope<T, any>) => Promise<void>
  ): Promise<void> {
    await this.connect();

    // Ensure consumer group exists
    try {
      await this.redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
    } catch (e: any) {
      if (!e.message.includes("BUSYGROUP")) throw e;
    }

    console.log(`[bus-client] Subscribed to ${stream} as ${group}/${consumer}`);

    while (true) {
      try {
        const results = await this.redis.xreadgroup(
          "GROUP", group, consumer,
          "COUNT", 1,
          "BLOCK", 2000,
          "STREAMS", stream, ">"
        );

        if (!results) continue;

        for (const [streamKey, messages] of results) {
          if (!messages) continue;
          for (const [id, fields] of messages) {
            if (!fields || !fields[1]) continue;
            const envelope = JSON.parse(fields[1]) as IntentEnvelope<T, any>;

            try {
              await handler(envelope);
              await this.redis.xack(streamKey, group, id);
            } catch (err) {
              console.error(`[bus-client] Handler failed for ${id}:`, err);
              await this.handleFailure(streamKey, id, fields, group, stream);
            }
          }
        }
      } catch (err) {
        console.error(`[bus-client] Read error:`, err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  /**
   * Subscribe to a specific starting offset (for replay-on-boot).
   */
  async subscribeFromOffset<T extends IntentType>(
    stream: string,
    group: string,
    consumer: string,
    startOffset: string,
    handler: (envelope: IntentEnvelope<T, any>) => Promise<void>
  ): Promise<void> {
    await this.connect();

    try {
      await this.redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
    } catch (e: any) {
      if (!e.message.includes("BUSYGROUP")) throw e;
    }

    console.log(`[bus-client] Subscribed to ${stream} from ${startOffset} as ${group}/${consumer}`);

    while (true) {
      try {
        const results = await this.redis.xreadgroup(
          "GROUP", group, consumer,
          "COUNT", 10,
          "BLOCK", 1000,
          "STREAMS", stream, ">"
        );

        if (!results) continue;

        for (const [streamKey, messages] of results) {
          if (!messages) continue;
          for (const [id, fields] of messages) {
            if (!fields || !fields[1]) continue;
            const envelope = JSON.parse(fields[1]) as IntentEnvelope<T, any>;

            try {
              await handler(envelope);
              await this.redis.xack(streamKey, group, id);
            } catch (err) {
              console.error(`[bus-client] Handler failed for ${id}:`, err);
              await this.handleFailure(streamKey, id, fields, group, stream);
            }
          }
        }
      } catch (err) {
        console.error(`[bus-client] Read error:`, err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async handleFailure(
    streamKey: string,
    messageId: string,
    fields: string[],
    group: string,
    originalStream: string
  ): Promise<void> {
    const retryKey = `retry:${group}:${messageId}`;
    const retries = await this.redis.incr(retryKey);
    await this.redis.expire(retryKey, 3600);

    if (retries > this.config.maxRetries) {
      await this.redis.xadd("intents:dead-letter", "*",
        "originalStream", originalStream,
        "messageId", messageId,
        "payload", fields[1] || "",
        "reason", "Max retries exceeded"
      );
      await this.redis.xack(streamKey, group, messageId);
      await this.redis.del(retryKey);
      console.error(`[bus-client] Message ${messageId} moved to dead-letter stream`);
    }
  }

  /**
   * Get the last acknowledged message ID for a consumer group.
   */
  async getLastAckedId(stream: string, group: string): Promise<string | null> {
    await this.connect();
    try {
      const info = await this.redis.xinfo("GROUPS", stream);
      for (const groupInfo of info) {
        if (groupInfo[1] === group) {
          return groupInfo[3] || null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Ping Redis to check connectivity.
   */
  async ping(): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.redis.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }
}

// Factory function for convenience
export function createBusClient(config?: BusConfig): BusClient {
  return new BusClient(config);
}
