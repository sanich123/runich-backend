import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { AccountService } from 'src/account/account.service';
import { ActivityService } from 'src/activity/activity.service';
import { EmailDTO } from './email.dto';
import { sendEmail } from 'src/utils/email/nodemailer';

@Injectable()
export class EmailService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly accountService: AccountService,
    private readonly activityService: ActivityService,
  ) {}

  async sendLikeEmailNotification({ profilePhoto, name, surname, activityId }: EmailDTO) {
    const {
      profile: { emailNotifications, name: whosActivityName, surname: whosActivitySurname },
      email,
      mapPhotoUrl,
    } = await this.activityService.getActivityWithEmailData(activityId);
    if (emailNotifications && profilePhoto) {
      const subject = 'Лайк к вашей активности';
      const html = `<p>Уважаемый ${whosActivityName} ${whosActivitySurname}!</p>
        <img src="${profilePhoto}" width="100" height="100" style="object-fit: contain"/>
        <p>${name} ${surname} только что лайкнул вашу активность!</p>
        ${mapPhotoUrl ? `<img src="${mapPhotoUrl}" width="99%"/>` : ''}`;
      await sendEmail(email, subject, html);
    }
    return { message: "User doesn't allow notifications or doesn't have any profile" };
  }
}
