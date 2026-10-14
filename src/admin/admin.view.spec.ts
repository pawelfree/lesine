import { renderAdminPage } from './admin.view';

describe('renderAdminPage', () => {
  it('shows the database as connected when status is ok', () => {
    const html = renderAdminPage('ok');
    expect(html).toContain('Database status: Connected');
  });

  it('shows the database as unavailable when status is error', () => {
    const html = renderAdminPage('error');
    expect(html).toContain('Database status: Unavailable');
  });
});
