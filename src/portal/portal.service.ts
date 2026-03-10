import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    if (user.role !== 'client') throw new ForbiddenException('Portal is for clients only');
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

  async getReports(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || user.role !== 'client') throw new ForbiddenException('Portal is for clients only');
    const reports = await this.prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return reports.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getReportByType(userId: string, type: string) {
    const user = await this.usersService.findById(userId);
    if (!user || user.role !== 'client') throw new ForbiddenException('Portal is for clients only');
    const report = await this.prisma.report.findFirst({
      where: { userId, type },
      orderBy: { createdAt: 'desc' },
    });
    return report
      ? {
          id: report.id,
          type: report.type,
          title: report.title,
          content: report.content,
          createdAt: report.createdAt.toISOString(),
        }
      : null;
  }

  async getMessages(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || user.role !== 'client') throw new ForbiddenException('Portal is for clients only');
    const messages = await this.prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return messages.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      monthLabel: m.monthLabel,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async getNotifications(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || user.role !== 'client') throw new ForbiddenException('Portal is for clients only');
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      category: n.category,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || user.role !== 'client') throw new ForbiddenException('Portal is for clients only');
    const n = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!n) return null;
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
    return { id: n.id, read: true };
  }
}
