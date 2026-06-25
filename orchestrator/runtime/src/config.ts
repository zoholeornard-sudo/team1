export const RUNTIME_SERVICE_NAME = "runtime";
export const RUNTIME_PORT = Number(process.env.PORT) || 3109;
export const ZO_ASK_MODEL = "vercel:zai/glm-5.2";
export const DEFAULT_REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
export const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR || `${process.cwd()}/data/checkpoints`;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const STALL_AFTER_MS = 90_000;
export const CONSUMER_GROUP = "runtime";
