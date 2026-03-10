import { Body, Controller, Get, Param, Patch, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { UsersService } from '../users/users.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private usersService: UsersService) {}

  @Get('users')
  async listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
    });
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      subscriptionStatus: user.subscriptionStatus,
      birthDate: user.birthDate,
      birthPlace: user.birthPlace,
      birthTime: user.birthTime,
      createdAt: user.createdAt.toISOString(),
    };
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; subscriptionStatus?: 'active' | 'inactive' | 'cancelled' },
  ) {
    if (typeof body.isActive === 'boolean') {
      return this.usersService.updateActive(id, body.isActive);
    }
    if (body.subscriptionStatus) {
      return this.usersService.updateSubscription(id, body.subscriptionStatus);
    }
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return this.usersService.toPublic(user);
  }

  @Get('stats')
  async getStats() {
    return this.usersService.getStats();
  }
}
