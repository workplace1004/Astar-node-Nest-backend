import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PortalService } from './portal.service';

@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private portalService: PortalService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: { id: string }) {
    return this.portalService.getProfile(user.id);
  }

  @Get('reports')
  async getReports(@CurrentUser() user: { id: string }) {
    return this.portalService.getReports(user.id);
  }

  @Get('reports/:type')
  async getReportByType(@CurrentUser() user: { id: string }, @Param('type') type: string) {
    return this.portalService.getReportByType(user.id, type);
  }

  @Get('messages')
  async getMessages(@CurrentUser() user: { id: string }) {
    return this.portalService.getMessages(user.id);
  }

  @Get('notifications')
  async getNotifications(@CurrentUser() user: { id: string }) {
    return this.portalService.getNotifications(user.id);
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.portalService.markNotificationRead(user.id, id);
  }
}
