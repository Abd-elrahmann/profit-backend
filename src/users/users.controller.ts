import { Controller, Get, Post, Body, Patch, Delete, Param, Query, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard,PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permissions('users', 'canAdd')
  addUser(@Req() req, @Body() body: { name: string; email: string; password: string; phone: string; roleId?: number }) {
    return this.usersService.addUser(req.user.id , body);
  }

  @Patch(':id')
  @Permissions('users', 'canUpdate')
  updateUser(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; phone?: string; roleId?: number; isActive?: boolean },
  ) {
    return this.usersService.updateUser(id, req.user.id , body);
  }

  @Patch(':id/role')
  @Permissions('users', 'canUpdate')
  assignRole(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('roleId') roleId: number,
  ) {
    return this.usersService.assignRole(id, req.user.id , roleId);
  }

  @Delete(':id')
  @Permissions('users', 'canDelete')
  deleteUser(@Req() req,
    @Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteUser(req.user.id , id);
  }

  @Get(':page')
  @Permissions('users', 'canView')
  getUsers(
    @Param('page', ParseIntPipe) page: number,
    @Query('limit') limit?: number,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('roleId') roleId?: number,
  ) {
    return this.usersService.getUsers(page, {limit, name, email, phone, roleId });
  }
}