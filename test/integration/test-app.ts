import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { AppModule } from '../../src/app.module';

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
}

/**
 * Boots the real Nest application ephemerally on a random port, against
 * whatever DATABASE_URL is currently set (expected to point at the
 * testcontainers-managed Postgres instance).
 */
export async function createTestApp(): Promise<TestApp> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  const { port } = server.address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}
