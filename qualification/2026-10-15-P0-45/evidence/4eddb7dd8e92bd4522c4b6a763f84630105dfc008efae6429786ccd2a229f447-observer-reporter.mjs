import { writeFileSync } from "node:fs";

// Private reporter only. Original config, guards, setup, tests and product imports stay unchanged.
export default class ScoreQualificationObserver {
  onTestRunEnd(testModules, unhandledErrors, reason) {
    if (!Array.isArray(testModules) || !Array.isArray(unhandledErrors)) throw new Error("Unexpected Vitest run-end shape");
    const output = process.env.AMC_P021_RUNTIME_OBSERVER_PATH;
    if (!output) throw new Error("Owned observer output path is required");
    const tasks = [];
    const visit = (task, parents, isFile = false) => {
      if (!task || !["test", "suite"].includes(task.type)) throw new Error("Unexpected Vitest task shape");
      const kind = isFile ? "file" : task.type;
      const names = [...parents, task.name];
      const errors = task.result?.errors ?? [];
      const hooks = task.result?.hooks ?? {};
      if (!Array.isArray(errors) || !hooks || typeof hooks !== "object" || Array.isArray(hooks)) throw new Error("Unexpected Vitest result shape");
      tasks.push({ kind, id: task.id, name: names.join(" "), fullName: task.type === "test" ? [...parents.slice(1), task.name].join(" ") : null, filepath: task.filepath ?? null,
        state: task.result?.state ?? null, hooks, errors });
      if (task.type === "suite") {
        if (!Array.isArray(task.tasks)) throw new Error("Unexpected Vitest suite children");
        for (const child of task.tasks) visit(child, names);
      }
    };
    for (const module of testModules) visit(module.task, [], true);
    const record = { schema: "amc-private-score-qualification-runtime-observer/1", pid: process.pid, cwd: process.cwd(), reason,
      files: testModules.map(module => module.task.filepath), testCount: tasks.filter(task => task.kind === "test").length,
      unhandledErrors, tasks,
      boundary: "Run-end records precede global teardown; post-exit outer streams are separately checked. Serialized test errors retain body/hook stacks for manual classification." };
    writeFileSync(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
}
