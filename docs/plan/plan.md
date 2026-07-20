# pose-detection — Plan

This file did not exist before 2026-07-20. It is being started honestly, not
retrofitted: the sections below reflect what's actually known/decided as of
this pass, not a reconstructed history of the project's original design.

## What this repo ships

A single-page React + TypeScript web app that uses TensorFlow.js (MoveNet)
to do real-time, in-browser human pose detection from a webcam feed. It is
built to a static bundle, served by nginx in a Docker container, and
deployed publicly at **https://gait.jedarden.com** (confirmed live,
HTTP 200, as of 2026-07-20).

Prior planning/debugging material lives in top-level docs rather than
`docs/notes/`: `README.md`, `DEPLOYMENT.md`, `container-purpose.md`,
`BASE_PATH_TESTING.md`, `REDIRECT_FIX_VALIDATION.md`, and the
per-bead task notes in `notes/`. This plan.md does not replace those; it's
the new home for architectural decisions going forward.

CI/CD for this repo is mid-migration from GitHub Actions to Argo Workflows
on the `iad-ci` cluster (see beads bf-2fb, bf-1sg, bf-1tb, bf-522 in this
repo's `.beads` workspace) — `.github/workflows/ci.yml` is still present
pending that migration's completion and is out of scope for this pass.

## Open infra note (not actioned in this pass)

This repo's `origin` remote is `github.com/jedarden/pose-detection` — there
is no Forgejo (`git.ardenone.com`) copy of this repo yet, unlike the
workspace's general Forgejo-primary convention. The repo's own CI is
deliberately wired to a GitHub webhook (`https://webhooks-ci.ardenone.com/pose-detection`,
see `notes/bf-2tx.md`), so this is not simply an oversight — migrating
hosting would need to preserve or re-point that webhook. Flagged for a
deliberate decision rather than acted on here.

## ADR-001: 2026-07-20 — Wire the production app onto the existing service/analysis architecture instead of the ad-hoc App.tsx implementation

### Context

`src/App.tsx` is the actual entry point rendered at gait.jedarden.com (via
`src/main.tsx`). Reading it against the rest of `src/`, it does not use
almost any of the substantial architecture that already exists in the
repo:

- `src/services/ApplicationCoordinator.ts`, `GaitAnalysisService.ts`
  (real cadence/stride-length/symmetry-index/gait-phase computation from
  keypoint history), `PoseSmoothingService.ts`, `PoseValidationService.ts`,
  `EventBusService.ts`, `DataExportService.ts` — none imported by `App.tsx`.
- `src/performance/AdaptiveQualityManager.ts`,
  `src/rendering/OptimizedRenderingPipeline.ts`,
  `src/memory/MemoryManager.ts` — real, substantial implementations (400-800
  lines each), none imported by `App.tsx`.
- `src/components/VideoDisplay.tsx`, `NotificationContainer.tsx`,
  `PoseDetectionDemo.tsx`, `SkeletonRenderer.ts`, `PoseOverlay.tsx`,
  `GaitVisualizationSystem.ts` — the "real" component layer, not used by
  `App.tsx`.

Instead, `App.tsx` hand-rolls its own `getUserMedia` call, its own
`requestAnimationFrame` loop, and draws keypoints/skeleton directly onto a
`<canvas>` with inline logic duplicating `SkeletonRenderer`/`PoseOverlay`.
Worse, several of the metrics it shows the public user are fabricated:

- `movementIntensity = Math.random() * 0.5 + 0.2` (`src/App.tsx`, in
  `processFrame`) — labeled "Movement Intensity" in the UI as if measured.
- `poseDuration: (timestamp - (timestamp - 1000)) / 1000` — always
  evaluates to `1`, not derived from any real duration.
- `handleExport`'s `session.duration: Date.now() - (Date.now() - 60000)` —
  always `60000`ms, exported as if it were the real session length.

Meanwhile `GaitAnalysisService` — real gait-phase/stride/cadence math —
exists, is exercised by tests, and is simply never called from the page
users actually load. The product's headline claims ("Gait Analysis:
Specialized algorithms for walking pattern detection", "Motion Tracking:
... velocity, and acceleration") describe capability that exists in the
codebase but is not present in what's deployed.

Two smaller, currently-shipped side effects of the same drift: production
renders `<PoseDetectionDiagnostic />` and `<SimplePoseTest />`
unconditionally — both components are commented "Temporary for
debugging" in `App.tsx` itself — and `processFrame` (which runs on every
`requestAnimationFrame` tick, i.e. up to ~60/sec) contains multiple
unconditional `console.log` calls.

