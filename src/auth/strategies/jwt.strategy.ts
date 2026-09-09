import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: { userId: string; type?: string; sessionId?: string }) {
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException('Требуется access token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });

    if (!user) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    if (payload.sessionId) {
      const session = await this.prisma.userSession.findUnique({ where: { id: payload.sessionId } });
      if (!session || session.revokedAt || session.userId !== user.id)
        throw new UnauthorizedException('Сессия завершена');
      if (Date.now() - session.lastSeenAt.getTime() >= 5 * 60 * 1000) {
        await this.prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
      }
    }

    return { ...user, sessionId: payload.sessionId };
  }
}
