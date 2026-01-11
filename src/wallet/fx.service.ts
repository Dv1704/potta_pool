import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class FXService {
    private readonly logger = new Logger(FXService.name);
    private readonly CACHE_TTL = 300000; // 5 minutes
    private lastFetchTime = 0;
    private rates: Record<string, number> = {
        USD: 16.0,
        GBP: 20.0,
        EUR: 17.0,
        GHS: 1.0,
    };

    /**
     * Convert external currency to GHS using live rates (cached)
     */
    async convertToGHS(amount: number, fromCurrency: string): Promise<{ ghsAmount: number; rate: number }> {
        await this.ensureFreshRates();
        const currency = fromCurrency.toUpperCase();

        // The API gives rate as 1 GHS = X Currency.
        // So for USD, it might be 0.0625. To get 1 USD = Y GHS, we do 1/rate.
        const ghsPerCurrency = 1 / (this.rates[currency] || 0);

        if (!this.rates[currency] || isFinite(ghsPerCurrency) === false) {
            throw new Error(`Currency ${fromCurrency} not supported or rate unavailable`);
        }

        return {
            ghsAmount: amount * ghsPerCurrency,
            rate: ghsPerCurrency,
        };
    }

    private async ensureFreshRates() {
        const now = Date.now();
        if (now - this.lastFetchTime < this.CACHE_TTL) return;

        try {
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/GHS');
            if (response.data && response.data.rates) {
                this.rates = response.data.rates;
                this.lastFetchTime = now;
                this.logger.log('Exchange rates updated successfully');
            }
        } catch (error: any) {
            this.logger.error(`Failed to fetch live rates: ${error.message}. Using fallback rates.`);
            // Keep existing rates even if they are stale
            this.lastFetchTime = now - (this.CACHE_TTL / 2); // Retry sooner
        }
    }

    getSupportedCurrencies(): string[] {
        return Object.keys(this.rates);
    }

    async getLiveRates(): Promise<Record<string, number>> {
        await this.ensureFreshRates();
        return { ...this.rates };
    }
}
