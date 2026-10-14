import { renderHomePage } from './home.view';

describe('renderHomePage', () => {
  it('shows the database as connected when status is ok', () => {
    const html = renderHomePage('ok');
    expect(html).toContain('Database status: Connected');
  });

  it('shows the database as unavailable when status is error', () => {
    const html = renderHomePage('error');
    expect(html).toContain('Database status: Unavailable');
  });
});
