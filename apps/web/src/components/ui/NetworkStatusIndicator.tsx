import { useEffect, useState } from 'react';
import { CheckCircle2, CloudUpload, RefreshCw, WifiOff } from 'lucide-react';
import { offlineSyncService, type SyncState } from '../../services/offlineSyncService.js';
import { Button } from './Button.js';

export function NetworkStatusIndicator() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isChecking, setIsChecking] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(offlineSyncService.getState());
  const [showSyncedNotice, setShowSyncedNotice] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      void offlineSyncService.flushQueue();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = offlineSyncService.subscribe((state) => {
      setSyncState(state);
      if (!state.isSyncing && state.pendingCount === 0 && state.lastSyncedAt) {
        setShowSyncedNotice(true);
        const timer = setTimeout(() => setShowSyncedNotice(false), 3000);
        return () => clearTimeout(timer);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const handleRetry = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/v1/health', { method: 'GET', credentials: 'omit' });
      if (res.ok) {
        setIsOnline(true);
        await offlineSyncService.flushQueue();
      }
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  // 1. Offline Mode Banner
  if (!isOnline) {
    return (
      <aside
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 w-full bg-ochre-subtle border-b border-ochre/30 px-4 py-2 text-ochre flex items-center justify-between text-xs animate-in slide-in-from-top-2 duration-150"
      >
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 stroke-[1.5] shrink-0" aria-hidden="true" />
          <span className="font-medium">
            Offline Mode ·{' '}
            {syncState.pendingCount > 0
              ? `${syncState.pendingCount} encrypted change(s) queued for sync`
              : 'Encrypted local cache active (zero plaintext persisted)'}
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetry}
          disabled={isChecking}
          className="h-7 text-xs text-ochre hover:bg-ochre/10 gap-1.5 cursor-pointer"
          aria-label="Retry network connection"
        >
          <RefreshCw
            className={`w-3 h-3 stroke-[1.5] ${isChecking ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{isChecking ? 'Checking...' : 'Retry'}</span>
        </Button>
      </aside>
    );
  }

  // 2. Online Syncing Banner
  if (syncState.isSyncing) {
    return (
      <aside
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 w-full bg-accent-subtle border-b border-accent/20 px-4 py-1.5 text-accent flex items-center justify-center gap-2 text-xs font-mono animate-in fade-in duration-150"
      >
        <CloudUpload className="w-3.5 h-3.5 animate-bounce" aria-hidden="true" />
        <span>Syncing {syncState.pendingCount} encrypted change(s) to server...</span>
      </aside>
    );
  }

  // 3. Briefly show synced confirmation
  if (showSyncedNotice) {
    return (
      <aside
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 w-full bg-accent-subtle/60 border-b border-accent/15 px-4 py-1.5 text-accent flex items-center justify-center gap-2 text-xs font-mono animate-in fade-in duration-150"
      >
        <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" aria-hidden="true" />
        <span>All offline entries successfully synchronized</span>
      </aside>
    );
  }

  return null;
}
