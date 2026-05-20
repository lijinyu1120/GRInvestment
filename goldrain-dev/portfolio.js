// Portfolio Management System
// Handles user portfolio data, stock holdings, and transactions

class PortfolioManager {
    constructor(awsServices) {
        this.awsServices = awsServices;
        this.userId = null;
        this.portfolio = null;
        this.transactions = [];
    }

    // Initialize portfolio manager with user ID
    async initialize() {
        try {
            console.log('🔄 Getting user attributes...');
            let userAttributes;
            try {
                userAttributes = await this.awsServices.getUserAttributes();
            } catch (attrError) {
                console.warn('⚠️ Portfolio: Failed to get user attributes, using session data:', attrError);
                // Fallback: get user info from session token
                const session = await this.awsServices.getUserSession();
                const payload = session.getIdToken().payload;
                userAttributes = {
                    sub: payload.sub,
                    email: payload.email
                };
            }
            
            this.userId = userAttributes.sub; // Cognito user ID
            console.log('👤 User ID:', this.userId);
            
            console.log('🔄 Loading portfolio...');
            await this.loadPortfolio();
            console.log('✅ Portfolio loaded');
            
            console.log('🔄 Loading transactions...');
            await this.loadTransactions();
            console.log('✅ Transactions loaded');
        } catch (error) {
            console.error('❌ Failed to initialize portfolio manager:', error);
            throw error;
        }
    }

    // Portfolio Data Structure - Simplified for bond-only portfolio
    createEmptyPortfolio() {
        return {
            userId: this.userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            holdings: {},
            watchlist: [],
            settings: {
                currency: 'CNY',
                theme: 'dark',
                notifications: true
            }
        };
    }

    // Bond Holding Data Structure - Simplified to store only essential data
    createBondHolding(shares, avgCost, purchaseDate) {
        return {
            shares: parseFloat(shares),
            avgCost: parseFloat(avgCost),
            purchaseDate: purchaseDate || new Date().toISOString()
        };
    }

    // Calculate dynamic values based on current bond price
    calculateHoldingValues(holding, currentPrice, symbol = 'BOND', name = '企业债券基金') {
        if (!currentPrice) return null;
        
        const totalCost = holding.shares * holding.avgCost;
        const currentValue = holding.shares * currentPrice;
        const gainLoss = currentValue - totalCost;
        const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;

        return {
            symbol: symbol,
            name: name,
            shares: holding.shares,
            avgCost: holding.avgCost,
            purchaseDate: holding.purchaseDate,
            currentPrice: parseFloat(currentPrice),
            totalCost: parseFloat(totalCost.toFixed(2)),
            currentValue: parseFloat(currentValue.toFixed(2)),
            gainLoss: parseFloat(gainLoss.toFixed(2)),
            gainLossPercent: parseFloat(gainLossPercent.toFixed(2)),
            lastUpdated: new Date().toISOString()
        };
    }

