import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cors = require('cors') as typeof import('cors');

async function bootstrap() {
  const expressApp = express();

  // 1. Body parser first (large payloads for image uploads, etc.)
  expressApp.use(express.json({ limit: '50mb' }));
  expressApp.use(express.urlencoded({ limit: '50mb', extended: true }));

  // 2. CORS – default origins + env CORS_ORIGIN (comma-separated)
  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://astra-firebase.vercel.app',
    'https://www.astra-firebase.vercel.app',
  ];

  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
    : [];

  const allOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

  const corsOptions: import('cors').CorsOptions = {
    origin: (origin, callback) => {
      if (allOrigins.length === 0) return callback(null, true);
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '').toLowerCase();
      const allowed = allOrigins.some((o) => o.replace(/\/$/, '').toLowerCase() === normalized);
      callback(null, allowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  };

  expressApp.use(cors(corsOptions));

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bodyParser: false,
    rawBody: false,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT != null ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);

  console.log(`Backend running at http://localhost:${port}`);
  console.log(`CORS allowed origins: ${allOrigins.join(', ')}`);
}
bootstrap();