### Decision

Re-point `src/App.tsx` at the existing service/component architecture
instead of continuing to maintain a second, parallel, partially-fake
implementation:

1. Replace the hand-rolled `getUserMedia`/draw loop with
   `ApplicationCoordinator` + `VideoDisplay` + `PoseOverlay`/
   `SkeletonRenderer`, wiring `GaitAnalysisService` into the frame loop so
   `GaitParameters` (cadence, stride length, symmetry index, gait phase)
   are real, computed values.
2. Remove the three fabricated metrics listed above; either compute them
   for real (movement intensity from keypoint velocity — the moving pieces
   already exist in `MotionTracker`-adjacent code — and session duration
   from a real session-start timestamp) or delete the field from the UI
   and the export payload rather than show a fake number.
3. Gate `PoseDetectionDiagnostic` and `SimplePoseTest` behind a `?debug=1`
   query param or `import.meta.env.DEV`, out of the default production
   render tree.
4. Route the per-frame debug `console.log` calls through a level-gated
   logger (`LoggingService.ts` already exists) so they no-op by default in
   production, matching the "Performance Optimized... 60+ FPS" claim
   rather than working against it.

This is scoped as an incremental rewrite of `App.tsx`'s internals — the
external URL, container, and deployment pipeline are unaffected — not a
rewrite of the analysis services, which are already implemented and
tested.

### Alternatives Considered

- **Leave `App.tsx` as-is, delete the unused architecture instead.** Rejected:
  `GaitAnalysisService` and friends are the only place the product's
  actual differentiator (gait analysis, not just keypoint dots) exists,
  and they have real logic + tests behind them. Deleting the more capable
  code to match the weaker shipped code destroys more value than it saves
  in cleanup effort.
- **Keep both, and just delete the three `Math.random()`/hardcoded fields
  from the shipped UI without doing the full integration.** This is a
  reasonable *incremental first step* (filed separately as a bead, since
  it's shippable on its own and de-risks the bigger integration), but it
  doesn't fix the core problem: the deployed app still duplicates
  rendering/analysis logic that already exists elsewhere in the repo, and
  still doesn't deliver gait analysis to the person using
  gait.jedarden.com.
- **Do nothing; treat the orphaned services as aspirational/future work.**
  Rejected: they're not aspirational, they're built and tested — the gap
  is purely that nobody re-pointed the entry point at them after building
  them, most likely because App.tsx was iterated on directly to unblock a
  demo and the newer service layer landed afterward without the swap-over
  happening. Leaving it means the repo continues to pay maintenance cost
  on two parallel implementations of the same feature.

### Consequences

- The public demo at gait.jedarden.com starts actually doing gait
  analysis (its namesake feature) instead of drawing keypoints and a
  random number.
- `App.tsx` shrinks substantially and stops being a second, drifted
  implementation of logic that lives properly in `src/services` and
  `src/rendering`.
- Requires a real (if scoped) implementation/integration pass — this is
  not a config change. It should be split into shippable-sized beads
  (fake-metric removal first, then component swap-in, then debug-gating)
  rather than done as one large change.
- Until this lands, the "Motion Tracking" and "Gait Analysis" bullets in
  `README.md` overstate what a visitor to the live demo actually
  experiences; worth a docs pass once the integration is real, not before
  (don't just adjust the copy down — the code to back it up already
  exists).
