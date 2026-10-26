import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { accessTokenExpiresIn, emailAccessTokenExpiresIn, refreshTokenExpiresIn } from '../constants/jwt.constants';
import type { SessionMetadata } from '../types/auth.types';
import { hashToken, normalizeSessionMetadata } from './auth-token.utils';

@Injectable()
export class AuthTokenService {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  createAccessToken(userId: string, sessionId?: string) {
    return this.jwtService.sign(
      { userId, type: 'access', ...(sessionId ? { sessionId } : {}) },
      { expiresIn: accessTokenExpiresIn },
    );
  }

  createEmailAccessToken(userId: string) {
    return this.jwtService.sign({ userId, type: 'email' }, { expiresIn: emailAccessTokenExpiresIn });
  }

  createRefreshToken(userId: string, sessionId?: string) {
    return this.jwtService.sign(
      { userId, type: 'refresh', jti: randomUUID(), ...(sessionId ? { sessionId } : {}) },
      { expiresIn: refreshTokenExpiresIn },
    );
  }

  hasPersistentStore() {
    return Boolean(this.prisma);
  }

  async createEmailLoginCredential(userId: string) {
    if (!this.prisma) return this.createEmailAccessToken(userId);

    const code = randomBytes(32).toString('base64url');
    await this.prisma.authExchange.create({
      data: {
        userId,
        codeHash: hashToken(code),
        purpose: 'email_login',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return code;
  }

  async consumeEmailLoginCode(code: string) {
    if (!this.prisma) throw new UnauthorizedException('Недействительный код входа');

    const now = new Date();
    const codeHash = hashToken(code);
    const exchange = await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.authExchange.updateMany({
        where: {
          codeHash,
          purpose: 'email_login',
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Код входа недействителен или уже использован');

      return transaction.authExchange.findUnique({ where: { codeHash } });
    });

    if (!exchange) throw new UnauthorizedException('Недействительный код входа');
    return exchange.userId;
  }

  createAuthTokens(userId: string) {
    return {
      userId,
      accessToken: this.createAccessToken(userId),
      refreshToken: this.createRefreshToken(userId),
    };
  }

  verifyAccessToken(accessToken: string) {
    return this.jwtService.verify<{ userId?: string }>(accessToken);
  }

  async createSessionTokens(userId: string, metadata: SessionMetadata = {}) {
    if (!this.prisma) return this.createAuthTokens(userId);
    const sessionId = randomUUID();
    const refreshToken = this.createRefreshToken(userId, sessionId);
    const normalizedMetadata = normalizeSessionMetadata(metadata);
    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId,
        refreshHash: hashToken(refreshToken),
        deviceId: normalizedMetadata.deviceId,
        deviceName: normalizedMetadata.deviceName,
        platform: normalizedMetadata.platform,
        deviceModel: normalizedMetadata.model,
        manufacturer: normalizedMetadata.manufacturer,
        osName: normalizedMetadata.osName,
        osVersion: normalizedMetadata.osVersion,
        deviceType: normalizedMetadata.deviceType,
        appVersion: normalizedMetadata.appVersion,
        appBuild: normalizedMetadata.appBuild,
        userAgent: normalizedMetadata.userAgent,
        ipAddress: normalizedMetadata.ipAddress,
      },
    });
    return { userId, accessToken: this.createAccessToken(userId, sessionId), refreshToken };
  }

  async revokeSession(userId: string, sessionId: string) {
    if (!this.prisma) return;

    await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async refreshAccessToken(refreshToken: string, metadata: SessionMetadata = {}) {
    try {
      const tokenInfo = this.jwtService.verify<{ userId?: string; type?: string; sessionId?: string }>(refreshToken);
      if (!tokenInfo.userId) throw new UnauthorizedException('Информация о пользователе не была найдена');
      if (tokenInfo.type && tokenInfo.type !== 'refresh') {
        throw new UnauthorizedException('Недействительный refresh token');
      }
      if (!tokenInfo.sessionId || !this.prisma) return { accessToken: this.createAccessToken(tokenInfo.userId) };
      const session = await this.prisma.userSession.findUnique({ where: { id: tokenInfo.sessionId } });
      if (!session || session.revokedAt || session.refreshHash !== hashToken(refreshToken))
        throw new UnauthorizedException('Сессия завершена');
      const nextRefreshToken = this.createRefreshToken(tokenInfo.userId, session.id);
      const normalizedMetadata = normalizeSessionMetadata({
        model: metadata.model ?? session.deviceModel ?? undefined,
        manufacturer: metadata.manufacturer ?? session.manufacturer ?? undefined,
        osName: metadata.osName ?? session.osName ?? undefined,
        osVersion: metadata.osVersion ?? session.osVersion ?? undefined,
        deviceType: metadata.deviceType ?? session.deviceType ?? undefined,
        appVersion: metadata.appVersion ?? session.appVersion ?? undefined,
        appBuild: metadata.appBuild ?? session.appBuild ?? undefined,
        userAgent: metadata.userAgent ?? session.userAgent ?? undefined,
        ipAddress: metadata.ipAddress ?? session.ipAddress ?? undefined,
      });
      const updated = await this.prisma.userSession.updateMany({
        where: {
          id: session.id,
          userId: tokenInfo.userId,
          refreshHash: hashToken(refreshToken),
          revokedAt: null,
        },
        data: {
          refreshHash: hashToken(nextRefreshToken),
          lastSeenAt: new Date(),
          ipAddress: normalizedMetadata.ipAddress,
          userAgent: normalizedMetadata.userAgent,
          deviceModel: normalizedMetadata.model,
          manufacturer: normalizedMetadata.manufacturer,
          osName: normalizedMetadata.osName,
          osVersion: normalizedMetadata.osVersion,
          deviceType: normalizedMetadata.deviceType,
          appVersion: normalizedMetadata.appVersion,
          appBuild: normalizedMetadata.appBuild,
        },
      });
      if (updated.count !== 1) throw new UnauthorizedException('Сессия завершена');
      return { accessToken: this.createAccessToken(tokenInfo.userId, session.id), refreshToken: nextRefreshToken };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Недействительный refresh token');
    }
  }
}
