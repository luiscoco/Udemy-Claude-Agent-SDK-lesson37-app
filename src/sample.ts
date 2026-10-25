import { runAgent, validateConfig } from "./agent.js";
await runAgent(
  validateConfig({ mode: process.argv[2] || "lifecycle" }),
  (event) => {
    if (event.type === "progress")
      console.log("Progress:", JSON.stringify(event.snapshot));
    if (event.type === "answer") console.log(event.text);
    if (event.type === "evidence")
      console.log("Evidence:", JSON.stringify(event));
  },
);
