import { Module } from '@nestjs/common';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [UsersModule, PrismaModule],
  controllers: [PaymentsController, MercadoPagoWebhookController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
