import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck,
  FileText,
  History,
  Key,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  BackupHistoryItem,
  BackupRestoreResult,
  DecryptedMemory,
  MemoirEncryptedBackup,
  MemoryRecord,
} from '@memoir/shared';
import { useAuth } from '../context/AuthContext.js';
import { useVaultStore } from '../stores/vaultStore.js';
import { api } from '../lib/api.js';
import { decryptMemoryPayload } from '../services/memoryCryptoService.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Input } from '../components/ui/Input.js';
import { PassphraseRotationModal } from '../components/vault/PassphraseRotationModal.js';

export function SettingsPage() {
  const { user } = useAuth();
  const { dek, isLocked } = useVaultStore();

  const [isRotationOpen, setIsRotationOpen] = useState(false);
  const [isPlaintextModalOpen, setIsPlaintextModalOpen] = useState(false);
  const [plaintextConfirmText, setPlaintextConfirmText] = useState('');
  const [isExportingPlaintext, setIsExportingPlaintext] = useState(false);
  const [plaintextError, setPlaintextError] = useState<string | null>(null);

  // Encrypted Backup state
  const [isExportingEncrypted, setIsExportingEncrypted] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Restore & Verification state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedBackup, setParsedBackup] = useState<MemoirEncryptedBackup | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<{
    valid: boolean;
    computedHash: string;
    manifestHash: string;
    details?: string;
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<BackupRestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await api.get<BackupHistoryItem[]>('backups/history');
      setHistory(data);
    } catch {
      // Non-critical if history fails to load
    } finally {
      setIsLoadingHistory(false);
    }
  };

  /**
   * 1. Export Encrypted Backup (.memoir-backup.json)
   */
  const handleExportEncryptedBackup = async () => {
    setIsExportingEncrypted(true);
    setExportMessage(null);
    try {
      const backupData = await api.post<MemoirEncryptedBackup>('backups/export');
      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memoir-backup-${new Date().toISOString().slice(0, 10)}.memoir-backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportMessage(
        `Encrypted archive exported (${backupData.manifest.entryCount} records, SHA-256: ${backupData.manifest.checksumSha256.slice(0, 8)}...)`,
      );
      loadHistory();
    } catch {
      setExportMessage('Failed to generate encrypted backup.');
    } finally {
      setIsExportingEncrypted(false);
    }
  };

  /**
   * 2. Inspect & Verify Backup File Client-Side
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreError(null);
    setRestoreResult(null);
    setVerificationStatus(null);
    setParsedBackup(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as MemoirEncryptedBackup;

      if (
        !parsed.manifest ||
        parsed.manifest.version !== 1 ||
        !parsed.vault ||
        !Array.isArray(parsed.memories) ||
        !Array.isArray(parsed.attachments)
      ) {
        setRestoreError('Malformed backup format or unsupported version.');
        return;
      }

      // Compute SHA-256 hash client-side over payload data
      const dataPayloadString = JSON.stringify({
        vault: parsed.vault,
        memories: parsed.memories,
        attachments: parsed.attachments,
      });

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(dataPayloadString));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      const isValid = computedHash === parsed.manifest.checksumSha256;

      setVerificationStatus({
        valid: isValid,
        computedHash,
        manifestHash: parsed.manifest.checksumSha256,
      });
      setParsedBackup(parsed);
    } catch {
      setRestoreError('Failed to read or parse backup file. Must be valid JSON.');
    }
  };

  /**
   * 3. Confirm & Restore Verified Backup
   */
  const handleConfirmRestore = async () => {
    if (!parsedBackup || !verificationStatus?.valid) return;

    setIsRestoring(true);
    setRestoreError(null);
    try {
      const result = await api.post<BackupRestoreResult>('backups/import', parsedBackup);
      setRestoreResult(result);
      setParsedBackup(null);
      setVerificationStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setRestoreError('Restore operation failed. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  /**
   * 4. Warning-Gated Plaintext / Markdown Export
   */
  const handleExportPlaintext = async () => {
    if (plaintextConfirmText !== 'CONFIRM EXPORT') {
      setPlaintextError('Please type CONFIRM EXPORT exactly to proceed.');
      return;
    }

    if (isLocked || !dek || !user) {
      setPlaintextError('Vault must be unlocked in browser RAM to decrypt memories for export.');
      return;
    }

    setIsExportingPlaintext(true);
    setPlaintextError(null);

    try {
      const res = await api.get<{ memories: MemoryRecord[] }>('memories');
      const decryptedList: DecryptedMemory[] = [];

      for (const m of res.memories) {
        try {
          const dec = await decryptMemoryPayload(m, dek, user.id);
          decryptedList.push(dec);
        } catch {
          // If a memory fails decryption, keep proceeding
        }
      }

      // Generate plaintext export bundle
      const exportJson = {
        exportedAt: new Date().toISOString(),
        warning: 'UNENCRYPTED PLAINTEXT EXPORT - KEEP SECURE ON LOCAL STORAGE',
        totalMemories: decryptedList.length,
        memories: decryptedList.map((m) => ({
          entryDate: m.entryDate,
          title: m.payload.title,
          bodyMarkdown: m.payload.bodyMarkdown,
          mood: m.payload.mood,
          tags: m.payload.tags,
          isPinned: m.isPinned,
          createdAt: m.createdAt,
        })),
      };

      const blob = new Blob([JSON.stringify(exportJson, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memoir-decrypted-plaintext-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsPlaintextModalOpen(false);
      setPlaintextConfirmText('');
    } catch {
      setPlaintextError('Failed to decrypt and export plaintext memories.');
    } finally {
      setIsExportingPlaintext(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="pb-4 border-b border-border">
        <h1 className="font-serif text-2xl font-semibold text-ink">Account & Vault Settings</h1>
        <p className="text-xs text-ink-muted mt-1">
          Manage data portability, cryptographic keys, and account continuity.
        </p>
      </div>

      {/* 1. Data Portability & Encrypted Backups */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Download className="w-4 h-4 text-accent stroke-[1.5]" />
            <span>Encrypted Backup & Portability</span>
          </h2>
          <p className="text-xs text-ink-muted leading-relaxed mt-1">
            Export a complete, self-contained zero-knowledge archive (
            <code className="text-xs">.memoir-backup.json</code>) containing all ciphertext
            envelopes, KDF parameters, wrapped keys, and a tamper-evident SHA-256 integrity
            manifest.
          </p>
        </div>

        {exportMessage && (
          <div className="p-3 bg-accent/10 border border-accent/20 rounded text-xs text-accent flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{exportMessage}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportEncryptedBackup}
            disabled={isExportingEncrypted}
            className="flex items-center gap-1.5"
          >
            {isExportingEncrypted ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 stroke-[1.5]" />
            )}
            <span>Export Encrypted Backup</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>Select Backup to Restore</span>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.memoir-backup.json"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Verification Inspector Card */}
        {verificationStatus && parsedBackup && (
          <div className="p-4 bg-surface border border-border rounded-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-accent" />
                <span>Backup Archive Integrity Inspector</span>
              </span>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                  verificationStatus.valid
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'bg-destructive/15 text-destructive font-semibold'
                }`}
              >
                {verificationStatus.valid
                  ? 'SHA-256 Checksum Verified'
                  : 'INTEGRITY FAILED (TAMPER DETECTED)'}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs border-t border-border/50 pt-2 text-ink-muted">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-ink-muted">
                  Memories
                </span>
                <span className="font-semibold text-ink">
                  {parsedBackup.memories.length} records
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-ink-muted">
                  Attachments
                </span>
                <span className="font-semibold text-ink">
                  {parsedBackup.attachments.length} files
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-ink-muted">
                  Protocol Version
                </span>
                <span className="font-semibold text-ink">v{parsedBackup.manifest.version}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-ink-muted">
                  Export Date
                </span>
                <span className="font-semibold text-ink">
                  {new Date(parsedBackup.manifest.exportedAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="text-[11px] font-mono text-ink-muted bg-surface/80 p-2 rounded border border-border/40 truncate">
              Manifest SHA-256: {verificationStatus.manifestHash}
            </div>

            {verificationStatus.valid ? (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  size="sm"
                  onClick={handleConfirmRestore}
                  disabled={isRestoring}
                  className="flex items-center gap-1.5"
                >
                  {isRestoring && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm & Restore All Items</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setParsedBackup(null);
                    setVerificationStatus(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <p className="text-xs text-destructive">
                This backup archive has been tampered with or corrupted. The computed SHA-256 hash
                does not match the manifest. Restore has been blocked.
              </p>
            )}
          </div>
        )}

        {restoreError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{restoreError}</span>
          </div>
        )}

        {restoreResult && (
          <div className="p-3 bg-accent/10 border border-accent/20 rounded text-xs text-accent flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Restore Complete: Restored {restoreResult.restoredMemoriesCount} memories and{' '}
              {restoreResult.restoredAttachmentsCount} attachments.
            </span>
          </div>
        )}

        {/* Previous Backups History */}
        {history.length > 0 && (
          <div className="pt-2 border-t border-border space-y-2">
            <h3 className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-ink-muted" />
              <span>Export History</span>
              {isLoadingHistory && <Loader2 className="w-3 h-3 animate-spin text-ink-muted" />}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] text-ink-muted uppercase border-b border-border/50">
                  <tr>
                    <th className="py-1 px-2 font-medium">Date</th>
                    <th className="py-1 px-2 font-medium">Entries</th>
                    <th className="py-1 px-2 font-medium">Size</th>
                    <th className="py-1 px-2 font-medium">SHA-256 Manifest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30 text-ink">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-surface/50">
                      <td className="py-1.5 px-2">{new Date(item.createdAt).toLocaleString()}</td>
                      <td className="py-1.5 px-2">{item.entryCount}</td>
                      <td className="py-1.5 px-2">{(item.byteSize / 1024).toFixed(1)} KB</td>
                      <td className="py-1.5 px-2 font-mono text-[11px] text-ink-muted">
                        {item.checksumSha256.slice(0, 16)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 2. Warning-Gated Plaintext / Markdown Export */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <FileText className="w-4 h-4 text-ink-muted stroke-[1.5]" />
          <span>Warning-Gated Plaintext & Markdown Export</span>
        </h2>
        <p className="text-xs text-ink-muted leading-relaxed">
          Decrypt all diary entries in browser RAM and export them to an unencrypted JSON archive
          for external portability or local Markdown reading.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPlaintextError(null);
            setPlaintextConfirmText('');
            setIsPlaintextModalOpen(true);
          }}
          className="text-terracotta border-terracotta/40 hover:bg-terracotta/10"
        >
          Export Decrypted Plaintext
        </Button>
      </div>

      {/* 3. Passphrase Rotation */}
      <div className="p-5 bg-surface border border-border rounded-lg space-y-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Key className="w-4 h-4 text-accent stroke-[1.5]" />
          <span>Rotate Vault Passphrase</span>
        </h2>
        <p className="text-xs text-ink-muted leading-relaxed">
          Zero-reencryption rotation: Changing your Vault Passphrase only re-wraps the master DEK.
          Zero diary entries require re-encryption.
        </p>
        <Button variant="outline" size="sm" onClick={() => setIsRotationOpen(true)}>
          Change Vault Passphrase
        </Button>
      </div>

      {/* 4. Danger Zone */}
      <div className="p-5 bg-surface border border-destructive/20 rounded-lg space-y-4">
        <h2 className="text-sm font-semibold text-destructive flex items-center gap-2">
          <Trash2 className="w-4 h-4 stroke-[1.5]" />
          <span>Delete Account</span>
        </h2>
        <p className="text-xs text-ink-muted leading-relaxed">
          Permanent removal of account identity, encrypted memories, and private files. This action
          cannot be undone.
        </p>
        <Button variant="destructive" size="sm">
          Delete Memoir Account
        </Button>
      </div>

      {/* Passphrase Rotation Modal */}
      <PassphraseRotationModal isOpen={isRotationOpen} onClose={() => setIsRotationOpen(false)} />

      {/* Warning-Gated Plaintext Export Modal */}
      <Dialog
        isOpen={isPlaintextModalOpen}
        onClose={() => setIsPlaintextModalOpen(false)}
        title="Warning: Plaintext Export"
      >
        <div className="space-y-4 pt-2">
          <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Cryptographic Protection Removed</span>
            </div>
            <p className="leading-relaxed">
              Once exported, your diary entries, intimate thoughts, moods, and private tags will be
              stored in unencrypted plaintext on your device. Anyone with access to your computer,
              backups, or cloud sync drives will be able to read them.
            </p>
          </div>

          {isLocked ? (
            <p className="text-xs text-destructive">
              Your vault is currently locked. You must unlock your vault first to allow local
              decryption.
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs text-ink-muted">
                To confirm this risk, type{' '}
                <span className="font-mono font-semibold text-ink">CONFIRM EXPORT</span> below:
              </label>
              <Input
                type="text"
                placeholder="CONFIRM EXPORT"
                value={plaintextConfirmText}
                onChange={(e) => setPlaintextConfirmText(e.target.value)}
              />
            </div>
          )}

          {plaintextError && <p className="text-xs text-destructive">{plaintextError}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => setIsPlaintextModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleExportPlaintext}
              disabled={
                isLocked || plaintextConfirmText !== 'CONFIRM EXPORT' || isExportingPlaintext
              }
              className="flex items-center gap-1.5"
            >
              {isExportingPlaintext && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Acknowledge & Export Plaintext</span>
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
