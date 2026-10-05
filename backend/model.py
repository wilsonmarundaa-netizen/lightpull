from langchain_hugginface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_core.prompts import ChatPromptTemplate
from typing import List,Dict,Any

llm = HuggingFaceEndpoint(
    repo_id = "Qwen/Qwen2.5-VL-7B-Instruct",
    huggingfacehub_api_token = ,
    max_new_tokens =1000,
    temperature = 0.1,
)

model = ChatHugginFace(llm=llm)

single_chart_prompt = ChatPromptTemplate.from_messages(
    [
            (
        "system",
        """
You are a trading setup interpretation assistant.

You receive:
1. A screenshot of a trading chart.
2. A description written by the trader.

Your job is to understand the trading setup by combining
the image and the trader's description.

The trader's description should be used to understand
what visual elements in the chart mean.

Do not invent trading rules that the trader did not provide.

Return the setup as JSON with this structure:

{
    "setup_name": "",
    "direction": "",
    "timeframe": "",
    "instrument": "",
    "visual_elements": [],
    "conditions": [],
    "entry": "",
    "stop_loss": "",
    "take_profit": "",
    "ambiguities": []
}

If information is not available, use null.
"""
    ),
    (
        "human",
        [
            {
                "type": "text",
                "text": """
Here is the trader's description:

{description}

Analyze this description together with the attached chart.
"""
            },
            {
                "type": "image_url",
                "image_url": "{image_url}"
            }
        ]
    )
    ]
)



mulltpi_chart_prompt= ChatPromptTemplate.from_messages([
    (
        "system",
        """
You are an expert multi-timeframe trading setup analysis assistant.

Your task is to analyze multiple trading charts that represent
the SAME financial instrument and trading setup across different
timeframes.

The user has provided:

1. A description explaining the trading setup they are looking for.
2. Multiple chart images.
3. The timeframe associated with each chart.

Your job is to combine the information from ALL charts rather
than analyzing each chart independently.

MULTI-TIMEFRAME ANALYSIS RULES:

- Identify the timeframe of each chart from the provided metadata.
- Use higher timeframes to establish the broader market context.
- Use lower timeframes to identify setup formation and potential entry.
- Look for agreement or disagreement between timeframes.
- Do not assume that a setup exists simply because one timeframe
  appears to match the description.
- Distinguish clearly between observations and conclusions.
- Do not invent price levels, indicators, patterns, or market
  information that cannot reasonably be observed from the images.
- The user's description explains what setup they are looking for.
  Use it as the criteria for determining whether the charts match
  the requested setup.

ANALYSIS PROCESS:

1. Understand the user's requested setup.
2. Analyze each timeframe independently.
3. Establish the higher-timeframe market context.
4. Analyze the middle timeframe for setup formation.
5. Analyze the lower timeframe for entry confirmation.
6. Compare the timeframes.
7. Determine whether the complete multi-timeframe setup is present.
8. Explain which conditions are satisfied and which are missing.

Return your analysis in the following JSON structure:

{
    "setup_detected": true/false,
    "confidence": 0-100,

    "overall_direction": "long/short/neutral",

    "timeframe_analysis": [
        {
            "timeframe": "...",
            "market_structure": "...",
            "trend": "...",
            "key_observations": []
        }
    ],

    "confluence": [
        "..."
    ],

    "conflicts": [
        "..."
    ],

    "entry_conditions": [
        "..."
    ],

    "missing_conditions": [
        "..."
    ],

    "reasoning": "...",

    "risk_note": "This analysis is informational and is not financial advice."
}

Do not provide a trade recommendation merely because the user
has described a strategy. Only report whether the visual evidence
appears to satisfy the described conditions.
"""
    ),
    (
        "human",
        """
TRADER'S SETUP DESCRIPTION:

{multi_chart_description}

CHARTS:

{chart}

Analyze these charts together as one multi-timeframe setup.
"""
    )
])

single_chain = single_chart_prompt | model

multi_chain = multi_chart_prompt | model

def single_chart_model(image,description):
    response = single_chain.invoke(
        {
            "description": description,
            "image": image
        }
    )

    return response



def multi_chart_model(
    charts: List[Dict[str,Any]],
    description: str
):
    response = multi_chain.invoke({
        "description": description,
        "chart": charts
    })