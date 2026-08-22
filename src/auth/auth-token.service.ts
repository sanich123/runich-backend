import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { accessTokenExpiresIn, emailAccessTokenExpiresIn, refreshTokenExpiresIn } from './jwt.constants';

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
        user_id: userId,
        code_hash: hashToken(code),
        purpose: 'email_login',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
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
          code_hash: codeHash,
          purpose: 'email_login',
          consumed_at: null,
          expires_at: { gt: now },
        },
        data: { consumed_at: now },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Код входа недействителен или уже использован');

      return transaction.authExchange.findUnique({ where: { code_hash: codeHash } });
    });

    if (!exchange) throw new UnauthorizedException('Недействительный код входа');
    return exchange.user_id;
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
        user_id: userId,
        refresh_hash: hashToken(refreshToken),
        device_id: normalizedMetadata.deviceId,
        device_name: normalizedMetadata.deviceName,
        platform: normalizedMetadata.platform,
        device_model: normalizedMetadata.model,
        manufacturer: normalizedMetadata.manufacturer,
        os_name: normalizedMetadata.osName,
        os_version: normalizedMetadata.osVersion,
        device_type: normalizedMetadata.deviceType,
        app_version: normalizedMetadata.appVersion,
        app_build: normalizedMetadata.appBuild,
        user_agent: normalizedMetadata.userAgent,
        ip_address: normalizedMetadata.ipAddress,
      },
    });
    return { userId, accessToken: this.createAccessToken(userId, sessionId), refreshToken };
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
      if (!session || session.revoked_at || session.refresh_hash !== hashToken(refreshToken))
        throw new UnauthorizedException('Сессия завершена');
      const nextRefreshToken = this.createRefreshToken(tokenInfo.userId, session.id);
      const normalizedMetadata = normalizeSessionMetadata({
        model: metadata.model ?? session.device_model ?? undefined,
        manufacturer: metadata.manufacturer ?? session.manufacturer ?? undefined,
        osName: metadata.osName ?? session.os_name ?? undefined,
        osVersion: metadata.osVersion ?? session.os_version ?? undefined,
        deviceType: metadata.deviceType ?? session.device_type ?? undefined,
        appVersion: metadata.appVersion ?? session.app_version ?? undefined,
        appBuild: metadata.appBuild ?? session.app_build ?? undefined,
        userAgent: metadata.userAgent ?? session.user_agent ?? undefined,
        ipAddress: metadata.ipAddress ?? session.ip_address ?? undefined,
      });
      const updated = await this.prisma.userSession.updateMany({
        where: {
          id: session.id,
          user_id: tokenInfo.userId,
          refresh_hash: hashToken(refreshToken),
          revoked_at: null,
        },
        data: {
          refresh_hash: hashToken(nextRefreshToken),
          last_seen_at: new Date(),
          ip_address: normalizedMetadata.ipAddress,
          user_agent: normalizedMetadata.userAgent,
          device_model: normalizedMetadata.model,
          manufacturer: normalizedMetadata.manufacturer,
          os_name: normalizedMetadata.osName,
          os_version: normalizedMetadata.osVersion,
          device_type: normalizedMetadata.deviceType,
          app_version: normalizedMetadata.appVersion,
          app_build: normalizedMetadata.appBuild,
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

export interface SessionMetadata {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  model?: string;
  manufacturer?: string;
  osName?: string;
  osVersion?: string;
  deviceType?: string;
  appVersion?: string;
  appBuild?: string;
  userAgent?: string;
  ipAddress?: string;
}

const SESSION_METADATA_LIMITS = {
  deviceId: 128,
  deviceName: 255,
  platform: 64,
  model: 128,
  manufacturer: 128,
  osName: 64,
  osVersion: 64,
  deviceType: 64,
  appVersion: 32,
  appBuild: 32,
  userAgent: 512,
  ipAddress: 128,
} as const;

function normalizeSessionMetadata(metadata: SessionMetadata) {
  return {
    deviceId: truncate(metadata.deviceId ?? 'unknown', SESSION_METADATA_LIMITS.deviceId) ?? 'unknown',
    deviceName: truncate(metadata.deviceName, SESSION_METADATA_LIMITS.deviceName),
    platform: truncate(metadata.platform, SESSION_METADATA_LIMITS.platform),
    model: truncate(metadata.model, SESSION_METADATA_LIMITS.model),
    manufacturer: truncate(metadata.manufacturer, SESSION_METADATA_LIMITS.manufacturer),
    osName: truncate(metadata.osName, SESSION_METADATA_LIMITS.osName),
    osVersion: truncate(metadata.osVersion, SESSION_METADATA_LIMITS.osVersion),
    deviceType: truncate(metadata.deviceType, SESSION_METADATA_LIMITS.deviceType),
    appVersion: truncate(metadata.appVersion, SESSION_METADATA_LIMITS.appVersion),
    appBuild: truncate(metadata.appBuild, SESSION_METADATA_LIMITS.appBuild),
    userAgent: truncate(metadata.userAgent, SESSION_METADATA_LIMITS.userAgent),
    ipAddress: truncate(metadata.ipAddress, SESSION_METADATA_LIMITS.ipAddress),
  };
}

function truncate(value: string | null | undefined, maxLength: number) {
  if (value === null || value === undefined) return value;
  return Array.from(value).slice(0, maxLength).join('');
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
