#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = process.cwd();

// Files and paths allowed to contain mock credentials or test fixtures
const ALLOWED_PATHS = [
  /\.env\.example$/,
  /\/test\//,
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /PROJECT_AND_SECURITY_REPORT\.md$/,
  /PROJECT_MEMORY\.md$/,
  /GUIDE\.md$/,
  /IMPLEMENTATION_PLAN\.md$/,
  /scripts\/scan-secrets\.mjs$/,
  /\.github\/workflows\//,
];

// High-confidence regex patterns for production secrets
const SECRET_PATTERNS = [
  {
    name: 'Private Key Block',
    pattern: /-----BEGIN (?:RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/,
  },
  {
    name: 'AWS Access Key ID',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\b/,
  },
  {
    name: 'Slack Bot / User Token',
    pattern: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/,
  },
  {
    name: 'Hardcoded Production Database URL',
    pattern:
      /\b(?:postgres|postgresql|mysql):\/\/(?!postgres:postgres@|memoir:memoir@|memoir:memoir_dev_password@localhost|memoir:memoir_ci_password@localhost)[a-zA-Z0-9_-]+:[^@\s]+@[a-zA-Z0-9.-]+:[0-9]+\/[a-zA-Z0-9_-]+\b/,
  },
];

function getTrackedFiles() {
  try {
    const stdout = execSync('git ls-files', { encoding: 'utf-8', cwd: ROOT_DIR });
    return stdout
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .map((f) => path.join(ROOT_DIR, f));
  } catch (err) {
    console.warn('[WARN] Could not retrieve git ls-files, falling back to all files:', err);
    return [];
  }
}

async function scan() {
  console.log(
    '[SECURITY SCAN] Scanning repository for hardcoded secrets and sensitive credentials...',
  );
  const files = getTrackedFiles();
  let violationCount = 0;

  for (const file of files) {
    const relPath = path.relative(ROOT_DIR, file);

    // Skip allowed paths
    if (ALLOWED_PATHS.some((regex) => regex.test(relPath))) {
      continue;
    }

    try {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const { name, pattern } of SECRET_PATTERNS) {
          if (pattern.test(line)) {
            console.error(`[HIGH SEVERITY SECRET DETECTED] ${name}`);
            console.error(`  Location: ${relPath}:${i + 1}`);
            console.error(`  Preview: ${line.trim().slice(0, 80)}...`);
            violationCount++;
          }
        }
      }
    } catch {
      // Skip unreadable binary files
    }
  }

  if (violationCount > 0) {
    console.error(`\n[FAILED] Secret scan failed with ${violationCount} high-risk finding(s).`);
    process.exit(1);
  } else {
    console.log(
      `[PASSED] Secret scan clean. Scanned ${files.length} tracked files. Zero secrets detected.`,
    );
  }
}

scan().catch((err) => {
  console.error('[ERROR] Secret scanner encountered an unexpected error:', err);
  process.exit(1);
});
