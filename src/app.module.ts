import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';

@Module({
  imports: [DatabaseModule, HomeModule, HealthModule, AdminModule],
  controllers: [AppController],
})
export class AppModule {}
