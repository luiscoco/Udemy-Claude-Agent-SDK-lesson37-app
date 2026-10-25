# Claude Agent SDK · Lesson 37 · Todo tracking and live progress

Five linked student pages, large text, actual SDK experiments and coloured code in all thirteen UML steps.

## What you will learn

- Opt in and inspect availability: Task tools depend on the bundled runtime and model. This app explicitly enables CLAUDE_CODE_ENABLE_TODO_TOOLS, selects native Task tools and shows the actual SDK initialization tool list.
- Correlate real task IDs: TaskCreate input describes a task. Its ID comes from the correlated user tool result, in tool_use_result.task.id. Pair that result with the request through tool_use_id.
- Track confirmed lifecycle changes: Use pending, in_progress and completed. TaskUpdate deleted removes a task. This tracker waits for successful tool results before changing confirmed state, so a denied update cannot falsely complete a task.
- Render active work clearly: Show activeForm while a task is in_progress and subject otherwise. Count completed and in-progress tasks. Pending tasks use an open circle, not a failure symbol.
- Compare progress with actual work: The website experiment creates home, about and stylesheet tasks, writes the three bounded files and updates progress. Inspect independently read file content; a completed checklist is an agent report, not an independent test.
- Handle variations and failure: Read raw taskId, id or task_id and activeForm or active_form defensively. Compare TaskList, TaskGet, deletion, failed updates, the legacy TodoWrite replacement list and a real turn-limit result plus exception.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson37-app.git
cd .\Udemy-Claude-Agent-SDK-lesson37-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson37-todo-progress`. Open http://127.0.0.1:3137 and keep the terminal running. Node.js 24+, API credit and model access are required. Windows may require Git Bash.

## Create your .env file

Preserve an existing file. Enter your own model key, then restart. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3137
# Windows only, if needed:
# CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe

```

No GitHub token or Managed Agents IDs are required. Secrets, dependencies and teaching media stay outside Git.

## Run the experiments

### Watch a real plan and website build

Compare Plan only with Lifecycle. Run Website and watch three tasks progress as actual HTML and CSS files are written. The explicit work hook delay is 1.8 seconds per classroom Read or Write.

```powershell
npm run sample:env -- plan
npm run sample:env -- lifecycle
npm run sample:env -- website
```

### Inspect IDs, labels and deletion

Compare the actual create tool request with its paired result. Run Delete, Rename and Read back; inspect TaskList and TaskGet output. Raw key aliases are supported by the tracker.

```powershell
npm run sample:env -- delete
npm run sample:env -- rename
npm run sample:env -- readback
```

### Compare failure, legacy tools and limits

Denied update must leave confirmed progress pending. Legacy enables TodoWrite with CLAUDE_CODE_ENABLE_TASKS=0 and replaces the entire list. Capped records an actual error_max_turns result and the following exception. Download observations and run offline tests.

```powershell
npm run sample:env -- denied
npm run sample:env -- legacy
npm run sample:env -- capped
npm test
```

## How the app was built

### 1. Validate the selected experiment

Accept a named classroom experiment. Browser input cannot replace the tools, prompts or filesystem scope.

Source: `src/modes.ts`, selected lines 3–9. Surrounding code omitted.

```typescript
export function validateConfig(value: unknown): RunConfig {
  const c = value as Record<string, unknown>;
  if (!c || typeof c !== "object" || !MODES.includes(c.mode as never))
    throw new Error("Choose a listed todo experiment.");
  if (Object.keys(c).some((k) => k !== "mode"))
    throw new Error("Only the classroom mode can be configured here.");
  return { mode: c.mode as RunConfig["mode"] };
```

### 2. Opt in to native task tools

Enable todo tools for the SDK subprocess while preserving inherited environment values. The legacy experiment selects TodoWrite instead.

Source: `src/agent.ts`, selected lines 119–122. Surrounding code omitted.

```typescript
CLAUDE_CODE_ENABLE_TODO_TOOLS: "1",
      CLAUDE_CODE_ENABLE_TASKS: c.mode === "legacy" ? "0" : "1",
    },
    hooks: {
```

### 3. Start the actual SDK query

A real query owns planning and execution. Drain the loop so the final result and any following exception are observed.

Source: `src/agent.ts`, selected lines 189–191. Surrounding code omitted.

```typescript
const q = query({ prompt: PROMPTS[c.mode], options });
      for await (const message of q) {
        if (message.type === "system" && message.subtype === "init") {
```

### 4. Inspect actual tool availability

SDK initialization reports the actual runtime tool list. Do not infer availability solely from the configured model name.

Source: `src/agent.ts`, selected lines 192–194. Surrounding code omitted.

```typescript
discoveredTools = message.tools;
          emit({ type: "discovery", tools: discoveredTools });
        } else if (message.type === "assistant") {
```

### 5. Receive structured task requests

Assistant tool_use blocks contain task requests. Record them before tracking their eventual correlated result.

Source: `src/agent.ts`, selected lines 196–200. Surrounding code omitted.

