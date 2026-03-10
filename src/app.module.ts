import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { PortalModule } from './portal/portal.module';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, AdminModule, PortalModule],
})
export class AppModule {}
