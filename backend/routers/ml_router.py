"""
ml_router.py — FastAPI endpoints for user ML processing.

Endpoints:
  POST /ml/process  → Run ML models on authenticated user's transactions (Classification, Anomaly, Cluster, Forecast)
  GET  /ml/profile  → Retrieve persistent ML profile (Cluster, Forecast) for authenticated user
"""

import os
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from supabase import create_client, Client

from services import ml_service
from routers.import_router import get_current_user_id

router = APIRouter(prefix="/ml", tags=["Machine Learning"])


def _get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


class ProcessMlRequest(BaseModel):
    force: bool = False


@router.post("/process")
async def process_ml(
    request: Optional[ProcessMlRequest] = None,
    user_id: str = Depends(get_current_user_id),
    authorization: Optional[str] = Header(None),
):
    """
    Run ML models on the authenticated user's stored Supabase transactions.
    - Classifies unclassified transactions (with confidence)
    - Detects anomalies using personalized user spending stats
    - Computes user spending behavior cluster (KMeans)
    - Generates user next expense forecast (HistGradientBoosting)
    - Persists results to transactions and user_ml_profiles
    """
    token = authorization.split("Bearer ")[1].strip() if authorization else None
    force_recompute = request.force if request else False

    try:
        summary = ml_service.process_user_transactions(
            user_id=user_id,
            force_recompute=force_recompute,
            token=token,
        )
        return summary
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process ML for user transactions: {str(e)}"
        )


@router.get("/profile")
async def get_user_ml_profile(
    user_id: str = Depends(get_current_user_id),
    authorization: Optional[str] = Header(None),
):
    """
    Retrieve the authenticated user's persistent ML profile
    (spending cluster, cluster description, and latest expense forecast).
    """
    token = authorization.split("Bearer ")[1].strip() if authorization else None
    try:
        client = _get_supabase()
        res = (
            client
            .from_("user_ml_profiles")
            .select("*")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if res and res.data:
            return {"profile": res.data}

        # If profile doesn't exist yet, compute it now
        profile = ml_service.update_user_ml_profile(user_id=user_id, token=token)
        return {"profile": profile}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve user ML profile: {str(e)}"
        )


@router.get("/forecast")
async def get_user_forecast(
    user_id: str = Depends(get_current_user_id),
    authorization: Optional[str] = Header(None),
):
    """
    Retrieve Stage A Hybrid Forecast & Stage B Groq Financial Reasoning for the authenticated user.
    Uses authenticated user's debit transactions from Supabase.
    Returns calibrated ML prediction, statistical baseline, reliability rating,
    confidence score (0-100), trend, confirmed vs possible recurring signals, and AI reasoning.
    """
    token = authorization.split("Bearer ")[1].strip() if authorization else None
    try:
        from services import forecast_service
        forecast_data = forecast_service.get_user_hybrid_forecast(user_id=user_id, token=token)
        return {"forecast": forecast_data}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate expense forecast: {str(e)}"
        )


@router.get("/forecast/reasoning")
async def get_user_forecast_reasoning(
    user_id: str = Depends(get_current_user_id),
    authorization: Optional[str] = Header(None),
):
    """
    Retrieve specifically the Stage B Groq AI Financial Reasoning for the authenticated user.
    """
    token = authorization.split("Bearer ")[1].strip() if authorization else None
    try:
        from services import forecast_service
        forecast_data = forecast_service.get_user_hybrid_forecast(user_id=user_id, token=token)
        return {
            "ai_reasoning": forecast_data.get("ai_reasoning", {}),
            "forecast_summary": {
                "ml_prediction": forecast_data.get("ml_prediction"),
                "statistical_baseline": forecast_data.get("statistical_baseline"),
                "fallback_prediction": forecast_data.get("fallback_prediction"),
                "reliability": forecast_data.get("reliability"),
                "confidence": forecast_data.get("confidence"),
                "trend": forecast_data.get("trend"),
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate forecast reasoning: {str(e)}"
        )

