var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
let FXService = class FXService {
    // Static map for demo, can be replaced with a live API (e.g. ExchangeRate-API)
    rates = {
        USD: 16.0, // 1 USD = 16 GHS
        GBP: 20.0, // 1 GBP = 20 GHS
        EUR: 17.0, // 1 EUR = 17 GHS
        GHS: 1.0,
    };
    /**
     * Convert external currency to GHS
     */
    async convertToGHS(amount, fromCurrency) {
        const rate = this.rates[fromCurrency.toUpperCase()];
        if (!rate) {
            throw new Error(`Currency ${fromCurrency} not supported`);
        }
        return {
            ghsAmount: amount * rate,
            rate: rate,
        };
    }
    getSupportedCurrencies() {
        return Object.keys(this.rates);
    }
};
FXService = __decorate([
    Injectable()
], FXService);
export { FXService };
