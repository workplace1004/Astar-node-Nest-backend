import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
