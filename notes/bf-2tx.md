# Argo Events Webhook Verification (bf-2tx)

## Verification Results

### 1. ✅ Sensor exists in cluster
```bash
kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig get sensor pose-detection-sensor -n argo-events
# NAME                    AGE
# pose-detection-sensor   8h
```

### 2. ✅ GitHub webhook configured
```bash
gh api repos/jedarden/pose-detection/hooks
# Webhook ID 650000942
# URL: https://webhooks-ci.ardenone.com/pose-detection
# Events: push
# Active: true
```

### 3. ❌ Workflow trigger blocked by cluster issue
The webhook infrastructure setup is **correct**, but the Argo Events controller-manager is crashing:

**Problem:**
```
argo-events-iad-ci-controller-manager-bbfcd844c-gddrr
Status: CrashLoopBackOff (504 restarts over 9 days)
Error: "too many open files"
```

**Root Cause:**
The controller-manager pod has insufficient file descriptor limits, preventing it from managing sensors. This is why there's no `pose-detection-sensor-sensor-xxx` pod running (while other sensors have pods like `spaxel-sensor-sensor-6vlgm-xxx`).

**Impact:**
- GitHub webhooks can deliver to the eventsource (github-webhooks-eventsource is Running)
- But the controller cannot create/update sensor pods to trigger workflows
- Push events are received but not processed into workflow submissions

## Recommendations

1. **Fix the controller-manager** - Increase file descriptor limits in the deployment
2. **Alternative: Restart the deployment** to clear accumulated file handles (temporary fix)
3. **Long-term:** Scale the eventbus workload or reduce the number of sensors if the cluster is hitting global FD limits.

## Test Summary

- Test commit pushed: b9ba20d
- Sensor config: Valid (correct filters, triggers, workflowTemplateRef)
- Eventsource pod: Running
- WorkflowTemplate: pose-detection-build exists
- Controller: CrashLoopBackOff (blocking functionality)
