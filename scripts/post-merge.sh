#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Reconcile dependencies from the committed lockfile without changing versions.
npm ci --prefer-offline --no-audit --no-fund
npm run check
npm run build

# Do not run destructive or interactive database pushes here.
# Workflow reconciliation is handled by Replit after this script succeeds.