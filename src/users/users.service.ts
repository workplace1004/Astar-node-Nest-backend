import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UserResponse } from './user.interface';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private toResponse(user: { id: string; email: string; name: string; role: string; isActive: boolean; subscriptionStatus: string; avatarUrl?: string | null }): UserResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserResponse['role'],
      isActive: user.isActive,
      subscriptionStatus: user.subscriptionStatus as UserResponse['subscriptionStatus'],
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  async create(data: {
    email: string;
    name: string;
    password: string;
    role: 'admin' | 'client';
    isActive?: boolean;
    subscriptionStatus?: 'active' | 'inactive' | 'cancelled';
    birthDate?: string;
    birthPlace?: string;
    birthTime?: string;
  }): Promise<UserResponse> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new Error('EMAIL_IN_USE');
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: data.name.trim(),
        passwordHash,
        role: data.role,
        isActive: data.isActive ?? true,
        subscriptionStatus: (data.subscriptionStatus ?? 'inactive') as 'active' | 'inactive' | 'cancelled',
        birthDate: data.birthDate ?? null,
        birthPlace: data.birthPlace ?? null,
        birthTime: data.birthTime ?? null,
      },
    });
    return this.toResponse(user);
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async validatePassword(user: { passwordHash: string }, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  toPublic(user: { id: string; email: string; name: string; role: string; isActive: boolean; subscriptionStatus: string; avatarUrl?: string | null }): UserResponse {
    return this.toResponse(user);
  }

  async findAll(params: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 10));
    const skip = (page - 1) * limit;
    const search = params.search?.trim().toLowerCase() ?? '';

    const where = {
      role: 'client' as const,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          subscriptionStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        subscriptionStatus: u.subscriptionStatus,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [total, activeSubs, inactiveSubs, cancelledSubs, previewsTotal, previewsThisMonth] = await Promise.all([
      this.prisma.user.count({ where: { role: 'client' } }),
      this.prisma.user.count({ where: { role: 'client', subscriptionStatus: 'active' } }),
      this.prisma.user.count({ where: { role: 'client', subscriptionStatus: 'inactive' } }),
      this.prisma.user.count({ where: { role: 'client', subscriptionStatus: 'cancelled' } }),
      this.prisma.preview.count(),
      this.prisma.preview.count({ where: { createdAt: { gte: monthStart } } }),
    ]);
    const providerCallsPerPreview = 2; // Astrology API v3: svg/natal + data/positions
    return {
      totalUsers: total,
      activeSubscriptions: activeSubs,
      inactiveSubscriptions: inactiveSubs,
      cancelledSubscriptions: cancelledSubs,
      astrologyApiUsage: {
        previewsTotal,
        previewsThisMonth,
        providerCallsEstimatedTotal: previewsTotal * providerCallsPerPreview,
        providerCallsEstimatedThisMonth: previewsThisMonth * providerCallsPerPreview,
      },
    };
  }

  async updateSubscription(id: string, subscriptionStatus: 'active' | 'inactive' | 'cancelled') {
    const user = await this.prisma.user.update({
      where: { id },
      data: { subscriptionStatus },
    });
    return this.toResponse(user);
  }

  async updateActive(id: string, isActive: boolean) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive },
    });
    return this.toResponse(user);
  }

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string; birthDate?: string; birthPlace?: string; birthTime?: string; avatarUrl?: string },
  ): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new UnauthorizedException('User not found');

    const updateData: { name?: string; email?: string; birthDate?: string | null; birthPlace?: string | null; birthTime?: string | null; avatarUrl?: string | null } = {};
    if (typeof data.name === 'string' && data.name.trim()) {
      updateData.name = data.name.trim();
    }
    if (typeof data.email === 'string' && data.email.trim()) {
      const newEmail = data.email.trim().toLowerCase();
      if (newEmail !== existing.email) {
        const taken = await this.prisma.user.findUnique({ where: { email: newEmail } });
        if (taken) throw new BadRequestException('Este correo ya está en uso.');
        updateData.email = newEmail;
      }
    }
    if (typeof data.birthDate === 'string') {
      const trimmed = data.birthDate.trim();
      updateData.birthDate = trimmed.length > 0 ? trimmed : null;
    }
    if (typeof data.birthPlace === 'string') {
      const trimmed = data.birthPlace.trim();
      updateData.birthPlace = trimmed.length > 0 ? trimmed : null;
    }
    if (typeof data.birthTime === 'string') {
      const trimmed = data.birthTime.trim();
      updateData.birthTime = trimmed.length > 0 ? trimmed : null;
    }
    if (typeof data.avatarUrl === 'string') {
      const trimmed = data.avatarUrl.trim();
      updateData.avatarUrl = trimmed.length > 0 ? trimmed : null;
    }
    if (Object.keys(updateData).length === 0) return this.toResponse(existing);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    return this.toResponse(user);
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await this.validatePassword(user, currentPassword);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta.');

    if (newPassword.length < 6) {
      throw new BadRequestException('La nueva contraseña debe tener al menos 6 caracteres.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }
}
