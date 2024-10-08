import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { EmailDTO } from './email.dto';

@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('like')
  async sendLikeEmailNotification(@Body() emailDto: EmailDTO) {
    return await this.emailService.sendLikeEmailNotification(emailDto);
  }
}
