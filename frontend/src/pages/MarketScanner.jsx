import { useEffect, useState } from "react";
import "./MarketScanner.css";

const apiBase = "https://lightpull-p3dl.onrender.com";
const singleTimeframes = ["1D", "1W"];
const multiTimeframes = ["1D", "1W"];
const sessions = ["Any", "London", "New York", "Tokyo", "Sydney"];
const multiChartKeys = ["higher", "primary", "lower"];
const multiChartLabels = { higher: "Higher", primary: "Primary", lower: "Lower" };

const imageToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
});

const asResultCards = (analysis, selectedMarkets) => {
    if (Array.isArray(analysis)) return analysis;
    if (analysis && typeof analysis === "object") {
        if (Array.isArray(analysis.results)) return analysis.results;
        return Object.entries(analysis).map(([symbol, result]) => ({ symbol, ...result }));
    }
    if (typeof analysis !== "string") return [];

    const jsonText = analysis.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
        const parsed = JSON.parse(jsonText);
        return asResultCards(parsed, selectedMarkets);
    } catch {
        return [{ symbol: selectedMarkets.join(", "), analysis }];
    }
};

const MarketScanner = () => {
    const [selectedMarkets, setSelectedMarkets] = useState([]);
    const [marketQuery, setMarketQuery] = useState("");
    const [marketMatches, setMarketMatches] = useState([]);
    const [marketCategories, setMarketCategories] = useState([]);
    const [marketCategory, setMarketCategory] = useState("Stocks");
    const [hasSearchedMarkets, setHasSearchedMarkets] = useState(false);
    const [searchingMarkets, setSearchingMarkets] = useState(false);
    const [loadingMarkets, setLoadingMarkets] = useState(true);
    const [marketOffset, setMarketOffset] = useState(0);
    const [marketTotal, setMarketTotal] = useState(0);
    const [multiTimeframe, setMultiTimeframe] = useState(false);
    const [setupName, setSetupName] = useState("");
    const [setupDescription, setSetupDescription] = useState("");
    const [singleImage, setSingleImage] = useState(null);
    const [multiCharts, setMultiCharts] = useState({ higher: null, primary: null, lower: null });
    const [timeframe, setTimeframe] = useState("1D");
    const [timeframes, setTimeframes] = useState({ higher: "1W", primary: "1D", lower: "1D" });
    const [session, setSession] = useState("Any");
    const [analysis, setAnalysis] = useState(null);
    const [noSetups, setNoSetups] = useState(false);
    const [error, setError] = useState("");
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch(`${apiBase}/api/market_symbols?category=Stocks`)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Could not load Alpha Vantage symbols.");
                return data;
            })
            .then((data) => {
                if (!cancelled) {
                    setMarketMatches(data.results || []);
                    setMarketCategories(data.categories || []);
                    setMarketTotal(data.total || 0);
                    setMarketOffset((data.results || []).length);
                    setHasSearchedMarkets(true);
                }
            })
            .catch((requestError) => {
                if (!cancelled) setError(requestError.message || "Could not load Alpha Vantage symbols.");
            })
            .finally(() => {
                if (!cancelled) setLoadingMarkets(false);
            });
        return () => { cancelled = true; };
    }, []);

    const toggleMarket = (symbol) => {
        setSelectedMarkets((current) => current.includes(symbol)
            ? current.filter((item) => item !== symbol)
            : [...current, symbol]);
        setAnalysis(null);
    };

    const searchMarkets = async () => {
        const query = marketQuery.trim();
        setSearchingMarkets(true);
        setError("");
        try {
            const response = await fetch(`${apiBase}/api/market_symbols?category=${encodeURIComponent(marketCategory)}&q=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not load Alpha Vantage symbols.");
            setMarketMatches(data.results || []);
            setMarketOffset((data.results || []).length);
            setMarketTotal(data.total || 0);
            setHasSearchedMarkets(true);
        } catch (requestError) {
            setError(requestError.message || "Could not load Alpha Vantage symbols.");
        } finally {
            setSearchingMarkets(false);
        }
    };

    const loadMoreMarkets = async () => {
        const nextOffset = marketOffset;
        setSearchingMarkets(true);
        setError("");
        try {
            const response = await fetch(`${apiBase}/api/market_symbols?category=${encodeURIComponent(marketCategory)}&q=${encodeURIComponent(marketQuery.trim())}&offset=${nextOffset}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not load more Alpha Vantage symbols.");
            setMarketMatches((current) => [...current, ...(data.results || [])]);
            setMarketOffset(nextOffset + (data.results || []).length);
            setMarketTotal(data.total || 0);
        } catch (requestError) {
            setError(requestError.message || "Could not load more Alpha Vantage symbols.");
        } finally {
            setSearchingMarkets(false);
        }
    };

    const toggleMarkets = (markets) => {
        const symbols = markets.map((market) => market.symbol);
        const allSelected = symbols.every((symbol) => selectedMarkets.includes(symbol));
        setSelectedMarkets((current) => allSelected
            ? current.filter((symbol) => !symbols.includes(symbol))
            : [...new Set([...current, ...symbols])]);
        setAnalysis(null);
    };

    const changeMarketCategory = async (category) => {
        setMarketCategory(category);
        setMarketQuery("");
        setMarketMatches([]);
        setMarketOffset(0);
        setLoadingMarkets(true);
        setError("");
        try {
            const response = await fetch(`${apiBase}/api/market_symbols?category=${encodeURIComponent(category)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not load this market category.");
            setMarketMatches(data.results || []);
            setMarketTotal(data.total || 0);
            setMarketOffset((data.results || []).length);
            setMarketCategories(data.categories || []);
            setHasSearchedMarkets(true);
        } catch (requestError) {
            setError(requestError.message || "Could not load this market category.");
        } finally {
            setLoadingMarkets(false);
        }
    };

    const setMultiImage = async (key, file) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setError("Choose an image file for each chart.");
            return;
        }
        setError("");
        setMultiCharts((current) => ({ ...current, [key]: file }));
        setAnalysis(null);
    };

    const startScan = async (event) => {
        event.preventDefault();
        setError("");
        if (!setupName.trim() || !setupDescription.trim()) {
            setError("Add a setup name and describe the pattern to scan.");
            return;
        }
        if (!selectedMarkets.length) {
            setError("Select at least one market to scan.");
            return;
        }
        if (multiTimeframe ? multiChartKeys.some((key) => !multiCharts[key]) : !singleImage) {
            setError(multiTimeframe ? "Upload all three timeframe reference charts." : "Upload a reference chart image.");
            return;
        }

        setIsScanning(true);
        setAnalysis(null);
        setNoSetups(false);
        try {
            const endpoint = multiTimeframe ? "multi_scanner" : "single_scanner";
            const body = multiTimeframe
                ? {
                    set_markets: selectedMarkets,
                    setupName: setupName.trim(),
                    higherTimeframe: timeframes.higher,
                    higherTimeframeDescription: descriptions.higher,
                    higherTimeframeImage: await imageToDataUrl(multiCharts.higher),
                    primaryTimeframe: timeframes.primary,
                    primaryTimeframeDescription: descriptions.primary,
                    primaryTimeframeImage: await imageToDataUrl(multiCharts.primary),
                    lowerTimeframe: timeframes.lower,
                    lowerTimeframeDescription: descriptions.lower,
                    lowerTimeframeImage: await imageToDataUrl(multiCharts.lower),
                    session
                }
                : {
                    set_markets: selectedMarkets,
                    setupName: setupName.trim(),
                    setupDescription: setupDescription.trim(),
                    setupImage: await imageToDataUrl(singleImage),
                    timeframe,
                    session
                };
            const response = await fetch(`${apiBase}/api/${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "The scan could not be completed.");
            if (data.message && !data.analysis) throw new Error(data.message);
            setAnalysis(data.analysis);
            setNoSetups(Boolean(data.noSetups));
        } catch (requestError) {
            setError(requestError.message || "The scan could not be completed.");
        } finally {
            setIsScanning(false);
        }
    };

    const descriptions = {
        higher: setupDescription.trim() || "Higher timeframe market context",
        primary: setupDescription.trim() || "Primary timeframe setup",
        lower: setupDescription.trim() || "Lower timeframe confirmation"
    };
    const resultCards = analysis ? asResultCards(analysis, selectedMarkets) : [];
    return (
        <div className="scanner-app">
            <header className="scanner-nav">
                <a href="/" className="scanner-brand">Lightpull</a>
                
            </header>
            <main className="scanner-main">
                <section className="scanner-intro">
                    <p className="scanner-eyebrow">MARKET SETUP SEARCH</p>
                    <h1>Find your setup.</h1>
                    <p className="scanner-subtitle">Scan live market data against your chart rules.</p>
                </section>

                <form className="scanner-layout" onSubmit={startScan}>
                    <section className="scanner-panel setup-panel">
                        <div className="panel-title">
                            <span className="step-number">01</span>
                            <h2>Define setup</h2>
                        </div>
                        <label className="field-label" htmlFor="setup-name">Setup name</label>
                        <input id="setup-name" className="scanner-input" value={setupName} onChange={(event) => setSetupName(event.target.value)} placeholder="e.g. Bull flag breakout" />
                        <label className="field-label" htmlFor="setup-description">Setup criteria</label>
                        <textarea id="setup-description" className="scanner-input setup-description" value={setupDescription} onChange={(event) => setSetupDescription(event.target.value)} placeholder="Describe the price action and conditions to look for..." />

                        {!multiTimeframe ? (
                            <div className="reference-field">
                                <div className="reference-copy"><span>Reference chart</span><small>{singleImage?.name || "PNG or JPG"}</small></div>
                                <label className="file-button">
                                    <input type="file" accept="image/*" onChange={(event) => setSingleImage(event.target.files?.[0] || null)} />
                                    {singleImage ? "Replace image" : "Upload image"}
                                </label>
                            </div>
                        ) : (
                            <div className="multi-reference-list">
                                {multiChartKeys.map((key) => (
                                    <div className="multi-reference" key={key}>
                                        <div className="multi-reference-heading">
                                            <span>{multiChartLabels[key]} timeframe</span>
                                            <select value={timeframes[key]} onChange={(event) => setTimeframes((current) => ({ ...current, [key]: event.target.value }))} aria-label={`${multiChartLabels[key]} timeframe`}>
                                                {multiTimeframes.map((option) => <option key={option} value={option}>{option}</option>)}
                                            </select>
                                        </div>
                                        <label className="file-button multi-file-button">
                                            <input type="file" accept="image/*" onChange={(event) => setMultiImage(key, event.target.files?.[0])} />
                                            {multiCharts[key]?.name || "Choose reference chart"}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mode-row">
                            <label className="scanner-toggle">
                                <input type="checkbox" checked={multiTimeframe} onChange={(event) => { setMultiTimeframe(event.target.checked); setAnalysis(null); setError(""); }} />
                                <span className="toggle-ui"><i /></span>
                                <span>Multi-timeframe scan</span>
                            </label>
                            {!multiTimeframe && (
                                <label className="inline-select-label">Timeframe
                                    <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
                                        {singleTimeframes.map((option) => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                </label>
                            )}
                        </div>
                    </section>

                    <section className="scanner-panel market-panel">
                        <div className="panel-title">
                            <span className="step-number">02</span>
                            <h2>Choose markets</h2>
                            <span className="selected-count">{selectedMarkets.length} selected</span>
                        </div>
                        <div className="market-search">
                            <input aria-label="Filter Alpha Vantage symbols" value={marketQuery} onChange={(event) => setMarketQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchMarkets(); } }} placeholder="Filter active symbols or company names" />
                            <button type="button" onClick={searchMarkets} disabled={searchingMarkets}>{searchingMarkets ? "Searching" : "Search"}</button>
                        </div>
                        <div className="market-categories" role="tablist" aria-label="Market categories">
                            {marketCategories.map((category) => (
                                <button key={category} type="button" role="tab" aria-selected={marketCategory === category} className={marketCategory === category ? "active" : ""} onClick={() => changeMarketCategory(category)}>
                                    {category}
                                </button>
                            ))}
                        </div>
                        {!loadingMarkets && marketMatches.length > 0 && (
                            <button type="button" className="select-all" onClick={() => toggleMarkets(marketMatches)}>
                                {marketMatches.every((market) => selectedMarkets.includes(market.symbol)) ? "Clear visible symbols" : `Select all ${marketMatches.length} shown`}
                            </button>
                        )}
                        {loadingMarkets ? <p className="market-empty">Loading Alpha Vantage symbols...</p> : marketMatches.length > 0 && (
                            <div className="market-search-results" aria-label="Alpha Vantage symbols">
                                {marketMatches.map((match) => (
                                    <label className="market-check-option" key={match.symbol}>
                                        <input type="checkbox" checked={selectedMarkets.includes(match.symbol)} onChange={() => toggleMarket(match.symbol)} />
                                        <span className="market-check" aria-hidden="true" />
                                        <span className="market-check-copy"><strong>{match.symbol}</strong><small>{match.name}{match.exchange ? ` · ${match.exchange}` : ""}</small></span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {!loadingMarkets && marketMatches.length > 0 && <p className="market-empty">Showing {marketMatches.length} of {marketTotal} active symbols.</p>}
                        {!loadingMarkets && marketMatches.length > 0 && marketMatches.length < marketTotal && (
                            <button type="button" className="load-more-markets" onClick={loadMoreMarkets} disabled={searchingMarkets}>
                                {searchingMarkets ? "Loading" : "Load more symbols"}
                            </button>
                        )}
                        {selectedMarkets.length > 0 && (
                            <section className="selected-market-section" aria-label="Selected markets">
                                <p className="selected-market-label">Selected for scan</p>
                                <div className="selected-markets">
                                    {selectedMarkets.map((symbol) => (
                                        <button type="button" key={symbol} onClick={() => toggleMarket(symbol)} aria-label={`Remove ${symbol}`}>
                                            {symbol}<span aria-hidden="true">×</span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}
                        {!loadingMarkets && marketMatches.length === 0 && <p className="market-empty">{hasSearchedMarkets ? "No matching Alpha Vantage symbols." : "Search Alpha Vantage for supported symbols."}</p>}
                        <label className="session-select">Preferred session
                            <select value={session} onChange={(event) => setSession(event.target.value)}>
                                {sessions.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                        </label>
                        <button className="scan-button" type="submit" disabled={isScanning || searchingMarkets}>
                            {isScanning ? <><span className="scan-spinner" /> Scanning live markets</> : <>Scan selected markets <span aria-hidden="true">↗</span></>}
                        </button>
                    </section>
                </form>

                {error && <p className="scanner-error" role="alert">{error}</p>}
                {analysis && (
                    <section className="scanner-results" aria-live="polite">
                        <div className="results-title-row">
                            <div><p className="scanner-eyebrow">LIVE SCAN COMPLETE</p><h2>{noSetups ? "Scan complete" : "Matching setups"}</h2></div>
                            {!noSetups && <span>{resultCards.length} {resultCards.length === 1 ? "result" : "results"}</span>}
                        </div>
                        {noSetups ? <p className="no-setups-message">No setups found. Try again later.</p> : <div className="result-grid">
                            {resultCards.map((result, index) => {
                                const symbol = result.symbol || result.pairName || result["Pair Name"] || result.market || `Result ${index + 1}`;
                                const confidence = result.confidence ?? result.aiConfidence ?? result.confidenceScore ?? result["AI Confidence"];
                                const details = result.analysis || result.description || result.summary || result.assessment || result["Cognitive Structural Assessment"];
                                return (
                                    <article className="scan-result-card" key={`${symbol}-${index}`}>
                                        <header><div><p>{result.pairType || result.marketType || result["Pair Type"] || "MARKET MATCH"}</p><h3>{symbol}</h3></div><strong>{confidence === undefined ? "--" : `${String(confidence).replace(/%$/, "")}%`}<small>confidence</small></strong></header>
                                        <p className="result-analysis">{details || "No structural assessment returned."}</p>
                                        <div className="result-levels">
                                            <div><span>Entry</span><b>{result.entry ?? result.suggestedEntry ?? result["Suggested Entry"] ?? "--"}</b></div>
                                            <div><span>Take profit</span><b>{result.takeProfit ?? result.tp ?? result["Suggested TP"] ?? "--"}</b></div>
                                            <div><span>Stop loss</span><b>{result.stopLoss ?? result.sl ?? result["Suggested SL"] ?? "--"}</b></div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>}
                    </section>
                )}
            </main>
        </div>
    );
};

export default MarketScanner;
