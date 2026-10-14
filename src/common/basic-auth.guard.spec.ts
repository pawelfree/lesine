import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { BasicAuthGuard } from './basic-auth.guard';

describe('BasicAuthGuard', () => {
  const originalUser = process.env.ADMIN_USERNAME;
  const originalPassword = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'secret';
  });

  afterAll(() => {
    process.env.ADMIN_USERNAME = originalUser;
    process.env.ADMIN_PASSWORD = originalPassword;
  });

  function createContext(authorization?: string) {
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    return { context, setHeader };
  }

  function basicHeader(credentials: string) {
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  it('allows a request with valid credentials', () => {
    const guard = new BasicAuthGuard();
    const { context } = createContext(basicHeader('admin:secret'));

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a request with no authorization header', () => {
    const guard = new BasicAuthGuard();
    const { context, setHeader } = createContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="admin"',
    );
  });

  it('rejects a non-Basic authorization header', () => {
    const guard = new BasicAuthGuard();
    const { context } = createContext('Bearer some-token');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a Basic header with no colon separator', () => {
    const guard = new BasicAuthGuard();
    const malformed = `Basic ${Buffer.from('no-colon-here').toString('base64')}`;
    const { context } = createContext(malformed);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request with the wrong username', () => {
    const guard = new BasicAuthGuard();
    const { context } = createContext(basicHeader('wrong:secret'));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request with the wrong password', () => {
    const guard = new BasicAuthGuard();
    const { context } = createContext(basicHeader('admin:wrong'));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a username of a different length than expected', () => {
    const guard = new BasicAuthGuard();
    const { context } = createContext(basicHeader('administrator:secret'));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('falls back to default admin/admin credentials when env vars are unset', () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    const guard = new BasicAuthGuard();
    const { context } = createContext(basicHeader('admin:admin'));

    expect(guard.canActivate(context)).toBe(true);
  });
});
