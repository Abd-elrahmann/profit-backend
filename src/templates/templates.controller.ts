import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
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
  async upsert(@Req() req: any, @Body() dto: UpsertTemplateDto) {
    return this.templatesService.upsertTemplate(req.user.id, dto);
  }

  @Get(':name')
  @Permissions('templates', 'canView')
  async getByName(@Param('name') name: TemplateType) {
    name = name.toUpperCase() as TemplateType;
    return this.templatesService.getTemplateByName(name);
  }

  @Get(':name/with-variables')
  @Permissions('templates', 'canView')
  async getTemplateWithVariables(@Param('name') name: TemplateType) {
    name = name.toUpperCase() as TemplateType;
    return this.templatesService.getTemplateWithVariables(name);
  }

  @Post(':templateName/variables')
  @Permissions('templates', 'canUpdate')
  async addVariable(
    @Param('templateName') templateName: TemplateType,
    @Body() body: { key: string; description?: string }
  ) {
    templateName = templateName.toUpperCase() as TemplateType;
    return this.templatesService.addVariable(templateName, body.key, body.description);
  }

  @Put('variables/:id')
  @Permissions('templates', 'canUpdate')
  async updateVariable(
    @Param('id') id: string,
    @Body() body: { key: string; description?: string }
  ) {
    return this.templatesService.updateVariable(parseInt(id), body.key, body.description);
  }

  @Delete('variables/:id')
  @Permissions('templates', 'canUpdate')
  async deleteVariable(@Param('id') id: string) {
    return this.templatesService.deleteVariable(parseInt(id));
  }

  @Post(':templateName/styles')
  @Permissions('templates', 'canUpdate')
  async saveStyle(
    @Param('templateName') templateName: TemplateType,
    @Body() body: { css: string }
  ) {
    templateName = templateName.toUpperCase() as TemplateType;
    return this.templatesService.saveStyle(templateName, body.css);
  }
}