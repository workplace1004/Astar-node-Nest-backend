import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../users/users.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'astar-dev-secret-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule implements OnModuleInit {
  constructor(private usersService: UsersService) {}

  async onModuleInit() {
    try {
      await this.usersService.create({
        email: 'admin@gmail.com',
        name: 'Admin',
        password: '123123',
        role: 'admin',
        subscriptionStatus: 'inactive',
      });
    } catch {
      // Admin already exists
    }
  }
}
