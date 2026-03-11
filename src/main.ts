import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT != null ? parseInt(process.env.PORT, 10) : 3000;

  const corsOrigin = process.env.CORS_ORIGIN;
  const allowedOrigins = corsOrigin
    ? corsOrigin.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
    : [];

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (allowedOrigins.length === 0) {
        return callback(null, true);
      }
      if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        return callback(null, true);
      }
      callback(null, false);
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
