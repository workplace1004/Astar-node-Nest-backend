import { Module } from '@nestjs/common';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';
import { PayPalWebhookController } from './paypal-webhook.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeModule } from '../exchange/exchange.module';

@Module({
  imports: [UsersModule, PrismaModule, ExchangeModule],
  controllers: [PaymentsController, MercadoPagoWebhookController, PayPalWebhookController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
