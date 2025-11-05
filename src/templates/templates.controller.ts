import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { UpsertTemplateDto } from './dto/templates.dto';
import { TemplateType } from '@prisma/client';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @Permissions('templates', 'canUpdate')
  async upsert(@Req() req, @Body() dto: UpsertTemplateDto) {
    return this.templatesService.upsertTemplate(req.user.id , dto);
  }

  @Get(':name')
  @Permissions('templates', 'canView')
  async getByName(@Param('name') name: TemplateType) {
    name = name.toUpperCase() as TemplateType;
    return this.templatesService.getTemplateByName(name);
  }
}