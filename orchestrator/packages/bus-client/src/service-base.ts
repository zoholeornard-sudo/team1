/**
 * Shared Express service base for orchestrator services.
 * Provides:
 * - /healthz endpoint for liveness checks
 * - /readyz endpoint for readiness checks
 * - /metrics endpoint stub for Prometheus (future)
 * - Graceful shutdown handling
 */

import express, { Express, Request, Response } from "express";
import { BusClient } from "@team1/bus-client";

export interface ServiceConfig {
  serviceName: string;
  port: number;
  redisUrl: string;
}

export interface ServiceState {
  isReady: boolean;
  isHealthy: boolean;
  lastCheck: number;
}

export class OrchestrationService {
  private app: Express;
  private config: ServiceConfig;
  private busClient: BusClient | null = null;
  private state: ServiceState = {
    isReady: false,
    isHealthy: true,
    lastCheck: Date.now(),
  };

  constructor(config: ServiceConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Liveness probe: service is running
    this.app.get("/healthz", (req: Request, res: Response) => {
      const status = this.state.isHealthy ? 200 : 503;
      res.status(status).json({
        status: this.state.isHealthy ? "healthy" : "unhealthy",
        service: this.config.serviceName,
        timestamp: new Date().toISOString(),
      });
    });

    // Readiness probe: service is ready to accept work
    this.app.get("/readyz", (req: Request, res: Response) => {
      const status = this.state.isReady ? 200 : 503;
      res.status(status).json({
        ready: this.state.isReady,
        service: this.config.serviceName,
        timestamp: new Date().toISOString(),
      });
    });

    // Metrics endpoint (stub for future Prometheus integration)
    this.app.get("/metrics", (req: Request, res: Response) => {
      res.set("Content-Type", "text/plain");
      res.send(
        `# HELP orchestrator_service_info Service metadata
# TYPE orchestrator_service_info gauge
orchestrator_service_info{service="${this.config.serviceName}"} 1
`
      );
    });
  }

  /**
   * Initialize the service (connect to Redis bus, etc.)
   */
  async initialize(): Promise<void> {
    console.log(
      `[${this.config.serviceName}] Initializing with config:`,
      this.config
    );

    // Initialize bus client
    this.busClient = new BusClient({
      redisUrl: this.config.redisUrl,
      serviceName: this.config.serviceName,
    });

    await this.busClient.connect();
    console.log(
      `[${this.config.serviceName}] Connected to Redis bus at ${this.config.redisUrl}`
    );

    this.state.isReady = true;
    this.state.lastCheck = Date.now();
  }

  /**
   * Start listening on the configured port
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        console.log(
          `[${this.config.serviceName}] Listening on port ${this.config.port}`
        );
        resolve();
      });
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log(`[${this.config.serviceName}] Shutting down...`);
    if (this.busClient) {
      await this.busClient.disconnect();
      console.log(`[${this.config.serviceName}] Disconnected from Redis bus`);
    }
  }

  /**
   * Get the bus client for this service
   */
  getBusClient(): BusClient {
    if (!this.busClient) {
      throw new Error("Service not initialized");
    }
    return this.busClient;
  }

  /**
   * Get the Express app for custom route registration
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Update service state (called by service implementations)
   */
  setState(state: Partial<ServiceState>): void {
    this.state = { ...this.state, ...state };
  }

  /**
   * Get current service state
   */
  getState(): ServiceState {
    return { ...this.state };
  }
}

export default OrchestrationService;
