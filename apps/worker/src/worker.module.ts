import { Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { processImport } from './import-jobs.js';
import { verifyArchive } from './archive-files.js';

@Injectable()
class WorkerProcess implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerProcess.name);
  private readonly pool = new Pool();
  private heartbeat?: NodeJS.Timeout;
  private working = false;

  async onApplicationBootstrap(): Promise<void> {
    await this.pool.query('SELECT 1');
    const archive = await verifyArchive(this.pool, true);
    if (archive.legacyChunks) this.logger.warn(`${archive.legacyChunks} legacy completed chunks have no manifest; archive coverage remains unverified`);
    this.logger.log('Worker ready for import jobs');
    this.heartbeat = setInterval(() => {
      if (this.working) return;
      this.working = true;
      void processImport(this.pool).catch((error: unknown) => this.logger.error(error)).finally(() => { this.working = false; });
    }, 5_000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    await this.pool.end();
  }
}

@Module({ providers: [WorkerProcess] })
export class WorkerModule {}
