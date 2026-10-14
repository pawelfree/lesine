import { DatabaseService } from '../database/database.service';
import { HomeController } from './home.controller';

describe('HomeController', () => {
  function createController(isUp: boolean) {
    const databaseService = {
      ping: jest.fn().mockResolvedValue(isUp),
    } as unknown as DatabaseService;
    return new HomeController(databaseService);
  }

  it('renders the home page with the database connected', async () => {
    const controller = createController(true);
    const html = await controller.getHomePage();
    expect(html).toContain('Database status: Connected');
  });

  it('renders the home page with the database unavailable', async () => {
    const controller = createController(false);
    const html = await controller.getHomePage();
    expect(html).toContain('Database status: Unavailable');
  });
});
