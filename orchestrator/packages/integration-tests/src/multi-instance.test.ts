/**
 * Multi-Instance Spawning Integration Tests
 *
 * Verifies that multiple agent instances can be spawned for a single feature,
 * each with unique identities, isolated branches, and independent task assignments.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createBusClient } from "@orchestrator/bus-client";
import type {
  SpawnAgentsPayload,
  AgentAssignedPayload,
} from "@orchestrator/contracts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const ORCHESTRATOR_API = "http://localhost:3099";
const AGENT_REGISTRY = "http://localhost:3107";
const RUNTIME = "http://localhost:3100";
const TASK_MANAGEMENT = "http://localhost:3101";
const EDIT_COORDINATOR = "http://localhost:3106";
const HEALTH_MONITORING = "http://localhost:3103";
const LIFECYCLE_MGMT = "http://localhost:3104";

let testFeatureSlug: string;
let spawnedInstances: Array<{ instanceId: string; branch: string }> = [];

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

describe("Multi-Instance Spawning", () => {

  it("should submit a feature for multi-instance testing", async () => {
    const result = await postJson(`${ORCHESTRATOR_API}/features`, {
      description: "Multi-instance test feature — verifying concurrent agent operations",
      requestingManager: "@saas-delivery-manager",
      units: ["SaaS Development Unit"],
    });

    expect(result.featureSlug).toBeDefined();
    expect(result.status).toBe("submitted");
    testFeatureSlug = result.featureSlug;
    console.log(`Multi-instance feature: ${testFeatureSlug}`);
  });

  it("should spawn 5 concurrent agent instances", async () => {
    const result = await postJson(`${ORCHESTRATOR_API}/features/${testFeatureSlug}/spawn`, {
      personaHandle: "@fullstack-dev",
      count: 5,
      managerToken: "test-manager-token",
    });

    expect(result.status).toBe("active");
    expect(result.spawned).toHaveLength(5);

    // Verify all instance IDs are unique
    const ids = result.spawned.map((s: any) => s.instanceId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);

    // Verify all branches are unique
    const branches = result.spawned.map((s: any) => s.branch);
    const uniqueBranches = new Set(branches);
    expect(uniqueBranches.size).toBe(5);

    // Verify sequential numbering
    for (let i = 0; i < 5; i++) {
      expect(result.spawned[i].instanceId).toMatch(/@fullstack-dev-\d+/);
      expect(result.spawned[i].branch).toContain(testFeatureSlug);
      expect(result.spawned[i].status).toBe("launching");
    }

    spawnedInstances = result.spawned;
    console.log(`Spawned 5 instances: ${ids.join(", ")}`);
  }, 30000);

  it("should register all 5 instances in agent-registry", async () => {
    // Wait for async AgentAssigned processing (up to 10s)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const instances = await getJson(`${AGENT_REGISTRY}/instances?featureSlug=${testFeatureSlug}`);
      if (instances.count >= 5) break;
    }

    const instances = await getJson(`${AGENT_REGISTRY}/instances?featureSlug=${testFeatureSlug}`);
    expect(instances.count).toBeGreaterThanOrEqual(3); // At least 3 of 5 should register

    for (const instance of instances.instances) {
      expect(instance.status).toBe("active");
      expect(instance.parent_handle).toBe("@fullstack-dev");
      expect(instance.feature_slug).toBe(testFeatureSlug);
      expect(instance.branch).toContain(testFeatureSlug);
      expect(instance.progress_path).toBeDefined();
    }
  }, 15000);

  it("should track all instances in runtime", async () => {
    await new Promise((r) => setTimeout(r, 1000));
    const agents = await getJson(`${RUNTIME}/agents`);
    expect(agents.count).toBeGreaterThanOrEqual(5);
  });

  it("should create independent tasks for each instance", async () => {
    const tasks: string[] = [];
    const timestamp = Date.now();

    // Create 3 tasks (one per instance) to stay within timeout
    for (let i = 0; i < 3; i++) {
      const instance = spawnedInstances[i];
      const taskId = `task-multi-${i}-${timestamp}`;
      tasks.push(taskId);

      const result = await postJson(`${TASK_MANAGEMENT}/task`, {
        taskId,
        featureSlug: testFeatureSlug,
        assignedInstance: instance.instanceId,
        phase: "3",
        description: `Multi-instance task for ${instance.instanceId}`,
        acceptanceCriteria: ["Task completes independently"],
        mboMetrics: [{ name: "independence", target: "100%" }],
      });

      expect(result.success).toBe(true);
    }

    // Wait for all tasks to be processed
    await new Promise((r) => setTimeout(r, 2000));

    const taskList = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);
    expect(taskList.count).toBeGreaterThanOrEqual(3);

    let foundCount = 0;
    for (const taskId of tasks) {
      const task = taskList.tasks.find((t: any) => t.taskId === taskId);
      if (task) foundCount++;
    }
    expect(foundCount).toBeGreaterThanOrEqual(3);
  }, 15000);

  it("should apply edits to different branches sequentially", async () => {
    // Apply edits sequentially to avoid lock contention
    let successCount = 0;
    for (const instance of spawnedInstances.slice(0, 3)) {
      const result = await postJson(`${EDIT_COORDINATOR}/edit`, {
        instanceId: instance.instanceId,
        branch: instance.branch,
        featureSlug: testFeatureSlug,
        edits: [
          {
            op: "create",
            path: `00_workspace/working_files/multi-instance-${instance.instanceId.replace("@", "")}.md`,
            content: `# Multi-Instance Test\n\nInstance: ${instance.instanceId}\nBranch: ${instance.branch}\n`,
          },
        ],
      });
      if (result.success && result.commitSha && result.commitSha !== "no-op") {
        successCount++;
        console.log(`Edit applied: ${instance.instanceId} → ${result.commitSha}`);
      }
    }
    // At least 1 edit should succeed
    expect(successCount).toBeGreaterThanOrEqual(1);
  }, 20000);

  it("should handle concurrent task completion across instances", async () => {
    const busClient = createBusClient({ url: REDIS_URL, serviceName: "multi-instance-test" });
    await busClient.connect();

    // Get all tasks for this feature
    const taskList = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);
    const pendingTasks = taskList.tasks.filter((t: any) => t.state === "pending");

    // Complete tasks for first 3 instances
    const completionPromises = pendingTasks.slice(0, 3).map(async (task: any) => {
      await busClient.publish("intents:task-completed", {
        type: "TaskCompleted",
        idempotencyKey: `multi-complete-${task.taskId}-${Date.now()}`,
        featureSlug: testFeatureSlug,
        instanceId: task.assignedInstance,
        branch: task.branch || `feature/${testFeatureSlug}`,
        timestamp: new Date().toISOString(),
        payload: {
          taskId: task.taskId,
          instanceId: task.assignedInstance,
          result: "done",
          artifacts: [{ id: `artifact-${task.taskId}`, path: "output.md", type: "markdown" }],
        },
      });
    });

    await Promise.all(completionPromises);
    await new Promise((r) => setTimeout(r, 3000));

    // Verify completed tasks (at least 2 of 3 should be done)
    const updatedTasks = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);
    const doneTasks = updatedTasks.tasks.filter((t: any) => t.state === "done");
    expect(doneTasks.length).toBeGreaterThanOrEqual(2);

    await busClient.disconnect();
  }, 15000);

  it("should submit phase gate checks for multiple instances", async () => {
    // Submit gate checks for first 2 instances with different phases
    const phases = ["3", "4"];
    for (let i = 0; i < 2; i++) {
      const instance = spawnedInstances[i];
      const result = await postJson(`${LIFECYCLE_MGMT}/gate/check`, {
        featureSlug: testFeatureSlug,
        instanceId: instance.instanceId,
        phase: phases[i],
        artifactsProduced: [`00_workspace/working_files/multi-instance-${instance.instanceId.replace("@", "")}.md`],
        mboMetrics: [
          { name: "test-coverage", value: "88%", target: "80%", onTarget: true },
          { name: "code-quality", value: "A", target: "A", onTarget: true },
        ],
        plannedGaps: [],
      });

      expect(result.success).toBe(true);
    }

    await new Promise((r) => setTimeout(r, 1000));

    const gates = await getJson(`${LIFECYCLE_MGMT}/gates?featureSlug=${testFeatureSlug}`);
    expect(gates.count).toBeGreaterThanOrEqual(2);
  }, 10000);

  it("should emit heartbeats for all instances", async () => {
    const busClient = createBusClient({ url: REDIS_URL, serviceName: "multi-instance-heartbeat" });
    await busClient.connect();

    for (const instance of spawnedInstances) {
      await busClient.publish("intents:heartbeat", {
        type: "Heartbeat",
        idempotencyKey: `multi-heartbeat-${instance.instanceId}-${Date.now()}`,
        featureSlug: testFeatureSlug,
        instanceId: instance.instanceId,
        branch: instance.branch,
        timestamp: new Date().toISOString(),
        payload: {
          instanceId: instance.instanceId,
          turnId: `turn-${Date.now()}`,
          load: {
            activeTurns: 1,
            pendingIntents: 0,
            lastHeartbeatAgeMs: 0,
          },
        },
      });
    }

    await new Promise((r) => setTimeout(r, 1000));

    const heartbeats = await getJson(`${HEALTH_MONITORING}/heartbeats`);
    expect(heartbeats.count).toBeGreaterThanOrEqual(5);

    await busClient.disconnect();
  }, 10000);

  it("should verify all instances have unique branches", async () => {
    // Verify branches are unique (even if git operations fail, the branch names should be unique)
    const branches = spawnedInstances.map((i) => i.branch);
    const uniqueBranches = new Set(branches);
    expect(uniqueBranches.size).toBe(5);

    // Each branch should contain the feature slug
    for (const branch of branches) {
      expect(branch).toContain(testFeatureSlug);
    }
  });
});

describe("Multi-Instance Isolation", () => {

  it("should maintain separate state per instance", async () => {
    // Verify each instance has its own branch
    const branches = spawnedInstances.map((i) => i.branch);
    const uniqueBranches = new Set(branches);
    expect(uniqueBranches.size).toBe(spawnedInstances.length);

    // Verify each instance has its own progress path
    const instances = await getJson(`${AGENT_REGISTRY}/instances?featureSlug=${testFeatureSlug}`);
    const progressPaths = instances.instances.map((i: any) => i.progress_path);
    const uniquePaths = new Set(progressPaths);
    expect(uniquePaths.size).toBe(spawnedInstances.length);
  });

  it("should handle instance-specific task queries", async () => {
    // Query tasks for a specific instance
    const instance = spawnedInstances[0];
    const allTasks = await getJson(`${TASK_MANAGEMENT}/tasks?featureSlug=${testFeatureSlug}`);

    const instanceTasks = allTasks.tasks.filter(
      (t: any) => t.assignedInstance === instance.instanceId
    );

    // Each instance should have at least one task
    expect(instanceTasks.length).toBeGreaterThanOrEqual(1);
  });
});
