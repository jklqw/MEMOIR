import { Laptop, Shield } from 'lucide-react';
import { Button } from '../components/ui/Button.js';

export function SecurityPage() {
  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-border">
        <h1 className="font-serif text-2xl font-semibold text-ink">Security & Privacy Dashboard</h1>
        <p className="text-xs text-ink-muted mt-1">
          Cryptographic posture, active devices, and zero-knowledge identity controls.
        </p>
      </div>

      {/* Security Posture Checklist */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Shield className="w-4 h-4 text-accent stroke-[1.5]" />
          <span>Security Posture Checklist</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-canvas border border-border rounded">
            <span className="text-ink font-medium">Vault Master Key (DEK) Wrapped</span>
            <span className="font-mono text-accent">Active (AES-256-GCM)</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-canvas border border-border rounded">
            <span className="text-ink font-medium">Two-Factor Authentication (TOTP)</span>
            <span className="font-mono text-ink-muted">Optional / Available</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-canvas border border-border rounded">
            <span className="text-ink font-medium">WebAuthn Passkeys</span>
            <span className="font-mono text-ink-muted">Available</span>
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Laptop className="w-4 h-4 text-accent stroke-[1.5]" />
            <span>Active Sessions</span>
          </div>
          <Button variant="outline" size="sm">
            Revoke All Other Devices
          </Button>
        </div>

        <div className="p-3 bg-canvas border border-border rounded flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-surface flex items-center justify-center text-ink-muted">
              <Laptop className="w-3.5 h-3.5 stroke-[1.5]" />
            </div>
            <div>
              <span className="font-medium text-ink block">Current Device</span>
              <span className="text-ink-subtle font-mono text-[11px]">Active Session</span>
            </div>
          </div>
          <span className="text-accent font-mono text-[11px]">This Browser</span>
        </div>
      </div>
    </div>
  );
}
