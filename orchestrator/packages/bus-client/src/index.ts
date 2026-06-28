/**
 * @orchestrator/bus-client — shared Redis Streams transport
 *
 * Provides:
 * - BusClient: publish/subscribe with idempotency dedupe (24h TTL)
 * - IntentEnvelope validation via the shared contracts catalog
 * - Dead-letter routing after 3 retries
 * - Stream replay-on-boot via last-acked offset tracking
 */
import { createClient, RedisClientType } from "redis";
import { IntentType, IntentEnvelope } from "@orchestrator/contracts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DEDUP_TTL = 86400; // 24h
const MAX_RETRIES = 3;

export interface BusConfig {
  url?: string;
  dedupTtl?: number;
  maxRetries?: number;
  redisDb?: number; // Redis SELECT db (0-15) for multi-instance isolation
}

export class BusClient {
  private redis: RedisClientType;
  private config: Required<BusConfig>;

  constructor(config: BusConfig = {}) {
    this.config = {
      url: config.url || REDIS_URL,
      dedupTtl: config.dedupTtl || DEDUP_TTL,
      maxRetries: config.maxRetries || MAX_RETRIES,
      redisDb: config.redisDb ?? this.extractDbFromUrl(config.url || REDIS_URL),
    };
    this.redis = createClient({ url: this.config.url });
  }

  private extractDbFromUrl(url: string): number {
    // redis://localhost:6379/3 → db=3
    const match = url.match(/\/(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  }

  async connect(): Promise<void> {
    if (!this.redis.isOpen) {
      await this.redis.connect();
    }
    // SELECT the instance-specific DB
    if (this.config.redisDb > 0) {
      await this.redis.select(this.config.redisDb);
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis.isOpen) {
      await this.redis.quit();
    }
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
    const acquired = await this.redis.set(dedupKey, "1", { NX: true, EX: this.config.dedupTtl });

    if (!acquired) {
      console.warn(`[bus-client] Duplicate intent dropped: ${envelope.idempotencyKey} on ${stream}`);
      return false;
    }

    // Publish to stream
    await this.redis.xAdd(stream, "*", {
      type: envelope.type,
      envelope: JSON.stringify(envelope),
    });

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
      await this.redis.xGroupCreate(stream, group, "0", { MKSTREAM: true });
    } catch (e: any) {
      if (!e.message.includes("BUSYGROUP")) throw e;
    }

    console.log(`[bus-client] Subscribed to ${stream} as ${group}/${consumer}`);

    while (true) {
      try {
        const streams = await this.redis.xReadGroup(
          group,
          consumer,
          [{ key: stream, id: ">" }],
          { COUNT: 1, BLOCK: 2000 }
        );

        if (!streams) continue;

        for (const streamEntry of streams) {
          if (!streamEntry.messages) continue;

          for (const message of streamEntry.messages) {
            if (!message.message?.envelope) continue;

            const envelope = JSON.parse(message.message.envelope) as IntentEnvelope<T, any>;

            try {
              await handler(envelope);
              await this.redis.xAck(streamEntry.key, group, message.id);
            } catch (err) {
              console.error(`[bus-client] Handler failed for ${message.id}:`, err);
              await this.handleFailure(streamEntry.key, message, group, stream);
            }
          }
        }
      } catch (err) {
        console.error(`[bus-client] Read error:`, err);
        // Brief backoff before retry
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
      await this.redis.xGroupCreate(stream, group, "0", { MKSTREAM: true });
    } catch (e: any) {
      if (!e.message.includes("BUSYGROUP")) throw e;
    }

    console.log(`[bus-client] Subscribed to ${stream} from ${startOffset} as ${group}/${consumer}`);

    while (true) {
      try {
        const streams = await this.redis.xReadGroup(
          group,
          consumer,
          [{ key: stream, id: ">" }],
          { COUNT: 10, BLOCK: 1000 }
        );

        if (!streams) continue;

        for (const streamEntry of streams) {
          if (!streamEntry.messages) continue;

          for (const message of streamEntry.messages) {
            if (!message.message?.envelope) continue;

            const envelope = JSON.parse(message.message.envelope) as IntentEnvelope<T, any>;

            try {
              await handler(envelope);
              await this.redis.xAck(streamEntry.key, group, message.id);
            } catch (err) {
              console.error(`[bus-client] Handler failed for ${message.id}:`, err);
              await this.handleFailure(streamEntry.key, message, group, stream);
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
    message: any,
    group: string,
    originalStream: string
  ): Promise<void> {
    const retryKey = `retry:${group}:${message.id}`;
    const retries = await this.redis.incr(retryKey);
    await this.redis.expire(retryKey, 3600);

    if (retries > this.config.maxRetries) {
      // Move to dead-letter stream
      await this.redis.xAdd("intents:dead-letter", "*", {
        originalStream,
        messageId: message.id,
        payload: message.message.envelope,
        reason: "Max retries exceeded",
      });
      await this.redis.xAck(streamKey, group, message.id);
      await this.redis.del(retryKey);
      console.error(`[bus-client] Message ${message.id} moved to dead-letter stream`);
    }
  }

  /**
   * Get the last acknowledged message ID for a consumer group.
   */
  async getLastAckedId(stream: string, group: string): Promise<string | null> {
    await this.connect();
    try {
      const info = await this.redis.xInfoGroups(stream);
      const groupInfo = info.find((g: any) => g.name === group);
      return groupInfo?.lastDeliveredId || null;
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