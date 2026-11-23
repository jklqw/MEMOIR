import { useState } from 'react';
import { Lock, LogOut, Menu, ShieldCheck, Unlock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useVaultStore } from '../../stores/vaultStore.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { ThemeToggle } from '../ui/ThemeToggle.js';

export interface HeaderProps {
  onToggleSidebar?: () => void;
  statusText?: string;
  isVaultUnlocked?: boolean;
  onOpenSetup?: () => void;
  onOpenUnlock?: () => void;
}

export function Header({ onToggleSidebar, onOpenSetup, onOpenUnlock }: HeaderProps) {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const { user, logout, isAuthenticated } = useAuth();
  const { isUnlocked, isInitialized, vaultMetadata, lock, idleTimeoutMinutes } = useVaultStore();

  const statusText = !isAuthenticated
    ? 'Zero-Knowledge Protection Active'
    : !isInitialized
      ? 'Vault Not Initialized'
      : isUnlocked
        ? `Vault Unlocked · RAM-only (Auto-lock ${idleTimeoutMinutes}m)`
        : 'Vault Locked · End-to-End Encrypted';

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 bg-canvas/80 backdrop-blur-xs border-b border-border">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSidebar}
              className="md:hidden p-1.5 h-auto text-ink-muted"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5 stroke-[1.5]" />
            </Button>
          )}

          <div
            className="flex items-center gap-2 text-xs font-mono text-ink-muted"
            aria-live="polite"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                !isAuthenticated
                  ? 'bg-ink-subtle'
                  : isUnlocked
                    ? 'bg-accent animate-pulse'
                    : 'bg-destructive'
              }`}
              aria-hidden="true"
            />
            <span>{statusText}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <>
              {isUnlocked ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={lock}
                  className="text-xs text-ink-muted hover:text-destructive gap-1.5"
                  title="Lock Vault now (clears DEK from RAM)"
                >
                  <Lock className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span className="hidden sm:inline">Lock Vault</span>
                </Button>
              ) : isInitialized ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onOpenUnlock}
                  className="text-xs gap-1.5"
                  title="Unlock Vault with Passphrase"
                >
                  <Unlock className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span className="hidden sm:inline">Unlock Vault</span>
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onOpenSetup}
                  className="text-xs gap-1.5"
                  title="Initialize Zero-Knowledge Vault"
                >
                  <Lock className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span className="hidden sm:inline">Initialize Vault</span>
                </Button>
              )}
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsInspectorOpen(true)}
            className="text-xs text-ink-muted hover:text-ink gap-1.5 hidden sm:inline-flex"
            title="Inspect client cryptographic envelope and key status"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-accent stroke-[1.5]" />
            <span>Crypto Inspector</span>
          </Button>

          {isAuthenticated && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              className="text-xs text-ink-muted hover:text-ink gap-1.5"
              title={user ? `Signed in as ${user.email}. Click to sign out.` : 'Sign out'}
            >
              <LogOut className="w-3.5 h-3.5 stroke-[1.5]" />
              <span className="hidden md:inline">Sign Out</span>
            </Button>
          )}

          <ThemeToggle />
        </div>
      </header>

      <Dialog
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        title="Cryptographic Inspector"
        description="Transparent verification of client-side cipher primitives and key isolation."
      >
        <div className="space-y-4 text-xs font-mono text-ink-muted">
          <div className="p-3 bg-canvas border border-border rounded-md space-y-2">
            <div className="flex justify-between">
              <span className="text-ink">Vault Master Key (DEK):</span>
              <span className={isUnlocked ? 'text-accent font-semibold' : 'text-destructive'}>
                {isUnlocked ? 'RAM-only (256-bit AES-GCM)' : 'Locked / Zeroized'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Key Derivation (KDF):</span>
              <span>
                {vaultMetadata
                  ? `${vaultMetadata.kdfAlgorithm} (m=${vaultMetadata.kdfMemory / 1024}MiB, t=${vaultMetadata.kdfIterations}, p=${vaultMetadata.kdfParallelism})`
                  : 'Argon2id (m=64MiB, t=3, p=1)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Envelope Version:</span>
              <span>v{vaultMetadata?.envelopeVersion ?? 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Payload Encryption:</span>
              <span>AES-256-GCM + 256B Boundary Padding</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Context Binding (AAD):</span>
              <span className="truncate max-w-[200px]">memoir:v1|*|user:{user?.id ?? '...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Recovery Key Fingerprint:</span>
              <span className="truncate max-w-[200px]">
                {vaultMetadata?.recoveryKeyFingerprint
                  ? `${vaultMetadata.recoveryKeyFingerprint.slice(0, 16)}...`
                  : 'Not initialized'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Idle Auto-Lock:</span>
              <span>{idleTimeoutMinutes} minutes (RAM cleared on timeout)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Storage Persistence:</span>
              <span className="text-accent font-medium">None (Zero disk/localStorage storage)</span>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-subtle">
            All private memory content is encrypted locally inside your browser WebAssembly runtime
            prior to transmission. No plaintext strings or unencrypted keys are ever stored on or
            disclosed to the server.
          </p>
        </div>
      </Dialog>
    </>
  );
}
