import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { accessTokenExpiresIn, emailAccessTokenExpiresIn, refreshTokenExpiresIn } from './jwt.constants';

@Injectable()
export class AuthTokenService {
  constructor(private readonly jwtService: JwtService) {}

  createAccessToken(userId: string) {
    return this.jwtService.sign({ userId }, { expiresIn: accessTokenExpiresIn });
  }

  createEmailAccessToken(userId: string) {
    return this.jwtService.sign({ userId }, { expiresIn: emailAccessTokenExpiresIn });
  }

  createRefreshToken(userId: string) {
    return this.jwtService.sign({ userId }, { expiresIn: refreshTokenExpiresIn });
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

  refreshAccessToken(refreshToken: string) {
    try {
      const tokenInfo = this.jwtService.verify<{ userId?: string }>(refreshToken);
      if (typeof tokenInfo?.userId !== 'string' || !tokenInfo.userId) {
        throw new UnauthorizedException('Информация о пользователе не была найдена');
      }
      return { accessToken: this.createAccessToken(tokenInfo.userId) };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Недействительный refresh token');
    }
  }
}
