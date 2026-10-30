import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/infrastructure/database/prisma/prisma.module';
import { ModerationModule } from 'src/moderation/moderation.module';
import { StorageModule } from 'src/storage/storage.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [PrismaModule, ModerationModule, StorageModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