```typescript
if (block.type === "tool_use") {
              observe("tool-request", block);
              tracker.request(block);
              progress();
            } else if (block.type === "text")
```

### 6. Keep requests provisional

Store each task request once by tool-use ID. A request alone does not add a confirmed task or change its status.

Source: `src/tracker.ts`, selected lines 18–24. Surrounding code omitted.

```typescript
request(call: Call) {
    if (!["TaskCreate", "TaskUpdate", "TodoWrite"].includes(call.name)) return;
    if (this.seenCalls.has(call.id)) return;
    this.seenCalls.add(call.id);
    this.calls.set(call.id, structuredClone(call));
    // Requests remain provisional until their correlated result succeeds.
  }
```

### 7. Correlate actual tool results

Pair user tool_result.tool_use_id with the earlier tool call. Read the structured tool_use_result object carried on that same user message.

Source: `src/agent.ts`, selected lines 216–218. Surrounding code omitted.

```typescript
tracker.result(block, message.tool_use_result);
            progress();
          }
```

### 8. Read assigned task IDs

TaskCreate results supply task.id. A missing ID does not create a synthetic Task-system identifier.

Source: `src/tracker.ts`, selected lines 42–50. Surrounding code omitted.

```typescript
const id = text(object(out.task).id);
      const subject = text(input.subject);
      if (!id || !subject) return;
      this.tasks.set(id, {
        id,
        subject,
        status: "pending",
        activeForm: text(input.activeForm ?? input.active_form),
      });
```

### 9. Confirm lifecycle updates

Accept raw identifier aliases, locate a known task and reject explicit failed execution. Apply updates only after a successful result.

Source: `src/tracker.ts`, selected lines 57–61. Surrounding code omitted.

```typescript
const id = text(input.taskId ?? input.id ?? input.task_id);
      if (!id || !this.tasks.has(id)) return;
      // An explicit false success response is not an accepted update.
      if (out.success === false) return;
      if (input.status === "deleted") {
```

### 10. Remove an obsolete task

Successful deletion removes the task from the map and progress denominator. Keep the confirmed deletion in history.

Source: `src/tracker.ts`, selected lines 61–69. Surrounding code omitted.

```typescript
if (input.status === "deleted") {
        this.tasks.delete(id);
        Object.assign(change, {
          outcome: "confirmed",
          taskId: id,
          status: "deleted",
        });
        return;
      }
```

### 11. Count confirmed progress

Count completed and active tasks from the confirmed snapshot. Pending tool requests are reported separately.

Source: `src/tracker.ts`, selected lines 106–110. Surrounding code omitted.

```typescript
completed: tasks.filter((t) => t.status === "completed").length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      pendingCalls: this.calls.size,
      changes: this.changes.map((c) => ({ ...c })),
    };
```

### 12. Render active work labels

Show activeForm only while in_progress; use the subject otherwise. Build browser text nodes so task labels cannot inject HTML.

Source: `src/client.ts`, selected lines 25–31. Surrounding code omitted.

```typescript
const label =
      t.status === "in_progress" && t.activeForm ? t.activeForm : t.subject;
    item.textContent = `${icon} ${label}`;
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `Task ${t.id} · ${t.status}`;
    item.append(meta);
```

### 13. Inspect actual work and cleanup

Read the actual bounded website files and fixture before emitting evidence. The finally block cleans only the verified temporary run directory.

Source: `src/agent.ts`, selected lines 240–248. Surrounding code omitted.

```typescript
const inspected = await workspace.inspect();
    const evidence: Evidence = {
      mode: c.mode,
      progress: tracker.snapshot(),
      snapshots,
      discoveredTools,
      result,
      exception,
      nativeErrors,
```

## Reference topics and limits

- Tool availability: The bundled Claude Code runtime selects task-tool defaults by model. This app explicitly opts in and displays actual initialized tools. Native Task tools and legacy TodoWrite are separate verified experiments.
- Progress is reported work: A completed task means the agent successfully updated its list. It is not proof that the underlying work is correct. Inspect independently read files, native feedback and application-specific checks.
- Requests versus confirmed state: The browser receives both requests and results. This tracker commits status changes after successful correlated results, improving on request-only progress displays when tools can fail or be denied.
- Task IDs and aliases: TaskCreate assigns IDs in tool_use_result.task.id. Raw model input can use taskId, id or task_id and activeForm or active_form. Unknown IDs are not silently synthesized.
- Legacy list semantics: TodoWrite replaces an entire list. It does not supply TaskCreate IDs. This interface labels its own display keys legacy-row-N; they are explicitly local presentation keys.
- Lifecycle and costs: TaskCreate, TaskUpdate, TaskList and TaskGet are planning tools, distinct from background-task system notifications. This app launches no subagents or background work. Queries are bounded by turns, a six-minute host timeout and a $0.60 SDK budget threshold, which is not a prepaid cap.

## References

- [Official SDK todo-tracking documentation](https://code.claude.com/docs/en/agent-sdk/todo-tracking)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)

Regenerate student pages with `python scripts/build-pages.py`. Run `npm test` for offline boundaries, review lifecycle, workspace and startup checks.
