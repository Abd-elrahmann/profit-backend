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
    
    // Set Access Token in HTTP-Only Cookie (15 minutes)
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/'
    });

    // Set Refresh Token in HTTP-Only Cookie (7 days)
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, 
      path: '/'
    });

    console.log('✅ Access & Refresh token cookies set successfully');

    // Return only user data (NO tokens in response body)
    return {
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
        await this.authService.logoutByRefreshToken(refreshToken);
      } catch (error) {
        console.log('Logout token validation failed, clearing cookie anyway');
      }
    }
    
    // Clear both Access and Refresh tokens
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    });

    console.log('✅ Access & Refresh token cookies cleared');

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
  @Get('permissions')
  getAllUserPermissions(
    @Req() req,
  ) {
    return this.authService.getAllUserPermissions(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('modules')
  getUserModules(
    @Req() req,
  ) {
    return this.authService.getUserModules(req.user.id);
  }

  @Post('refresh')
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken) {
      console.warn('❌ Refresh endpoint called but no refresh token in cookies');
      console.warn('Available cookies:', Object.keys(req.cookies || {}));
      throw new UnauthorizedException('No refresh token provided');
    }

    console.log('🔄 Refresh token found in cookies, attempting refresh...');

    try {
      console.log('Refreshing token for cookies');
      const result = await this.authService.refreshAccessToken(refreshToken);
      
      // Set new Access Token in HTTP-Only Cookie
      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
        path: '/'
      });

      // Re-set the refresh token cookie to extend its lifetime
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
      });

      console.log('✅ Access token refreshed successfully for user:', result.user.id);

      // Return only user data (NO accessToken in response body)
      return {
        user: result.user
      };
    } catch (error) {
      console.error('Refresh endpoint error:', error.message);
      throw error;
    }
  }
}