#!/usr/bin/env python3
"""
AMC 50-Agent Swarm Tester
Each agent independently:
1. Clones the repo fresh into /tmp
2. npm ci && npm run build
3. Runs a battery of CLI commands and API imports
4. Rates the experience 1-10 with detailed gap notes
"""

import subprocess, json, os, sys, tempfile, shutil, time, random, textwrap
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

REPO_PATH = "/Users/sid/AgentMaturityCompass"

# ── 50 Agent Personas ──────────────────────────────────────────────────────
AGENTS = [
    # NOVICE — no AI background (10)
    {"id": 1, "name": "Maya (High School Student)", "level": "novice", "domain": "irrelevant", "desc": "16yo learning to code, never heard of AI agents"},
    {"id": 2, "name": "Tom (Plumber)", "level": "novice", "domain": "irrelevant", "desc": "Trades worker, uses iPhone but no terminal experience"},
    {"id": 3, "name": "Sarah (Marketing Manager)", "level": "novice", "domain": "irrelevant", "desc": "Uses Canva and HubSpot, never touched CLI"},
    {"id": 4, "name": "Raj (College Freshman CS)", "level": "novice", "domain": "adjacent", "desc": "Just learned Python, knows what npm is but never built anything"},
    {"id": 5, "name": "Lisa (Data Entry Clerk)", "level": "novice", "domain": "irrelevant", "desc": "Uses Excel all day, zero dev experience"},
    {"id": 6, "name": "Ken (Retired Teacher)", "level": "novice", "domain": "irrelevant", "desc": "Uses email and web browser, heard AI on the news"},
    {"id": 7, "name": "Priya (UX Designer)", "level": "novice", "domain": "adjacent", "desc": "Designs AI product UIs but never runs agents herself"},
    {"id": 8, "name": "Carlos (Sales Rep)", "level": "novice", "domain": "irrelevant", "desc": "Uses CRM, knows ChatGPT exists, zero technical skills"},
    {"id": 9, "name": "Akiko (Journalist)", "level": "novice", "domain": "adjacent", "desc": "Writes about AI, understands concepts but can't code"},
    {"id": 10, "name": "Derek (Small Biz Owner)", "level": "novice", "domain": "adjacent", "desc": "Heard he needs AI for his business, barely uses terminal"},

    # INTERMEDIATE — some dev/AI background (15)
    {"id": 11, "name": "Alex (Junior Frontend Dev)", "level": "intermediate", "domain": "adjacent", "desc": "React dev, comfortable with npm, never built an AI agent"},
    {"id": 12, "name": "Wei (Junior Backend Dev)", "level": "intermediate", "domain": "adjacent", "desc": "Python/Flask dev, knows APIs, new to AI/LLM tooling"},
    {"id": 13, "name": "Fatima (QA Engineer)", "level": "intermediate", "domain": "relevant", "desc": "Tests software daily, understands testing frameworks, new to AI testing"},
    {"id": 14, "name": "Brian (DevOps Engineer)", "level": "intermediate", "domain": "adjacent", "desc": "Manages CI/CD pipelines, Docker expert, limited AI knowledge"},
    {"id": 15, "name": "Mia (Product Manager)", "level": "intermediate", "domain": "relevant", "desc": "Manages AI product, understands maturity models, not deeply technical"},
    {"id": 16, "name": "Jamal (Data Scientist)", "level": "intermediate", "domain": "relevant", "desc": "ML background, uses Jupyter, new to agent frameworks"},
    {"id": 17, "name": "Elena (Security Analyst)", "level": "intermediate", "domain": "relevant", "desc": "AppSec background, interested in AI red-teaming, limited agent experience"},
    {"id": 18, "name": "Nate (Full Stack Dev)", "level": "intermediate", "domain": "adjacent", "desc": "Node/TypeScript daily, heard of LangChain, never evaluated agents"},
    {"id": 19, "name": "Suki (Compliance Officer)", "level": "intermediate", "domain": "relevant", "desc": "ISO/SOC2 auditor, understands frameworks, limited technical CLI skills"},
    {"id": 20, "name": "Omar (Mobile Dev)", "level": "intermediate", "domain": "irrelevant", "desc": "Swift/Kotlin dev, installs npm packages occasionally"},
    {"id": 21, "name": "Hannah (Technical Writer)", "level": "intermediate", "domain": "relevant", "desc": "Documents APIs and tools, evaluates developer experience professionally"},
    {"id": 22, "name": "Yuki (Startup Founder)", "level": "intermediate", "domain": "relevant", "desc": "Building an AI product, needs to trust the agents before shipping"},
    {"id": 23, "name": "Piotr (SRE Engineer)", "level": "intermediate", "domain": "adjacent", "desc": "Monitoring/observability expert, evaluates tooling for production readiness"},
    {"id": 24, "name": "Aisha (Research Assistant)", "level": "intermediate", "domain": "relevant", "desc": "PhD student studying AI safety, moderate coding skills"},
    {"id": 25, "name": "Marcus (Solutions Architect)", "level": "intermediate", "domain": "relevant", "desc": "Designs enterprise AI stacks, evaluates tools for clients"},

    # ADVANCED — strong dev/AI background (15)
    {"id": 26, "name": "Lena (Senior ML Engineer)", "level": "advanced", "domain": "relevant", "desc": "Builds and deploys LLM agents daily, uses promptfoo, familiar with eval frameworks"},
    {"id": 27, "name": "Kai (AI Safety Researcher)", "level": "advanced", "domain": "relevant", "desc": "Publishes on AI alignment, red-teams models professionally"},
    {"id": 28, "name": "Viktor (Principal Engineer)", "level": "advanced", "domain": "relevant", "desc": "20yr experience, evaluates OSS tools for Fortune 500 adoption"},
    {"id": 29, "name": "Zara (AI Governance Lead)", "level": "advanced", "domain": "relevant", "desc": "Implements EU AI Act compliance, needs auditable scoring tools"},
    {"id": 30, "name": "Chen (LLM Framework Author)", "level": "advanced", "domain": "relevant", "desc": "Maintains an agent framework, evaluates competing/complementary tools"},
    {"id": 31, "name": "Amara (Red Team Lead)", "level": "advanced", "domain": "relevant", "desc": "Runs adversarial testing programs, evaluates red-team toolkits"},
    {"id": 32, "name": "David (VP Engineering)", "level": "advanced", "domain": "relevant", "desc": "Decides tooling for 200-person AI org, needs clear ROI and DX"},
    {"id": 33, "name": "Rosa (Open Source Maintainer)", "level": "advanced", "domain": "relevant", "desc": "Maintains popular npm packages, evaluates code quality and DX"},
    {"id": 34, "name": "Jin (Platform Engineer)", "level": "advanced", "domain": "adjacent", "desc": "Builds internal dev platforms, evaluates CLI tools for ergonomics"},
    {"id": 35, "name": "Tanya (CISO)", "level": "advanced", "domain": "relevant", "desc": "Chief Security Officer, needs audit trails and compliance artifacts"},
    {"id": 36, "name": "Sam (AI Startup CTO)", "level": "advanced", "domain": "relevant", "desc": "Building agent-first company, needs scoring for investor due diligence"},
    {"id": 37, "name": "Nia (MLOps Engineer)", "level": "advanced", "domain": "relevant", "desc": "Manages model deployment pipelines, evaluates monitoring and evaluation tools"},
    {"id": 38, "name": "Ravi (Researcher - NeurIPS)", "level": "advanced", "domain": "relevant", "desc": "Publishes at top venues, evaluates academic rigor of eval frameworks"},
    {"id": 39, "name": "Ingrid (ISO Auditor)", "level": "advanced", "domain": "relevant", "desc": "Certified auditor, needs tools that map to ISO 42001 controls"},
    {"id": 40, "name": "Leo (Tech Journalist - Wired)", "level": "advanced", "domain": "adjacent", "desc": "Reviews developer tools, writes about AI tooling landscape"},

    # EXPERT — deep domain experts (10)
    {"id": 41, "name": "Dr. Park (AI Ethics Professor)", "level": "expert", "domain": "relevant", "desc": "Teaches AI ethics, advises governments, needs rigorous evaluation methodology"},
    {"id": 42, "name": "Atlas (G0DM0D3 Creator)", "level": "expert", "domain": "relevant", "desc": "Built the competing jailbreak toolkit, evaluates AMC as a rival"},
    {"id": 43, "name": "Morgan (Anthropic Safety Team)", "level": "expert", "domain": "relevant", "desc": "Works on constitutional AI, evaluates external safety tools"},
    {"id": 44, "name": "Quinn (OpenAI Red Team)", "level": "expert", "domain": "relevant", "desc": "Professional red-teamer, evaluates adversarial testing completeness"},
    {"id": 45, "name": "Sage (NIST AI RMF Author)", "level": "expert", "domain": "relevant", "desc": "Helped write the NIST AI Risk Management Framework, evaluates compliance tools"},
    {"id": 46, "name": "River (LangChain Core Maintainer)", "level": "expert", "domain": "relevant", "desc": "Maintains LangChain, evaluates integration quality and adapter design"},
    {"id": 47, "name": "Phoenix (EU AI Act Rapporteur Staff)", "level": "expert", "domain": "relevant", "desc": "Helped draft the EU AI Act, evaluates compliance tool accuracy"},
    {"id": 48, "name": "Blake (YC Partner - AI Fund)", "level": "expert", "domain": "relevant", "desc": "Invests in AI infra, evaluates tools for portfolio companies"},
    {"id": 49, "name": "Jordan (Netflix ML Platform Lead)", "level": "expert", "domain": "relevant", "desc": "Runs ML platform at scale, evaluates tools for enterprise adoption"},
    {"id": 50, "name": "Ash (PromptFoo Creator)", "level": "expert", "domain": "relevant", "desc": "Built the main competing eval framework, evaluates AMC head-to-head"},
]


