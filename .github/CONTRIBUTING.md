# Contributing to Pose Detection

Forgejo is the canonical repository for this project:

```bash
git clone https://git.ardenone.com/jedarden/pose-detection.git
cd pose-detection
```

The GitHub repository is a read-only mirror. Do not use a GitHub fork, GitHub
Actions workflow, or a GitHub branch as the source of truth for a change. The
production CI trigger currently arrives through the mirrored GitHub push hook,
but the Argo workflow checks out the Forgejo repository.

Before submitting a change:

```bash
npm ci
npm run lint
npm run build
npm run test:deployment
```

Commit the relevant files and push the change to the Forgejo `main` branch.
The complete production release and verification procedure is in
[`docs/CI-CD.md`](../docs/CI-CD.md). Issues belong on
[Forgejo](https://git.ardenone.com/jedarden/pose-detection/issues).
