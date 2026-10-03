# Canonical repository and CI/CD workflow

This is the source-of-truth runbook for `pose-detection`. It describes the
production path as configured in `jedarden/declarative-config` on 2026-10-03.
The manifests in that repository and the live ArgoCD status are authoritative
when this document and an older note disagree.

## Repository authority

Forgejo is the canonical repository:

```text
https://git.ardenone.com/jedarden/pose-detection.git
```

Push application changes to `main` on Forgejo. The GitHub repository at
`https://github.com/jedarden/pose-detection` is a read-only mirror. Its copy is
useful for public browsing and, for this legacy webhook integration, receives
the mirrored push event; it is not a second authoring repository and must not
be treated as the source of truth.

The same rule applies to CI/CD configuration: edit the manifests in
`jedarden/declarative-config`, commit them there, and push to Forgejo. Do not
apply or patch Argo-managed resources directly with `kubectl`.

Some current ArgoCD Application definitions read the declarative-config
GitHub mirror because of an operational Forgejo credential limitation. That is
an infrastructure read path, not an authoring rule: wait for the mirror to
contain the Forgejo commit and confirm the ArgoCD sync revision before calling
a change deployed.

## Active production release path

The live site is a static Cloudflare Pages deployment at
`https://gait.jedarden.com`. The current flow is:

```text
Forgejo push to main
  -> read-only GitHub mirror receives the push
  -> GitHub webhook: /pose-detection
  -> Argo Events EventSource: github-webhooks (iad-ci)
  -> Sensor: pose-detection-sensor
  -> WorkflowTemplate: website-build (argo-workflows)
  -> clone the Forgejo repository and run the release gate
  -> deploy dist/ to Cloudflare Pages project gait-jedarden-com
```

The GitHub webhook is a compatibility trigger, not a source-of-truth decision.
The build itself clones Forgejo. The relevant declarative-config paths are:

- `k8s/iad-ci/argo-events/github-eventsource.yml`
- `k8s/iad-ci/argo-events/pose-detection-sensor.yml`
- `k8s/iad-ci/argo-workflows/website-build-workflowtemplate.yml`

### Event and sensor contract

`pose-detection-sensor` listens for the `pose-detection` event from the
`github-webhooks` EventSource and accepts only:

- a `push` event;
- `refs/heads/main`; and
- a commit message that does not begin with `ci: auto-bump`.

The sensor submits `website-build` with these production parameters:

```text
repo:          jedarden/pose-detection
branch:        main
build-command: npm ci && npm run lint && npm run build
output-dir:    dist
cf-project:    gait-jedarden-com
deadline:      1800 seconds
```

`website-build` uses its pinned website-builder image, clones from
`git.ardenone.com`, runs the command above, and deploys `dist/` with Wrangler.
The release gate intentionally does not run the legacy full Vitest suite: the
current production gate is the passing lint/build path represented by the
sensor manifest.

## Image publication and ArgoCD scope

The canonical production path does **not** publish a `gait-detection` Docker
image and does **not** deploy the live site through an ArgoCD Application. The
old container path was retired by the Cloudflare Pages migration
(`declarative-config` commit `65a759e5`): its Docker Hub publication and
`k8s/apexalgo-iad/gait/` deployment manifest were removed.

For historical context, that path was `test -> resolve VERSION -> Kaniko image
publication -> declarative-config image-tag update -> ArgoCD rollout`. It is
documented here only to explain old workflow names and logs; it is not an
active release process.

The following are therefore not release steps:

- manually building or pushing `ronaldraygun/gait-detection`;
- changing a `gait-detection` image tag in a Kubernetes manifest; or
- running `kubectl apply`, `patch`, `scale`, or `rollout restart` for this site.

`Dockerfile`, `k8s/deployment.yaml`, `k8s-example.yaml`, and the generic
`DEPLOYMENT.md` examples remain useful for local/container experimentation,
but they are not the production deployment contract. The
`pose-detection-build` WorkflowTemplate, where present in a checkout of
`declarative-config`, is historical/orphaned: the active sensor submits
`website-build`, not `pose-detection-build`. Do not re-enable the image path
without a separate declarative-config change that defines the image registry,
deployment manifest, and verification target.

## Verification after a change

All inspection is read-only. Run these checks from an operator environment
with the `iad-ci` kubeconfig; never put a token or kubeconfig contents in a
command, log, or bead.

1. Confirm the source change landed on Forgejo and the mirror contains the
   same commit. The mirror is only the webhook bridge for this pipeline.
2. Confirm the ArgoCD applications that own the CI control plane are healthy:

   ```bash
   kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig \
     -n argocd get application argo-events-ns-iad-ci \
       argo-workflows-ns-iad-ci \
       -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status'
   ```

   Both applications must report `Synced` and `Healthy`. These applications
   reconcile the EventSource, Sensor, and WorkflowTemplate from
   `declarative-config`; they are not a deployment mechanism for the Pages
   site itself.

3. Confirm the event source and sensor are ready:

   ```bash
   kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig \
     -n argo-events get eventsource github-webhooks \
       -o jsonpath='{.status.conditions}'
   kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig \
     -n argo-events get sensor pose-detection-sensor \
       -o jsonpath='{.status.conditions}'
   ```

   The EventSource must be deployed and serving the `/pose-detection` route;
   the Sensor must have `DependenciesProvided`, `Deployed`, and
   `TriggersProvided` conditions true.

4. Inspect the GitHub hook without printing its secret:

   ```bash
   gh api repos/jedarden/pose-detection/hooks \
     --jq '.[] | select(.config.url == "https://webhooks-ci.ardenone.com/pose-detection") | {id,active,events,last_response}'
   ```

   It must be active and configured for `push`. A successful hook delivery
   only proves that the event reached Argo Events; continue with the workflow
   checks.

5. Confirm the submitted workflow succeeds:

   ```bash
   kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig \
     -n argo-workflows get workflows \
       --sort-by=.metadata.creationTimestamp
   kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig \
     -n argo-workflows get workflow <workflow-name> \
       -o jsonpath='{.status.phase}{"\n"}'
   ```

   Select the newest `website-build-*` workflow for the push. Its phase must
   be `Succeeded`; inspect the workflow UI/logs if it is `Failed`, `Error`, or
   remains `Pending`.

6. Verify the public release after Argo reports success:

   ```bash
   curl --fail --silent --show-error --location \
     https://gait.jedarden.com/ >/dev/null
   ```

   This final check confirms the Pages deployment is reachable. It is the
   production deployment check for the current architecture; there is no
   image digest or Kubernetes rollout to verify.

## Changing the pipeline

Change the appropriate manifest under `declarative-config/k8s/iad-ci/`, push
the commit to Forgejo, and wait for ArgoCD to reconcile. Record the
declarative-config commit, ArgoCD application, workflow name, workflow result,
and live URL check with the owning change. If the production target changes
from Cloudflare Pages to a container and ArgoCD-managed workload, update this
runbook in the same change and document the new pinned image, deployment
manifest, ArgoCD Application, and post-sync health checks.
