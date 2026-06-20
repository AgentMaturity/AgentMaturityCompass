# Accessibility

Last reviewed: 2026-06-16

AMC aims to make the CLI, website, generated dashboard, and local Studio usable for keyboard-only users, screen-reader users, low-vision users, and users who disable terminal color.

## Standards Target

- Website and generated dashboard: WCAG 2.2 AA-aligned checks, including text contrast, visible focus, skip navigation, and accessible names for chart surfaces.
- CLI: color is supplemental, not the only signal. Use `NO_COLOR=1` or `--no-color` for plain output where supported.
- Generated dashboard: use Settings -> Theme -> High contrast, or cycle the top-right theme control until `HC` appears.
- Generated dashboard heatmaps: score, target, gap, and confidence are exposed as visible text plus ARIA grid, gridcell, selected-state, and meter values; color is supplemental.
- Evidence: accessibility fixes should be backed by repeatable tests, not only visual inspection.

External standards used for this review:

- W3C WCAG 2.2 Success Criterion 1.4.1 Use of Color: https://www.w3.org/TR/WCAG22/#use-of-color
- W3C WCAG 2.2 Success Criterion 1.4.3 Contrast (Minimum): https://www.w3.org/TR/WCAG22/#contrast-minimum
- W3C WCAG 2.2 Success Criterion 4.1.2 Name, Role, Value: https://www.w3.org/TR/WCAG22/#name-role-value
- W3C WAI Accessibility Statement guidance: https://www.w3.org/WAI/planning/statements/
- WAI-ARIA accessible name guidance: https://www.w3.org/TR/accname-1.2/

## Current Support

- Static website pages include skip links and keyboard focus-visible styling.
- Website hero canvas is decorative and marked `aria-hidden="true"`.
- Playground and generated console chart canvases expose `role="img"` plus descriptive `aria-label` text.
- Generated dashboard secondary text on dark backgrounds uses a higher-contrast token than the previously flagged `rgba(244,244,245,.55)`.
- Generated dashboard onboarding traps keyboard focus while open and restores focus when closed.
- Generated dashboard question heatmap rows include visible maturity level, gap, and confidence labels, plus ARIA grid semantics and confidence meters.
- The Playwright accessibility suite uses `@axe-core/playwright` for the core static pages.

## Known Limitations

- Interactive terminal prompts depend on the user's terminal and screen reader support.
- Some generated reports include dense tables and code blocks that may require additional screen-reader review with real data.
- Automated axe checks do not replace manual keyboard and assistive-technology testing.

## Feedback

Open an issue at https://github.com/AgentMaturity/AgentMaturityCompass/issues with:

- Page, command, or generated artifact path.
- Assistive technology and browser or terminal used.
- Expected result and actual result.
- Screenshot, terminal output, or axe report when available.

Accessibility findings should be treated as product defects and should include a regression test where practical.
