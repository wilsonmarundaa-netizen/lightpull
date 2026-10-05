const express = require("express");
const router = express.Router();
const { single_auto_query, multi_auto_query, noSetupsMessage } = require("../models/agents");
const { selected_markets: get_selected_markets, list_markets } = require("../models/marketdata");

const isImageDataUrl = (value) => typeof value === "string" && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);

router.get("/api/market_symbols", async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : "Stocks";
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    try {
        return res.json(await list_markets(category, query, offset));
    } catch (error) {
        console.error("Alpha Vantage symbol list failed", error);
        return res.status(502).json({ message: error.message?.startsWith("Alpha Vantage")
            ? error.message
            : "Market search could not be completed." });
    }
});

router.post("/api/single_scanner", async (req, res) => {
    const { set_markets, setupName, setupDescription, setupImage, timeframe, session = "Any" } = req.body;
    if (!setupName?.trim() || !setupDescription?.trim() || !timeframe || !isImageDataUrl(setupImage) || !Array.isArray(set_markets) || !set_markets.length) {
        return res.status(400).json({ message: "Add setup details, a reference image, a timeframe, and at least one market." });
    }
    try {
        const marketData = await get_selected_markets(set_markets, timeframe);
        const analysis = await single_auto_query({ setupName, setupDescription, setupImage, timeframe, pairNames: set_markets, marketData, session });
        return res.json({ analysis, noSetups: analysis === noSetupsMessage });
    } catch (error) {
        console.error("Single market scan failed", error);
        const message = error.message?.startsWith("Alpha Vantage") || error.message?.startsWith("Hugging Face")
            ? error.message
            : "The live market scan could not be completed. Check the backend logs for details.";
        return res.status(502).json({ message });
    }
});

router.post("/api/multi_scanner", async (req, res) => {
    const { set_markets, setupName, higherTimeframeDescription, higherTimeframeImage, primaryTimeframeDescription,
        primaryTimeframeImage, lowerTimeframeDescription, lowerTimeframeImage, higherTimeframe = "1D",
        primaryTimeframe = "1D", lowerTimeframe = "1D", session = "Any" } = req.body;
    const images = [higherTimeframeImage, primaryTimeframeImage, lowerTimeframeImage];
    if (!setupName?.trim() || !Array.isArray(set_markets) || !set_markets.length ||
        ![higherTimeframeDescription, primaryTimeframeDescription, lowerTimeframeDescription].every((value) => value?.trim()) ||
        !images.every(isImageDataUrl)) {
        return res.status(400).json({ message: "Complete each timeframe description and image, then select at least one market." });
    }
    try {
        const marketData = await get_selected_markets(set_markets, { higher: higherTimeframe, primary: primaryTimeframe, lower: lowerTimeframe });
        const analysis = await multi_auto_query({ marketData, setupName, pairNames: set_markets, higherTimeframeDescription, higherTimeframeImage,
            primaryTimeframeDescription, primaryTimeframeImage, lowerTimeframeDescription, lowerTimeframeImage, session });
        return res.json({ analysis, noSetups: analysis === noSetupsMessage });
    } catch (error) {
        console.error("Multi-timeframe market scan failed", error);
        const message = error.message?.startsWith("Alpha Vantage") || error.message?.startsWith("Hugging Face")
            ? error.message
            : "The live market scan could not be completed.";
        return res.status(502).json({ message });
    }
});

module.exports = router;