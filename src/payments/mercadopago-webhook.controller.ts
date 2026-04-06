import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Public endpoints for Mercado Pago notifications (no JWT).
 * Dashboard: Your integrations → Webhooks → URL: https://&lt;backend&gt;/payments/webhooks/mercadopago
 */
@Controller('payments/webhooks')
export class MercadoPagoWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  async postMercadoPago(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    try {
      return await this.paymentsService.handleMercadoPagoWebhook({
        method: 'POST',
        headers,
        body,
        query,
      });
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      return { received: true as const, processed: false as const, detail: 'exception' };
    }
  }

  /** Legacy IPN-style GET (?topic=payment&id=...) */
  @Get('mercadopago')
  @HttpCode(HttpStatus.OK)
  async getMercadoPago(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, string>,
  ) {
    try {
      return await this.paymentsService.handleMercadoPagoWebhook({
        method: 'GET',
        headers,
        body: {},
        query,
      });
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      return { received: true as const, processed: false as const, detail: 'exception' };
    }
  }
}
