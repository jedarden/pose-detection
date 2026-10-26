# AGENTS.md

Guidance for AI coding agents working in this repository.

## Stack

- React 18 + TypeScript, built with Vite
- TensorFlow.js MoveNet (`@tensorflow-models/pose-detection`) for in-browser pose estimation — WebGL/WebGPU backend, no server round-trips
- Vitest for unit tests, Cypress for E2E
- Production container: nginx serving the Vite build on port 8080, with `BASE_PATH` injected at container start (runtime setting, not build-time)

## Commands

```bash
npm ci                       # reproducible install
npm run dev                  # dev server at http://localhost:3000 (vite.config.ts pins port 3000, strictPort; override with: npm run dev -- --port 5173)
npx vitest run               # unit tests, single pass
npm run build                # production build to dist/
npm run test:deployment      # node --test suites for container/base-path behavior
docker build -t pose-detection .   # container build
```

`npm run bench:browser` measures FPS in headless Chromium; it is not part of the default gate.

## House rules

- **Never create `.github/workflows/*`.** GitHub Actions are disabled org-wide; CI runs on Argo Workflows in `iad-ci` (templates live in `declarative-config/k8s/iad-ci/argo-workflows/`).
- **Work directly on `main`** — no feature branches, no PR-per-change flow. Push to the Forgejo `origin`; GitHub is a read-only mirror.
- **Stage exact paths** (`git add README.md AGENTS.md docs/images/…`) — never `git add -A`, `git add .`, or `git commit -a`.
- **Never force-push.**
- **No `:latest` image tags** — reference published images by a pinned version tag.
- Do not edit `src/` incidentally: it is covered by other open work, and feature claims in the README are owned by a separate bead.
