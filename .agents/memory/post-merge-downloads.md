---
name: Post-merge dependency downloads
description: Allow for slow cold-cache dependency downloads in merge setup.
---
Post-merge dependency installs can exceed five minutes on a cold cache; prefer cached packages and allow a longer setup timeout.

**Why:** Package proxy downloads consumed the initial five-minute budget; the cached retry completed setup in about half a minute.

**How to apply:** Inspect npm download logs before treating a setup timeout as a build failure. Keep setup non-interactive and do not add forced database pushes.