import React, { createContext, useContext, useEffect, useState } from 'react';
import type { LoginDto, RegisterDto } from '@memoir/shared';
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
  login: (credentials: LoginDto) => Promise<{ mfaRequired?: boolean; mfaToken?: string }>;
  verify2Fa: (data: { mfaToken?: string; code: string }) => Promise<void>;
  register: (credentials: RegisterDto) => Promise<{ message: string }>;
  verifyEmail: (token: string) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        login,
        verify2Fa,
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
