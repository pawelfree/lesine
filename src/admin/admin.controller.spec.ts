import { DatabaseService } from '../database/database.service';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  function createController(isUp: boolean) {
    const databaseService = {
      ping: jest.fn().mockResolvedValue(isUp),
    } as unknown as DatabaseService;
    return new AdminController(databaseService);
  }

  it('renders the admin page with the database connected', async () => {
    const controller = createController(true);
    const html = await controller.getAdminPage();
    expect(html).toContain('Admin panel');
    expect(html).toContain('Database status: Connected');
  });

  it('renders the admin page with the database unavailable', async () => {
    const controller = createController(false);
    const html = await controller.getAdminPage();
    expect(html).toContain('Database status: Unavailable');
  });
});
