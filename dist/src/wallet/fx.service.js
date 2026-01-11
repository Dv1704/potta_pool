var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FXService_1;
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
let FXService = FXService_1 = class FXService {
    logger = new Logger(FXService_1.name);
    CACHE_TTL = 300000; // 5 minutes
    lastFetchTime = 0;
    rates = {
        USD: 16.0,
        GBP: 20.0,
        EUR: 17.0,
        GHS: 1.0,
    };
    /**
     * Convert external currency to GHS using live rates (cached)
     */
    async convertToGHS(amount, fromCurrency) {
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
    async ensureFreshRates() {
        const now = Date.now();
        if (now - this.lastFetchTime < this.CACHE_TTL)
            return;
        try {
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/GHS');
            if (response.data && response.data.rates) {
                this.rates = response.data.rates;
                this.lastFetchTime = now;
                this.logger.log('Exchange rates updated successfully');
            }
        }
        catch (error) {
            this.logger.error(`Failed to fetch live rates: ${error.message}. Using fallback rates.`);
            // Keep existing rates even if they are stale
            this.lastFetchTime = now - (this.CACHE_TTL / 2); // Retry sooner
        }
    }
    getSupportedCurrencies() {
        return Object.keys(this.rates);
    }
    async getLiveRates() {
        await this.ensureFreshRates();
        return { ...this.rates };
    }
};
FXService = FXService_1 = __decorate([
    Injectable()
], FXService);
export { FXService };
