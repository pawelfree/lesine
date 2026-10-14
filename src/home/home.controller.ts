import { Controller, Get, Header } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { renderHomePage } from './home.view';

@Controller()
export class HomeController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  @Header('Content-Type', 'text/html')
  async getHomePage(): Promise<string> {
    const isUp = await this.databaseService.ping();
    return renderHomePage(isUp ? 'ok' : 'error');
  }
}
