import { Controller, Get } from "@nestjs/common";
import { ExchangeService } from "./exchange.service";

@Controller("exchange")
export class ExchangeController {
  constructor(private readonly exchange: ExchangeService) {}

  /** Cotización orientativa 1 USD → ARS (pública; la clave API queda solo en el servidor). */
  @Get("usd-ars")
  usdArs() {
    return this.exchange.getUsdToArsRate();
  }
}
