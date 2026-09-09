import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailService } from 'src/email/email.service';
import { AuthTokenService } from './services/auth-token.service';
import { YandexAuthService } from './services/yandex-auth.service';
import { AuthEmailService } from './services/auth-email.service';
import { VkAuthService } from './services/vk-auth.service';
import { EmailNotificationService } from 'src/email/email-notification.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { accessTokenExpiresIn } from './constants/jwt.constants';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: { expiresIn: accessTokenExpiresIn },
    }),
    StorageModule,
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
    EmailNotificationService,
    ThrottlerGuard,
  ],
})
export class AuthModule {}
