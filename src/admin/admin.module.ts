import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule, PrismaModule],
  controllers: [AdminController],
})
export class AdminModule {}
