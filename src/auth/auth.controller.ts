import { Body, Controller, Get, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    try {
      return await this.authService.register(dto);
    } catch (e) {
      if (e instanceof Error && e.message === 'EMAIL_IN_USE') {
        throw new UnauthorizedException('Este correo ya está registrado. Inicia sesión o usa otro email.');
      }
      throw e;
    }
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email.trim().toLowerCase(), dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { id: string }) {
    const profile = await this.authService.me(user.id);
    if (!profile) throw new UnauthorizedException();
    return profile;
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const current = body?.currentPassword ?? '';
    const newPwd = body?.newPassword ?? '';
    await this.authService.changePassword(user.id, current, newPwd);
    return { ok: true };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() body: { name?: string; email?: string },
  ) {
    return this.authService.updateProfile(user.id, body);
  }
}
