import { renderMarkdown } from "./markdown.js";
const get = (id) => document.getElementById(id);
const rows = [], observations = [];
const run = get("run");
const select = get("observation-select");
let complete = false;
function json(id, value) {
    get(id).textContent = JSON.stringify(value, null, 2);
    Prism.highlightElement(get(id));
}
function progress(s) {
    get("summary").textContent =
        `${s.completed}/${s.total} completed · ${s.inProgress} in progress`;
    get("pending").textContent =
        `${s.pendingCalls} task-tool request(s) awaiting results`;
    const fragment = document.createDocumentFragment();
    for (const t of s.tasks) {
        const item = document.createElement("li");
        item.className = `task ${t.status}`;
        const icon = t.status === "completed" ? "✓" : t.status === "in_progress" ? "↻" : "○";
        const label = t.status === "in_progress" && t.activeForm ? t.activeForm : t.subject;
        item.textContent = `${icon} ${label}`;
        const meta = document.createElement("p");
        meta.className = "meta";
        meta.textContent = `Task ${t.id} · ${t.status}`;
        item.append(meta);
        fragment.append(item);
    }
    get("tasks").replaceChildren(fragment);
    json("tracker", s);
    json("changes", s.changes);
}
select.onchange = () => json("selected-observation", observations[Number(select.value)]);
function show(e) {
    rows.push(e);
    if (e.type === "options")
        json("options", e.options);
    if (e.type === "progress")
        progress(e.snapshot);
    if (e.type === "answer") {
        const p = document.createElement("article");
        renderMarkdown(p, e.text);
        get("conversation").append(p);
        for (const code of p.querySelectorAll("pre code"))
            Prism.highlightElement(code);
    }
    if (e.type === "discovery")
        json("discovery", e.tools);
    if (e.type === "result")
        json("result", e.value);
    if (e.type === "observation") {
        observations.push(e.record);
        const o = document.createElement("option");
        o.value = String(observations.length - 1);
        o.textContent = `${e.record.sequence} · ${e.record.atMs} ms · ${e.record.kind}`;
        select.append(o);
        select.value = o.value;
        json("selected-observation", e.record);
    }
    if (e.type === "error")
        get("status").textContent = e.text;
    if (e.type === "evidence") {
        complete = true;
        json("evidence", e);
        json("files", e.files);
        get("exception").textContent = e.exception || "No exception observed.";
    }
}
run.onclick = async () => {
    rows.length = 0;
    observations.length = 0;
    complete = false;
    get("conversation").replaceChildren();
    select.replaceChildren();
    get("tasks").replaceChildren();
    for (const id of [
        "options",
        "tracker",
        "changes",
        "discovery",
        "result",
        "evidence",
        "files",
        "selected-observation",
    ])
        json(id, {});
    get("summary").textContent = "No confirmed tasks yet";
    get("pending").textContent = "Waiting for actual SDK task results.";
    get("exception").textContent = "";
    run.disabled = true;
    get("status").textContent = "Running real SDK query…";
    try {
        const response = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: get("mode").value }),
        });
        if (!response.ok || !response.body)
            throw new Error(await response.text());
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let pending = "";
        while (true) {
            const { value, done } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            let end;
            while ((end = pending.indexOf("\n\n")) >= 0) {
                const frame = pending.slice(0, end);
                pending = pending.slice(end + 2);
                if (frame.startsWith("data: "))
                    show(JSON.parse(frame.slice(6)));
            }
            if (done)
                break;
        }
        if (complete)
            get("status").textContent = "Complete · actual SDK evidence ready";
    }
    catch (error) {
        get("status").textContent =
            error instanceof Error ? error.message : "Run failed.";
    }
    finally {
        run.disabled = false;
    }
};
get("download").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lesson37-actual-events.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const config = await (await fetch("/api/config")).json();
run.disabled = !config.ready;
get("configuration").textContent = config.ready
    ? `Model: ${config.model} · SDK ${config.typescriptVersion} · key configured privately on server`
    : "Configure the model key in .env and restart. See How to run.";
