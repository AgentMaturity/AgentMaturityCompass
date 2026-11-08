---
"agent-maturity-compass": patch
---

Linux installer archives built on macOS no longer carry macOS metadata (LIVE-DEPLOY-06). The release packages the archives on a macOS runner, whose `tar` added AppleDouble `._*` entries and `com.apple.provenance` extended-attribute headers to the Linux archive; the hosted installer would refuse an archive with a root-level `._` entry. On macOS the packager now runs `tar --no-mac-metadata --no-xattrs` with `COPYFILE_DISABLE=1`, and `npm run package:desktop:verify` walks every `.tar.gz` and refuses any `._*` entry or extended-attribute pax header, naming the entry.
