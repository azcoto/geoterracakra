import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import dotenv from 'dotenv';
import { AppModule } from './app.module.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(repositoryRoot, '.env') });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true, timestamp: true }),
  });

  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
