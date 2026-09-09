import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { EmailService } from 'src/email/email.service';
import { getEmailDeliveryReason } from './auth-email.utils';

@Injectable()
export class AuthEmailService {
  private readonly logger = new Logger(AuthEmailService.name);

  constructor(@Inject(EmailService) private readonly emailService: EmailService) {}

  async sendConfirmationCode(email: string, code: number, accessToken: string) {
    try {
      await this.emailService.sendConfirmationCode(email, code, accessToken);
    } catch (error) {
      this.logger.error(`Не удалось отправить письмо с кодом подтверждения на ${email}`, error);
      throw new ServiceUnavailableException(`Не удалось отправить письмо. Причина: ${getEmailDeliveryReason(error)}`);
    }
  }

  async sendLoginLink(email: string, accessToken: string) {
    try {
      await this.emailService.sendLoginLink(email, accessToken);
    } catch (error) {
      this.logger.error(`Не удалось отправить ссылку для входа на ${email}`, error);
      throw new ServiceUnavailableException(`Не удалось отправить письмо. Причина: ${getEmailDeliveryReason(error)}`);
    }
  }

  async sendPasswordChangeCode(email: string, code: number) {
    try {
      await this.emailService.sendPasswordChangeCode(email, code);
    } catch (error) {
      this.logger.error(`Не удалось отправить код смены пароля на ${email}`, error);
      throw new ServiceUnavailableException(`Не удалось отправить письмо. Причина: ${getEmailDeliveryReason(error)}`);
    }
  }
}
