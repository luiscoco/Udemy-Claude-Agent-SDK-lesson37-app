import type { Task, Change, Snapshot } from "./protocol.js";
interface Call {
  id: string;
  name: string;
  input: unknown;
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown) => (typeof v === "string" ? v : undefined);
const statuses = ["pending", "in_progress", "completed"] as const;
export class TaskTracker {
  private tasks = new Map<string, Task>();
  private calls = new Map<string, Call>();
  private seenCalls = new Set<string>();
  readonly changes: Change[] = [];
  request(call: Call) {
    if (!["TaskCreate", "TaskUpdate", "TodoWrite"].includes(call.name)) return;
    if (this.seenCalls.has(call.id)) return;
    this.seenCalls.add(call.id);
    this.calls.set(call.id, structuredClone(call));
    // Requests remain provisional until their correlated result succeeds.
  }
  result(block: { tool_use_id: string; is_error?: boolean }, output: unknown) {
    const call = this.calls.get(block.tool_use_id);
    if (!call) return;
    this.calls.delete(block.tool_use_id);
    const change: Change = {
      toolUseId: call.id,
      tool: call.name,
      outcome: "unconfirmed",
    };
    this.changes.push(change);
    if (block.is_error) {
      change.outcome = "failed";
      return;
    }
    const input = object(call.input),
      out = object(output);
    if (call.name === "TaskCreate") {
      const id = text(object(out.task).id);
      const subject = text(input.subject);
      if (!id || !subject) return;
      this.tasks.set(id, {
        id,
        subject,
        status: "pending",
        activeForm: text(input.activeForm ?? input.active_form),
      });
      Object.assign(change, {
        outcome: "confirmed",
        taskId: id,
        status: "pending",
      });
    } else if (call.name === "TaskUpdate") {
      const id = text(input.taskId ?? input.id ?? input.task_id);
      if (!id || !this.tasks.has(id)) return;
      // An explicit false success response is not an accepted update.
      if (out.success === false) return;
      if (input.status === "deleted") {
        this.tasks.delete(id);
        Object.assign(change, {
          outcome: "confirmed",
          taskId: id,
          status: "deleted",
        });
        return;
      }
      const task = this.tasks.get(id)!;
      if (statuses.includes(input.status as never))
        task.status = input.status as Task["status"];
      const subject = text(input.subject),
        active = text(input.activeForm ?? input.active_form);
      if (subject) task.subject = subject;
      if (active) task.activeForm = active;
      Object.assign(change, {
        outcome: "confirmed",
        taskId: id,
        status: task.status,
      });
    } else if (call.name === "TodoWrite" && Array.isArray(input.todos)) {
      // Legacy TodoWrite replaces a whole list and has no TaskCreate IDs.
      const next = new Map<string, Task>();
      for (const [i, value] of input.todos.entries()) {
        const t = object(value),
          subject = text(t.content);
        if (!subject || !statuses.includes(t.status as never)) return;
        const id = `legacy-row-${i + 1}`;
        next.set(id, {
          id,
          subject,
          activeForm: text(t.activeForm),
          status: t.status as Task["status"],
        });
      }
      this.tasks = next;
      change.outcome = "confirmed";
    }
  }
  snapshot(): Snapshot {
    const tasks = [...this.tasks.values()].map((t) => ({ ...t }));
    return {
      tasks,
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "completed").length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      pendingCalls: this.calls.size,
      changes: this.changes.map((c) => ({ ...c })),
    };
  }
}
