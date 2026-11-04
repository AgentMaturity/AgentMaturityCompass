# Summarize P0-62 Studio lane runs into one JSON (scratch helper; output is committed as a receipt).
import json, os, re, sys
base, label, tarball_sha, commit = sys.argv[1:5]
runs = []
for name in sorted(os.listdir(base)):
    d = os.path.join(base, name); row = {"run": name}
    if not os.path.exists(os.path.join(d, "environment.txt")): continue
    env = open(os.path.join(d, "environment.txt")).read()
    row["loadavgBefore"] = re.search(r"^loadavg ([\d.]+)", env, re.M).group(1)
    m = re.search(r"exit (\d+) duration (\d+)s", open(os.path.join(d, "studio.log")).read()); row["studioStepExit"], row["studioStepSeconds"] = int(m.group(1)), int(m.group(2))
    r = json.load(open(os.path.join(d, "studio", "fixture-run-receipt.json")))
    row["ok"] = r.get("ok"); row["error"] = r.get("error")
    row["publicCommandExits"] = [c["exitCode"] for c in r["commands"]]
    b = os.path.join(d, "studio", "browser", "receipt.json")
    if os.path.exists(b): row["browserCounts"] = json.load(open(b)).get("counts")
    row["coldVerifiersValid"] = sum(1 for v in r.get("coldVerifiers") or [] if v.get("valid"))
    if not r.get("ok"):
        for f, key in (("command-06.log", "upDemoOutput"), ("command-07.log", "downOutput"), ("demo-studio.log", "demoDaemonLog")):
            p = os.path.join(d, "studio", "logs", f)
            row[key] = open(p).read().strip() if os.path.exists(p) else None
        row["demoDaemonCleanup"] = [c for c in r.get("cleanup", []) if "demo" in c.get("resource", "")]
    runs.append(row)
out = {"label": label, "environment": "local colima amc-s7f (Ubuntu 24.04, 6.8.0-117-generic, 4 vCPU) on macOS arm64; not CI",
       "image": "node:24-bookworm@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0 + baked bubblewrap, python3-venv, Playwright 1.62.1, Chromium (local tag amc-p062-studio:arm64)",
       "tarballSha256": tarball_sha, "sourceCommit": commit, "runs": runs,
       "passed": sum(1 for r in runs if r["ok"]), "failed": sum(1 for r in runs if not r["ok"])}
print(json.dumps(out, indent=1))
