import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionResponse } from '@memoir/shared';
import { AlertCircle, CheckCircle2, Globe, Laptop, RotateCcw, Shield, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { api } from '../lib/api.js';

export function SecurityPage() {
  const queryClient = useQueryClient();
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const {
    data: sessions = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<SessionResponse[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionResponse[]>('/api/v1/sessions'),
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/api/v1/sessions/${sessionId}`),
    onSuccess: () => {
      setActionMessage({ type: 'success', text: 'Device session revoked successfully.' });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err: unknown) => {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke session.',
      });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => api.post('/api/v1/sessions/revoke-all'),
    onSuccess: () => {
      setActionMessage({ type: 'success', text: 'All other device sessions have been revoked.' });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err: unknown) => {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke other sessions.',
      });
    },
  });

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="pb-4 border-b border-border">
        <h1 className="font-serif text-2xl font-semibold text-ink">Security & Privacy Dashboard</h1>
        <p className="text-xs text-ink-muted mt-1">
          Cryptographic posture, active devices, and zero-knowledge identity controls.
        </p>
      </div>

      {actionMessage && (
        <div
          role="alert"
          aria-live="polite"
          className={`p-3 rounded-md border flex items-center justify-between text-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-[11px] underline hover:no-underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Security Posture Checklist */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Shield className="w-4 h-4 text-accent stroke-[1.5]" />
          <span>Security Posture Checklist</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-paper border border-border rounded">
            <div>
              <span className="text-ink font-medium block">Zero-Knowledge Invariant</span>
              <span className="text-[11px] text-ink-muted">
                Plaintext memory strings and raw encryption keys never leave browser RAM
              </span>
            </div>
            <span className="font-mono text-accent text-[11px] px-2 py-0.5 rounded bg-accent/10">
              Enforced
            </span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-paper border border-border rounded">
            <div>
              <span className="text-ink font-medium block">Account Password Hash</span>
              <span className="text-[11px] text-ink-muted">
                Server-side memory-hard Argon2id (m=64MiB, t=3, p=4)
              </span>
            </div>
            <span className="font-mono text-accent text-[11px] px-2 py-0.5 rounded bg-accent/10">
              Argon2id
            </span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-paper border border-border rounded">
            <div>
              <span className="text-ink font-medium block">Session Security & Rotation</span>
              <span className="text-[11px] text-ink-muted">
                Opaque HttpOnly cookies, family rotation, and replay detection
              </span>
            </div>
            <span className="font-mono text-accent text-[11px] px-2 py-0.5 rounded bg-accent/10">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Laptop className="w-4 h-4 text-accent stroke-[1.5]" />
            <span>Active Sessions & Authorized Devices</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              title="Refresh session list"
              className="text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={revokeAllMutation.isPending || sessions.length <= 1}
              onClick={() => revokeAllMutation.mutate()}
              className="text-xs"
            >
              {revokeAllMutation.isPending ? 'Revoking...' : 'Revoke All Other Devices'}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="py-8 text-center text-xs text-ink-muted">
            <div className="w-5 h-5 border-2 border-border border-t-ink rounded-full animate-spin mx-auto mb-2" />
            Loading active sessions...
          </div>
        )}

        {isError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400 rounded">
            Failed to load active device sessions.
          </div>
        )}

        {!isLoading && !isError && sessions.length === 0 && (
          <p className="text-xs text-ink-muted py-4 text-center">No active sessions found.</p>
        )}

        {!isLoading && !isError && sessions.length > 0 && (
          <div className="space-y-2.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="p-3 bg-paper border border-border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface border border-border flex items-center justify-center text-ink shrink-0">
                    <Laptop className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{session.deviceLabel}</span>
                      {session.isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/15 text-accent font-semibold">
                          This Browser
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-ink-muted text-[11px] font-mono mt-0.5">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" strokeWidth={1.5} />
                        {session.ipMasked}
                      </span>
                      <span>•</span>
                      <span>Last seen: {new Date(session.lastSeenAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(session.id)}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 self-end sm:self-center"
                    title="Revoke session for this device"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
