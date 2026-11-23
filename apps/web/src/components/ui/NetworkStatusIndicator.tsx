import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from './Button.js';

export function NetworkStatusIndicator() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = async () => {
    setIsChecking(true);
    try {
      // Ping health check or test navigator
      const res = await fetch('/api/v1/health', { method: 'GET', credentials: 'omit' });
      if (res.ok) {
        setIsOnline(true);
      }
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  if (isOnline) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full bg-ochre-subtle border-b border-ochre/30 px-4 py-2 text-ochre flex items-center justify-between text-xs animate-in slide-in-from-top-2 duration-150"
    >
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 stroke-[1.5] shrink-0" aria-hidden="true" />
        <span className="font-medium">
          Offline Mode · Your entries and actions remain protected in local memory.
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRetry}
        disabled={isChecking}
        className="h-7 text-xs text-ochre hover:bg-ochre/10 gap-1.5"
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
