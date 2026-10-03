#!/usr/bin/env node
// Browser performance regression benchmark for the real-time pose pipeline.
//
// Builds the production bundle, serves it, starts analysis with a fake camera
// in headless Chromium, and measures:
//   - render FPS: requestAnimationFrame cadence while detection runs
//   - dropped frames: rAF gaps longer than 1.5 frame budgets
//   - detection FPS and per-call latency from PoseDetectionService's
//     'pose-detection' events (skipped adaptive frames are counted separately)
//
// The documented target is 60+ FPS. Render FPS and detection FPS must both reach
// BENCH_MIN_FPS (default 60) or the run exits 1. Latency and dropped frames are
// reported only. Exit 2 means the benchmark could not run (browser, model, or
// camera failure), so no performance verdict was produced.
//
// Environment:
//   BENCH_CHROME      Chromium executable (default: Playwright's cached build)
//   BENCH_URL         Measure an already-running app instead of building one
//   BENCH_MIN_FPS     Required FPS for render and detection (default 60)
//   BENCH_WARMUP_MS   Settle time after first detection (default 3000)
//   BENCH_DURATION_MS Measurement window (default 10000)
//   BENCH_PORT        Preview server port when building (default 4273)

import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const env = process.env;
const minFps = Number(env.BENCH_MIN_FPS ?? 60);
const warmupMs = Number(env.BENCH_WARMUP_MS ?? 3000);
const durationMs = Number(env.BENCH_DURATION_MS ?? 10000);
const port = Number(env.BENCH_PORT ?? 4273);
const frameBudgetMs = 1000 / minFps;

const log = (message) => console.error(`[bench] ${message}`);

// Installed before any app script runs, so every detection event is captured.
const initScript = () => {
  const bench = { frames: [], detections: [], skipped: 0 };
  window.__bench = bench;
  window.addEventListener('pose-detection', (event) => {
    const { latencyMs, skipped } = event.detail;
    if (skipped) bench.skipped += 1;
    else bench.detections.push({ t: performance.now(), latencyMs });
  });
  const sample = (timestamp) => {
    bench.frames.push(timestamp);
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

async function startPreviewServer() {
  log('building production bundle');
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
  const server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'],
    { stdio: 'ignore' },
  );
  const url = `http://localhost:${port}/`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return { url, server };
    } catch {
      // Server not listening yet.
    }
    await delay(200);
  }
  server.kill();
  throw new Error(`preview server did not start on ${url}`);
}

function summarize(frames, detections, skipped) {
  const elapsedS = (frames.at(-1) - frames[0]) / 1000;
  const gaps = frames.slice(1).map((t, i) => t - frames[i]);
  const dropped = gaps.filter((gap) => gap > 1.5 * frameBudgetMs).length;
  const latencies = detections.map((d) => d.latencyMs).sort((a, b) => a - b);
  const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? null;
  const detectionSpanS = (detections.at(-1).t - detections[0].t) / 1000;
  return {
    renderFps: (frames.length - 1) / elapsedS,
    detectionFps: detections.length > 1 ? (detections.length - 1) / detectionSpanS : 0,
    frames: frames.length,
    droppedFrames: dropped,
    droppedRatio: dropped / Math.max(1, gaps.length),
    detections: detections.length,
    skippedDetections: skipped,
    latencyMs: { p50: percentile(0.5), p95: percentile(0.95), max: latencies.at(-1) ?? null },
  };
}

async function main() {
  let previewServer = null;
  let url = env.BENCH_URL;
  if (!url) {
    const started = await startPreviewServer();
    url = started.url;
    previewServer = started.server;
  }

  let browser = null;
  try {
    browser = await chromium.launch({
      executablePath: env.BENCH_CHROME || undefined,
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--enable-unsafe-swiftshader',
        '--use-angle=swiftshader',
      ],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(initScript);
    page.on('pageerror', (error) => log(`page error: ${error.message}`));

    log(`opening ${url}`);
    await page.goto(url, { waitUntil: 'load' });
    const startButton = page.getByRole('button', { name: /Start Analysis/ });
    await startButton.waitFor({ state: 'visible', timeout: 120000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some(
        (b) => /Start Analysis/.test(b.textContent ?? '') && !b.disabled,
      ),
      null,
      { timeout: 120000 },
    );
    await startButton.click();

    log('waiting for first detection');
    await page.waitForFunction(() => window.__bench.detections.length > 0 || window.__bench.skipped > 0, null, { timeout: 120000 });
    await delay(warmupMs);

    log(`measuring for ${durationMs} ms`);
    await page.evaluate(() => {
      window.__bench.frames = [];
      window.__bench.detections = [];
      window.__bench.skipped = 0;
    });
    await delay(durationMs);
    const raw = await page.evaluate(() => window.__bench);

    if (raw.frames.length < 2 || raw.detections.length < 2) {
      throw new Error(`insufficient samples: ${raw.frames.length} frames, ${raw.detections.length} detections`);
    }

    const result = summarize(raw.frames, raw.detections, raw.skipped);
    const failures = [];
    if (result.renderFps < minFps) failures.push(`render FPS ${result.renderFps.toFixed(1)} < ${minFps}`);
    if (result.detectionFps < minFps) failures.push(`detection FPS ${result.detectionFps.toFixed(1)} < ${minFps}`);
    const report = { target: `${minFps}+ FPS`, url, ...result, pass: failures.length === 0, failures };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.pass ? 0 : 1;
  } catch (error) {
    log(`benchmark could not complete: ${error.message}`);
    process.exitCode = 2;
  } finally {
    await browser?.close();
    previewServer?.kill();
  }
}

main();
