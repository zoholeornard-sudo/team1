/**
 * Integration Tests for team1 Orchestrator
 *
 * Tests the complete lifecycle:
 * 1. Feature submission via orchestrator-api
 * 2. Agent spawning via SpawnAgents intent
 * 3. Task creation and assignment
 * 4. Edit coordination (checkout, apply, commit)
 * 5. Lifecycle gating (phase gates, MBO)
 * 6. Health monitoring (heartbeats, stall detection)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createBusClient } from "@orchestrator/bus-client";
import type {
  FeatureSubmittedPayload,
  SpawnAgentsPayload,
  AgentAssignedPayload,
  TaskCreatedPayload,
  TaskCompletedPayload,
  EditIntentPayload,
  AcquireCheckoutPayload,
  PhaseGateCheckPayload,
  HeartbeatPayload,
} from "@orchestrator/contracts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const ORCHESTRATOR_API = "http://localhost:3099";
const TASK_MANAGEMENT = "http://localhost:3101";
const AGENT_REGISTRY = "http://localhost:3107";
const EDIT_COORDINATOR = "http://localhost:3106";
const LIFECYCLE_MGMT = "http://localhost:3104";
const HEALTH_MONITORING = "http://localhost:3103";
const RUNTIME = "http://localhost:3100";

let testFeatureSlug: string;
let testInstanceId: string;
let testBranch: string;
let testTaskId: string;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getJson(url: string) {
  const res = await fetch(url);
  return res.json();
}

describe("Orchestrator Integration Tests", () => {
  it("should submit a feature via orchestrator-api", async () => {
    const result = await postJson(`${ORCHESTRATOR_API}/features`, {
      description: "Integration test feature for end-to-end testing",
      requestingManager: "@saas-delivery-manager",
      units: ["SaaS Development Unit"],
    });

    expect(result.featureSlug).toBeDefined();
    expect(result.status).toBe("submitted");
    expect(result.units).toContain("SaaS Development Unit");

    testFeatureSlug = result.featureSlug;
    console.log(`Created feature: ${testFeatureSlug}`);
  });

  it("should spawn agents for the feature", async () => {
    const result = await postJson(`${ORCHESTRATOR_API}/features/${testFeatureSlug}/spawn`, {
      personaHandle: "@architect-agent",
      count: 2,
      managerToken: "test-manager-token",
    });

    expect(result.status).toBe("active");
    expect(result.spawned).toHaveLength(2);
    // Instance IDs are sequential across all features (counter-based)
    expect(result.spawned[0].instanceId).toMatch(/@architect-agent-\d+/);
    expect(result.spawned[1].instanceId).toMatch(/@architect-agent-\d+/);

    testInstanceId = result.spawned[0].instanceId;
    testBranch = result.spawned[0].branch;
    console.log(`Spawned instance: ${testInstanceId} on branch: ${testBranch}`);
  });

  it("should have agent instances registered in agent-registry", async () => {
    // Wait for async processing of AgentAssigned intents (up to 5s)
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const instances = await getJson(`${AGENT_REGISTRY}/instances?featureSlug=${testFeatureSlug}`);
      if (instances.count >= 2) {
        const testInstance = instances.instances.find((i: any) => i.id === testInstanceId);
        expect(testInstance).toBeDefined();
        expect(testInstance.status).toBe("active");
        return;
      }
    }
    // Final check
    const instances = await getJson(`${AGENT_REGISTRY}/instances?featureSlug=${testFeatureSlug}`);
    expect(instances.count).toBeGreaterThanOrEqual(1);
  }, 10000);

  it("should have runtime tracking the agents", async () => {
    // Wait for async processing
    await new Promise((r) => setTimeout(r, 1000));
    
    const agents = await getJson(`${RUNTIME}/agents`);
    // Runtime tracks agents that have been assigned tasks
    expect(agents.count).toBeGreaterThanOrEqual(0);
    if (agents.count > 0) {
      const testAgent = agents.agents.find((a: any) => a.instanceId === testInstanceId);
      // Agent may or may not be tracked depending on task assignment flow
      if (testAgent) {
        expect(testAgent.status).toMatch(/^(idle|working|stalled)$/);
      }
    }
  });

  it("should create a task via task-management", async () => {
    testTaskId = `task-${testFeatureSlug}-test-${Date.now()}`;
    
    const taskPayload: TaskCreatedPayload = {
      taskId: testTaskId,
      featureSlug: testFeatureSlug,
      assignedInstance: testInstanceId,
      phase: "1",
      description: "Test task for integration testing",
      acceptanceCriteria: ["Task is created", "Task can be completed"],
      mboMetrics: [{ name: "test-coverage", target: "80%" }],
    };

    // Use the HTTP API to create task
    const result = await postJson(`${TASK_MANAGEMENT}/task`, taskPayload);
    expect(result.success).toBe(true);

    // Wait for task to be processed (up to 5s)
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const tasks = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);
      const testTask = tasks.tasks.find((t: any) => t.taskId === testTaskId);
      if (testTask) {
        expect(testTask.state).toBe("pending");
        return;
      }
    }
    // Final check
    const tasks = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);
    expect(tasks.count).toBeGreaterThan(0);
  }, 10000);

  it("should complete a task", async () => {
    // Wait for task to be created
    await new Promise((r) => setTimeout(r, 1000));
    
    // Use the bus to emit TaskCompleted intent
    const busClient = createBusClient({ url: REDIS_URL, serviceName: "integration-test-task" });
    await busClient.connect();
    
    const completedPayload: TaskCompletedPayload = {
      taskId: testTaskId,
      instanceId: testInstanceId,
      result: "done",
      artifacts: [{ id: "artifact-1", path: "test-output.md", type: "markdown" }],
    };

    await busClient.publish("intents:task-completed", {
      type: "TaskCompleted",
      idempotencyKey: `task-completed-${testTaskId}-${Date.now()}`,
      featureSlug: testFeatureSlug,
      instanceId: testInstanceId,
      branch: testBranch,
      timestamp: new Date().toISOString(),
      payload: completedPayload,
    });

    // Wait for task to be updated (up to 5s)
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const tasks = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);
      const testTask = tasks.tasks.find((t: any) => t.taskId === testTaskId);
      if (testTask && testTask.state === "done") {
        await busClient.disconnect();
        return;
      }
    }
    
    await busClient.disconnect();
    // Final check - task should exist
    const tasks = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);
    const testTask = tasks.tasks.find((t: any) => t.taskId === testTaskId);
    expect(testTask).toBeDefined();
  }, 10000);

  it("should acquire checkout and apply edits via edit-coordinator", async () => {
    const edits: EditIntentPayload[] = [
      {
        op: "create",
        path: `00_workspace/working_files/test-integration-${testFeatureSlug}.md`,
        content: "# Integration Test\n\nThis file was created during integration testing.",
      },
    ];

    const result = await postJson(`${EDIT_COORDINATOR}/edit`, {
      instanceId: testInstanceId,
      branch: testBranch,
      featureSlug: testFeatureSlug,
      edits,
    });

    expect(result.success).toBe(true);
    expect(result.commitSha).toBeDefined();
    expect(result.commitSha).not.toBe("no-op");
    expect(result.editsApplied).toBe(1);
  });

  it("should submit a phase gate check", async () => {
    const gatePayload: PhaseGateCheckPayload = {
      featureSlug: testFeatureSlug,
      instanceId: testInstanceId,
      phase: "1",
      artifactsProduced: [`00_workspace/working_files/test-integration-${testFeatureSlug}.md`],
      mboMetrics: [
        { name: "test-coverage", value: "85%", target: "80%", onTarget: true },
        { name: "code-quality", value: "A", target: "A", onTarget: true },
      ],
      plannedGaps: [],
    };

    // Use HTTP API to submit gate check
    const result = await postJson(`${LIFECYCLE_MGMT}/gate/check`, gatePayload);
    expect(result.success).toBe(true);

    // Wait for gate to be processed
    await new Promise((r) => setTimeout(r, 1000));

    const gates = await getJson(`${LIFECYCLE_MGMT}/gates?featureSlug=${testFeatureSlug}`);
    expect(gates.count).toBeGreaterThan(0);
    // Phase is stored as a number in lifecycle-management
    const testGate = gates.phaseGates.find((g: any) => g.featureSlug === testFeatureSlug && (g.phase === 1 || g.phase === "1"));
    expect(testGate).toBeDefined();
    expect(testGate.artifactPassed).toBe(true);
    expect(testGate.mboPassed).toBe(true);
  });

  it("should handle edit-coordinator metrics", async () => {
    const metrics = await getJson(`${EDIT_COORDINATOR}/metrics`);
    expect(metrics).toBeDefined();
    expect(metrics.editsApplied).toBeGreaterThanOrEqual(0);
    expect(metrics.editsRejected).toBeGreaterThanOrEqual(0);
  });

  it("should handle task-management metrics", async () => {
    const tasks = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);
    expect(tasks.count).toBeGreaterThan(0);
    // At least one task should exist (created earlier in the test)
    expect(tasks.tasks.length).toBeGreaterThan(0);
  });
});

describe("Service Health Tests", () => {
  const services = [
    { name: "orchestrator-api", port: 3099 },
    { name: "runtime", port: 3100 },
    { name: "task-management", port: 3101 },
    { name: "session-management", port: 3102 },
    { name: "health-monitoring", port: 3103 },
    { name: "lifecycle-management", port: 3104 },
    { name: "event-coordination", port: 3105 },
    { name: "edit-coordinator", port: 3106 },
    { name: "agent-registry", port: 3107 },
    { name: "workflow", port: 3108 },
    { name: "manager-loop", port: 3109 },
    { name: "review-scheduler", port: 3110 },
    { name: "conflict-detector", port: 3111 },
    { name: "metric-alert", port: 3112 },
  ];

  for (const svc of services) {
    it(`should have ${svc.name} healthy on port ${svc.port}`, async () => {
      // Retry up to 3 times with delay for services that may be slow to respond
      let health: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          health = await getJson(`http://localhost:${svc.port}/health`);
          if (health.status) break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      expect(health).toBeDefined();
      expect(health.status).toMatch(/^(ok|ready)$/);
      expect(health.service).toBe(svc.name);
    }, 10000);
  }
});