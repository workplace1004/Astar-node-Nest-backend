import { Injectable, Logger } from "@nestjs/common";

type ExchangeApiResponse = {
  result?: string;
  "error-type"?: string;
  time_last_update_utc?: string;
  conversion_rates?: Record<string, number>;
};

type CacheEntry = {
  arsPerUsd: number;
  expiresAt: number;
  asOf: string;
};

@Injectable()
export class ExchangeService {
  private readonly logger = new Logger(ExchangeService.name);
  private cache: CacheEntry | null = null;

  /** Evita superar límites del plan free; la API se actualiza ~1 vez al día. */
  private readonly cacheTtlMs = 6 * 60 * 60 * 1000;

  /** Si falta clave o falla la API, mostrar algo razonable hasta el próximo intento. */
  private readonly fallbackArsPerUsd = 1450;

  async getUsdToArsRate(): Promise<{
    arsPerUsd: number;
    source: "live" | "fallback";
    asOf?: string;
  }> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return {
        arsPerUsd: this.cache.arsPerUsd,
        source: "live",
        asOf: this.cache.asOf,
      };
    }

    const apiKey = process.env.EXCHANGE_RATE_API_KEY?.trim();
    if (!apiKey) {
      this.logger.warn("EXCHANGE_RATE_API_KEY no configurada; usando cotización de respaldo");
      return { arsPerUsd: this.fallbackArsPerUsd, source: "fallback" };
    }

    try {
      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
      const res = await fetch(url);
      const data = (await res.json()) as ExchangeApiResponse;

      if (data.result !== "success" || typeof data.conversion_rates?.ARS !== "number") {
        this.logger.warn(
          `ExchangeRate-API no devolvió ARS: ${data["error-type"] ?? res.status} — usando respaldo`,
        );
        return { arsPerUsd: this.fallbackArsPerUsd, source: "fallback" };
      }

      const arsPerUsd = data.conversion_rates.ARS;
      const asOf = data.time_last_update_utc ?? new Date().toISOString();
      this.cache = {
        arsPerUsd,
        expiresAt: now + this.cacheTtlMs,
        asOf,
      };

      return { arsPerUsd, source: "live", asOf };
    } catch (e) {
      this.logger.error("Fallo al consultar ExchangeRate-API", e);
      return { arsPerUsd: this.fallbackArsPerUsd, source: "fallback" };
    }
  }
}
