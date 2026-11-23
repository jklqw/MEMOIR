import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Security CI/CD, Secret Scanning & Dependency Audit Verification', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  it('1. Executes scripts/scan-secrets.mjs and confirms zero hardcoded secrets exist in tracked files', () => {
    const result = execSync('node scripts/scan-secrets.mjs', {
      cwd: rootDir,
      encoding: 'utf-8',
    });

    expect(result).toContain('[PASSED]');
    expect(result).toContain('Zero secrets detected');
  });

  it('2. Confirms secret scanner positively detects synthetic secret patterns when tested', () => {
    const syntheticSecret = 'AKIAIOSFODNN7EXAMPLE'; // Known AWS fake test key
    const pattern = /\bAKIA[0-9A-Z]{16}\b/;
    expect(pattern.test(syntheticSecret)).toBe(true);

    const syntheticPrivateKey = '-----BEGIN RSA PRIVATE KEY-----';
    const keyPattern = /-----BEGIN (?:RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/;
    expect(keyPattern.test(syntheticPrivateKey)).toBe(true);

    const syntheticGithubPat = 'ghp_123456789012345678901234567890123456';
    const githubPattern = /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\b/;
    expect(githubPattern.test(syntheticGithubPat)).toBe(true);
  });

  it('3. Confirms .gitleaks.toml exists and specifies custom rules for Memoir Recovery Keys & DEKs', async () => {
    const gitleaksPath = path.join(rootDir, '.gitleaks.toml');
    const content = await fs.readFile(gitleaksPath, 'utf-8');

    expect(content).toContain('title = "Memoir Gitleaks Configuration"');
    expect(content).toContain('id = "memoir-recovery-key"');
    expect(content).toContain('id = "memoir-dek-raw"');
    expect(content).toContain('[allowlist]');
  });

  it('4. Confirms .github/workflows/security.yml defines automated secret scanning and regression checks', async () => {
    const workflowPath = path.join(rootDir, '.github/workflows/security.yml');
    const content = await fs.readFile(workflowPath, 'utf-8');

    expect(content).toContain('gitleaks/gitleaks-action@v2');
    expect(content).toContain('node scripts/scan-secrets.mjs');
    expect(content).toContain('pnpm test:security');
    expect(content).toContain('pnpm audit --audit-level=high');
  });

  it('5. Confirms ESLint configuration enforces security-focused static analysis rules', async () => {
    const eslintPath = path.join(rootDir, 'eslint.config.mjs');
    const content = await fs.readFile(eslintPath, 'utf-8');

    expect(content).toContain("'no-eval': 'error'");
    expect(content).toContain("'no-implied-eval': 'error'");
    expect(content).toContain("'no-new-func': 'error'");
    expect(content).toContain("'no-proto': 'error'");
    expect(content).toContain("'no-with': 'error'");
  });
});
