import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT != null ? parseInt(process.env.PORT, 10) : 3000;

  const corsOrigin = process.env.CORS_ORIGIN;
  const allowedOrigins = corsOrigin
    ? corsOrigin.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
    : [];

  const allowOrigin = (origin: string | undefined): boolean => {
    if (allowedOrigins.length === 0) return true;
    return !!origin && allowedOrigins.includes(origin);
  };

  // CORS middleware first – runs on every request and sets headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.enableCors({
    origin: (requestOrigin, callback) => {
      callback(null, allowOrigin(requestOrigin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}`);
}
bootstrap();
