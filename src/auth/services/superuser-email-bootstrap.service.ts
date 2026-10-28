import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { normalizeEmail } from '../utils/russian-email';
import { getSuperuserEmails, SUPERUSER_AUDIT_ACTOR } from '../utils/superuser-email-allowlist';

@Injectable()
export class SuperuserEmailBootstrapService {
  private readonly allowedEmails = getSuperuserEmails(process.env.SUPERUSER_EMAILS);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async grantIfAllowlisted(userId: string, email?: string) {
    if (!this.allowedEmails.size) return;

    const suppliedEmail = email ? normalizeEmail(email) : undefined;
    if (suppliedEmail && !this.allowedEmails.has(suppliedEmail)) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailConfirmedAt: true, deletedAt: true },
    });
    if (!user?.emailConfirmedAt || user.deletedAt) return;

    const targetEmail = normalizeEmail(user.email);
    if (!this.allowedEmails.has(targetEmail) || (suppliedEmail && suppliedEmail !== targetEmail)) return;

    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: {
          id: userId,
          email: user.email,
          emailConfirmedAt: { not: null },
          deletedAt: null,
          OR: [{ isSuperAdmin: false }, { isSuperAdmin: null }],
        },
        data: { isSuperAdmin: true },
      });
      if (!updated.count) return;

      await transaction.adminAccessAudit.create({
        data: {
          actorUserId: null,
          targetUserId: userId,
          actorEmail: SUPERUSER_AUDIT_ACTOR,
          targetEmail: user.email,
          role: 'superuser',
          action: 'granted',
        },
      });
    });
  }
}
