// Price Data Service
// Handles fetching and managing bond/stock price data from S3

class PriceDataService {
    constructor(awsServices) {
        this.awsServices = awsServices;
        this.priceCache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache
        this.bondDataKey = 'bond_values_093027.json'; // S3 key for bond data
        this.lastUpdateTime = null;
        this.lastBondData = null; // Store latest bond data for fund details
    }

    // Fetch bond data from S3
    async fetchBondData() {
        try {
            const bondData = await this.awsServices.getObject(this.bondDataKey);
            if (!bondData) {
                throw new Error('Bond data not found in S3');
            }
            
            // Filter out incomplete records and sort by timestamp
            const validData = bondData
                .filter(item => item.价格_中间价 && item.timestamp)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
            return validData;
        } catch (error) {
            console.error('Failed to fetch bond data from S3:', error);
            throw error;
        }
    }

    // Get latest bond price data
    async getLatestBondPrice() {
        try {
            const bondData = await this.fetchBondData();
            if (bondData.length === 0) {
                return null;
            }
            
            const latest = bondData[0];
            const bondDetails = {
                timestamp: latest.timestamp,
                buyPrice: parseFloat(latest.价格_买价),
                midPrice: parseFloat(latest.价格_中间价),
                sellPrice: parseFloat(latest.价格_卖价),
                buyYield: parseFloat(latest['最差收益率(YTW)_买价']),
                midYield: parseFloat(latest['最差收益率(YTW)_中间价']),
                sellYield: parseFloat(latest['最差收益率(YTW)_卖价']),
                buyYTM: parseFloat(latest['到期收益率(YTM)_买价']),
                midYTM: parseFloat(latest['到期收益率(YTM)_中间价']),
                sellYTM: parseFloat(latest['到期收益率(YTM)_卖价']),
                modifiedDuration: parseFloat(latest['修正久期_中间价']),
                convexity: parseFloat(latest['凸性_中间价']),
                liquidityScore: parseFloat(latest['流动性分数_中间价']),
                volume30Day: latest['30天成交量'],
                accruedInterest: latest['应付利息'],
                buyChange: latest.涨跌额_买价,
                midChange: latest.涨跌额_中间价,
                sellChange: latest.涨跌额_卖价
            };
            
            // Store for fund details display
            this.lastBondData = bondDetails;
            
            return bondDetails;
        } catch (error) {
            console.error('Failed to get latest bond price:', error);
            return null;
        }
    }

    // Get bond price history
    async getBondPriceHistory(days = 30) {
        try {
            const bondData = await this.fetchBondData();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            return bondData
                .filter(item => new Date(item.timestamp) >= cutoffDate)
                .map(item => ({
                    timestamp: item.timestamp,
                    date: new Date(item.timestamp).toISOString().split('T')[0],
                    buyPrice: parseFloat(item.价格_买价),
                    midPrice: parseFloat(item.价格_中间价),
                    sellPrice: parseFloat(item.价格_卖价),
                    volume: parseFloat(item['30天成交量'] || 0)
                }))
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        } catch (error) {
            console.error('Failed to get bond price history:', error);
            return [];
        }
    }

