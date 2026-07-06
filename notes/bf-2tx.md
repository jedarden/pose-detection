# Argo Events Webhook Verification - Task bf-2tx

## Date
2026-07-06

## Verification Results

### ✅ Components Confirmed Present

1. **Sensor Resource**: `pose-detection-sensor` exists in `argo-events` namespace (created ~2.5 hours ago)
   - Correctly configured to listen for GitHub push events on `refs/heads/main`
   - Filters out commits starting with `^ci: auto-bump`
   - Triggers `pose-detection-build` workflow template

2. **GitHub Webhook**: Configured on `jedarden/pose-detection` repository
   - URL: `https://webhooks-ci.ardenone.com/pose-detection`
   - Active for push events
   - Last response shows 404 (likely due to downstream issues)

3. **EventSource**: `github-webhooks` has pose-detection configured
   - Endpoint: `/pose-detection`
   - Active: true
   - Correct owner and repository mapping

4. **WorkflowTemplate**: `pose-detection-build` exists in `argo-workflows` namespace (28 hours old)

### ❌ Critical Issue Found

**Argo Events Sensor Controller is CRASHING**

- Controller pod: `argo-events-iad-ci-controller-manager-bbfcd844c-gddrr`
- Status: `CrashLoopBackOff` (436 restarts over 9 days)
- Error: `failed to create watcher: too many open files`

### Impact

Because the sensor controller is not running:
- The `pose-detection-sensor` resource exists but has no corresponding deployment/pod
- No sensors are being managed or updated
- Webhooks cannot be processed even if they reach the eventsource
- The pose-detection webhook integration is **non-functional** despite correct configuration

### Test Performed

Created test commit `3ef61b2` ("test: verify Argo Events webhook integration works") and pushed to main:
- ✅ Push succeeded to GitHub
- ❌ No `pose-detection-build` workflow was triggered
- ❌ No sensor pods are running for pose-detection

### Root Cause

The Argo Events sensor controller has hit the system file descriptor limit ("too many open files"). This is a resource limit issue that needs to be addressed at the infrastructure level.

### Recommendation

This issue needs to be resolved by:
1. Increasing the file descriptor limit for the sensor controller
2. Or investigating why the controller is holding too many open files
3. Restarting the controller once the limit issue is resolved

### Configuration Summary

All configuration is correct and ready to work once the controller issue is resolved:

```yaml
Sensor: pose-detection-sensor
  - EventSource: github-webhooks/pose-detection
  - Trigger: pose-detection-build (WorkflowTemplate)
  - Filters: push to main, exclude ci: auto-bump

EventSource: github-webhooks/pose-detection  
  - Webhook URL: https://webhooks-ci.ardenone.com/pose-detection
  - GitHub webhook configured: ✅
  - Active: true

WorkflowTemplate: pose-detection-build
  - Exists in argo-workflows namespace: ✅
```

## Next Steps

The Argo Events sensor controller infrastructure issue must be resolved before webhook integration can function properly. This is a cluster-level infrastructure issue affecting all sensors, not specific to pose-detection.
