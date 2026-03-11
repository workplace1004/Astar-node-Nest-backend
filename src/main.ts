import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { Request, Response, NextFunction } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express');

async function bootstrap() {
  const expressApp = express();

  const corsOrigin = process.env.CORS_ORIGIN ?? '';
  const allowedOrigins = corsOrigin
    ? corsOrigin.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
    : [];

  const allowOrigin = (origin: string | undefined): boolean => {
    if (allowedOrigins.length === 0) return true;
    return !!origin && allowedOrigins.includes(origin);
  };

  // CORS must be the very first middleware – handle preflight and set headers on all responses
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  const port = process.env.PORT != null ? parseInt(process.env.PORT, 10) : 3000;

  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}`);
}
bootstrap();
