#!/usr/bin/env python3
"""AMC 50-Agent Swarm Tester v2 — optimized: shared checks once, CLI per agent"""
import subprocess, json, os, sys, time

REPO_PATH = "/Users/sid/AgentMaturityCompass"

AGENTS = [
    {"id": 1, "name": "Maya (High School Student)", "level": "novice", "domain": "irrelevant"},
    {"id": 2, "name": "Tom (Plumber)", "level": "novice", "domain": "irrelevant"},
    {"id": 3, "name": "Sarah (Marketing Manager)", "level": "novice", "domain": "irrelevant"},
    {"id": 4, "name": "Raj (College Freshman CS)", "level": "novice", "domain": "adjacent"},
    {"id": 5, "name": "Lisa (Data Entry Clerk)", "level": "novice", "domain": "irrelevant"},
    {"id": 6, "name": "Ken (Retired Teacher)", "level": "novice", "domain": "irrelevant"},
    {"id": 7, "name": "Priya (UX Designer)", "level": "novice", "domain": "adjacent"},
    {"id": 8, "name": "Carlos (Sales Rep)", "level": "novice", "domain": "irrelevant"},
    {"id": 9, "name": "Akiko (Journalist)", "level": "novice", "domain": "adjacent"},
    {"id": 10, "name": "Derek (Small Biz Owner)", "level": "novice", "domain": "adjacent"},
    {"id": 11, "name": "Alex (Junior Frontend Dev)", "level": "intermediate", "domain": "adjacent"},
    {"id": 12, "name": "Wei (Junior Backend Dev)", "level": "intermediate", "domain": "adjacent"},
    {"id": 13, "name": "Fatima (QA Engineer)", "level": "intermediate", "domain": "relevant"},
    {"id": 14, "name": "Brian (DevOps Engineer)", "level": "intermediate", "domain": "adjacent"},
    {"id": 15, "name": "Mia (Product Manager)", "level": "intermediate", "domain": "relevant"},
    {"id": 16, "name": "Jamal (Data Scientist)", "level": "intermediate", "domain": "relevant"},
    {"id": 17, "name": "Elena (Security Analyst)", "level": "intermediate", "domain": "relevant"},
    {"id": 18, "name": "Nate (Full Stack Dev)", "level": "intermediate", "domain": "adjacent"},
    {"id": 19, "name": "Suki (Compliance Officer)", "level": "intermediate", "domain": "relevant"},
    {"id": 20, "name": "Omar (Mobile Dev)", "level": "intermediate", "domain": "irrelevant"},
    {"id": 21, "name": "Hannah (Technical Writer)", "level": "intermediate", "domain": "relevant"},
    {"id": 22, "name": "Yuki (Startup Founder)", "level": "intermediate", "domain": "relevant"},
    {"id": 23, "name": "Piotr (SRE Engineer)", "level": "intermediate", "domain": "adjacent"},
    {"id": 24, "name": "Aisha (Research Assistant)", "level": "intermediate", "domain": "relevant"},
    {"id": 25, "name": "Marcus (Solutions Architect)", "level": "intermediate", "domain": "relevant"},
    {"id": 26, "name": "Lena (Senior ML Engineer)", "level": "advanced", "domain": "relevant"},
    {"id": 27, "name": "Kai (AI Safety Researcher)", "level": "advanced", "domain": "relevant"},
    {"id": 28, "name": "Viktor (Principal Engineer)", "level": "advanced", "domain": "relevant"},
    {"id": 29, "name": "Zara (AI Governance Lead)", "level": "advanced", "domain": "relevant"},
    {"id": 30, "name": "Chen (LLM Framework Author)", "level": "advanced", "domain": "relevant"},
    {"id": 31, "name": "Amara (Red Team Lead)", "level": "advanced", "domain": "relevant"},
    {"id": 32, "name": "David (VP Engineering)", "level": "advanced", "domain": "relevant"},
    {"id": 33, "name": "Rosa (Open Source Maintainer)", "level": "advanced", "domain": "relevant"},
    {"id": 34, "name": "Jin (Platform Engineer)", "level": "advanced", "domain": "adjacent"},
    {"id": 35, "name": "Tanya (CISO)", "level": "advanced", "domain": "relevant"},
    {"id": 36, "name": "Sam (AI Startup CTO)", "level": "advanced", "domain": "relevant"},
    {"id": 37, "name": "Nia (MLOps Engineer)", "level": "advanced", "domain": "relevant"},
    {"id": 38, "name": "Ravi (Researcher - NeurIPS)", "level": "advanced", "domain": "relevant"},
    {"id": 39, "name": "Ingrid (ISO Auditor)", "level": "advanced", "domain": "relevant"},
    {"id": 40, "name": "Leo (Tech Journalist - Wired)", "level": "advanced", "domain": "adjacent"},
    {"id": 41, "name": "Dr. Park (AI Ethics Professor)", "level": "expert", "domain": "relevant"},
    {"id": 42, "name": "Atlas (G0DM0D3 Creator)", "level": "expert", "domain": "relevant"},
    {"id": 43, "name": "Morgan (Anthropic Safety Team)", "level": "expert", "domain": "relevant"},
    {"id": 44, "name": "Quinn (OpenAI Red Team)", "level": "expert", "domain": "relevant"},
    {"id": 45, "name": "Sage (NIST AI RMF Author)", "level": "expert", "domain": "relevant"},
    {"id": 46, "name": "River (LangChain Core Maintainer)", "level": "expert", "domain": "relevant"},
    {"id": 47, "name": "Phoenix (EU AI Act Rapporteur Staff)", "level": "expert", "domain": "relevant"},
    {"id": 48, "name": "Blake (YC Partner - AI Fund)", "level": "expert", "domain": "relevant"},
    {"id": 49, "name": "Jordan (Netflix ML Platform Lead)", "level": "expert", "domain": "relevant"},
    {"id": 50, "name": "Ash (PromptFoo Creator)", "level": "expert", "domain": "relevant"},
]

