import React, { createContext, useContext, useEffect, useState } from 'react';
import type { LoginDto, RegisterDto } from '@memoir/shared';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api } from '../lib/api.js';

export interface AuthUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  accountStatus: string;
  totpEnabled?: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPasskeySupported: boolean;
  login: (credentials: LoginDto) => Promise<{ mfaRequired?: boolean; mfaToken?: string }>;
  loginWithPasskey: (email?: string) => Promise<void>;
  verify2Fa: (data: { mfaToken?: string; code: string }) => Promise<void>;
  registerPasskey: (deviceName?: string) => Promise<{ message: string }>;
  register: (credentials: RegisterDto) => Promise<{ message: string }>;
  verifyEmail: (token: string) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);

  useEffect(() => {
    setIsPasskeySupported(browserSupportsWebAuthn());
  }, []);

  const refreshUser = async () => {
    try {
      const profile = await api.get<AuthUser>('/api/v1/auth/me');
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  const login = async (
    credentials: LoginDto,
  ): Promise<{ mfaRequired?: boolean; mfaToken?: string }> => {
    setIsLoading(true);
    try {
      const res = await api.post<{
        user?: { id: string; email: string };
        mfaRequired?: boolean;
        mfaToken?: string;
      }>('/api/v1/auth/login', credentials);

      if (res.mfaRequired && res.mfaToken) {
        return { mfaRequired: true, mfaToken: res.mfaToken };
      }
      await refreshUser();
      return {};
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithPasskey = async (email?: string): Promise<void> => {
    setIsLoading(true);
    try {
      const options = await api.post<PublicKeyCredentialRequestOptionsJSON>(
        '/api/v1/auth/passkeys/login/options',
        { email },
      );
      const assertion = await startAuthentication({ optionsJSON: options });
      await api.post('/api/v1/auth/passkeys/login/verify', {
        response: assertion,
        challenge: options.challenge,
      });
      await refreshUser();
    } finally {
      setIsLoading(false);
    }
  };

  const registerPasskey = async (deviceName?: string): Promise<{ message: string }> => {
    const options = await api.post<PublicKeyCredentialCreationOptionsJSON>(
      '/api/v1/auth/passkeys/register/options',
    );
    const attestation = await startRegistration({ optionsJSON: options });
    return api.post<{ message: string }>('/api/v1/auth/passkeys/register/verify', {
      response: attestation,
      deviceName,
    });
  };

  const verify2Fa = async (data: { mfaToken?: string; code: string }): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post('/api/v1/auth/2fa/verify', data);
      await refreshUser();
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (credentials: RegisterDto): Promise<{ message: string }> => {
    return api.post<{ message: string }>('/api/v1/auth/register', credentials);
  };

  const verifyEmail = async (token: string): Promise<{ message: string }> => {
    return api.post<{ message: string }>('/api/v1/auth/verify-email', { token });
  };

  const logout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isPasskeySupported,
        login,
        loginWithPasskey,
        verify2Fa,
        registerPasskey,
        register,
        verifyEmail,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