    // Get complete bond data for dashboard table
    async getCompleteBondData() {
        try {
            const bondData = await this.fetchBondData();
            if (bondData.length === 0) {
                return null;
            }
            
            // Return the most recent complete data entry
            const latest = bondData[0];
            return {
                timestamp: latest.timestamp,
                价格_买价: latest.价格_买价,
                价格_中间价: latest.价格_中间价,
                价格_卖价: latest.价格_卖价,
                涨跌额_买价: latest.涨跌额_买价,
                涨跌额_中间价: latest.涨跌额_中间价,
                涨跌额_卖价: latest.涨跌额_卖价,
                '最差收益率(YTW)_买价': latest['最差收益率(YTW)_买价'],
                '最差收益率(YTW)_中间价': latest['最差收益率(YTW)_中间价'],
                '最差收益率(YTW)_卖价': latest['最差收益率(YTW)_卖价'],
                '到期收益率(YTM)_买价': latest['到期收益率(YTM)_买价'],
                '到期收益率(YTM)_中间价': latest['到期收益率(YTM)_中间价'],
                '到期收益率(YTM)_卖价': latest['到期收益率(YTM)_卖价'],
                流动性分数_买价: latest.流动性分数_买价,
                流动性分数_中间价: latest.流动性分数_中间价,
                流动性分数_卖价: latest.流动性分数_卖价,
                G利差_买价: latest.G利差_买价,
                G利差_中间价: latest.G利差_中间价,
                G利差_卖价: latest.G利差_卖价,
                I利差_买价: latest.I利差_买价,
                I利差_中间价: latest.I利差_中间价,
                I利差_卖价: latest.I利差_卖价,
                T利差_买价: latest.T利差_买价,
                T利差_中间价: latest.T利差_中间价,
                T利差_卖价: latest.T利差_卖价,
                Z利差_买价: latest.Z利差_买价,
                Z利差_中间价: latest.Z利差_中间价,
                Z利差_卖价: latest.Z利差_卖价,
                麦考利久期_买价: latest.麦考利久期_买价,
                麦考利久期_中间价: latest.麦考利久期_中间价,
                麦考利久期_卖价: latest.麦考利久期_卖价,
                修正久期_买价: latest.修正久期_买价,
                修正久期_中间价: latest.修正久期_中间价,
                修正久期_卖价: latest.修正久期_卖价,
                凸性_买价: latest.凸性_买价,
                凸性_中间价: latest.凸性_中间价,
                凸性_卖价: latest.凸性_卖价,
                应付利息: latest.应付利息,
                '30天成交量': latest['30天成交量']
            };
        } catch (error) {
            console.error('Failed to get complete bond data:', error);
            return null;
        }
    }

    // Get price for specific symbol (bond or stock)
    async getPrice(symbol) {
        // Check cache first
        const cached = this.priceCache.get(symbol);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }

        try {
            let priceData = null;

            // Handle bond symbols (customize this based on your bond naming convention)
            if (this.isBondSymbol(symbol)) {
                priceData = await this.getLatestBondPrice();
                if (priceData) {
                    // Use mid price as the default price for bonds
                    priceData.currentPrice = priceData.midPrice;
                }
            } else {
                // For stocks, you might want to integrate with a stock API
                // For now, we'll return a placeholder
                priceData = await this.getStockPrice(symbol);
            }

            // Cache the result
            if (priceData) {
                this.priceCache.set(symbol, {
                    data: priceData,
                    timestamp: Date.now()
                });
            }

            return priceData;
        } catch (error) {
            console.error(`Failed to get price for ${symbol}:`, error);
            return null;
        }
    }

    // Check if symbol is a bond
    isBondSymbol(symbol) {
        // Customize this logic based on your bond naming convention
        // For example, bonds might have specific prefixes or patterns
        return symbol.toLowerCase().includes('bond') || 
               symbol.toLowerCase().includes('债券') ||
               symbol.match(/^\d+\.\d+$/); // Pattern like "123.456" common in bond naming
    }

    // Get stock price (placeholder - integrate with your preferred stock API)
    async getStockPrice(symbol) {
        // This is a placeholder implementation
        // In production, you would integrate with APIs like:
        // - Alpha Vantage
        // - Yahoo Finance
        // - IEX Cloud
        // - Polygon.io
        
        try {
            // For demonstration, return mock data
            // Replace this with actual API integration
            const mockPrice = 100 + Math.random() * 200; // Random price between 100-300
            
            return {
                symbol: symbol,
                currentPrice: parseFloat(mockPrice.toFixed(2)),
                timestamp: new Date().toISOString(),
                change: parseFloat((Math.random() * 10 - 5).toFixed(2)), // Random change between -5 and +5
                changePercent: parseFloat((Math.random() * 10 - 5).toFixed(2))
            };
        } catch (error) {
            console.error(`Failed to fetch stock price for ${symbol}:`, error);
            return null;
        }
    }

    // Update portfolio with latest prices
    async updatePortfolioPrices(portfolioManager) {
        if (!portfolioManager || !portfolioManager.portfolio) {
            throw new Error('Portfolio manager not initialized');
        }

        const holdings = Object.keys(portfolioManager.portfolio.holdings);
        const priceUpdates = {};
        
        for (const symbol of holdings) {
            try {
                const priceData = await this.getPrice(symbol);
                if (priceData && priceData.currentPrice) {
                    priceUpdates[symbol] = priceData.currentPrice;
                }
            } catch (error) {
                console.error(`Failed to update price for ${symbol}:`, error);
            }
        }

        // Update portfolio with new prices
        if (Object.keys(priceUpdates).length > 0) {
            await portfolioManager.updateStockPrices(priceUpdates);
            this.lastUpdateTime = new Date();
        }

        return priceUpdates;
    }

    // Get market summary data
    async getMarketSummary() {
        try {
            const bondPrice = await this.getLatestBondPrice();
            
            if (!bondPrice) {
                return null;
            }

            // Store the full bond data for fund details
            this.lastBondData = bondPrice;
            
            return {
                timestamp: bondPrice.timestamp,
                lastUpdated: new Date(bondPrice.timestamp).toLocaleString(),
                bondData: {
                    buyPrice: bondPrice.buyPrice,
                    midPrice: bondPrice.midPrice,
                    sellPrice: bondPrice.sellPrice,
                    buyYield: bondPrice.buyYield,
                    midYield: bondPrice.midYield,
                    sellYield: bondPrice.sellYield,
                    changes: {
                        buy: bondPrice.buyChange,
                        mid: bondPrice.midChange,
                        sell: bondPrice.sellChange
                    }
                }
            };
        } catch (error) {
            console.error('Failed to get market summary:', error);
            return null;
        }
    }

    // Calculate bond metrics
    calculateBondMetrics(bondData, holdings) {
        if (!bondData || !holdings) {
            return null;
        }

        const metrics = {
            totalBondValue: 0,
            averageYield: 0,
            bondCount: 0
        };

        let totalValue = 0;
        let weightedYield = 0;

        for (const [symbol, holding] of Object.entries(holdings)) {
            if (this.isBondSymbol(symbol)) {
                const bondValue = holding.shares * bondData.midPrice;
                totalValue += bondValue;
                weightedYield += bondData.midYield * bondValue;
                metrics.bondCount++;
            }
        }

        if (totalValue > 0) {
            metrics.totalBondValue = totalValue;
            metrics.averageYield = weightedYield / totalValue;
        }

        return metrics;
    }

    // Clear price cache
    clearCache() {
        this.priceCache.clear();
    }

    // Get cache statistics
    getCacheStats() {
        return {
            size: this.priceCache.size,
            lastUpdateTime: this.lastUpdateTime,
            ttl: this.cacheTTL
        };
    }

    // Set custom S3 key for bond data
    setBondDataKey(key) {
        this.bondDataKey = key;
    }

    // Get S3 key for bond data
    getBondDataKey() {
        return this.bondDataKey;
    }
}

