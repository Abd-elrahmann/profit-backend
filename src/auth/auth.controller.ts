import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  Patch,
  Param,
  UseInterceptors,
  UploadedFile,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
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
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(body);
    

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, 
      path: '/'
    });


    return {
      accessToken: result.accessToken,
      user: result.user
    };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = req.cookies?.refreshToken;
    
    if (refreshToken) {
      try {
        // Get user ID from refresh token to invalidate it
        await this.authService.logoutByRefreshToken(refreshToken);
      } catch (error) {
        // Even if token is invalid, clear the cookie
        console.log('Logout token validation failed, clearing cookie anyway');
      }
    }
    
    // Always clear the cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    return { message: 'تم تسجيل الخروج بنجاح' };
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
  @Patch('upload-profile-image')
  @UseInterceptors(FileInterceptor('profileImage'))
  uploadProfileImage(@Req() req, @UploadedFile() file: Express.Multer.File) {
    return this.authService.uploadProfileImage(req.user.id, file);
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

  @Post('refresh')
  async refreshToken(@Req() req: Request) {

    const refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    return this.authService.refreshAccessToken(refreshToken);
  }
}