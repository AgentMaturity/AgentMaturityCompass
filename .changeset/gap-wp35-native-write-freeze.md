---
"agent-maturity-compass": patch
---

Native `fs.write` and `fs.edit` (WRITE_LOW) now honour drift and integrity freezes the way ToolHub does (AXR-02/AXR-03). Calls in classes that are not bound to an authorization record are checked against the active freezes just before the body runs and refused with `action_class_frozen`; a freeze state that cannot be read refuses too. Which classes need an authorization record is unchanged.
