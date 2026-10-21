import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { getJwtSecret } from 'src/common/config/environment';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private static readonly LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly pendingLastSeenUpdates = new Set<string>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: { userId: string; type?: string; sessionId?: string }) {
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException('Требуется access token');
    }

    if (payload.sessionId) {
      const session = await this.prisma.userSession.findUnique({
        where: { id: payload.sessionId },
        select: { userId: true, revokedAt: true, lastSeenAt: true },
      });
      if (!session || session.revokedAt || session.userId !== payload.userId)
        throw new UnauthorizedException('Сессия завершена');

      if (Date.now() - session.lastSeenAt.getTime() >= JwtStrategy.LAST_SEEN_UPDATE_INTERVAL_MS) {
        this.scheduleLastSeenUpdate(payload.sessionId, payload.userId);
      }

      return { id: session.userId, sessionId: payload.sessionId };
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
    if (!user) throw new UnauthorizedException('Требуется авторизация');

    return { ...user, sessionId: payload.sessionId };
  }

  private scheduleLastSeenUpdate(sessionId: string, userId: string) {
    if (this.pendingLastSeenUpdates.has(sessionId)) return;
    this.pendingLastSeenUpdates.add(sessionId);

    const staleBefore = new Date(Date.now() - JwtStrategy.LAST_SEEN_UPDATE_INTERVAL_MS);
    const lastSeenAt = new Date();
    void this.prisma.userSession
      .updateMany({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          lastSeenAt: { lt: staleBefore },
        },
        data: { lastSeenAt },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Не удалось обновить lastSeenAt сессии ${sessionId}`,
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        this.pendingLastSeenUpdates.delete(sessionId);
      });
  }
}
