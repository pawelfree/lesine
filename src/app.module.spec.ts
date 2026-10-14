import { Test } from '@nestjs/testing';
import { AdminController } from './admin/admin.controller';
import { AdvisorReportsController } from './advisor-reports/advisor-reports.controller';
import { AppController } from './app.controller';
import { AppModule } from './app.module';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health/health.controller';
import { HomeController } from './home/home.controller';

describe('AppModule', () => {
  it('wires up every controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ ping: jest.fn().mockResolvedValue(true) })
      .compile();

    expect(moduleRef.get(AppController)).toBeInstanceOf(AppController);
    expect(moduleRef.get(HomeController)).toBeInstanceOf(HomeController);
    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
    expect(moduleRef.get(AdminController)).toBeInstanceOf(AdminController);
    expect(moduleRef.get(AdvisorReportsController)).toBeInstanceOf(
      AdvisorReportsController,
    );

    await moduleRef.close();
  });
});
