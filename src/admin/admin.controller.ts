import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

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
    return reports.map((r) => ({
      id: r.id,
      user: r.user.name,
      userEmail: r.user.email,
      type: r.type,
      title: r.title,
      status: 'Generado',
      date: r.createdAt.toISOString(),
      content: r.content,
    }));
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
}