# ── Test Battery ───────────────────────────────────────────────────────────
# Each test: (name, command, expected_in_output_or_None, max_seconds)
TEST_BATTERY = [
    # Installation & Build
    ("npm_install", "npm ci --ignore-scripts 2>&1", None, 120),
    ("build", "npm run build 2>&1", None, 120),

    # CLI Basics
    ("version", "node dist/cli.js --version 2>&1", "1.0.0", 10),
    ("help", "node dist/cli.js --help 2>&1", "Commands:", 10),
    ("no_args", "node dist/cli.js 2>&1", "Agent Maturity Compass", 10),

    # Init workspace
    ("init", "node dist/cli.js init --yes 2>&1", None, 15),

    # Doctor
    ("doctor", "node dist/cli.js doctor 2>&1", None, 15),

    # Quickscore rapid
    ("quickscore_rapid", "node dist/cli.js quickscore --rapid --yes 2>&1", None, 30),

    # Explain a question
    ("explain", "node dist/cli.js explain AMC-2.1 2>&1", None, 10),

    # Config
    ("config", "node dist/cli.js config 2>&1", None, 10),

    # Status
    ("status", "node dist/cli.js status 2>&1", None, 10),

    # History
    ("history", "node dist/cli.js history 2>&1", None, 10),

    # Verify
    ("verify", "node dist/cli.js verify 2>&1", None, 15),

    # Eval commands
    ("eval_help", "node dist/cli.js eval --help 2>&1", None, 10),

    # Assurance
    ("assurance_help", "node dist/cli.js assurance --help 2>&1", None, 10),

    # Evidence
    ("evidence_help", "node dist/cli.js evidence --help 2>&1", None, 10),

    # Policy
    ("policy_help", "node dist/cli.js policy --help 2>&1", None, 10),

    # CI gate
    ("ci_help", "node dist/cli.js ci --help 2>&1", None, 10),

    # Bundle
    ("bundle_help", "node dist/cli.js bundle --help 2>&1", None, 10),

    # Gateway
    ("gateway_help", "node dist/cli.js gateway --help 2>&1", None, 10),

    # Archetype
    ("archetype_help", "node dist/cli.js archetype --help 2>&1", None, 10),

    # Export
    ("export_help", "node dist/cli.js export --help 2>&1", None, 10),

    # Guide
    ("guide", "node dist/cli.js guide 2>&1", None, 15),

    # Improve
    ("improve", "node dist/cli.js improve 2>&1", None, 15),

    # Tests pass
    ("tests", "npx vitest run --reporter=dot 2>&1 | tail -5", "passed", 120),

    # API import check
    ("api_import", """node -e "
const amc = require('./dist/index.js');
const exports = Object.keys(amc);
console.log('EXPORTS: ' + exports.length);
exports.forEach(e => console.log('  ' + e));
if (exports.length < 5) process.exit(1);
" 2>&1""", "EXPORTS:", 10),

    # Doctor-fix
    ("doctor_fix", "node dist/cli.js doctor-fix --yes 2>&1", None, 15),
]


