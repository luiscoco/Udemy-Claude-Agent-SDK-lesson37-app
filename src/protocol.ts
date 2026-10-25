export const MODES = [
  "plan",
  "lifecycle",
  "website",
  "delete",
  "rename",
  "readback",
  "denied",
  "legacy",
  "capped",
] as const;
export type Mode = (typeof MODES)[number];
export interface RunConfig {
  mode: Mode;
}
export interface Task {
  id: string;
  subject: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed";
}
export interface Change {
  toolUseId: string;
  tool: string;
  outcome: string;
  taskId?: string;
  status?: string;
}
export interface Snapshot {
  tasks: Task[];
  completed: number;
  inProgress: number;
  total: number;
  pendingCalls: number;
  changes: Change[];
}
export interface Observation {
  sequence: number;
  atMs: number;
  kind: string;
  detail: unknown;
}
export interface Evidence {
  mode: Mode;
  progress: Snapshot;
  snapshots: Snapshot[];
  discoveredTools: string[];
  result: unknown;
  exception: string | null;
  nativeErrors: number;
  fixtureUnchanged: boolean;
  files: { name: string; content: string }[];
  observations: Observation[];
}
export type LabEvent =
  | { type: "options"; options: unknown; config: RunConfig }
  | { type: "observation"; record: Observation }
  | { type: "progress"; snapshot: Snapshot }
  | { type: "answer"; text: string }
  | { type: "discovery"; tools: string[] }
  | { type: "result"; value: unknown }
  | ({ type: "evidence" } & Evidence)
  | { type: "error" | "notice"; text: string };
