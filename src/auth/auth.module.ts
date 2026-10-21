import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailModule } from 'src/email/email.module';
import { AuthTokenService } from './services/auth-token.service';
import { YandexAuthService } from './services/yandex-auth.service';
import { AuthEmailService } from './services/auth-email.service';
import { VkAuthService } from './services/vk-auth.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { accessTokenExpiresIn } from './constants/jwt.constants';
import { StorageModule } from 'src/storage/storage.module';
import { getJwtSecret } from 'src/common/config/environment';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: accessTokenExpiresIn },
    }),
    StorageModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthEmailService,
    YandexAuthService,
    VkAuthService,
    JwtStrategy,
    ThrottlerGuard,
  ],
})
export class AuthModule {}
