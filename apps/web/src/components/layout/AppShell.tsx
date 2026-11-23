import React, { useState } from 'react';
import {
  Archive,
  BarChart3,
  BookOpen,
  Calendar,
  Clock,
  FolderLock,
  Lock,
  LogOut,
  Settings,
  Shield,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils.js';
import { Header } from './Header.js';

export interface AppShellProps {
  children: React.ReactNode;
  isVaultUnlocked?: boolean;
  onLockVault?: () => void;
  onLogout?: () => void;
}

export function AppShell({
  children,
  isVaultUnlocked = false,
  onLockVault,
  onLogout,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const navigation = [
    { name: 'Journal', href: '/journal', icon: BookOpen },
    { name: 'Timeline', href: '/timeline', icon: Archive },
    { name: 'Calendar', href: '/calendar', icon: Calendar },
    { name: 'Time Capsules', href: '/capsules', icon: Clock },
    { name: 'Private Vault', href: '/vault', icon: FolderLock },
    { name: 'Insights', href: '/insights', icon: BarChart3 },
    { name: 'Security', href: '/security', icon: Shield },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      <Header
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        isVaultUnlocked={isVaultUnlocked}
        statusText={
          isVaultUnlocked
            ? 'Vault Unlocked · Encrypted locally'
            : 'Vault Locked · End-to-End Encrypted'
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden animate-in fade-in duration-150"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed md:static inset-y-0 left-0 z-40 w-60 bg-surface border-r border-border flex flex-col justify-between transition-transform duration-150 ease-out md:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="p-4 space-y-6">
            <Link
              to="/journal"
              className="flex items-center gap-2.5 px-2 py-1 text-ink focus-visible:outline-hidden"
            >
              <div className="w-7 h-7 rounded bg-accent flex items-center justify-center text-accent-ink font-serif font-bold text-base shadow-xs">
                M
              </div>
              <div>
                <span className="font-serif font-semibold tracking-wide text-sm block leading-none">
                  Memoir
                </span>
                <span className="text-[10px] text-ink-subtle font-mono tracking-tighter block mt-0.5">
                  v1.0 Zero-Knowledge
                </span>
              </div>
            </Link>

            <nav className="space-y-1" aria-label="Main Navigation">
              {navigation.map((item) => {
                const isActive = location.pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all duration-150 ease-out',
                      isActive
                        ? 'bg-accent/10 text-accent font-semibold border-l-2 border-accent'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-hover',
                    )}
                  >
                    <Icon className="w-4 h-4 stroke-[1.5]" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="p-3 border-t border-border space-y-1">
            {isVaultUnlocked && onLockVault && (
              <button
                type="button"
                onClick={onLockVault}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium text-ink-muted hover:text-destructive hover:bg-destructive-subtle transition-colors duration-150 cursor-pointer"
              >
                <Lock className="w-4 h-4 stroke-[1.5]" />
                <span>Lock Vault</span>
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium text-ink-subtle hover:text-ink hover:bg-surface-hover transition-colors duration-150 cursor-pointer"
              >
                <LogOut className="w-4 h-4 stroke-[1.5]" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[68ch] mx-auto px-6 py-8 md:py-12">{children}</div>
        </main>
      </div>
    </div>
  );
}