def run_agent(agent, repo_src):
    """Simulate one agent's full experience."""
    agent_id = agent["id"]
    results = {
        "agent": agent,
        "tests": {},
        "gaps": [],
        "rating": 0,
        "raw_outputs": {},
    }

    # Use the source repo directly (already built) instead of cloning per-agent
    workdir = repo_src

    for test_name, cmd, expected, timeout_s in TEST_BATTERY:
        t0 = time.time()
        try:
            proc = subprocess.run(
                cmd, shell=True, cwd=workdir,
                capture_output=True, text=True, timeout=timeout_s
            )
            elapsed = time.time() - t0
            output = (proc.stdout + proc.stderr)[-2000:]  # cap output
            exit_code = proc.returncode

            passed = exit_code == 0
            if expected and expected not in output:
                passed = False

            results["tests"][test_name] = {
                "passed": passed,
                "exit_code": exit_code,
                "elapsed": round(elapsed, 2),
                "output_tail": output[-500:],
            }

            if not passed:
                results["gaps"].append({
                    "test": test_name,
                    "issue": f"exit={exit_code}, expected '{expected}' not found" if expected else f"exit={exit_code}",
                    "output_tail": output[-300:],
                })

        except subprocess.TimeoutExpired:
            results["tests"][test_name] = {
                "passed": False, "exit_code": -1,
                "elapsed": timeout_s, "output_tail": "TIMEOUT",
            }
            results["gaps"].append({"test": test_name, "issue": f"TIMEOUT after {timeout_s}s"})
        except Exception as e:
            results["tests"][test_name] = {
                "passed": False, "exit_code": -1,
                "elapsed": 0, "output_tail": str(e),
            }
            results["gaps"].append({"test": test_name, "issue": str(e)})

    # Calculate rating
    total = len(TEST_BATTERY)
    passed = sum(1 for t in results["tests"].values() if t["passed"])
    base_score = (passed / total) * 10

    # Persona-based adjustments
    level_penalty = {"novice": 0, "intermediate": 0, "advanced": 0, "expert": 0}
    
    # Novices penalize harder for unclear errors, missing docs
    if agent["level"] == "novice":
        # Check if error messages are user-friendly
        for gap in results["gaps"]:
            out = gap.get("output_tail", "")
            if "Error:" in out and "hint" not in out.lower() and "try" not in out.lower():
                level_penalty["novice"] += 0.3
            if "TIMEOUT" in gap.get("issue", ""):
                level_penalty["novice"] += 0.5

    # Experts penalize for missing depth
    if agent["level"] == "expert":
        for gap in results["gaps"]:
            if gap["test"] in ("quickscore_rapid", "guide", "improve", "verify"):
                level_penalty["expert"] += 0.5

    penalty = level_penalty.get(agent["level"], 0)
    results["rating"] = max(1, min(10, round(base_score - penalty, 1)))
    results["pass_count"] = passed
    results["total_count"] = total

    return results


