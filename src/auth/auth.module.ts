import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { EmailService } from 'src/email/email.service';
import { AuthTokenService } from './auth-token.service';
import { YandexAuthService } from './yandex-auth.service';
import { AuthEmailService } from './auth-email.service';
import { VkAuthService } from './vk-auth.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: { expiresIn: '1y' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthEmailService,
    YandexAuthService,
    VkAuthService,
    JwtStrategy,
    EmailService,
  ],
})
export class AuthModule {}
