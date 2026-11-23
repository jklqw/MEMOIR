import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useVaultStore } from '../../stores/vaultStore.js';

export function VaultIdleWatcher() {
  const { isUnlocked, resetActivityTimer, lock, fetchVault } = useVaultStore();
  const { isAuthenticated } = useAuth();

  // Fetch vault metadata whenever authenticated, lock if signed out
  useEffect(() => {
    if (isAuthenticated) {
      void fetchVault();
    } else {
      lock();
    }
  }, [isAuthenticated, fetchVault, lock]);

  // Setup idle activity listeners when vault is unlocked
  useEffect(() => {
    if (!isUnlocked) return;

    const handleActivity = () => {
      resetActivityTimer();
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [isUnlocked, resetActivityTimer]);

  return null;
}
