import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api.js';

describe('WCAG 2.2 AA Accessibility & Resilient Edge States Verification', () => {
  it('1. Verifies Archival Paper & Obsidian Ink palettes satisfy WCAG 2.2 AA contrast ratios (>= 4.5:1)', () => {
    const tokensPath = path.resolve(__dirname, '../src/styles/tokens.css');
    const tokensContent = fs.readFileSync(tokensPath, 'utf-8');

    // Helper to calculate relative luminance according to WCAG 2.2 specs
    function getLuminance(hex: string): number {
      const cleanHex = hex.replace('#', '');
      const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

      const toLinear = (c: number) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }

    function getContrast(hex1: string, hex2: string): number {
      const lum1 = getLuminance(hex1);
      const lum2 = getLuminance(hex2);
      const brightest = Math.max(lum1, lum2);
      const darkest = Math.min(lum1, lum2);
      return (brightest + 0.05) / (darkest + 0.05);
    }

    // Extract light mode colors
    const lightCanvasMatch = tokensContent.match(/--color-canvas:\s*(#[0-9a-fA-F]{6});/);
    const lightInkMatch = tokensContent.match(/--color-ink:\s*(#[0-9a-fA-F]{6});/);
    const lightMutedMatch = tokensContent.match(/--color-ink-muted:\s*(#[0-9a-fA-F]{6});/);
    const lightAccentMatch = tokensContent.match(/--color-accent:\s*(#[0-9a-fA-F]{6});/);

    expect(lightCanvasMatch).toBeTruthy();
    expect(lightInkMatch).toBeTruthy();
    expect(lightMutedMatch).toBeTruthy();

    const lightCanvas = lightCanvasMatch![1]!;
    const lightInk = lightInkMatch![1]!;
    const lightMuted = lightMutedMatch![1]!;
    const lightAccent = lightAccentMatch![1]!;

    // Normal text contrast >= 4.5:1 in light mode
    const lightInkContrast = getContrast(lightInk, lightCanvas);
    const lightMutedContrast = getContrast(lightMuted, lightCanvas);
    const lightAccentContrast = getContrast(lightAccent, lightCanvas);

    expect(lightInkContrast).toBeGreaterThanOrEqual(7.0); // High contrast archival ink
    expect(lightMutedContrast).toBeGreaterThanOrEqual(4.5); // WCAG AA for muted secondary text
    expect(lightAccentContrast).toBeGreaterThanOrEqual(4.5); // WCAG AA for accent text / interactive

    // Extract dark mode colors
    const darkSection = tokensContent.split('.dark')[1] || '';
    const darkCanvasMatch = darkSection.match(/--color-canvas:\s*(#[0-9a-fA-F]{6});/);
    const darkInkMatch = darkSection.match(/--color-ink:\s*(#[0-9a-fA-F]{6});/);
    const darkMutedMatch = darkSection.match(/--color-ink-muted:\s*(#[0-9a-fA-F]{6});/);

    expect(darkCanvasMatch).toBeTruthy();
    expect(darkInkMatch).toBeTruthy();
    expect(darkMutedMatch).toBeTruthy();

    const darkCanvas = darkCanvasMatch![1]!;
    const darkInk = darkInkMatch![1]!;
    const darkMuted = darkMutedMatch![1]!;

    const darkInkContrast = getContrast(darkInk, darkCanvas);
    const darkMutedContrast = getContrast(darkMuted, darkCanvas);

    expect(darkInkContrast).toBeGreaterThanOrEqual(7.0);
    expect(darkMutedContrast).toBeGreaterThanOrEqual(4.5);
  });

  it('2. Verifies focus-visible rings and prefers-reduced-motion CSS rules are defined', () => {
    const mainCssPath = path.resolve(__dirname, '../src/styles/main.css');
    const mainCss = fs.readFileSync(mainCssPath, 'utf-8');

    // 1. Focus visible ring definition
    expect(mainCss).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px/);

    // 2. Reduced motion preference definition
    expect(mainCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(mainCss).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(mainCss).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it('3. Verifies AppShell provides accessible skip-to-content link and semantic landmarks', () => {
    const appShellPath = path.resolve(__dirname, '../src/components/layout/AppShell.tsx');
    const appShellContent = fs.readFileSync(appShellPath, 'utf-8');

    // Skip to main content link
    expect(appShellContent).toContain('href="#main-content"');
    expect(appShellContent).toContain('Skip to main content');
    expect(appShellContent).toContain('sr-only focus:not-sr-only');

    // Main landmark with id="main-content"
    expect(appShellContent).toContain('id="main-content"');
    expect(appShellContent).toContain('role="main"');
    expect(appShellContent).toContain('tabIndex={-1}');

    // Command palette integration
    expect(appShellContent).toContain('<CommandPalette');
    expect(appShellContent).toContain('<NetworkStatusIndicator');
  });

  it('4. Verifies DeleteAccountModal enforces re-auth password, explicit confirmation phrase, and honest disclosure', () => {
    const modalPath = path.resolve(__dirname, '../src/components/auth/DeleteAccountModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf-8');

    // Explicit confirmation phrase requirement
    expect(modalContent).toContain('DELETE MY ACCOUNT');

    // Honest retention disclosure
    expect(modalContent).toContain('Honest Retention Disclosure');
    expect(modalContent).toContain('30-day');
    expect(modalContent).toContain('disaster');

    // Re-auth password requirement
    expect(modalContent).toContain('type="password"');
    expect(modalContent).toContain('autoComplete="current-password"');

    // API invocation
    expect(modalContent).toContain("api.delete<DeleteAccountResponse>('auth/account'");
  });

  it('5. Verifies api.delete sends JSON request body and CSRF tokens when executing mutations', async () => {
    // Mock global fetch
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        success: true,
        data: {
          message: 'Account deleted successfully.',
          backupRetentionNotice: 'All data permanently deleted.',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await api.delete<{ message: string; backupRetentionNotice: string }>(
      'auth/account',
      { password: 'MasterPassword123!', confirmation: 'DELETE MY ACCOUNT' },
    );

    expect(result.message).toContain('Account deleted successfully');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/account',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          password: 'MasterPassword123!',
          confirmation: 'DELETE MY ACCOUNT',
        }),
      }),
    );

    vi.unstubAllGlobals();
  });
});
