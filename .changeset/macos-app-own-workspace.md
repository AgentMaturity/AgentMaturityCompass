---
"agent-maturity-compass": minor
---

The macOS Studio app now sets up your own workspace instead of a view-only demo. First launch says where AMC keeps its records, creates the workspace with its vault passphrase in the macOS Keychain, creates an owner account with a generated password kept in the Keychain, and signs you in through the console's own login, so every control works; later launches open the console signed in. Studio > Try the Demo keeps the sample workspace. The app gains Reload, Open in Browser, Stop AMC, Show Logs and About; offers to stop Studio when you quit; shows install progress and the actual reason when something fails, with Retry; runs on its own ports (3230-3232) so a terminal `amc up` keeps 3210-3212; and clears cached scripts and service workers after an AMC update. The archive and hosted installers now end with the next step: type `amc`.
