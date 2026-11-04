import { Controller, Get, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

class Database implements OnModuleDestroy {
  readonly pool = new Pool();

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Controller('health')
class HealthController {
  constructor(private readonly database: Database) {}

  @Get()
  async check(): Promise<{ status: string; database: string }> {
    await this.database.pool.query('SELECT 1');
    return { status: 'ok', database: 'ok' };
  }
}

@Module({ controllers: [HealthController], providers: [Database] })
export class AppModule {}