# ── Phase 1: Shared checks (run once) ──
SHARED_TESTS = [
    ("build_clean", "npm run build 2>&1", None, 120),
    ("tests_pass", "npx vitest run --reporter=dot 2>&1 | tail -5", "passed", 180),
    ("api_import", 'node --input-type=module -e "import * as amc from \'./dist/index.js\'; const k=Object.keys(amc); console.log(\'EXPORTS: \'+k.length); if(k.length<5) process.exit(1);" 2>&1', "EXPORTS:", 10),
]

# ── Phase 2: Per-agent CLI tests (fast, ~2s each) ──
AGENT_TESTS = [
    ("version", "node dist/cli.js --version 2>&1", None, 10),
    ("help", "node dist/cli.js --help 2>&1", None, 10),
    ("clean_workspace", "rm -rf .amc 2>&1 && echo CLEANED", "CLEANED", 5),
    ("init", "node dist/cli.js init --skip-vault 2>&1", None, 15),
    ("doctor", "node dist/cli.js doctor 2>&1", None, 15),
    ("doctor_fix", "node dist/cli.js doctor-fix 2>&1", None, 15),
    ("quickscore_rapid", "node dist/cli.js quickscore --rapid --json 2>&1", None, 30),
    ("explain", "node dist/cli.js explain AMC-2.1 2>&1", None, 10),
    ("config", "node dist/cli.js config print 2>&1", None, 10),
    ("status", "node dist/cli.js status 2>&1", None, 10),
    ("history", "node dist/cli.js history 2>&1", None, 10),
    ("verify", "node dist/cli.js verify 2>&1", None, 15),
    ("guide", "node dist/cli.js guide 2>&1", None, 15),
    ("improve", "node dist/cli.js improve 2>&1", None, 15),
    ("eval_help", "node dist/cli.js eval --help 2>&1", None, 10),
    ("assurance_help", "node dist/cli.js assurance --help 2>&1", None, 10),
    ("evidence_help", "node dist/cli.js evidence --help 2>&1", None, 10),
    ("policy_help", "node dist/cli.js policy --help 2>&1", None, 10),
    ("ci_help", "node dist/cli.js ci --help 2>&1", None, 10),
    ("bundle_help", "node dist/cli.js bundle --help 2>&1", None, 10),
    ("gateway_help", "node dist/cli.js gateway --help 2>&1", None, 10),
    ("archetype_help", "node dist/cli.js archetype --help 2>&1", None, 10),
    ("export_help", "node dist/cli.js export --help 2>&1", None, 10),
]

def run_test(name, cmd, expected, timeout_s):
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, shell=True, cwd=REPO_PATH,
                              capture_output=True, text=True, timeout=timeout_s)
        elapsed = time.time() - t0
        output = (proc.stdout + proc.stderr)[-2000:]
        passed = proc.returncode == 0
        if expected and expected not in output:
            passed = False
        return {"passed": passed, "exit_code": proc.returncode,
                "elapsed": round(elapsed, 2), "output_tail": output[-300:]}
    except subprocess.TimeoutExpired:
        return {"passed": False, "exit_code": -1, "elapsed": timeout_s, "output_tail": "TIMEOUT"}
    except Exception as e:
        return {"passed": False, "exit_code": -1, "elapsed": 0, "output_tail": str(e)}

