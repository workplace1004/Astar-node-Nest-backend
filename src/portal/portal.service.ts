import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';

/** Must match catalog ids exposed in the portal extras UI. */
const KNOWN_EXTRA_SERVICE_IDS = new Set([
  'momento-actual',
  'energia-interna',
  'tomar-decision',
  'movimientos-6m',
  'movimientos-12m',
  'audio-personalizado',
  'carta-vivo',
  'solar-vivo',
  'tres-preguntas',
]);

/** Display titles for extras catalog (keep in sync with portal UI). */
const EXTRA_SERVICE_TITLES: Record<string, string> = {
  'momento-actual': 'Lectura de tu momento actual + preguntas',
  'energia-interna': 'Tu energía interna vs la que estás mostrando',
  'tomar-decision': 'Tomar una decisión',
  'movimientos-6m': 'Tus próximos movimientos — 6 meses',
  'movimientos-12m': 'Tus próximos movimientos — 12 meses',
  'audio-personalizado': 'Audio personalizado de lo que necesites',
  'carta-vivo': 'Lectura en vivo de tu carta astral',
  'solar-vivo': 'Lectura en vivo de tu revolución solar',
  'tres-preguntas': '3 preguntas (respondo integrando todas mis herramientas)',
};

/** Misma cuenta puede usar el portal cliente (admin o cliente). */
function canUseClientPortal(role: string): boolean {
  return role === 'client' || role === 'admin';
}

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private paymentsService: PaymentsService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    if (!canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
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
      birthLat: (user as unknown as { birthLat?: number | null }).birthLat ?? null,
      birthLon: (user as unknown as { birthLon?: number | null }).birthLon ?? null,
      birthTimezone: (user as unknown as { birthTimezone?: string | null }).birthTimezone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async getMyOrders(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    const [orders, row] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { extrasCartServiceIds: true },
      }),
    ]);
    const cartIds = row?.extrasCartServiceIds ?? [];
    const extrasCartItems = cartIds.map((id) => ({
      id,
      title: EXTRA_SERVICE_TITLES[id] ?? id,
    }));
    return {
      orders: orders.map((o) => ({
        id: o.id,
        type: o.type,
        amount: o.amount,
        method: o.method,
        createdAt: o.createdAt.toISOString(),
      })),
      extrasCartItems,
    };
  }

  async getReports(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    await this.paymentsService.syncSubscriptionReportsIfNeeded(userId);
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
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    await this.paymentsService.syncSubscriptionReportsIfNeeded(userId);
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
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    const messages = await this.prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const answerMessagesWithoutQuestion = messages.filter((m) => m.type === 'answer' && !m.questionText);
    let questionTextByContent: Map<string, string> = new Map();
    if (answerMessagesWithoutQuestion.length > 0) {
      const answers = answerMessagesWithoutQuestion.map((m) => m.content);
      const questions = await this.prisma.question.findMany({
        where: { userId, answer: { in: answers } },
        select: { question: true, answer: true },
      });
      questions.forEach((q) => {
        if (q.answer) questionTextByContent.set(q.answer, q.question);
      });
    }

    return messages.map((m) => {
      let questionText = m.questionText ?? null;
      if (m.type === 'answer' && !questionText && m.content) {
        questionText = questionTextByContent.get(m.content) ?? null;
      }
      return {
        id: m.id,
        type: m.type,
        content: m.content,
        questionText,
        monthLabel: m.monthLabel,
        createdAt: m.createdAt.toISOString(),
      };
    });
  }

  async getNotifications(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
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
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
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

  async markAllNotificationsRead(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    await this.prisma.notification.updateMany({
      where: { userId },
      data: { read: true },
    });
    return { ok: true };
  }

  async getMyQuestions(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    const questions = await this.prisma.question.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return questions.map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer ?? null,
      status: q.status,
      createdAt: q.createdAt.toISOString(),
    }));
  }

  private sanitizeExtraServiceIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const out: string[] = [];
    for (const x of ids) {
      if (typeof x !== 'string' || x.length < 1 || x.length > 80) continue;
      if (!KNOWN_EXTRA_SERVICE_IDS.has(x)) continue;
      if (!out.includes(x)) out.push(x);
    }
    return out;
  }

  async getExtrasSelections(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { extrasFavoriteServiceIds: true, extrasCartServiceIds: true },
    });
    return {
      favoriteIds: row?.extrasFavoriteServiceIds ?? [],
      cartServiceIds: row?.extrasCartServiceIds ?? [],
    };
  }

  async setExtrasSelections(userId: string, body: { favoriteIds?: unknown; cartServiceIds?: unknown }) {
    const user = await this.usersService.findById(userId);
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    const favoriteIds = this.sanitizeExtraServiceIds(body.favoriteIds);
    const cartServiceIds = this.sanitizeExtraServiceIds(body.cartServiceIds);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        extrasFavoriteServiceIds: favoriteIds,
        extrasCartServiceIds: cartServiceIds,
      },
    });
    return { favoriteIds, cartServiceIds };
  }

  async createQuestion(userId: string, questionText: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !canUseClientPortal(user.role)) throw new ForbiddenException('Portal is for clients only');
    if (!questionText || questionText.length < 1) {
      throw new ForbiddenException('Question text is required');
    }
    const question = await this.prisma.question.create({
      data: {
        userId,
        question: questionText,
        status: 'new',
      },
    });
    return {
      id: question.id,
      question: question.question,
      status: question.status,
      createdAt: question.createdAt.toISOString(),
    };
  }
}
