import { Controller, Get, Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogRefreshesController } from './catalog-refreshes.controller.js';
import { Database } from './database.js';
import { ImportJobsController } from './import-jobs.controller.js';

@Controller('health')
class HealthController {
  constructor(private readonly database: Database) {}

  @Get()
  async check(): Promise<{ status: string; database: string }> {
    await this.database.pool.query('SELECT 1');
    return { status: 'ok', database: 'ok' };
  }
}

@Module({ controllers: [HealthController, CatalogController, CatalogRefreshesController, ImportJobsController], providers: [Database] })
export class AppModule {}
