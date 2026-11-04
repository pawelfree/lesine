import { Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
class WorkerProcess implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerProcess.name);
  private readonly pool = new Pool();
  private heartbeat?: NodeJS.Timeout;

  async onApplicationBootstrap(): Promise<void> {
    await this.pool.query('SELECT 1');
    this.logger.log('Worker ready; no jobs configured yet');
    this.heartbeat = setInterval(() => {
      void this.pool.query('SELECT 1').catch((error: unknown) => this.logger.error(error));
    }, 60_000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    await this.pool.end();
  }
}

@Module({ providers: [WorkerProcess] })
export class WorkerModule {}
