import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  UseGuards,
  Req,
  Res,
  Patch,
  Param,
  UseInterceptors,
  UploadedFile,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './strategy/jwt.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  register(@Body() body: { name: string; email: string; password: string; phone: string }) {
    return this.authService.register(body);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(body);

    const isProduction = process.env.NODE_ENV === 'production';


    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
      domain: undefined,
    });


    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      domain: undefined,
    });


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

      }
    }


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
  @UseInterceptors(FileInterceptor('profileImage', { storage: multer.memoryStorage() }))
  uploadProfileImage(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('يرجى اختيار صورة');
    return this.authService.uploadProfileImage(req.user.id, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile-image')
  deleteProfileImage(@Req() req) {
    return this.authService.deleteProfileImage(req.user.id);
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
      throw new UnauthorizedException('No refresh token provided');
    }

    try {
      const result = await this.authService.refreshAccessToken(refreshToken);

      const isProduction = process.env.NODE_ENV === 'production';


      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
        domain: undefined,
      });


      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
        domain: undefined,
      });


      return {
        user: result.user
      };
    } catch (error) {
      throw error;
    }
  }
}