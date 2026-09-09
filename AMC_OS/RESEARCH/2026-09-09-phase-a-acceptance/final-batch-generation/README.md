# Final implementation-batch inventory preparation

Prepared only; not executed. After CoS retained-output commands and root CLI registration are integrated, supply the exact full runtime source commit to runner.py. It creates a fresh no-hardlinks clone with isolated HOME, installs the frozen lockfile under Node22, builds, regenerates the actual built CLI command inventory, and runs the candidate's source-inventory generator there. No generator runs in the shared root. Each step retains its actual log, status and process disposition; existing output is refused.

Inspect the generated-only delta before copying the previously declared exact inventory files into root. Commit that inventory update, then run final acceptance in another fresh clone pinned to the resulting source commit. This preparation is not a test count, passing suite, installed-platform or release receipt. The earlier post-cos-generation records and b412b404 source inventory remain historical.
