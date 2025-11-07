import { Controller, Post, Body, Get, UseGuards, Req, Patch, Param, ParseIntPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './strategy/jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  register(@Body() body: { name: string; email: string; password: string; phone: string }) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  profile(@Req() req) {
    return this.authService.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('update-profile')
  updateProfile(@Req() req, @Body() body: { name?: string; phone?: string; }) {
    return this.authService.updateProfile(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('update-password')
  updatePassword(@Req() req, @Body() body: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    return this.authService.updatePassword(req.user.id, body);
  }

  @Post('request-reset-password')
  requestReset(@Body() body: { email: string }) {
    return this.authService.requestResetPassword(body.email);
  }

  @Post('reset-password')
  resetPassword(@Body() body: { token: string; newPassword: string; confirmPassword: string }) {
    return this.authService.resetPassword(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('permissions/:module')
  getUserModulePermissions(
    @Req() req,
    @Param('module') module: string,
  ) {
    return this.authService.getUserModulePermissions(req.user.id, module);
  }

  @UseGuards(JwtAuthGuard)
  @Get('modules')
  getUserModules(
    @Req() req,
  ) {
    return this.authService.getUserModules(req.user.id);
  }
}