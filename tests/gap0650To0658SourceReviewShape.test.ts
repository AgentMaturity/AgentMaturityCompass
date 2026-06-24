import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE_REVIEW_DOCS = [
  "docs/source-reviews/GAP-0650-product-design-provider-drift-boundary.md",
  "docs/source-reviews/GAP-0651-autorag-replay-corpus.md",
  "docs/source-reviews/GAP-0652-large-ai-models-future-communications-metric-validity.md",
  "docs/source-reviews/GAP-0653-pydantic-logfire-question-score-explainability.md",
  "docs/source-reviews/GAP-0654-agenta-public-methodology.md",
  "docs/source-reviews/GAP-0655-adalflow-live-drift.md",
  "docs/source-reviews/GAP-0656-healthcare-harmonization-score-explainability.md",
  "docs/source-reviews/GAP-0657-meta-thinking-marl-score-explainability.md",
  "docs/source-reviews/GAP-0658-generative-agents-live-drift.md",
];

describe("GAP-0650..0658 source-review note shape", () => {
  it("keeps every source-review note restartable with explicit closure and fail-closed sections", () => {
    for (const path of SOURCE_REVIEW_DOCS) {
      const doc = readFileSync(path, "utf8");
      expect(doc, path).toContain("## Relevance decision");
      expect(doc, path).toContain("## AMC/8 surface check");
      expect(doc, path).toContain("## Product closure");
      expect(doc, path).toContain("## Fail-closed rule");
      expect(doc, path).toContain("## No-bloat boundary");
      expect(doc, path).toContain("## Verification");
    }
  });
});
