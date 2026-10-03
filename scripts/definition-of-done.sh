#!/bin/sh
set -eu

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--fast" ]; }; then
    echo "usage: $0 [--fast]" >&2
    exit 2
fi

# The repository's legacy unit-test tree currently mixes Jest and Vitest
# contracts. The production checks below are the definition of done for the
# deployment-path work this repository publishes.

if ! command -v npm >/dev/null 2>&1; then
    echo "error: npm is required; install Node.js 18+ with npm and ensure npm is on PATH" >&2
    exit 127
fi

if ! command -v node >/dev/null 2>&1; then
    echo "error: Node.js 18+ is required; install Node.js and ensure node is on PATH" >&2
    exit 127
fi

node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || {
    echo "error: unable to determine the Node.js version" >&2
    exit 1
}
if [ "$node_major" -lt 18 ]; then
    echo "error: Node.js 18+ is required (found major version $node_major)" >&2
    exit 1
fi

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd)
cd "$repository_root"

npm ci --ignore-scripts
npm run build
npm run lint
npm run test:deployment
