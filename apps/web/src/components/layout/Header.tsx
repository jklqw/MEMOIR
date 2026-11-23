import { useState } from 'react';
import { LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { ThemeToggle } from '../ui/ThemeToggle.js';

export interface HeaderProps {
  onToggleSidebar?: () => void;
  statusText?: string;
  isVaultUnlocked?: boolean;
}

export function Header({
  onToggleSidebar,
  statusText = 'Zero-Knowledge Protection Active',
  isVaultUnlocked = false,
}: HeaderProps) {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const { user, logout, isAuthenticated } = useAuth();

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
                isVaultUnlocked ? 'bg-accent animate-pulse' : 'bg-ink-subtle'
              }`}
              aria-hidden="true"
            />
            <span>{statusText}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
              <span className="text-accent font-semibold">
                {isVaultUnlocked ? 'RAM-only (256-bit AES-GCM)' : 'Locked / Zeroized'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Key Derivation (KDF):</span>
              <span>Argon2id (m=64MiB, t=3, p=1)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Payload Encryption:</span>
              <span>AES-256-GCM + 256B Boundary Padding</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Context Binding (AAD):</span>
              <span className="truncate max-w-[200px]">memoir:v1|record-context</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink">Memory Security:</span>
              <span>No persistence (RAM-only store)</span>
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