    // Transaction Data Structure
    createTransaction(type, symbol, shares, price, date = null) {
        return {
            id: this.generateTransactionId(),
            type: type, // 'buy', 'sell', 'dividend'
            symbol: symbol.toUpperCase(),
            shares: parseFloat(shares),
            price: parseFloat(price),
            total: parseFloat((shares * price).toFixed(2)),
            date: date || new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
    }

    // Generate unique transaction ID
    generateTransactionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Load portfolio from S3
    async loadPortfolio() {
        try {
            const portfolioKey = this.awsServices.getUserPortfolioKey(this.userId);
            console.log('📁 Portfolio S3 key:', portfolioKey);
            
            const portfolioData = await this.awsServices.getObject(portfolioKey);
            console.log('📊 Portfolio data from S3:', portfolioData);
            
            if (portfolioData) {
                this.portfolio = portfolioData;
                console.log('✅ Existing portfolio loaded');
            } else {
                // Create new portfolio if none exists
                console.log('ℹ️ No existing portfolio found, creating new one');
                this.portfolio = this.createEmptyPortfolio();
                await this.savePortfolio();
                console.log('✅ New portfolio created');
            }
        } catch (error) {
            console.error('❌ Failed to load portfolio:', error);
            console.error('Error details:', error);
            this.portfolio = this.createEmptyPortfolio();
        }
    }

    // Load transactions from S3
    async loadTransactions() {
        try {
            const transactionsKey = this.awsServices.getUserTransactionsKey(this.userId);
            const transactionsData = await this.awsServices.getObject(transactionsKey);
            
            this.transactions = transactionsData || [];
        } catch (error) {
            console.error('Failed to load transactions:', error);
            this.transactions = [];
        }
    }

    // Save portfolio to S3
    async savePortfolio() {
        try {
            this.portfolio.updatedAt = new Date().toISOString();
            const portfolioKey = this.awsServices.getUserPortfolioKey(this.userId);
            await this.awsServices.putObject(portfolioKey, this.portfolio);
        } catch (error) {
            console.error('Failed to save portfolio:', error);
            throw error;
        }
    }

    // Save transactions to S3
    async saveTransactions() {
        try {
            const transactionsKey = this.awsServices.getUserTransactionsKey(this.userId);
            await this.awsServices.putObject(transactionsKey, this.transactions);
        } catch (error) {
            console.error('Failed to save transactions:', error);
            throw error;
        }
    }

    // Add bond to portfolio (buy transaction)
    async buyStock(symbol, name, shares, price, date = null) {
        try {
            const transaction = this.createTransaction('buy', symbol, shares, price, date);
            
            // Add transaction
            this.transactions.push(transaction);
            
            // Update portfolio holdings
            if (this.portfolio.holdings[symbol]) {
                // Update existing holding
                const holding = this.portfolio.holdings[symbol];
                const totalShares = holding.shares + shares;
                const totalCost = (holding.shares * holding.avgCost) + (shares * price);
                const newAvgCost = totalCost / totalShares;
                
                this.portfolio.holdings[symbol] = this.createBondHolding(
                    totalShares,
                    newAvgCost,
                    holding.purchaseDate
                );
            } else {
                // Create new holding
                this.portfolio.holdings[symbol] = this.createBondHolding(shares, price, date);
            }
            
            // Save changes
            await this.saveTransactions();
            await this.savePortfolio();
            
            return transaction;
        } catch (error) {
            console.error('Failed to buy stock:', error);
            throw error;
        }
    }

    // Remove bond from portfolio (sell transaction)
    async sellStock(symbol, shares, price, date = null) {
        try {
            if (!this.portfolio.holdings[symbol]) {
                throw new Error(`No holdings found for ${symbol}`);
            }
            
            const holding = this.portfolio.holdings[symbol];
            if (holding.shares < shares) {
                throw new Error(`Insufficient shares. You own ${holding.shares} shares of ${symbol}`);
            }
            
            const transaction = this.createTransaction('sell', symbol, shares, price, date);
            
            // Add transaction
            this.transactions.push(transaction);
            
            // Update portfolio holdings
            const remainingShares = holding.shares - shares;
            if (remainingShares > 0) {
                // Update existing holding
                this.portfolio.holdings[symbol] = this.createBondHolding(
                    remainingShares,
                    holding.avgCost,
                    holding.purchaseDate
                );
            } else {
                // Remove holding completely
                delete this.portfolio.holdings[symbol];
            }
            
            // Save changes
            await this.saveTransactions();
            await this.savePortfolio();
            
            return transaction;
        } catch (error) {
            console.error('Failed to sell stock:', error);
            throw error;
        }
    }

    // Update bond prices - no longer saves calculated values to portfolio
    async updateStockPrices(priceUpdates) {
        // This method is kept for compatibility but doesn't save calculated values
        // Values are calculated dynamically when needed
        console.log('Bond prices updated:', priceUpdates);
    }

    // Add stock to watchlist
    async addToWatchlist(symbol, name) {
        if (!this.portfolio.watchlist.some(item => item.symbol === symbol)) {
            this.portfolio.watchlist.push({
                symbol: symbol.toUpperCase(),
                name: name,
                addedAt: new Date().toISOString()
            });
            await this.savePortfolio();
        }
    }

    // Remove stock from watchlist
    async removeFromWatchlist(symbol) {
        this.portfolio.watchlist = this.portfolio.watchlist.filter(
            item => item.symbol !== symbol.toUpperCase()
        );
        await this.savePortfolio();
    }

    // Get portfolio summary with dynamic calculation
    getPortfolioSummary(currentBondPrice = null) {
        let totalValue = 0;
        let totalCost = 0;
        
        for (const holding of Object.values(this.portfolio.holdings)) {
            const cost = holding.shares * holding.avgCost;
            totalCost += cost;
            
            if (currentBondPrice) {
                totalValue += holding.shares * currentBondPrice;
            } else {
                totalValue += cost; // Fallback to cost if no current price
            }
        }
        
        const totalGainLoss = totalValue - totalCost;
        const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
        
        return {
            totalValue: parseFloat(totalValue.toFixed(2)),
            totalCost: parseFloat(totalCost.toFixed(2)),
            totalGainLoss: parseFloat(totalGainLoss.toFixed(2)),
            totalGainLossPercent: parseFloat(totalGainLossPercent.toFixed(2)),
            holdingsCount: Object.keys(this.portfolio.holdings).length,
            watchlistCount: this.portfolio.watchlist.length
        };
    }

    // Get holdings array with dynamic calculation
    getHoldingsArray(currentBondPrice = null) {
        return Object.entries(this.portfolio.holdings).map(([symbol, holding]) => {
            // Provide default symbol and name for display
            const displaySymbol = symbol || 'BOND';
            const displayName = '企业债券基金';
            
            if (currentBondPrice) {
                return this.calculateHoldingValues(holding, currentBondPrice, displaySymbol, displayName);
            } else {
                // Return basic holding info if no current price
                return {
                    symbol: displaySymbol,
                    name: displayName,
                    shares: holding.shares,
                    avgCost: holding.avgCost,
                    purchaseDate: holding.purchaseDate,
                    currentPrice: null,
                    totalCost: holding.shares * holding.avgCost,
                    currentValue: holding.shares * holding.avgCost,
                    gainLoss: 0,
                    gainLossPercent: 0
                };
            }
        }).sort((a, b) => b.currentValue - a.currentValue);
    }

    // Get transactions array
    getTransactionsArray(limit = null) {
        const sorted = this.transactions.sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        return limit ? sorted.slice(0, limit) : sorted;
    }

    // Get transactions for specific symbol
    getTransactionsBySymbol(symbol) {
        return this.transactions.filter(t => t.symbol === symbol.toUpperCase())
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // Update portfolio settings
    async updateSettings(settings) {
        this.portfolio.settings = { ...this.portfolio.settings, ...settings };
        await this.savePortfolio();
    }

    // Export portfolio data
    exportPortfolioData() {
        return {
            portfolio: this.portfolio,
            transactions: this.transactions,
            exportedAt: new Date().toISOString()
        };
    }

    // Get portfolio performance metrics
    getPerformanceMetrics(currentBondPrice = null) {
        const holdings = this.getHoldingsArray(currentBondPrice);
        const summary = this.getPortfolioSummary(currentBondPrice);
        
        return {
            totalValue: summary.totalValue,
            totalCost: summary.totalCost,
            totalGainLoss: summary.totalGainLoss,
            totalGainLossPercent: summary.totalGainLossPercent,
            topPerformers: holdings.slice(0, 5).map(h => ({
                symbol: h.symbol,
                gainLossPercent: h.gainLossPercent
            })),
            worstPerformers: holdings.sort((a, b) =>
                a.gainLossPercent - b.gainLossPercent
            ).slice(0, 5).map(h => ({
                symbol: h.symbol,
                gainLossPercent: h.gainLossPercent
            }))
        };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PortfolioManager;
} else if (typeof window !== 'undefined') {
    window.PortfolioManager = PortfolioManager;
}