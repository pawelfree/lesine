export function renderAdminPage(databaseStatus: 'ok' | 'error'): string {
  const dbLabel = databaseStatus === 'ok' ? 'Connected' : 'Unavailable';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OpenMercato Admin</title>
  </head>
  <body>
    <h1>Admin panel</h1>
    <p data-testid="admin-db-status">Database status: ${dbLabel}</p>
  </body>
</html>
`;
}
