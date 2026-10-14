export function renderHomePage(databaseStatus: 'ok' | 'error'): string {
  const dbLabel = databaseStatus === 'ok' ? 'Connected' : 'Unavailable';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OpenMercato</title>
  </head>
  <body>
    <h1>OpenMercato</h1>
    <p data-testid="app-status">Application status: ok</p>
    <p data-testid="db-status">Database status: ${dbLabel}</p>
    <nav>
      <a href="/admin">Admin panel</a>
    </nav>
  </body>
</html>
`;
}
