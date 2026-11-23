import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { type RegisterDto, RegisterSchema } from '@memoir/shared';
import { AlertCircle, KeyRound, Mail, ShieldAlert } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { useAuth } from '../context/AuthContext.js';

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterDto>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: RegisterDto) => {
    setServerError(null);
    try {
      await registerAccount(data);
      setSubmittedEmail(data.email);
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred during account creation.');
      }
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-paper flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-surface py-8 px-6 sm:px-10 border border-border rounded-lg shadow-xs text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full border border-border bg-paper flex items-center justify-center text-ink">
              <Mail className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <h1 className="font-serif text-2xl font-normal text-ink">Check Your Inbox</h1>
            <p className="text-xs text-ink-muted leading-relaxed">
              If <span className="font-medium text-ink">{submittedEmail}</span> is eligible, a
              confirmation link has been sent. Please open the link to verify your email address.
            </p>
            <div className="p-3 rounded-md bg-paper border border-border text-[11px] text-ink-muted text-left">
              <strong>What happens next?</strong> After verifying your email, you will choose a
              separate <strong>Vault Passphrase</strong> and generate an emergency printable{' '}
              <strong>Recovery Kit</strong>. Zero unencrypted diary data will ever leave your
              browser.
            </div>
            <div className="pt-2">
              <Link to="/login">
                <Button variant="primary" size="md" className="w-full justify-center">
                  Proceed to Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-surface">
            <KeyRound className="w-5 h-5 text-ink" strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="font-serif text-3xl font-normal text-center text-ink tracking-tight">
          Create Your Private Archive
        </h1>
        <p className="mt-2 text-center text-xs text-ink-muted">
          Your personal diary protected by end-to-end zero-knowledge cryptography.
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
                Account Password (Server Authentication)
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Minimum 10 characters"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
              {errors.password && (
                <p id="password-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.password.message}
                </p>
              )}
              <p className="mt-1 text-[11px] text-ink-muted">
                Must be at least 10 characters long. Hashed server-side with Argon2id.
              </p>
            </div>

            <div className="p-3 rounded-md bg-paper border border-border text-[11px] leading-relaxed text-ink-muted flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" strokeWidth={1.5} />
              <span>
                <strong>Zero-Knowledge Assurance:</strong> This password only authenticates your
                account identity with the server. Your diary vault encryption key will be created
                locally on your device in the next step.
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
                {isSubmitting ? 'Creating Account...' : 'Create Account'}
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-xs text-ink-muted">
              Already have an archive?{' '}
              <Link to="/login" className="font-medium text-ink hover:underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
