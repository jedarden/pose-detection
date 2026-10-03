import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const verifier = new URL('./definition-of-done.sh', import.meta.url);
const verifierPath = verifier.pathname;
const repositoryRoot = new URL('..', import.meta.url).pathname;

test('definition-of-done is executable and bootstraps npm dependencies before checks', () => {
  const mode = statSync(verifierPath).mode;
  assert.ok((mode & 0o111) !== 0, 'definition-of-done.sh must be executable');

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pose-detection-verifier-'));
  const fakeNpm = join(temporaryDirectory, 'npm');
  const invocationLog = join(temporaryDirectory, 'npm-invocations.log');

  try {
    writeFileSync(
      fakeNpm,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$VERIFIER_INVOCATION_LOG"\n',
      { mode: 0o755 },
    );
    chmodSync(fakeNpm, 0o755);

    const result = spawnSync(verifierPath, ['--fast'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${temporaryDirectory}:${process.env.PATH ?? ''}`,
        VERIFIER_INVOCATION_LOG: invocationLog,
      },
    });

    assert.equal(
      result.status,
      0,
      `direct --fast invocation failed: ${result.error?.message ?? result.stderr}`,
    );
    assert.deepEqual(readFileSync(invocationLog, 'utf8').trim().split('\n'), [
      'ci --ignore-scripts',
      'run build',
      'run lint',
      'run test:deployment',
    ]);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('definition-of-done reports the missing npm prerequisite', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pose-detection-verifier-'));

  try {
    const result = spawnSync(verifierPath, ['--fast'], {
      cwd: temporaryDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: temporaryDirectory,
      },
    });

    assert.equal(result.status, 127);
    assert.match(result.stderr, /npm is required/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
