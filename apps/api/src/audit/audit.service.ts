import { Injectable, NotFoundException } from '@nestjs/common';
import { SecurityEventType } from '@prisma/client';
import type { SecurityPostureCheck, SecurityPostureResponse } from '@memoir/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QueryAuditEventsDto } from './dto/query-audit-events.dto.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves paginated security events for the authenticated user with optional eventType filtering.
   */
  async getEvents(
    userId: string,
    query: QueryAuditEventsDto,
  ): Promise<{
    events: Array<{
      id: string;
      eventType: string;
      safeMetadata: Record<string, unknown>;
      createdAt: string;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const whereClause: { userId: string; eventType?: SecurityEventType } = {
      userId,
      ...(query.eventType ? { eventType: query.eventType } : {}),
    };

    const [events, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.securityEvent.count({
        where: whereClause,
      }),
    ]);

    return {
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        safeMetadata: (e.safeMetadata as Record<string, unknown>) || {},
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      limit: query.limit || 50,
      offset: query.offset || 0,
    };
  }

  /**
   * Evaluates the authenticated user's current security posture, active protections, and recent threats.
   */
  async getPosture(userId: string): Promise<SecurityPostureResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        vault: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User account not found.');
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [passkeyCount, activeSessionCount, recentSuspiciousLogins] = await Promise.all([
      this.prisma.webAuthnCredential.count({
        where: { userId },
      }),
      this.prisma.session.count({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
      this.prisma.securityEvent.count({
        where: {
          userId,
          eventType: SecurityEventType.SUSPICIOUS_LOGIN,
          createdAt: { gt: thirtyDaysAgo },
        },
      }),
    ]);

    const emailVerified = !!user.emailVerifiedAt;
    const vaultConfigured = !!user.vault;
    const totpEnabled = user.totpEnabled;

    const checks: SecurityPostureCheck[] = [
      {
        id: 'email_verification',
        label: 'Email Verification',
        passed: emailVerified,
        description: emailVerified
          ? 'Account email address is verified.'
          : 'Email verification is required for account recovery notifications.',
      },
      {
        id: 'zero_knowledge_vault',
        label: 'Zero-Knowledge Vault',
        passed: vaultConfigured,
        description: vaultConfigured
          ? 'End-to-end encrypted vault is initialized with client-derived keys.'
          : 'Vault has not been set up yet.',
      },
      {
        id: 'two_factor_auth',
        label: 'Two-Factor Authentication (TOTP)',
        passed: totpEnabled,
        description: totpEnabled
          ? 'RFC 6238 TOTP authenticator is active with encrypted backup codes.'
          : 'Protect your account password with a second authentication factor.',
      },
      {
        id: 'webauthn_passkeys',
        label: 'FIDO2 / WebAuthn Passkeys',
        passed: passkeyCount > 0,
        description:
          passkeyCount > 0
            ? `${passkeyCount} biometric passkey(s) or hardware key(s) registered.`
            : 'Enroll biometric or hardware passkeys for phishing-resistant sign-in.',
      },
      {
        id: 'session_hygiene',
        label: 'Device & Session Hygiene',
        passed: activeSessionCount <= 5,
        description: `${activeSessionCount} active device session(s) authorized.`,
      },
      {
        id: 'threat_detection',
        label: 'Suspicious Activity Monitoring',
        passed: recentSuspiciousLogins === 0,
        description:
          recentSuspiciousLogins === 0
            ? 'No suspicious logins detected in the last 30 days.'
            : `${recentSuspiciousLogins} suspicious login alert(s) in the last 30 days. Review active sessions.`,
      },
    ];

    let overallScore: 'strong' | 'good' | 'action_needed';
    if (
      vaultConfigured &&
      emailVerified &&
      (totpEnabled || passkeyCount > 0) &&
      recentSuspiciousLogins === 0
    ) {
      overallScore = 'strong';
    } else if (vaultConfigured && emailVerified) {
      overallScore = 'good';
    } else {
      overallScore = 'action_needed';
    }

    return {
      emailVerified,
      vaultConfigured,
      totpEnabled,
      passkeyCount,
      activeSessionCount,
      recentSuspiciousLogins,
      overallScore,
      checks,
    };
  }
}
