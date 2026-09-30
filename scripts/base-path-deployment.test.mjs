import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';

const image = `pose-detection-base-path-test:${process.pid}`;
const cases = [
  { name: 'root', basePath: '/' },
  { name: 'single-segment', basePath: '/gait' },
  { name: 'nested', basePath: '/apps/pose-detector' },
];

function docker(args, options = {}) {
  const output = execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  return typeof output === 'string' ? output.trim() : '';
}

function prefixFor(basePath) {
  return basePath === '/' ? '' : basePath;
}

function extractLocalResources(html) {
  const resources = [];
  const pattern = /<(?:script[^>]+src|link[^>]+href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const resource = match[1];
    if (!/^(?:[a-z][a-z\d+.-]*:|\/\/|data:|#)/i.test(resource)) {
      resources.push(resource);
    }
  }
  return resources;
}

async function fetchText(url, options) {
  const response = await fetch(url, options);
  return { response, body: await response.text() };
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message}`);
}

async function startDeployment(basePath, t) {
  const container = docker([
    'run', '--rm', '--detach',
    '--publish', '127.0.0.1::8080',
    '--env', `BASE_PATH=${basePath}`,
    image,
  ]);
  t.after(() => {
    try {
      docker(['rm', '--force', container]);
    } catch {
      // The --rm container may already have stopped and been removed.
    }
  });

  const portMapping = docker(['port', container, '8080/tcp']);
  const port = portMapping.match(/:(\d+)\s*$/)?.[1];
  assert.ok(port, `Docker did not report a published port: ${portMapping}`);
  const origin = `http://127.0.0.1:${port}`;
  const prefix = prefixFor(basePath);
  await waitForServer(`${origin}${prefix}/health`);
  return { origin, prefix };
}

async function assertLocalResources(origin, pageUrl, html, expectedPrefix) {
  const resources = extractLocalResources(html);
  assert.ok(resources.length > 0, 'The page should reference local assets');

  for (const resource of resources) {
    const resourceUrl = new URL(resource, pageUrl);
    assert.equal(
      resourceUrl.origin,
      origin,
      `resource ${resource} should stay on the deployment origin`,
    );
    assert.ok(
      resourceUrl.pathname === expectedPrefix || resourceUrl.pathname.startsWith(`${expectedPrefix}/`),
      `resource ${resource} resolved outside BASE_PATH: ${resourceUrl.pathname}`,
    );
    const response = await fetch(resourceUrl);
    assert.equal(response.status, 200, `resource ${resource} should load`);
  }
}

describe('BASE_PATH production deployments', { concurrency: false }, () => {
  before(() => {
    docker(['build', '--tag', image, '.'], { stdio: 'inherit' });
  });

  after(() => {
    try {
      docker(['image', 'rm', image]);
    } catch {
      // Preserve the image when cleanup fails so a failed run remains debuggable.
    }
  });

  test('root, single-segment, and nested deployments serve config, assets, fallback, and navigation', async (t) => {
    for (const { name, basePath } of cases) {
      await t.test(`${name} deployment`, async (deploymentTest) => {
        const { origin, prefix } = await startDeployment(basePath, deploymentTest);
        const expectedApiUrl = basePath === '/' ? '/api' : `${basePath}/api`;
        const appUrl = `${origin}${prefix}/`;
        const { response, body } = await fetchText(appUrl);

        assert.equal(response.status, 200);
        assert.match(body, new RegExp(`window\\.__BASE_PATH__ = '${basePath}'`));
        assert.match(body, new RegExp(`basePath: '${basePath}'`));
        assert.match(body, new RegExp(`apiUrl: '${expectedApiUrl.replace('/', '\\/')}'`));
        await assertLocalResources(origin, appUrl, body, prefix);

        const health = await fetch(`${origin}${prefix}/health`);
        assert.equal(health.status, 200);
        assert.equal((await health.json()).status, 'healthy');

        const manifest = await fetch(`${origin}${prefix}/manifest.json`);
        assert.equal(manifest.status, 200);
        const manifestBody = await manifest.json();
        const iconUrl = new URL(manifestBody.icons[0].src, `${origin}${prefix}/manifest.json`);
        assert.equal((await fetch(iconUrl)).status, 200);

        const routeUrl = `${origin}${prefix}/motion/session`;
        const navigation = await fetchText(routeUrl);
        assert.equal(navigation.response.status, 200);
        assert.match(navigation.body, new RegExp(`window\\.__BASE_PATH__ = '${basePath}'`));
        await assertLocalResources(origin, routeUrl, navigation.body, prefix);

        if (basePath !== '/') {
          const redirect = await fetch(`${origin}${basePath}`, { redirect: 'manual' });
          assert.equal(redirect.status, 301);
          assert.equal(redirect.headers.get('location'), `${basePath}/`);
        }
      });
    }
  });
});