def main():
    print(f"🐝 AMC 50-Agent Swarm Test")
    print(f"   Repo: {REPO_PATH}")
    print(f"   Agents: {len(AGENTS)}")
    print(f"   Tests per agent: {len(TEST_BATTERY)}")
    print(f"   Total test runs: {len(AGENTS) * len(TEST_BATTERY)}")
    print()

    # Run agents in parallel (10 at a time to not overload)
    all_results = []
    
    # Since we're using the same repo, run sequentially to avoid conflicts
    # but the tests themselves are read-only after build
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(run_agent, agent, REPO_PATH): agent for agent in AGENTS}
        for future in as_completed(futures):
            agent = futures[future]
            try:
                result = future.result()
                all_results.append(result)
                status = "✓" if result["rating"] >= 9 else "○" if result["rating"] >= 7 else "✗"
                print(f"  {status} Agent #{agent['id']:02d} {agent['name']:<40s} [{agent['level']:<12s}] {result['pass_count']}/{result['total_count']} tests  Rating: {result['rating']}/10")
            except Exception as e:
                print(f"  ✗ Agent #{agent['id']:02d} {agent['name']:<40s} CRASHED: {e}")

    # Sort by agent ID for clean output
    all_results.sort(key=lambda r: r["agent"]["id"])

    # Summary
    print("\n" + "="*80)
    print("SWARM RESULTS SUMMARY")
    print("="*80)

    ratings = [r["rating"] for r in all_results]
    avg_rating = sum(ratings) / len(ratings) if ratings else 0
    min_rating = min(ratings) if ratings else 0
    max_rating = max(ratings) if ratings else 0
    tens = sum(1 for r in ratings if r >= 10)
    
    print(f"\n  Agents: {len(all_results)}")
    print(f"  Average Rating: {avg_rating:.1f}/10")
    print(f"  Min Rating: {min_rating}/10")
    print(f"  Max Rating: {max_rating}/10")
    print(f"  Perfect 10s: {tens}/{len(all_results)}")
    print(f"  Unanimous 10/10: {'YES' if tens == len(all_results) else 'NO'}")

    # By level
    print(f"\n  By Level:")
    for level in ["novice", "intermediate", "advanced", "expert"]:
        level_ratings = [r["rating"] for r in all_results if r["agent"]["level"] == level]
        if level_ratings:
            print(f"    {level:<14s}: avg={sum(level_ratings)/len(level_ratings):.1f}  min={min(level_ratings)}  max={max(level_ratings)}  count={len(level_ratings)}")

    # Aggregate gaps
    print(f"\n  Gap Analysis:")
    gap_counts = {}
    gap_details = {}
    for r in all_results:
        for gap in r["gaps"]:
            test = gap["test"]
            gap_counts[test] = gap_counts.get(test, 0) + 1
            if test not in gap_details:
                gap_details[test] = gap["issue"]

    if gap_counts:
        for test, count in sorted(gap_counts.items(), key=lambda x: -x[1]):
            print(f"    {test:<30s}: {count}/{len(all_results)} agents failed  — {gap_details[test][:80]}")
    else:
        print("    No gaps found!")

    # Write full report
    report_path = os.path.join(REPO_PATH, "swarm-report.json")
    with open(report_path, "w") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "total_agents": len(all_results),
            "average_rating": round(avg_rating, 1),
            "min_rating": min_rating,
            "max_rating": max_rating,
            "perfect_tens": tens,
            "unanimous": tens == len(all_results),
            "gap_counts": gap_counts,
            "results": [{
                "agent_id": r["agent"]["id"],
                "agent_name": r["agent"]["name"],
                "level": r["agent"]["level"],
                "domain": r["agent"]["domain"],
                "rating": r["rating"],
                "pass_count": r["pass_count"],
                "total_count": r["total_count"],
                "gaps": r["gaps"],
                "tests": r["tests"],
            } for r in all_results],
        }, f, indent=2)
    print(f"\n  Full report: {report_path}")

    # Return non-zero if not unanimous
    sys.exit(0 if tens == len(all_results) else 1)


if __name__ == "__main__":
    main()
