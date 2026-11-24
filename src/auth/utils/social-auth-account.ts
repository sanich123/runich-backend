import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { SuperuserEmailBootstrapService } from '../services/superuser-email-bootstrap.service';

export type SocialAuthProvider = 'VK' | 'YANDEX';

export type SocialAuthProfile = {
  name?: string;
  surname?: string;
  city?: string;
  profilePhoto?: string;
};

export async function provisionSocialEmailAccount(
  prisma: PrismaService,
  superuserBootstrap: Pick<SuperuserEmailBootstrapService, 'grantIfAllowlisted'>,
  input: { email: string; provider: SocialAuthProvider; profile: SocialAuthProfile },
): Promise<string> {
  const { email, provider, profile } = input;
  const existingUser: { id: string; emailConfirmedAt: Date | null } | null = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailConfirmedAt: true },
  });

  let userId: string;
  if (!existingUser) {
    const createdUser: { id: string; emailConfirmedAt: Date | null } = await prisma.user.create({
      data: {
        email,
        authProvider: provider,
        emailConfirmedAt: new Date(),
        createdAt: new Date(),
        profile: {
          create: {
            name: profile.name,
            surname: profile.surname,
            city: profile.city,
            profilePhoto: profile.profilePhoto,
            email,
          },
        },
      },
    });
    userId = createdUser.id;
  } else {
    userId = existingUser.id;
    if (!existingUser.emailConfirmedAt) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { emailConfirmedAt: new Date() },
      });
    }
  }

  await superuserBootstrap.grantIfAllowlisted(userId, email);
  await prisma.user.update({ where: { id: userId }, data: { lastSignInAt: new Date() } });
  return userId;
}
