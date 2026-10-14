import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';

const COMMAND_TIMEOUT_MS = 60_000;

/**
 * Thin wrapper around the `agent-browser` CLI so integration tests can drive
 * a real Chromium session and assert on its text output from inside Jest.
 */
export class AgentBrowserSession {
  readonly sessionId = `ci-${randomUUID()}`;

  private run(args: string[]): string {
    return execFileSync('agent-browser', args, {
      encoding: 'utf8',
      timeout: COMMAND_TIMEOUT_MS,
      env: { ...process.env, AGENT_BROWSER_SESSION: this.sessionId },
    });
  }

  open(url: string): string {
    return this.run(['open', url]);
  }

  getText(selector: string): string {
    return this.run(['get', 'text', selector]).trim();
  }

  setCredentials(username: string, password: string): void {
    this.run(['set', 'credentials', username, password]);
  }

  close(): void {
    try {
      this.run(['close']);
    } catch {
      // Best-effort cleanup; the daemon self-reaps idle sessions regardless.
    }
  }
}
