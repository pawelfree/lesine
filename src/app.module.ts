import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AdvisorReportsModule } from './advisor-reports/advisor-reports.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';

@Module({
  imports: [
    DatabaseModule,
    HomeModule,
    HealthModule,
    AdminModule,
    AdvisorReportsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
