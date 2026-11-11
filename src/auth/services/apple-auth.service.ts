import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { SessionMetadata } from '../types/auth.types';
import { normalizeEmail } from '../utils/russian-email';
import { isPrismaUniqueConstraintError, verifyAppleIdentityToken } from '../utils/apple-auth.utils';
import { AuthTokenService } from './auth-token.service';
import { SuperuserEmailBootstrapService } from './superuser-email-bootstrap.service';

@Injectable()
export class AppleAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthTokenService) private readonly tokenService: AuthTokenService,
    @Inject(SuperuserEmailBootstrapService)
    private readonly superuserEmailBootstrapService: SuperuserEmailBootstrapService,
  ) {}

  async loginWithIdentityToken(
    identityToken: string,
    nonce: string,
    givenName: string | undefined,
    familyName: string | undefined,
    metadata: SessionMetadata = {},
  ) {
    const identity = await verifyAppleIdentityToken(identityToken, nonce);
    let user = await this.prisma.user.findUnique({ where: { appleSubject: identity.subject } });

    if (!user) {
      if (!identity.email || !identity.emailVerified) {
        throw new UnauthorizedException('Apple не передал подтверждённый email для создания аккаунта');
      }

      const email = normalizeEmail(identity.email);
      user = await this.prisma.user.findUnique({ where: { email } });
      if (user) {
        if (user.appleSubject && user.appleSubject !== identity.subject) {
          throw new ConflictException('Этот email уже связан с другим Apple ID');
        }
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { appleSubject: identity.subject, emailConfirmedAt: user.emailConfirmedAt ?? new Date() },
        });
      } else {
        try {
          user = await this.prisma.user.create({
            data: {
              email,
              authProvider: 'APPLE',
              appleSubject: identity.subject,
              emailConfirmedAt: new Date(),
              createdAt: new Date(),
              profile: {
                create: {
                  name: givenName?.trim() || undefined,
                  surname: familyName?.trim() || undefined,
                  email,
                },
              },
            },
          });
        } catch (error) {
          if (!isPrismaUniqueConstraintError(error)) throw error;
          user = await this.prisma.user.findUnique({ where: { appleSubject: identity.subject } });
          if (!user) throw new ConflictException('Аккаунт с этим Apple ID уже создаётся');
        }
      }
    }

    await this.superuserEmailBootstrapService.grantIfAllowlisted(user.id, user.email);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSignInAt: new Date() } });
    return this.tokenService.createSessionTokens(user.id, metadata);
  }
}
