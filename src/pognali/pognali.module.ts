import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-prisma';
import { PognaliController } from './pognali.controller';
import { PognaliService } from './pognali.service';

@Module({
  imports: [PrismaModule],
  controllers: [PognaliController],
  providers: [PognaliService],
})
export class PognaliModule {}
