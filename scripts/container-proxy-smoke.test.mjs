import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

const id = process.pid;
const image = `pose-detection-smoke-test:${id}`;
const network = `pose-detection-smoke-net-${id}`;
const appName = `pose-detection-smoke-app-${id}`;
const proxyName = `pose-detection-smoke-proxy-${id}`;
let containerCount = 0;
const started = [];

function readRepoFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function docker(args, options = {}) {
  const output = execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  return typeof output === 'string' ? output.trim() : '';
}

function remove(name) {
  try {
    docker(['rm', '--force', name]);
  } catch {
    // The container may already have stopped and been removed.
  }
}

// The Kubernetes example is the contract under test, so read its values
// directly rather than duplicating them here.
const example = readRepoFile('k8s-example.yaml');
const nginxListenPort = Number(readRepoFile('nginx.conf.template').match(/listen\s+(\d+);/)[1]);
const exampleBasePath = example.match(/name: BASE_PATH\s*\n\s*value: "([^"]*)"/)[1];
const exampleContainerPort = Number(example.match(/containerPort:\s*(\d+)/)[1]);
const exampleProbes = [...example.matchAll(/httpGet:\s*\n\s*path:\s*(\S+)\s*\n\s*port:\s*(\d+)/g)].map(
  (match) => ({ path: match[1], port: Number(match[2]) }),
);
const exampleTargetPorts = [...example.matchAll(/targetPort:\s*(\d+)/g)].map((match) => Number(match[1]));
const exampleIngressPaths = [...example.matchAll(/^\s*- path:\s*(\S+)/gm)].map((match) => match[1]);

function startApp(basePath, { onNetwork = false } = {}) {
  const name = `${appName}-${containerCount++}`;
  const args = ['run', '--rm', '--detach', '--name', name, '--env', `BASE_PATH=${basePath}`];
  if (onNetwork) {
    args.push('--network', network);
  } else {
    args.push('--publish', `127.0.0.1::${nginxListenPort}`);
  }
  args.push(image);
  started.push(name);
  return docker(args) && name;
}

