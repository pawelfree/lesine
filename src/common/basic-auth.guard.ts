import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

@Injectable()
export class BasicAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const expectedUser = process.env.ADMIN_USERNAME ?? 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD ?? 'admin';

    const header = request.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(
        header.slice('Basic '.length),
        'base64',
      ).toString('utf8');
      const separatorIndex = decoded.indexOf(':');
      if (separatorIndex !== -1) {
        const user = decoded.slice(0, separatorIndex);
        const password = decoded.slice(separatorIndex + 1);
        if (
          safeEqual(user, expectedUser) &&
          safeEqual(password, expectedPassword)
        ) {
          return true;
        }
      }
    }

    response.setHeader('WWW-Authenticate', 'Basic realm="admin"');
    throw new UnauthorizedException('Invalid credentials');
  }
}
