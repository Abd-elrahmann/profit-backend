import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { SendNotificationDto } from './dto/notification.dto';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Get('all/:page')
    @Permissions('notifications', 'canView')
    async getAllNotifications(
        @Param('page') page: number,
        @Query('limit') limit: number = 10,
        @Query('type') type?: string,
        @Query('clientName') clientName?: string,
        @Query('loanCode') loanCode?: string,
    ) {
        const filters = {
            type,
            clientName,
            loanCode,
        };

        return this.notificationService.getAllNotifications(page, +limit, filters);
    }

    @Get(':clientId')
    @Permissions('notifications', 'canView')
    getByClient(@Param('clientId') clientId: string) {
        return this.notificationService.getByClient(Number(clientId));
    }

    @Post('send')
    sendNotification(@Body() dto: SendNotificationDto) {
        return this.notificationService.sendNotification(dto);
    }
}
