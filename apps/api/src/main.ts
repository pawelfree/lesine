import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { localAccessMiddleware } from './local-access.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(localAccessMiddleware);
  app.setGlobalPrefix('api');
  await app.listen(3000, '0.0.0.0');
}

void bootstrap();
