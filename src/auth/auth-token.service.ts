import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { accessTokenExpiresIn, emailAccessTokenExpiresIn, refreshTokenExpiresIn } from './jwt.constants';

@Injectable()
export class AuthTokenService {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  createAccessToken(userId: string, sessionId?: string) {
    return this.jwtService.sign({ userId, ...(sessionId ? { sessionId } : {}) }, { expiresIn: accessTokenExpiresIn });
  }

  createEmailAccessToken(userId: string) {
    return this.jwtService.sign({ userId }, { expiresIn: emailAccessTokenExpiresIn });
  }

  createRefreshToken(userId: string, sessionId?: string) {
    return this.jwtService.sign({ userId, ...(sessionId ? { sessionId } : {}) }, { expiresIn: refreshTokenExpiresIn });
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
    await this.prisma.userSession.create({
      data: { id: sessionId, user_id: userId, refresh_hash: hashToken(refreshToken), device_id: metadata.deviceId ?? 'unknown', device_name: metadata.deviceName, platform: metadata.platform, device_model: metadata.model, manufacturer: metadata.manufacturer, os_name: metadata.osName, os_version: metadata.osVersion, device_type: metadata.deviceType, app_version: metadata.appVersion, app_build: metadata.appBuild, user_agent: metadata.userAgent, ip_address: metadata.ipAddress },
    });
    return { userId, accessToken: this.createAccessToken(userId, sessionId), refreshToken };
  }

  async refreshAccessToken(refreshToken: string, metadata: SessionMetadata = {}) {
    try {
      const tokenInfo = this.jwtService.verify<{ userId?: string; sessionId?: string }>(refreshToken);
      if (!tokenInfo.userId) throw new UnauthorizedException('Информация о пользователе не была найдена');
      if (!tokenInfo.sessionId || !this.prisma) return { accessToken: this.createAccessToken(tokenInfo.userId) };
      const session = await this.prisma.userSession.findUnique({ where: { id: tokenInfo.sessionId } });
      if (!session || session.revoked_at || session.refresh_hash !== hashToken(refreshToken)) throw new UnauthorizedException('Сессия завершена');
      const nextRefreshToken = this.createRefreshToken(tokenInfo.userId, session.id);
      await this.prisma.userSession.update({ where: { id: session.id }, data: { refresh_hash: hashToken(nextRefreshToken), last_seen_at: new Date(), ip_address: metadata.ipAddress ?? session.ip_address, user_agent: metadata.userAgent ?? session.user_agent, device_model: metadata.model ?? session.device_model, manufacturer: metadata.manufacturer ?? session.manufacturer, os_name: metadata.osName ?? session.os_name, os_version: metadata.osVersion ?? session.os_version, device_type: metadata.deviceType ?? session.device_type, app_version: metadata.appVersion ?? session.app_version, app_build: metadata.appBuild ?? session.app_build } });
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

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
