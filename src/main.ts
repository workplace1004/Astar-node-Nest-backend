import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT != null ? parseInt(process.env.PORT, 10) : 3000;
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  });
  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}`);
}
bootstrap();
