const alphaVantageUrl = "https://www.alphavantage.co/query";
const intervalMap = { "1D": "daily", "1W": "weekly" };
const { parse } = require("csv-parse/sync");
const listingCacheDuration = 24 * 60 * 60 * 1000;
let activeListingCache;
let activeListingRequest;
let currencyCatalogCache;

const apiKey = () => process.env.ALPHA_VANTAGE || process.env.ALPHA_VANTAGE_API_KEY;

const parseCurrencyList = async (url) => {
    const response = await fetch(url);
    const csv = await response.text();
    if (!response.ok || csv.trimStart().startsWith("{")) {
        throw new Error("Alpha Vantage currency catalog could not be loaded.");
    }
    return parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true })
        .map((item) => {
            const entries = Object.entries(item);
            const code = entries.find(([key]) => /currency code/i.test(key))?.[1] || entries[0]?.[1];
            const name = entries.find(([key]) => /currency name/i.test(key))?.[1] || entries[1]?.[1];
            return { code, name };
        })
        .filter((item) => item.code && item.name);
};

const candleValue = (candle, index, label) => {
    const pattern = new RegExp(`^${index}[a-z]?\\.\\s*${label}`, "i");
    return Object.entries(candle).find(([key]) => pattern.test(key))?.[1] ?? null;
};

const liveData = async (symbol, timeframe) => {
    const key = apiKey();
    if (!key) throw new Error("Alpha Vantage API key is missing. Set ALPHA_VANTAGE in backend/.env.");

    const interval = intervalMap[timeframe] || intervalMap["1D"];
    const params = new URLSearchParams({ apikey: key });
    let seriesKey;

    if (symbol.includes("/")) {
        const [fromSymbol, toSymbol] = symbol.split("/");
        const cryptoSymbols = new Set((await get_currency_catalog()).crypto.map((item) => item.code));
        if (cryptoSymbols.has(fromSymbol)) {
            params.set("function", interval === "weekly" ? "DIGITAL_CURRENCY_WEEKLY" : "DIGITAL_CURRENCY_DAILY");
            params.set("symbol", fromSymbol);
            params.set("market", toSymbol);
            seriesKey = `Time Series (Digital Currency ${interval === "weekly" ? "Weekly" : "Daily"})`;
        } else {
            params.set("function", interval === "weekly" ? "FX_WEEKLY" : "FX_DAILY");
            params.set("from_symbol", fromSymbol);
            params.set("to_symbol", toSymbol);
            seriesKey = `Time Series FX (${interval === "weekly" ? "Weekly" : "Daily"})`;
        }
    } else {
        if (!/^[A-Za-z0-9.^_-]+$/.test(symbol)) throw new Error(`Invalid Alpha Vantage stock symbol: ${symbol}.`);
        params.set("function", interval === "weekly" ? "TIME_SERIES_WEEKLY" : "TIME_SERIES_DAILY");
        params.set("symbol", symbol);
        if (interval === "daily") params.set("outputsize", "compact");
        seriesKey = interval === "weekly" ? "Weekly Time Series" : "Time Series (Daily)";
    }

    const response = await fetch(`${alphaVantageUrl}?${params}`);
    const data = await response.json();
    const series = data[seriesKey];
    if (!response.ok || !series || typeof series !== "object") {
        const detail = data.Note || data.Information || data["Error Message"];
        throw new Error(`Alpha Vantage could not return ${symbol} data${detail ? `: ${detail}` : "."}`);
    }

    const values = Object.entries(series).slice(0, 100).map(([datetime, candle]) => ({
        datetime,
        open: candleValue(candle, 1, "open"),
        high: candleValue(candle, 2, "high"),
        low: candleValue(candle, 3, "low"),
        close: candleValue(candle, 4, "close"),
        volume: candleValue(candle, 5, "volume")
    }));
    if (!values.length || values.some((candle) => !candle.open || !candle.high || !candle.low || !candle.close)) {
        throw new Error(`Alpha Vantage returned an incomplete OHLC series for ${symbol}.`);
    }

    return { symbol, interval, values, status: "ok", source: "Alpha Vantage" };
};