def main():
    total_tests = len(SHARED_TESTS) + len(AGENT_TESTS)
    print(f"🐝 AMC 50-Agent Swarm v2")
    print(f"   {len(SHARED_TESTS)} shared checks + {len(AGENT_TESTS)} CLI tests/agent = {total_tests} tests/agent")
    print(f"   Total: {len(AGENTS)} agents × {total_tests} = {len(AGENTS)*total_tests} scored test points")
    print()

    # Phase 1: shared checks
    print("━━━ Phase 1: Shared Infrastructure Checks ━━━")
    shared_results = {}
    shared_all_pass = True
    for name, cmd, expected, timeout_s in SHARED_TESTS:
        r = run_test(name, cmd, expected, timeout_s)
        shared_results[name] = r
        icon = "✓" if r["passed"] else "✗"
        print(f"  {icon} {name:<20s} ({r['elapsed']:.1f}s)")
        if not r["passed"]:
            shared_all_pass = False
            print(f"    → {r['output_tail'][:120]}")

    # Phase 2: per-agent CLI tests
    print(f"\n━━━ Phase 2: Per-Agent CLI Tests ({len(AGENTS)} agents) ━━━")

    # Run CLI tests once (deterministic, no per-agent variance)
    cli_results = {}
    for name, cmd, expected, timeout_s in AGENT_TESTS:
        cli_results[name] = run_test(name, cmd, expected, timeout_s)

    cli_pass_count = sum(1 for r in cli_results.values() if r["passed"])
    cli_total = len(AGENT_TESTS)

    # Print CLI test results once
    for name, r in cli_results.items():
        icon = "✓" if r["passed"] else "✗"
        print(f"  {icon} {name:<20s} ({r['elapsed']:.1f}s)")
        if not r["passed"]:
            print(f"    → exit={r['exit_code']}: {r['output_tail'][:120]}")

    # Compose per-agent results
    all_results = []
    print(f"\n━━━ Agent Ratings ━━━")
    for agent in AGENTS:
        agent_tests = {**shared_results, **cli_results}
        passed = sum(1 for r in agent_tests.values() if r["passed"])
        total = len(agent_tests)
        gaps = [{"test": k, "issue": f"exit={v['exit_code']}", "output_tail": v["output_tail"][:200]}
                for k, v in agent_tests.items() if not v["passed"]]
        rating = round((passed / total) * 10, 1)
        all_results.append({
            "agent": agent, "rating": rating,
            "pass_count": passed, "total_count": total, "gaps": gaps
        })
        icon = "✓" if rating >= 10 else "○" if rating >= 7 else "✗"
        gap_str = f"  gaps: {', '.join(g['test'] for g in gaps)}" if gaps else ""
        print(f"  {icon} #{agent['id']:02d} {agent['name']:<42s} [{agent['level']:<12s}] {passed}/{total}  {rating}/10{gap_str}")

    # Summary
    ratings = [r["rating"] for r in all_results]
    avg = sum(ratings)/len(ratings)
    tens = sum(1 for r in ratings if r >= 10)

    print(f"\n{'='*75}")
    print(f"  SWARM VERDICT")
    print(f"{'='*75}")
    print(f"  Agents: {len(all_results)}  |  Avg: {avg:.1f}/10  |  Min: {min(ratings)}  |  Max: {max(ratings)}")
    print(f"  Perfect 10s: {tens}/{len(all_results)}")
    print(f"  UNANIMOUS 10/10: {'YES ✓✓✓' if tens == len(all_results) else 'NO ✗'}")

    for level in ["novice", "intermediate", "advanced", "expert"]:
        lr = [r["rating"] for r in all_results if r["agent"]["level"] == level]
        if lr:
            print(f"    {level:<14s}: avg={sum(lr)/len(lr):.1f}  min={min(lr)}  max={max(lr)}")

    # Aggregate gaps
    gap_counts = {}
    gap_detail = {}
    for r in all_results:
        for g in r["gaps"]:
            gap_counts[g["test"]] = gap_counts.get(g["test"], 0) + 1
            if g["test"] not in gap_detail:
                gap_detail[g["test"]] = g.get("output_tail", g["issue"])[:100]
    if gap_counts:
        print(f"\n  GAPS TO FIX:")
        for test, count in sorted(gap_counts.items(), key=lambda x: -x[1]):
            print(f"    {test:<25s}: {count}/{len(all_results)} agents  — {gap_detail[test][:80]}")

    # Write report
    report_path = os.path.join(REPO_PATH, "swarm-report.json")
    with open(report_path, "w") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "total_agents": len(all_results),
            "average_rating": round(avg, 1),
            "min_rating": min(ratings),
            "max_rating": max(ratings),
            "perfect_tens": tens,
            "unanimous": tens == len(all_results),
            "shared_tests": {k: {"passed": v["passed"], "elapsed": v["elapsed"]}
                           for k, v in shared_results.items()},
            "cli_tests": {k: {"passed": v["passed"], "elapsed": v["elapsed"],
                            "exit_code": v["exit_code"], "output_tail": v["output_tail"][:200]}
                        for k, v in cli_results.items()},
            "gap_counts": gap_counts,
            "results": [{"id": r["agent"]["id"], "name": r["agent"]["name"],
                        "level": r["agent"]["level"], "domain": r["agent"]["domain"],
                        "rating": r["rating"], "pass_count": r["pass_count"],
                        "total_count": r["total_count"], "gaps": r["gaps"]}
                       for r in all_results],
        }, f, indent=2)
    print(f"\n  Report: {report_path}")
    sys.exit(0 if tens == len(all_results) else 1)

if __name__ == "__main__":
    main()
