from fastapi import APIRouter, UploadFile, File, Form
from model import single_chart_model 
from model import multi_chart_model 
import json

from typing import List

router = APIRouter

@router.post("/single_chart_analysis")
async def analyze(
    image: UploadFile = File(...),
    description: str = Form(...)
):

    image_bytes = await image.read()

    results = single_chart_model(image_bytes,description)

    return results

@router.post("/multi_chart_analysis")
async def analyze(
    image: List[UploadFile] = File(...),
    timeframes: str = Form(...),
    description: str = Form(...)
):

    timeframe_list = json.loads(timeframes)

    charts = []

    for image, timeframe in zip(image, timeframe_list):

        image_bytes = await image.read()

        charts.append({
            "image": image_bytes,
            "timeframe": timeframe
        })

    results = await multi_chart_model(charts,description)

    return results

