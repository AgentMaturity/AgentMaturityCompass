import { expect, test } from "vitest";
import { renderEqualizerSliders } from "../../src/console/assets/components/equalizerSliders.js";

// M12: each of the Equalizer's sliders is named by its question, so a screen reader can tell the 67 apart.
test("every slider has an accessible name with its question id", () => {
  const container = { innerHTML: "", querySelectorAll: () => [] };
  renderEqualizerSliders(container as unknown as HTMLElement, [{ qId: "AMC-1.1", desired: 3 }, { qId: "AMC-1.2", desired: 2 }]);
  const labels = [...container.innerHTML.matchAll(/<input type="range"[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
  expect(labels).toEqual(["Target level for AMC-1.1", "Target level for AMC-1.2"]);
});
