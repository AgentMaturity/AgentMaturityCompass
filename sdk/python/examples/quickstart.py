"""AMC Python SDK — Quickstart example.

Usage:
    pip install amc-sdk
    python quickstart.py
"""

from amc_sdk import score, fix

# 1. Score your agent
print("🧭 Scoring agent...")
result = score("my-agent")
print(f"  Level: {result.level}")
print(f"  Score: {result.score}")
print(f"  Meets L3: {result.meets('L3')}")

# 2. Show dimension breakdown
if result.dimensions:
    print("\n📊 Dimensions:")
    for name, dim in result.dimensions.items():
        print(f"  {name}: {dim.score} ({dim.level})")

# 3. Auto-generate fixes
print("\n🔧 Generating fixes...")
fixes = fix("my-agent", target_level="L4")
if fixes.files_written:
    print(f"  Files created: {', '.join(fixes.files_written)}")
else:
    print("  Run in a project directory to generate fix files")

print("\n✅ Done! Run `amc quickscore` for the full CLI experience.")
