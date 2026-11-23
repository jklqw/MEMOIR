import { KeyRound, Lock, Shield, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';

export function LandingPage() {
  return (
    <div className="py-12 md:py-20 space-y-16 text-center md:text-left">
      <div className="space-y-6 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-mono">
          <Shield className="w-3.5 h-3.5 stroke-[1.5]" />
          <span>Zero-Knowledge Architecture · E2EE</span>
        </div>

        <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl text-ink font-semibold tracking-tight leading-[1.15]">
          A quiet, private sanctuary for your thoughts.
        </h1>

        <p className="text-base sm:text-lg text-ink-muted leading-relaxed font-sans font-normal">
          Memoir is an archival diary engineered with client-side cryptography. Even if our servers,
          databases, and storage disks are completely breached, your memories remain unbreakable.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2 justify-center md:justify-start">
          <Link to="/register">
            <Button size="lg" className="font-sans">
              Create Encrypted Vault
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" size="lg" className="font-sans">
              Sign In
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-border">
        <div className="p-5 bg-surface border border-border rounded-lg space-y-3">
          <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center text-accent">
            <Lock className="w-4 h-4 stroke-[1.5]" />
          </div>
          <h2 className="font-serif font-semibold text-ink text-base">Client-Side AEAD</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            Every memory is padded to 256-byte boundaries and encrypted with AES-256-GCM and unique
            nonces before leaving your browser.
          </p>
        </div>

        <div className="p-5 bg-surface border border-border rounded-lg space-y-3">
          <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center text-accent">
            <KeyRound className="w-4 h-4 stroke-[1.5]" />
          </div>
          <h2 className="font-serif font-semibold text-ink text-base">Three-Secret Separation</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            Your Account Password, Vault Passphrase, and 256-bit Crockford Recovery Key remain
            strictly isolated.
          </p>
        </div>

        <div className="p-5 bg-surface border border-border rounded-lg space-y-3">
          <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center text-accent">
            <Sparkles className="w-4 h-4 stroke-[1.5]" />
          </div>
          <h2 className="font-serif font-semibold text-ink text-base">Archival Craft</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            Designed like a tactile literary notebook in Archival Paper & Ink. Zero ads, zero
            telemetry, zero AI-slop neon clutter.
          </p>
        </div>
      </div>
    </div>
  );
}
