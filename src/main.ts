import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT != null ? parseInt(process.env.PORT, 10) : 3000;

  const corsOrigin = process.env.CORS_ORIGIN;
  const origin = corsOrigin
    ? corsOrigin.split(',').map((o) => o.trim()).filter(Boolean)
    : true;

  app.enableCors({
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}`);
}
bootstrap();
