import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.js';
import { Button } from './components/ui/Button.js';
import { CalendarPage } from './pages/CalendarPage.js';
import { InsightsPage } from './pages/InsightsPage.js';
import { JournalPage } from './pages/JournalPage.js';
import { LandingPage } from './pages/LandingPage.js';
import { SecurityPage } from './pages/SecurityPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { TimelinePage } from './pages/TimelinePage.js';
import { VaultPage } from './pages/VaultPage.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function NotFoundPage() {
  return (
    <div className="py-16 text-center space-y-4">
      <h1 className="font-serif text-3xl font-semibold text-ink">404 — Page Not Found</h1>
      <p className="text-xs text-ink-muted">
        The memory or page you were looking for does not exist in this archive.
      </p>
      <Link to="/journal">
        <Button variant="secondary" size="sm">
          Return to Journal
        </Button>
      </Link>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/journal"
            element={
              <AppShell>
                <JournalPage />
              </AppShell>
            }
          />
          <Route
            path="/timeline"
            element={
              <AppShell>
                <TimelinePage />
              </AppShell>
            }
          />
          <Route
            path="/calendar"
            element={
              <AppShell>
                <CalendarPage />
              </AppShell>
            }
          />
          <Route
            path="/capsules"
            element={
              <AppShell>
                <TimelinePage />
              </AppShell>
            }
          />
          <Route
            path="/vault"
            element={
              <AppShell>
                <VaultPage />
              </AppShell>
            }
          />
          <Route
            path="/insights"
            element={
              <AppShell>
                <InsightsPage />
              </AppShell>
            }
          />
          <Route
            path="/security"
            element={
              <AppShell>
                <SecurityPage />
              </AppShell>
            }
          />
          <Route
            path="/settings"
            element={
              <AppShell>
                <SettingsPage />
              </AppShell>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
