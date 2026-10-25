import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { TaskTracker } from "./tracker.js";
import { prepareWorkspace } from "./workspace.js";
import { validateConfig, MODES } from "./modes.js";
import type {
  RunConfig,
  Mode,
  LabEvent,
  Observation,
  Snapshot,
  Evidence,
} from "./protocol.js";
export { validateConfig, MODES };
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const DEFAULT_CONFIG: RunConfig = { mode: "lifecycle" };
const create =
  "Use TaskCreate once to create a task with subject 'Inspect classroom fixture', description 'Read lesson.txt and report the marker', activeForm 'Inspecting classroom fixture'. Use the returned real task ID in later updates.";
const finish =
  "Finish with a short Markdown summary. Do not use other tools or retry denied calls.";
export const PROMPTS: Record<Mode, string> = {
  plan:
    create + " Leave it pending; do not do the work or complete it. " + finish,
  lifecycle:
    create +
    " Then TaskUpdate in_progress, Read lesson.txt once, then TaskUpdate completed. " +
    finish,
  website:
    "Build a tiny classroom website using three tasks. First create all three tasks with TaskCreate: 'Create home page', 'Create about page', 'Create shared stylesheet'. Give each an activeForm describing work in progress. Then for each task sequentially: TaskUpdate in_progress; Write its corresponding file (index.html, about.html, style.css); TaskUpdate completed. Include the text TODO-37 in both pages, link style.css, and make the two pages link to each other. Only these three files may be written. " +
    finish,
  delete:
    "Create two tasks with TaskCreate: 'Keep classroom outline' and 'Remove obsolete draft'. Then delete only the obsolete task with TaskUpdate status deleted using its returned task ID. Leave the first pending. " +
    finish,
  rename:
    create +
    " Then update its subject to 'Verify classroom marker' and activeForm to 'Verifying classroom marker', leaving status pending. Next set in_progress, Read lesson.txt once, and complete the task. " +
    finish,
  readback:
    create +
    " Then call TaskList once and TaskGet once using that actual task ID. Leave the task pending. " +
    finish,
  denied:
    create +
    " Then try TaskUpdate completed exactly once. A classroom guard will reject that completion. Report the rejection; leave the task pending and do not retry. " +
    finish,
  legacy:
    "Use TodoWrite exactly three times. First a list with one item content 'Inspect legacy fixture', status pending, activeForm 'Inspecting legacy fixture'. Second replace the list with that item in_progress. Read lesson.txt once. Third replace the list with that item completed. " +
    finish,
  capped: create + " Leave it pending and finish. " + finish,
};
export function redact(text: string) {
  for (const s of [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
  ].filter(Boolean) as string[])
    text = text.split(s).join("[REDACTED]");
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]");
}
export async function runAgent(
  value: RunConfig,
  emit: (event: LabEvent) => void,
  controller = new AbortController(),
) {
  const c = validateConfig(value),
    workspace = await prepareWorkspace();
  const tracker = new TaskTracker(),
    snapshots: Snapshot[] = [],
    observations: Observation[] = [];
  const started = Date.now();
  let discoveredTools: string[] = [],
    result: unknown = null;
  let exception: string | null = null,
    nativeErrors = 0;
  const observe = (kind: string, detail: unknown) => {
    const record = {
      sequence: observations.length + 1,
      atMs: Date.now() - started,
      kind,
      detail,
    };
    observations.push(record);
    emit({ type: "observation", record });
  };
  const progress = () => {
    const snapshot = tracker.snapshot();
    snapshots.push(snapshot);
    emit({ type: "progress", snapshot });
  };
  const taskTools =
    c.mode === "legacy"
      ? ["TodoWrite"]
      : ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet"];
  const tools = [
    ...taskTools,
    "Read",
    ...(c.mode === "website" ? ["Write"] : []),
  ];
  const options: Options = {
    cwd: workspace.cwd,
    model: MODEL,
    tools,
    allowedTools: tools,
    permissionMode: "dontAsk",
    settingSources: [],
    plugins: [],
    persistSession: false,
    maxTurns: c.mode === "capped" ? 1 : 20,
    maxBudgetUsd: 0.6,
    effort: "low",
    thinking: { type: "disabled" },
    abortController: controller,
    env: {
      ...process.env,
      HOME: workspace.home,
      USERPROFILE: workspace.home,
      CLAUDE_CONFIG_DIR: workspace.sdkHome,
      ANTHROPIC_AUTH_TOKEN: undefined,
      CLAUDE_CODE_ENABLE_TODO_TOOLS: "1",
      CLAUDE_CODE_ENABLE_TASKS: c.mode === "legacy" ? "0" : "1",
    },
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input, _id, context) => {
              if (input.hook_event_name !== "PreToolUse") return {};
              const i = input.tool_input as Record<string, unknown>;
              const file =
                typeof i.file_path === "string"
                  ? resolve(workspace.cwd, i.file_path)
                  : "";
              const read =
                input.tool_name === "Read" &&
                file === resolve(workspace.cwd, "lesson.txt");
              const write =
                c.mode === "website" &&
                input.tool_name === "Write" &&
                ["index.html", "about.html", "style.css"].some(
                  (n) => file === resolve(workspace.cwd, n),
                ) &&
                typeof i.content === "string" &&
                i.content.length < 12000;
              const task = taskTools.includes(input.tool_name);
              const deniedCompletion =
                c.mode === "denied" &&
                input.tool_name === "TaskUpdate" &&
                i.status === "completed";
              if ((!read && !write && !task) || deniedCompletion) {
                observe("guard-denied", { tool: input.tool_name, input: i });
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason:
                      "Classroom guard: this action is not permitted in the selected experiment.",
                  },
                };
              }
              if (read || write) {
                observe("work-running", { tool: input.tool_name, file });
                // Explicit teaching delay makes an actual in-progress state visible.
                await delay(1800, undefined, { signal: context.signal });
              }
              return {};
            },
          ],
        },
      ],
    },
  };
  emit({
    type: "options",
    config: c,
    options: {
      model: MODEL,
      tools,
      maxTurns: options.maxTurns,
      maxBudgetUsd: options.maxBudgetUsd,
      env: {
        CLAUDE_CODE_ENABLE_TODO_TOOLS: "1",
        CLAUDE_CODE_ENABLE_TASKS: c.mode === "legacy" ? "0" : "1",
      },
      prompt: PROMPTS[c.mode],
    },
  });
  try {
    try {
      const q = query({ prompt: PROMPTS[c.mode], options });
      for await (const message of q) {
        if (message.type === "system" && message.subtype === "init") {
          discoveredTools = message.tools;
          emit({ type: "discovery", tools: discoveredTools });
        } else if (message.type === "assistant") {
          for (const block of message.message.content) {
            if (block.type === "tool_use") {
              observe("tool-request", block);
              tracker.request(block);
              progress();
            } else if (block.type === "text")
              emit({ type: "answer", text: redact(block.text) });
          }
        } else if (
          message.type === "user" &&
          Array.isArray(message.message.content)
        ) {
          for (const block of message.message.content) {
            if (block.type !== "tool_result") continue;
            if (block.is_error) nativeErrors++;
            observe("tool-result", {
              toolUseId: block.tool_use_id,
              isError: !!block.is_error,
              output: message.tool_use_result,
              content: block.content,
            });
            tracker.result(block, message.tool_use_result);
            progress();
          }
        } else if (message.type === "result") {
          result = {
            subtype: message.subtype,
            sessionId: message.session_id,
            costUsd: message.total_cost_usd,
            turns: message.num_turns,
            text:
              message.subtype === "success"
                ? redact(message.result)
                : message.errors,
          };
          emit({ type: "result", value: result });
        }
      }
    } catch (error) {
      exception = redact(
        error instanceof Error ? error.message : String(error),
      );
      observe("exception", exception);
      if (!result) emit({ type: "error", text: exception });
    }
    const inspected = await workspace.inspect();
    const evidence: Evidence = {
      mode: c.mode,
      progress: tracker.snapshot(),
      snapshots,
      discoveredTools,
      result,
      exception,
      nativeErrors,
      ...inspected,
      observations,
    };
    emit({ type: "evidence", ...evidence });
  } finally {
    await workspace.cleanup();
  }
}
