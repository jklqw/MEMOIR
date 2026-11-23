import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, MailCheck, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { useAuth } from '../context/AuthContext.js';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token');
  const { verifyEmail } = useAuth();

  const [tokenInput, setTokenInput] = useState(tokenFromUrl || '');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const executeVerification = async (tokenToVerify: string) => {
    if (!tokenToVerify.trim()) {
      setErrorMessage('Please provide a valid verification token.');
      setStatus('error');
      return;
    }

    setStatus('verifying');
    setErrorMessage(null);

    try {
      await verifyEmail(tokenToVerify.trim());
      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Verification failed. The token may be expired or invalid.');
      }
    }
  };

  useEffect(() => {
    if (tokenFromUrl) {
      void executeVerification(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-surface">
            <MailCheck className="w-5 h-5 text-ink" strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="font-serif text-3xl font-normal text-center text-ink tracking-tight">
          Email Verification
        </h1>
        <p className="mt-2 text-center text-xs text-ink-muted">
          Confirming your email address activates your account for zero-knowledge vault creation.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 px-6 sm:px-10 border border-border rounded-lg shadow-xs text-center">
          {status === 'verifying' && (
            <div className="space-y-4 py-4">
              <div className="w-6 h-6 border-2 border-border border-t-ink rounded-full animate-spin mx-auto" />
              <p className="font-serif text-sm text-ink">Verifying archival token...</p>
              <p className="text-xs text-ink-muted">
                Checking cryptographically hashed one-time token against the server registry.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <h2 className="font-serif text-xl font-normal text-ink">
                Email Successfully Verified
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Your email address has been confirmed. You may now sign in and set up your
                Zero-Knowledge Vault.
              </p>
              <div className="pt-2">
                <Link to="/login">
                  <Button variant="primary" size="md" className="w-full justify-center">
                    Proceed to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <h2 className="font-serif text-xl font-normal text-ink">Verification Failed</h2>
              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed" role="alert">
                {errorMessage || 'The verification link is invalid or has expired.'}
              </p>
              <div className="pt-2 space-y-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => executeVerification(tokenInput)}
                  className="w-full justify-center"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                  Retry Verification
                </Button>
                <Link to="/login" className="block">
                  <Button variant="ghost" size="sm" className="w-full justify-center">
                    Return to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {status === 'idle' && (
            <div className="space-y-4 text-left">
              <p className="text-xs text-ink-muted">
                If you did not open this page directly from your verification email, paste your
                verification token below:
              </p>
              <div>
                <label htmlFor="token" className="block text-xs font-medium text-ink mb-1.5">
                  Verification Token
                </label>
                <Input
                  id="token"
                  type="text"
                  placeholder="Paste one-time token here"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => executeVerification(tokenInput)}
                className="w-full justify-center"
              >
                Verify Email
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
