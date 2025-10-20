import { Controller, Post, Body, Get, Param, Delete, Patch, ParseIntPipe, UseGuards, Query, Req } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard,PermissionsGuard)
@Controller('roles')
export class RolesController {
    constructor(private readonly rolesService: RolesService) { }

    // Create a role with permissions
    @Post()
    @Permissions('roles', 'canAdd')
    createRole(
        @Body()
        body: {
            name: string;
            description?: string;
            permissions: {
                module: string;
                canView?: boolean;
                canAdd?: boolean;
                canUpdate?: boolean;
                canDelete?: boolean;
            }[];
        },
    ) {
        return this.rolesService.createRole(body);
    }

    // Get all roles
    @Get()
    @Permissions('roles', 'canView')
    getRoles(
        @Query('id') id?: number,
        @Query('name') name?: string,
    ) {
        return this.rolesService.getRoles({
            id: id ? Number(id) : undefined,
            name,
        });
    }

    // Get current user's permissions
    @Get('permissions')
    getUserPermissions(@Req() req) {
        return this.rolesService.getUserPermissions(req.user.id);
    }

    // Update a role
    @Patch(':id')
    @Permissions('roles', 'canUpdate')
    updateRole(
        @Param('id', ParseIntPipe) id: number,
        @Body()
        body: {
            name?: string;
            description?: string;
            permissions?: {
                module: string;
                canView?: boolean;
                canAdd?: boolean;
                canUpdate?: boolean;
                canDelete?: boolean;
            }[];
        },
    ) {
        return this.rolesService.updateRole(id, body);
    }

    // Delete a role
    @Delete(':id')
    @Permissions('roles', 'canDelete')
    deleteRole(@Param('id', ParseIntPipe) id: number) {
        return this.rolesService.deleteRole(id);
    }
}
