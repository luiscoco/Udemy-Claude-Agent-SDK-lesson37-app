import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskTracker } from "./tracker.js";
import { validateConfig } from "./modes.js";
// Unit fixtures only. Actual SDK experiments are verified independently.
const create = (t: TaskTracker, call: string, id: string, subject = id) => {
  t.request({
    id: call,
    name: "TaskCreate",
    input: { subject, active_form: `Working ${id}` },
  });
  t.result({ tool_use_id: call }, { task: { id, subject } });
};
test("creation waits for a correlated result ID, including out-of-order results", () => {
  const t = new TaskTracker();
  for (const id of ["a", "b"])
    t.request({ id, name: "TaskCreate", input: { subject: id } });
  assert.equal(t.snapshot().total, 0);
  t.result({ tool_use_id: "b" }, { task: { id: "20" } });
  t.result({ tool_use_id: "a" }, { task: { id: "10" } });
  assert.deepEqual(
    t.snapshot().tasks.map((x) => [x.id, x.subject]),
    [
      ["20", "b"],
      ["10", "a"],
    ],
  );
});
test("failed create and missing structured ID do not invent tasks", () => {
  const t = new TaskTracker();
  for (const id of ["a", "b"])
    t.request({ id, name: "TaskCreate", input: { subject: id } });
  t.result({ tool_use_id: "a", is_error: true }, { task: { id: "1" } });
  t.result({ tool_use_id: "b" }, {});
  assert.equal(t.snapshot().total, 0);
});
test("failed updates preserve confirmed status", () => {
  const t = new TaskTracker();
  create(t, "a", "7");
  t.request({
    id: "b",
    name: "TaskUpdate",
    input: { taskId: "7", status: "completed" },
  });
  assert.equal(t.snapshot().completed, 0);
  t.result({ tool_use_id: "b", is_error: true }, {});
  assert.equal(t.snapshot().completed, 0);
});
test("raw aliases and renamed activeForm are accepted after success", () => {
  const t = new TaskTracker();
  create(t, "a", "7");
  t.request({
    id: "b",
    name: "TaskUpdate",
    input: {
      task_id: "7",
      status: "in_progress",
      active_form: "Renaming",
      subject: "Renamed",
    },
  });
  t.result({ tool_use_id: "b" }, { success: true });
  assert.deepEqual(t.snapshot().tasks[0], {
    id: "7",
    subject: "Renamed",
    activeForm: "Renaming",
    status: "in_progress",
  });
});
test("deletion removes the task from the progress denominator", () => {
  const t = new TaskTracker();
  create(t, "a", "1");
  create(t, "b", "2");
  t.request({
    id: "c",
    name: "TaskUpdate",
    input: { id: "2", status: "deleted" },
  });
  t.result({ tool_use_id: "c" }, { success: true });
  assert.equal(t.snapshot().total, 1);
});
test("replayed tool requests and results do not duplicate state", () => {
  const t = new TaskTracker();
  create(t, "a", "1");
  create(t, "a", "1");
  assert.equal(t.snapshot().total, 1);
  assert.equal(t.snapshot().changes.length, 1);
});
test("legacy list replacement uses explicitly local row IDs", () => {
  const t = new TaskTracker();
  t.request({
    id: "a",
    name: "TodoWrite",
    input: {
      todos: [{ content: "A", activeForm: "Doing A", status: "completed" }],
    },
  });
  t.result({ tool_use_id: "a" }, {});
  assert.equal(t.snapshot().tasks[0].id, "legacy-row-1");
  assert.equal(t.snapshot().completed, 1);
});
test("browser configuration cannot override tools", () => {
  assert.throws(() => validateConfig({ mode: "unknown" }));
  assert.throws(() => validateConfig({ mode: "website", tools: ["Bash"] }));
});