// Real-time price updater
class PriceUpdater {
    constructor(priceService, portfolioManager) {
        this.priceService = priceService;
        this.portfolioManager = portfolioManager;
        this.updateInterval = null;
        this.isRunning = false;
    }

    // Start automatic price updates
    start(intervalMinutes = 5) {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        const intervalMs = intervalMinutes * 60 * 1000;

        this.updateInterval = setInterval(async () => {
            try {
                await this.priceService.updatePortfolioPrices(this.portfolioManager);
                console.log('Portfolio prices updated automatically');
                
                // Trigger UI update if callback is available
                if (this.onPriceUpdate) {
                    this.onPriceUpdate();
                }
            } catch (error) {
                console.error('Failed to update prices automatically:', error);
            }
        }, intervalMs);

        console.log(`Price updater started with ${intervalMinutes} minute intervals`);
    }

    // Stop automatic price updates
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.isRunning = false;
        console.log('Price updater stopped');
    }

    // Set callback for price updates
    setOnPriceUpdate(callback) {
        this.onPriceUpdate = callback;
    }

    // Manual price update
    async updateNow() {
        try {
            const updates = await this.priceService.updatePortfolioPrices(this.portfolioManager);
            console.log('Manual price update completed:', updates);
            
            if (this.onPriceUpdate) {
                this.onPriceUpdate();
            }
            
            return updates;
        } catch (error) {
            console.error('Failed to update prices manually:', error);
            throw error;
        }
    }

    // Get updater status
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastUpdate: this.priceService.lastUpdateTime,
            cacheStats: this.priceService.getCacheStats()
        };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PriceDataService, PriceUpdater };
} else if (typeof window !== 'undefined') {
    window.PriceDataService = PriceDataService;
    window.PriceUpdater = PriceUpdater;
}