const get_active_listings = async () => {
    const key = apiKey();
    if (!key) throw new Error("Alpha Vantage API key is missing. Set ALPHA_VANTAGE in backend/.env.");

    if (activeListingCache && Date.now() - activeListingCache.fetchedAt < listingCacheDuration) {
        return activeListingCache.symbols;
    }

    if (!activeListingRequest) {
        activeListingRequest = (async () => {
            const params = new URLSearchParams({ function: "LISTING_STATUS", state: "active", apikey: key });
            const response = await fetch(`${alphaVantageUrl}?${params}`);
            const csv = await response.text();
            if (!response.ok || csv.trimStart().startsWith("{")) {
                let detail = "";
                try {
                    const data = JSON.parse(csv);
                    detail = data.Note || data.Information || data["Error Message"] || "";
                } catch {
                    detail = "";
                }
                throw new Error(`Alpha Vantage active-symbol list could not be loaded${detail ? `: ${detail}` : "."}`);
            }

            const symbols = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true })
                .filter((item) => item.symbol && item.status?.toLowerCase() === "active")
                .map((item) => ({
                    symbol: item.symbol,
                    name: item.name,
                    exchange: item.exchange,
                    type: item.assetType
                }))
                .sort((left, right) => left.symbol.localeCompare(right.symbol));
            if (!symbols.length) throw new Error("Alpha Vantage returned an empty active-symbol list.");
            activeListingCache = { fetchedAt: Date.now(), symbols };
            return symbols;
        })().finally(() => {
            activeListingRequest = null;
        });
    }

    return activeListingRequest;
};

const get_currency_catalog = async () => {
    if (currencyCatalogCache && Date.now() - currencyCatalogCache.fetchedAt < listingCacheDuration) {
        return currencyCatalogCache.catalog;
    }
    const [forex, crypto] = await Promise.all([
        parseCurrencyList("https://www.alphavantage.co/physical_currency_list/"),
        parseCurrencyList("https://www.alphavantage.co/cryptocurrency_list/")
    ]);
    const catalog = { forex, crypto };
    currencyCatalogCache = { fetchedAt: Date.now(), catalog };
    return catalog;
};

const get_market_categories = async () => {
    const [listings, currencies] = await Promise.all([get_active_listings(), get_currency_catalog()]);
    return {
        Stocks: listings.filter((item) => item.type.toLowerCase() === "stock"),
        ETFs: listings.filter((item) => item.type.toLowerCase() === "etf"),
        Forex: currencies.forex
            .filter((item) => item.code.toUpperCase() !== "USD")
            .map((item) => ({ symbol: `${item.code}/USD`, name: `${item.name} / US Dollar`, exchange: "FX", type: "Forex" })),
        Crypto: currencies.crypto
            .filter((item) => item.code.toUpperCase() !== "USD")
            .map((item) => ({ symbol: `${item.code}/USD`, name: `${item.name} / US Dollar`, exchange: "Digital Currency", type: "Crypto" }))
    };
};

const list_markets = async (category = "Stocks", query = "", offset = 0, limit = 50) => {
    const categories = await get_market_categories();
    const symbols = categories[category] || [];
    const normalizedQuery = query.trim().toLowerCase();
    const matches = normalizedQuery
        ? symbols.filter((item) => item.symbol.toLowerCase().includes(normalizedQuery) || item.name.toLowerCase().includes(normalizedQuery))
        : symbols;
    return { categories: Object.keys(categories), results: matches.slice(offset, offset + limit), total: matches.length };
};

const selected_markets = async (markets, interval) => {
    if (interval && typeof interval === "object") {
        const results = [];
        for (const symbol of markets) {
            const timeframes = {};
            for (const [key, value] of Object.entries(interval)) timeframes[key] = await liveData(symbol, value);
            results.push({ symbol, timeframes });
        }
        return results;
    }
    const results = [];
    for (const market of markets) results.push(await liveData(market, interval));
    return results;
};

module.exports = {
    selected_markets,
    list_markets
};