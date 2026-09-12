import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { getAppEnvironment } from 'src/common/config/environment';
import { LoadTestSeedRequestDto } from './load-test.dto';
import { LoadTestSeedService } from './load-test.service';

@ApiExcludeController()
@Controller('load-test')
export class LoadTestController {
  constructor(private readonly service: LoadTestSeedService) {}

  @Post('seed')
  async enqueue(@Headers('x-load-test-token') token: string | undefined, @Body() input: LoadTestSeedRequestDto) {
    this.assertAccess(token);
    return await this.service.enqueue(input);
  }

  @Get('seed/:runId')
  async getJob(@Headers('x-load-test-token') token: string | undefined, @Param('runId') runId: string) {
    this.assertAccess(token);
    return await this.service.getJob(runId);
  }

  @Delete('seed/:runId')
  async deleteJob(@Headers('x-load-test-token') token: string | undefined, @Param('runId') runId: string) {
    this.assertAccess(token);
    return await this.service.remove(runId);
  }

  private assertAccess(token: string | undefined) {
    if (getAppEnvironment() === 'production') throw new NotFoundException();
    const expectedToken = process.env.LOAD_TEST_SEED_TOKEN?.trim();
    if (!expectedToken) throw new ForbiddenException('Load-test seed не настроен');
    if (!token) throw new UnauthorizedException('Требуется load-test token');
    if (token !== expectedToken) throw new UnauthorizedException('Некорректный load-test token');
  }
}
