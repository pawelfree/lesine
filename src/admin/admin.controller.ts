import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { DatabaseService } from '../database/database.service';
import { renderAdminPage } from './admin.view';

@Controller('admin')
@UseGuards(BasicAuthGuard)
export class AdminController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  @Header('Content-Type', 'text/html')
  async getAdminPage(): Promise<string> {
    const isUp = await this.databaseService.ping();
    return renderAdminPage(isUp ? 'ok' : 'error');
  }
}
