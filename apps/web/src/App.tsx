import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.js';
import { ProtectedRoute } from './components/layout/ProtectedRoute.js';
import { Button } from './components/ui/Button.js';
import { AuthProvider } from './context/AuthContext.js';
import { CalendarPage } from './pages/CalendarPage.js';
import { InsightsPage } from './pages/InsightsPage.js';
import { JournalPage } from './pages/JournalPage.js';
import { LandingPage } from './pages/LandingPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { SecurityPage } from './pages/SecurityPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { TimelinePage } from './pages/TimelinePage.js';
import { VaultPage } from './pages/VaultPage.js';
import { VerifyEmailPage } from './pages/VerifyEmailPage.js';

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
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* Protected Archival Routes */}
            <Route
              path="/journal"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <JournalPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/timeline"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <TimelinePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <CalendarPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/capsules"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <TimelinePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vault"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <VaultPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insights"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <InsightsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/security"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <SecurityPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
