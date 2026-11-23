import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginDto, LoginSchema } from '@memoir/shared';
import { AlertCircle, Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { useAuth } from '../context/AuthContext.js';

export function LoginPage() {
  const { login, verify2Fa, loginWithPasskey, isPasskeySupported } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mfaChallenge, setMfaChallenge] = useState<{ token: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);
  const [isPasskeyLoggingIn, setIsPasskeyLoggingIn] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/journal';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginDto) => {
    setServerError(null);
    try {
      const res = await login(data);
      if (res.mfaRequired && res.mfaToken) {
        setMfaChallenge({ token: res.mfaToken });
        return;
      }
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred during sign in.');
      }
    }
  };

  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge || !mfaCode.trim()) return;
    setServerError(null);
    setIsVerifyingMfa(true);
    try {
      await verify2Fa({ mfaToken: mfaChallenge.token, code: mfaCode.trim() });
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Invalid two-factor authentication code.');
      }
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setServerError(null);
    setIsPasskeyLoggingIn(true);
    try {
      await loginWithPasskey();
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Passkey authentication failed.');
      }
    } finally {
      setIsPasskeyLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-surface">
            <Lock className="w-5 h-5 text-ink" strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="font-serif text-3xl font-normal text-center text-ink tracking-tight">
          Welcome to Memoir
        </h1>
        <p className="mt-2 text-center text-xs text-ink-muted">
          Sign in to your private, zero-knowledge personal archive.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 px-6 sm:px-10 border border-border rounded-lg shadow-xs">
          {serverError && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-6 p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-2.5 text-xs text-red-800 dark:text-red-300"
            >
              <AlertCircle
                className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400"
                strokeWidth={1.5}
              />
              <span>{serverError}</span>
            </div>
          )}

          {mfaChallenge ? (
            <form onSubmit={onMfaSubmit} className="space-y-5" noValidate>
              <div className="p-3 rounded-md bg-paper border border-border text-[11px] leading-relaxed text-ink-muted flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-ink shrink-0 mt-0.5" strokeWidth={1.5} />
                <span>
                  Two-factor authentication is active on this account. Enter the 6-digit TOTP code
                  from your authenticator app, or enter an 8-character single-use backup code.
                </span>
              </div>

              <div>
                <label htmlFor="mfaCode" className="block text-xs font-medium text-ink mb-1.5">
                  Authentication Code
                </label>
                <Input
                  id="mfaCode"
                  type="text"
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="123456 or ABCD-1234"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="font-mono text-center tracking-wider text-base"
                />
              </div>

              <div className="space-y-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full justify-center"
                  disabled={isVerifyingMfa || !mfaCode.trim()}
                >
                  {isVerifyingMfa ? 'Verifying Code...' : 'Verify & Sign In'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-xs text-ink-muted"
                  onClick={() => {
                    setMfaChallenge(null);
                    setMfaCode('');
                    setServerError(null);
                  }}
                >
                  Back to Sign In
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-ink mb-1.5">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="archivist@example.com"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  {...register('email')}
                />
                {errors.email && (
                  <p id="email-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-medium text-ink mb-1.5">
                  Account Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                {errors.password && (
                  <p id="password-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="p-3 rounded-md bg-paper border border-border text-[11px] leading-relaxed text-ink-muted flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" strokeWidth={1.5} />
                <span>
                  <strong>Three-Secret Separation:</strong> This password authenticates your server
                  session only. Your diary entries remain sealed until you unlock your local vault
                  with your Vault Passphrase.
                </span>
              </div>

              <div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full justify-center"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Authenticating...' : 'Sign In'}
                </Button>
              </div>

              {isPasskeySupported && (
                <div className="pt-1">
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-surface px-2 text-ink-muted text-[10px]">Or</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    className="w-full justify-center text-xs flex items-center gap-2"
                    disabled={isPasskeyLoggingIn || isSubmitting}
                    onClick={() => void handlePasskeyLogin()}
                  >
                    <Fingerprint className="w-4 h-4 text-accent" strokeWidth={1.5} />
                    {isPasskeyLoggingIn ? 'Authenticating with Passkey...' : 'Sign in with Passkey'}
                  </Button>
                </div>
              )}
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-xs text-ink-muted">
              Do not have an archive yet?{' '}
              <Link
                to="/register"
                className="font-medium text-ink hover:underline underline-offset-4"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
