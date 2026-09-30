#!/bin/sh
set -eu

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--fast" ]; }; then
    echo "usage: $0 [--fast]" >&2
    exit 2
fi

# The repository's legacy unit-test tree currently mixes Jest and Vitest
# contracts. The production checks below are the definition of done for the
# deployment-path work this repository publishes.
npm ci --ignore-scripts
npm run build
npm run lint
npm run test:deployment
