import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Public endpoint for PayPal webhooks (no JWT).
 * Dashboard: PayPal Developer → your app → Webhooks → URL: https://&lt;backend&gt;/payments/webhooks/paypal
 * Subscribe at least to: PAYMENT.CAPTURE.COMPLETED
 */
@Controller('payments/webhooks')
export class PayPalWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('paypal')
  @HttpCode(HttpStatus.OK)
  async postPayPal(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    try {
      return await this.paymentsService.handlePayPalWebhook({ headers, body });
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      return { received: true as const, processed: false as const, detail: 'exception' };
    }
  }
}
