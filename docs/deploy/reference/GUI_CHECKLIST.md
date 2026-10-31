# Desktop launcher GUI checklist (manual)

Sid runs this on macOS ARM64 and on Windows x64 for the commit under qualification. Agents cannot run it. The result becomes a GUI lane receipt that `scripts/gen-platform-matrix.mjs` reads.

1. Build the installers on that machine: `npm run package:desktop`, then `npm run package:desktop:verify`.
2. Install the package for this platform from `dist/installers/` on a user account that has never run AMC.
3. Start AMC Studio from the desktop launcher (not from a terminal). Studio opens in the browser and reaches the sign-in page.
4. Run one stub-provider task from the console and open its verification view; it shows a verified result or a named, verified prefix.
5. Quit from the launcher, start it again, and confirm the earlier task is still listed.
6. Remove the package and confirm the launcher is gone.

Record the receipt in a lane folder under the platform receipts directory:

- `lane.json`: `{"schema": "amc.platform-lane/1", "kind": "gui", "platform": "darwin" or "win32", "arch": "arm64" or "x64", "nodeMajor": 22, "commit": "<40-hex sha>"}`
- `gui.json`: `{"status": "passed" or "failed", "steps": [the six step results], "operator": "Sid", "date": "YYYY-MM-DD"}`