function publishedOrigin(container, containerPort = nginxListenPort) {
  const mapping = docker(['port', container, `${containerPort}/tcp`]);
  const port = mapping.match(/:(\d+)\s*$/)?.[1];
  assert.ok(port, `Docker did not report a published port: ${mapping}`);
  return `http://127.0.0.1:${port}`;
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

async function assertResourcesLoad(origin, pageUrl, html, prefix) {
  const resources = extractLocalResources(html);
  assert.ok(resources.length > 0, 'The page should reference local assets');
  for (const resource of resources) {
    const resourceUrl = new URL(resource, pageUrl);
    assert.equal(resourceUrl.origin, origin, `resource ${resource} should stay on the proxy origin`);
    assert.ok(
      resourceUrl.pathname === prefix || resourceUrl.pathname.startsWith(`${prefix}/`),
      `resource ${resource} resolved outside ${prefix}: ${resourceUrl.pathname}`,
    );
    const response = await fetch(resourceUrl);
    assert.equal(response.status, 200, `resource ${resource} should load through the proxy`);
  }
}

// Mirrors the nginx location the README documents: the proxy forwards the
// full BASE_PATH prefix unchanged. The /stripped/ location reproduces the
// rewrite-target behaviour the example used to have, as a negative control.
function proxyConfig(app, prefix) {
  return `worker_processes 1;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 64; }
http {
    access_log off;
    server {
        listen ${nginxListenPort};
        # TLS terminates at the proxy. The app 301s any request forwarded as
        # plain http, so the proxy must report https.
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        location = ${prefix} {
            proxy_pass http://${app}:${nginxListenPort};
        }
        location ${prefix}/ {
            proxy_pass http://${app}:${nginxListenPort};
        }
        location /stripped/ {
            rewrite ^/stripped/(.*)$ /$1 break;
            proxy_pass http://${app}:${nginxListenPort};
        }
    }
}`;
}

describe('Kubernetes example contract', () => {
  test('container ports and probes target the port nginx listens on', () => {
    assert.equal(exampleContainerPort, nginxListenPort, 'containerPort should match nginx listen port');
    for (const port of exampleTargetPorts) {
      assert.equal(port, nginxListenPort, 'Service targetPort should match nginx listen port');
    }
    assert.ok(exampleProbes.length > 0, 'The example should define HTTP probes');
    for (const probe of exampleProbes) {
      assert.equal(probe.port, nginxListenPort, `probe ${probe.path} should use port ${nginxListenPort}`);
    }
  });

  test('probes use the documented health endpoint under BASE_PATH', () => {
    for (const probe of exampleProbes) {
      assert.equal(probe.path, `${exampleBasePath}/health`);
    }
  });

  test('ingress paths keep the BASE_PATH prefix and nothing strips it', () => {
    assert.ok(exampleIngressPaths.length > 0, 'The example should define ingress paths');
    for (const path of exampleIngressPaths) {
      assert.equal(path, exampleBasePath, 'ingress path should equal BASE_PATH');
    }
    assert.doesNotMatch(example, /rewrite-target|stripPrefix/i, 'the example must not strip the prefix');
  });
});

describe('container and reverse-proxy smoke', { concurrency: false }, () => {
  before(() => {
    docker(['build', '--tag', image, '.'], { stdio: 'inherit' });
    docker(['network', 'create', network]);
  });

  after(() => {
    for (const name of started) remove(name);
    remove(proxyName);
    try {
      docker(['network', 'rm', network]);
    } catch {
      // Keep the network when cleanup fails so a failed run remains debuggable.
    }
    try {
      docker(['image', 'rm', image]);
    } catch {
      // Keep the image when cleanup fails so a failed run remains debuggable.
    }
  });

  test('Dockerfile HEALTHCHECK script passes for root and the example BASE_PATH', async (t) => {
    for (const basePath of ['/', exampleBasePath]) {
      await t.test(`BASE_PATH=${basePath}`, async () => {
        const container = startApp(basePath);
        const origin = publishedOrigin(container);
        const prefix = basePath === '/' ? '' : basePath;
        await waitForServer(`${origin}${prefix}/health`);

        const output = docker(['exec', container, '/usr/local/bin/health-check.sh']);
        assert.match(output, /Health check passed/);
      });
    }
  });

  test('Kubernetes example probes succeed on the declared port and path', async () => {
    const container = startApp(exampleBasePath);
    const origin = publishedOrigin(container, exampleContainerPort);
    await waitForServer(`${origin}${exampleProbes[0].path}`);

    for (const probe of exampleProbes) {
      const response = await fetch(`${origin}${probe.path}`);
      assert.equal(response.status, 200, `probe ${probe.path} should return 200`);
      assert.equal((await response.json()).status, 'healthy');
    }
  });

  test('reverse proxy forwards the example BASE_PATH unchanged', async (t) => {
    const app = startApp(exampleBasePath, { onNetwork: true });
    const config = proxyConfig(app, exampleBasePath);
    const proxy = docker([
      'run', '--rm', '--detach', '--name', proxyName,
      '--network', network,
      '--publish', `127.0.0.1::${nginxListenPort}`,
      'nginx:1.24-alpine',
      'sh', '-c',
      `cat > /tmp/nginx.conf <<'EOF'\n${config}\nEOF\nexec nginx -c /tmp/nginx.conf -g 'daemon off;'`,
    ]);
    assert.ok(proxy, 'proxy container should start');
    const origin = publishedOrigin(proxyName);
    const prefix = exampleBasePath;
    try {
      await waitForServer(`${origin}${prefix}/health`);
    } catch (error) {
      const logs = docker(['logs', proxyName]);
      throw new Error(`${error.message}\nproxy logs:\n${logs}`, { cause: error });
    }

    await t.test('health endpoint is reachable through the proxy', async () => {
      const response = await fetch(`${origin}${prefix}/health`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, 'healthy');
    });

    await t.test('path without trailing slash redirects to the app', async () => {
      const response = await fetch(`${origin}${prefix}`, { redirect: 'manual' });
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), `${prefix}/`);
    });

    await t.test('root page and its local assets resolve under the prefix', async () => {
      const pageUrl = `${origin}${prefix}/`;
      const response = await fetch(pageUrl);
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, new RegExp(`window\\.__BASE_PATH__ = '${prefix}'`));
      await assertResourcesLoad(origin, pageUrl, body, prefix);
    });

    await t.test('deep SPA route falls back to index.html', async () => {
      const response = await fetch(`${origin}${prefix}/motion/session`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<html/i);
    });

    await t.test('stripping the prefix breaks the app (negative control)', async () => {
      const response = await fetch(`${origin}/stripped/health`);
      assert.equal(response.status, 404);
    });
  });
});
