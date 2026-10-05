require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { InferenceClient } = require("@huggingface/inference");
const { MULTI_TIMEFRAME_MARKET_SCAN_PROMPT: multiAutoPrompt } = require("../prompts/multiAutoScanner");
const { SINGLE_TIMEFRAME_MARKET_SCAN_PROMPT: singleAutoPrompt } = require("../prompts/singleAutoScanner");

const normalizeHfToken = (candidate) => candidate?.trim().replace(/^(["'])(.*)\1;?$/s, "$2").trim();
const hfToken = normalizeHfToken(process.env.HF_API_KEY) || normalizeHfToken(process.env.HF_TOKEN);
const hf = new InferenceClient(hfToken);
const model = "Qwen/Qwen3.5-9B";
const noSetupsMessage = "No setups found. Try again later.";

const formatScanResult = (content) => {
    if (typeof content !== "string" || !content.trim()) return noSetupsMessage;

    const response = content.trim();
    const jsonResponse = response.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
    try {
        const parsed = JSON.parse(jsonResponse);
        if (Array.isArray(parsed) && parsed.length === 0) return noSetupsMessage;
        if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.results) && parsed.results.length === 0) return noSetupsMessage;
        if (parsed && parsed.setup_detected === false) return noSetupsMessage;
    } catch {
        if (/^no\s+(?:matching\s+)?setups?\s+(?:were\s+)?found\b/i.test(response)) return noSetupsMessage;
    }

    return content;
};

const singleAuto = ChatPromptTemplate.fromMessages([
    ["human", [
        { type: "text", text: singleAutoPrompt.replace("{setupImage}", "") },
        { type: "image_url", image_url: "{setupImage}" }
    ]]
]);

const multiAuto = ChatPromptTemplate.fromMessages([
    ["human", [
        { type: "text", text: multiAutoPrompt
            .replace("{higherTimeframeImage}", "")
            .replace("{primaryTimeframeImage}", "")
            .replace("{lowerTimeframeImage}", "") },
        { type: "image_url", image_url: "{higherTimeframeImage}" },
        { type: "image_url", image_url: "{primaryTimeframeImage}" },
        { type: "image_url", image_url: "{lowerTimeframeImage}" }
    ]]
]);

const toHuggingFaceMessage = (message) => ({
    role: message._getType() === "human" ? "user" : "assistant",
    content: Array.isArray(message.content)
        ? message.content.map((part) => {
            if (part.type !== "image_url") return part;
            const imageUrl = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
            return { type: "image_url", image_url: { url: imageUrl } };
        })
        : message.content
});

const complete = async (prompt, values) => {
    if (!hfToken) throw new Error("Hugging Face API key is missing. Set HF_API_KEY in backend/.env.");
    const messages = await prompt.formatMessages(values);
    try {
        const response = await hf.chatCompletion({
            model,
            messages: messages.map(toHuggingFaceMessage)
        });
        const result = response.choices?.[0]?.message?.content;
        return formatScanResult(result);
    } catch (error) {
        throw new Error(`Hugging Face inference failed: ${error.message}`);
    }
};

const single_auto_query = (values) => complete(singleAuto, values);
const multi_auto_query = (values) => complete(multiAuto, values);

module.exports = { single_auto_query, multi_auto_query, noSetupsMessage };
