import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

const CONTENT_STYLE_CATEGORY_TITLE = '__content_style_config__';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {}

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

  @Get('orders')
  async listOrders() {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return orders.map((o) => ({
      id: o.id,
      user: o.user.name,
      userEmail: o.user.email,
      type: o.type,
      amount: o.amount,
      method: o.method,
      date: o.createdAt.toISOString(),
    }));
  }

  @Get('blog')
  async listBlog() {
    const posts = await this.prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return posts.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      date: p.createdAt.toISOString(),
      content: p.content,
    }));
  }

  @Get('blog/:id')
  async getBlog(@Param('id') id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return {
      id: post.id,
      title: post.title,
      status: post.status,
      date: post.createdAt.toISOString(),
      content: post.content,
    };
  }

  @Post('blog')
  async createBlog(@Body() body: { title: string; content: string; status?: string }) {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const content = typeof body?.content === 'string' ? body.content : '';
    const status = body?.status === 'published' ? 'published' : 'draft';
    if (!title) throw new NotFoundException('Title is required');
    const post = await this.prisma.blogPost.create({
      data: { title, content, status },
    });
    return {
      id: post.id,
      title: post.title,
      status: post.status,
      date: post.createdAt.toISOString(),
      content: post.content,
    };
  }

  @Patch('blog/:id')
  async updateBlog(@Param('id') id: string, @Body() body: { title?: string; content?: string; status?: string }) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Blog post not found');
    const data: { title?: string; content?: string; status?: string } = {};
    if (typeof body?.title === 'string') data.title = body.title.trim();
    if (typeof body?.content === 'string') data.content = body.content;
    if (body?.status === 'published' || body?.status === 'draft') data.status = body.status;
    const post = await this.prisma.blogPost.update({
      where: { id },
      data,
    });
    return {
      id: post.id,
      title: post.title,
      status: post.status,
      date: post.createdAt.toISOString(),
      content: post.content,
    };
  }

  @Delete('blog/:id')
  async deleteBlog(@Param('id') id: string) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Blog post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('knowledge-base')
  async listKnowledgeBase() {
    const categories = await this.prisma.knowledgeCategory.findMany({
      orderBy: { title: 'asc' },
      include: { entries: { orderBy: { createdAt: 'asc' } } },
    });
    return categories.map((c) => ({
      id: c.id,
      title: c.title,
      entries: c.entries.map((e) => ({ id: e.id, content: e.content })),
    }));
  }

  @Post('knowledge-base/categories')
  async createKnowledgeCategory(@Body() body: { title: string }) {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) throw new NotFoundException('title is required');
    const category = await this.prisma.knowledgeCategory.create({
      data: { title },
      include: { entries: true },
    });
    return {
      id: category.id,
      title: category.title,
      entries: category.entries.map((e) => ({ id: e.id, content: e.content })),
    };
  }

  @Post('knowledge-base/categories/:categoryId/entries')
  async createKnowledgeEntry(
    @Param('categoryId') categoryId: string,
    @Body() body: { content: string },
  ) {
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) throw new NotFoundException('content is required');
    const category = await this.prisma.knowledgeCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');
    const entry = await this.prisma.knowledgeEntry.create({
      data: { categoryId, content },
    });
    return { id: entry.id, content: entry.content };
  }

  @Patch('knowledge-base/entries/:id')
  async updateKnowledgeEntry(
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) throw new NotFoundException('content is required');
    const entry = await this.prisma.knowledgeEntry.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    const updated = await this.prisma.knowledgeEntry.update({
      where: { id },
      data: { content },
    });
    return { id: updated.id, content: updated.content };
  }

  @Delete('knowledge-base/entries/:id')
  async deleteKnowledgeEntry(@Param('id') id: string) {
    const entry = await this.prisma.knowledgeEntry.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    await this.prisma.knowledgeEntry.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('birth-chart-interpretations')
  async listBirthChartInterpretations() {
    const rows = await this.prisma.birthChartInterpretation.findMany({
      orderBy: [{ type: 'asc' }, { sign: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      sign: row.sign,
      description: row.description,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  @Patch('birth-chart-interpretations/:id')
  async updateBirthChartInterpretation(
    @Param('id') id: string,
    @Body() body: { description?: string },
  ) {
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    if (!description) throw new NotFoundException('description is required');
    const existing = await this.prisma.birthChartInterpretation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Interpretation not found');
    const updated = await this.prisma.birthChartInterpretation.update({
      where: { id },
      data: { description },
    });
    return {
      id: updated.id,
      type: updated.type,
      sign: updated.sign,
      description: updated.description,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  @Get('content-style')
  async getContentStyle() {
    const config = await this.readContentStyleConfig();
    return { config };
  }

  @Patch('content-style')
  async updateContentStyle(@Body() body: { config?: unknown }) {
    const incoming = body?.config;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      throw new BadRequestException('config object is required');
    }

    const serialized = JSON.stringify(incoming);
    const category =
      (await this.prisma.knowledgeCategory.findFirst({
        where: { title: CONTENT_STYLE_CATEGORY_TITLE },
      })) ??
      (await this.prisma.knowledgeCategory.create({
        data: { title: CONTENT_STYLE_CATEGORY_TITLE },
      }));

    const existingEntry = await this.prisma.knowledgeEntry.findFirst({
      where: { categoryId: category.id },
      orderBy: { createdAt: 'desc' },
    });

    if (existingEntry) {
      await this.prisma.knowledgeEntry.update({
        where: { id: existingEntry.id },
        data: { content: serialized },
      });
    } else {
      await this.prisma.knowledgeEntry.create({
        data: {
          categoryId: category.id,
          content: serialized,
        },
      });
    }

    const config = await this.readContentStyleConfig();
    return { config };
  }

  @Get('questions')
  async listQuestions() {
    const questions = await this.prisma.question.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return questions.map((q) => ({
      id: q.id,
      user: q.user.name,
      userEmail: q.user.email,
      question: q.question,
      answer: q.answer ?? null,
      status: q.status,
      date: q.createdAt.toISOString(),
    }));
  }

  @Get('notifications')
  async getNotifications(@CurrentUser() user: { id: string }) {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [newQuestions, recentOrders, readRecords] = await Promise.all([
      this.prisma.question.findMany({
        where: { status: 'new' },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { user: { select: { name: true, email: true } } },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { user: { select: { name: true } } },
      }),
      this.prisma.adminNotificationRead.findMany({
        where: { userId: user.id },
        select: { notificationId: true },
      }),
    ]);

    const readIds = new Set(readRecords.map((r) => r.notificationId));

    const notifications: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      date: string;
      link: string;
      unread: boolean;
    }> = [];

    newQuestions.forEach((q) => {
      const id = `q-${q.id}`;
      notifications.push({
        id,
        type: 'question',
        title: 'Nueva pregunta',
        description: `${q.user.name} (${q.user.email})`,
        date: q.createdAt.toISOString(),
        link: '/admin/questions',
        unread: !readIds.has(id),
      });
    });

    recentOrders.forEach((o) => {
      const id = `o-${o.id}`;
      notifications.push({
        id,
        type: 'order',
        title: 'Nuevo pedido',
        description: `${o.type} — ${o.amount} — ${o.user.name}`,
        date: o.createdAt.toISOString(),
        link: '/admin/orders',
        unread: !readIds.has(id),
      });
    });

    notifications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const slice = notifications.slice(0, 50);
    return { notifications: slice };
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.prisma.adminNotificationRead.upsert({
      where: {
        userId_notificationId: { userId: user.id, notificationId: id },
      },
      create: { userId: user.id, notificationId: id },
      update: {},
    });
    return { ok: true };
  }

  @Post('notifications/read-all')
  async markAllNotificationsRead(@CurrentUser() user: { id: string }) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const [newQuestions, recentOrders] = await Promise.all([
      this.prisma.question.findMany({
        where: { status: 'new' },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true },
      }),
    ]);
    const ids = [
      ...newQuestions.map((q) => `q-${q.id}`),
      ...recentOrders.map((o) => `o-${o.id}`),
    ];
    if (ids.length === 0) return { ok: true };
    await this.prisma.adminNotificationRead.createMany({
      data: ids.map((notificationId) => ({ userId: user.id, notificationId })),
      skipDuplicates: true,
    });
    return { ok: true };
  }

  @Get('questions/:id')
  async getQuestion(@Param('id') id: string) {
    const q = await this.prisma.question.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!q) throw new NotFoundException('Question not found');
    return {
      id: q.id,
      user: q.user.name,
      userEmail: q.user.email,
      question: q.question,
      answer: q.answer ?? null,
      status: q.status,
      date: q.createdAt.toISOString(),
    };
  }

  @Patch('questions/:id')
  async updateQuestion(
    @Param('id') id: string,
    @Body() body: { answer?: string },
  ) {
    const text = typeof body.answer === 'string' ? body.answer.trim() : '';
    const question = await this.prisma.question.update({
      where: { id },
      data: {
        answer: text || null,
        status: text ? 'answered' : undefined,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (text && question.userId) {
      await Promise.all([
        this.prisma.message.create({
          data: {
            userId: question.userId,
            type: 'answer',
            content: text,
            questionText: question.question,
            monthLabel: null,
          },
        }),
        this.prisma.notification.create({
          data: {
            userId: question.userId,
            title: 'Nueva respuesta a tu pregunta',
            body: text.length > 120 ? text.slice(0, 120) + '…' : text,
            category: 'question',
            read: false,
          },
        }),
      ]);
    }

    return {
      id: question.id,
      user: question.user.name,
      userEmail: question.user.email,
      question: question.question,
      answer: question.answer ?? null,
      status: question.status,
      date: question.createdAt.toISOString(),
    };
  }

  @Get('messages/:userId')
  async getMessagesWithUser(@Param('userId') userId: string) {
    const messages = await this.prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return messages.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      monthLabel: m.monthLabel,
      createdAt: m.createdAt.toISOString(),
      fromAdmin: true,
    }));
  }

  @Get('reports')
  async listReports() {
    const reports = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return reports.map((r) => this.mapReportToAdminItem(r));
  }

  @Get('reports/:id')
  async getReport(@Param('id') id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!report) throw new NotFoundException('Report not found');
    return this.mapReportToAdminItem(report);
  }

  @Patch('reports/:id')
  async updateReport(
    @Param('id') id: string,
    @Body() body: { content?: string; title?: string },
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!report) throw new NotFoundException('Report not found');
    const data: { content?: string | null; title?: string } = {};
    if (typeof body.content === 'string') data.content = body.content.trim() || null;
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
    const updated = await this.prisma.report.update({
      where: { id },
      data,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return this.mapReportToAdminItem(updated);
  }

  private mapReportToAdminItem(r: { id: string; type: string; title: string; content: string | null; createdAt: Date; user: { name: string; email: string } }) {
    return {
      id: r.id,
      user: r.user.name,
      userEmail: r.user.email,
      type: r.type,
      title: r.title,
      status: 'Generado',
      date: r.createdAt.toISOString(),
      content: r.content,
    };
  }

  @Post('messages')
  async sendMessage(@Body() body: { userId: string; content: string }) {
    const userId = body?.userId;
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!userId || !content) throw new NotFoundException('userId and content required');
    const message = await this.prisma.message.create({
      data: {
        userId,
        type: 'monthly',
        content,
      },
    });
    return {
      id: message.id,
      type: message.type,
      content: message.content,
      monthLabel: message.monthLabel,
      createdAt: message.createdAt.toISOString(),
      fromAdmin: true,
    };
  }

  private async readContentStyleConfig(): Promise<unknown | null> {
    try {
      const category = await this.prisma.knowledgeCategory.findFirst({
        where: { title: CONTENT_STYLE_CATEGORY_TITLE },
        include: {
          entries: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      const raw = category?.entries?.[0]?.content;
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
