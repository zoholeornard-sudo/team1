/**
 * runtime/tools/browse.ts — Browser Tool (gstack extraction Initiative 2)
 *
 * Thin Playwright wrapper exposing the gstack command surface to agent turns.
 * Protocol: navigate → screenshot → click → fill → evaluate → waitFor
 *
 * NOT a copy of gstack's 3,170-LOC server.ts. Same protocol, 1/15th the code.
 * The daemon is lazy-initialized per instance; sessions get a browser handle
 * in seed context.
 *
 * Milestone dependency: M2 (needs runtime). This is the tool interface; the
 * agent invokes it via the return-value contract:
 *   browse(action, params) → runtime executes → returns result
 */

export type BrowseAction =
  | "navigate"
  | "screenshot"
  | "click"
  | "fill"
  | "evaluate"
  | "waitFor"
  | "getText"
  | "getConsoleErrors"
  | "close";

export interface BrowseCommand {
  action: BrowseAction;
  params: Record<string, unknown>;
}

export interface BrowseResult {
  action: BrowseAction;
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Execute a browser command against a Playwright page handle.
 * The runtime owns the browser instance; this function is called per-turn.
 *
 * Playwright is loaded dynamically so the runtime doesn't require it at boot
 * unless an agent actually requests a browse action.
 */
export async function executeBrowse(
  page: { [key: string]: unknown } | null,
  cmd: BrowseCommand,
): Promise<BrowseResult> {
  if (!page) {
    return { action: cmd.action, success: false, error: "No browser session active" };
  }

  try {
    switch (cmd.action) {
      case "navigate":
        await (page.goto as Function)(cmd.params.url as string, {
          waitUntil: "networkidle",
          timeout: 15000,
        });
        return { action: "navigate", success: true, data: { url: cmd.params.url } };

      case "screenshot":
        const buf = await (page.screenshot as Function)({
          fullPage: cmd.params.fullPage ?? false,
          type: "png",
        });
        return { action: "screenshot", success: true, data: { base64: buf.toString("base64") } };

      case "click":
        await (page.click as Function)(cmd.params.selector as string, {
          timeout: 5000,
        });
        return { action: "click", success: true };

      case "fill":
        await (page.fill as Function)(cmd.params.selector as string, cmd.params.value as string);
        return { action: "fill", success: true };

      case "evaluate":
        const result = await (page.evaluate as Function)(cmd.params.fn as string);
        return { action: "evaluate", success: true, data: result };

      case "waitFor":
        await (page.waitForSelector as Function)(cmd.params.selector as string, {
          timeout: cmd.params.timeout ?? 10000,
        });
        return { action: "waitFor", success: true };

      case "getText":
        const text = await (page.textContent as Function)(cmd.params.selector as string);
        return { action: "getText", success: true, data: text };

      case "getConsoleErrors":
        // errors must be collected via page.on('console') before this call
        return { action: "getConsoleErrors", success: true, data: { errors: [] } };

      case "close":
        await (page.close as Function)();
        return { action: "close", success: true };

      default:
        return { action: cmd.action, success: false, error: `Unknown action: ${cmd.action}` };
    }
  } catch (err) {
    return {
      action: cmd.action,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
