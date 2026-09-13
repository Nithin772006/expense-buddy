"""
recurring_router.py — FastAPI endpoints for Smart Recurring Payment Detector & Reminder System.

Strict Security:
- Extracts authenticated user_id strictly from verified Supabase JWT Bearer token.
- Completely ignores any client-supplied user_id.
- Enforces Row-Level Security (RLS) on all database operations.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from services.supabase_client import get_supabase_client, verify_access_token
from services.recurring_reminder_service import (
    sync_user_recurring_payments,
    manual_mark_paid,
)

router = APIRouter(prefix="/recurring-payments", tags=["Recurring Payments"])


# ── Auth Dependency ──────────────────────────────────────────────────────────

def get_current_auth(authorization: Optional[str] = Header(None)) -> tuple[str, str]:
    """
    Extract Bearer token from Authorization header and verify with Supabase Auth.
    Returns (user_id, token).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Access token required."
        )
    token = authorization.split("Bearer ")[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty access token.")

    try:
        user_info = verify_access_token(token)
        return user_info["id"], token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication error: {str(e)}")


# ── Request Schemas ──────────────────────────────────────────────────────────

class MarkPaidRequest(BaseModel):
    paid_date: str = Field(..., description="Date payment was made in YYYY-MM-DD format")
    actual_amount: float = Field(..., gt=0, description="Actual amount paid in INR")
    notes: Optional[str] = Field(None, description="Optional note for this billing cycle")


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("")
async def get_recurring_payments(auth: tuple[str, str] = Depends(get_current_auth)):
    """
    Fetch all recurring payments and possible patterns for the authenticated user,
    with full summary statistics and current billing cycle status badges.
    """
    user_id, token = auth
    try:
        data = sync_user_recurring_payments(user_id=user_id, token=token)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch recurring payments: {str(e)}")


@router.get("/summary")
async def get_recurring_summary(auth: tuple[str, str] = Depends(get_current_auth)):
    """
    Return high-level summary counts (active count, monthly total, due soon, due today, overdue, paid).
    """
    user_id, token = auth
    try:
        data = sync_user_recurring_payments(user_id=user_id, token=token)
        return data.get("summary", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch recurring summary: {str(e)}")


@router.get("/upcoming")
async def get_upcoming_payments(auth: tuple[str, str] = Depends(get_current_auth)):
    """
    Return active recurring commitments that are UPCOMING or DUE_SOON.
    """
    user_id, token = auth
    try:
        data = sync_user_recurring_payments(user_id=user_id, token=token)
        filtered = [
            p for p in data.get("recurring_payments", [])
            if p.get("current_cycle_status") in ("upcoming", "due_soon")
        ]
        return {"upcoming_payments": filtered}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/due")
async def get_due_payments(auth: tuple[str, str] = Depends(get_current_auth)):
    """
    Return active recurring commitments that are DUE_SOON or DUE_TODAY.
    """
    user_id, token = auth
    try:
        data = sync_user_recurring_payments(user_id=user_id, token=token)
        filtered = [
            p for p in data.get("recurring_payments", [])
            if p.get("current_cycle_status") in ("due_soon", "due_today")
        ]
        return {"due_payments": filtered}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overdue")
async def get_overdue_payments(auth: tuple[str, str] = Depends(get_current_auth)):
    """
    Return active recurring commitments that are OVERDUE or MISSED.
    """
    user_id, token = auth
    try:
        data = sync_user_recurring_payments(user_id=user_id, token=token)
        filtered = [
            p for p in data.get("recurring_payments", [])
            if p.get("current_cycle_status") in ("overdue", "missed")
        ]
        return {"overdue_payments": filtered}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{payment_id}/history")
async def get_payment_cycle_history(
    payment_id: str,
    auth: tuple[str, str] = Depends(get_current_auth),
):
    """
    Return billing cycle instance history for a specific recurring payment.
    Ensures user isolation: returns 404 if record does not belong to authenticated user.
    """
    user_id, token = auth
    client = get_supabase_client(token)

    try:
        # Verify ownership
        rec_resp = (
            client
            .from_("recurring_payments")
            .select("id, merchant, frequency, average_amount")
            .eq("id", payment_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not rec_resp.data:
            raise HTTPException(status_code=404, detail="Recurring payment not found or access denied.")

        instances_resp = (
            client
            .from_("recurring_payment_instances")
            .select("*")
            .eq("recurring_payment_id", payment_id)
            .eq("user_id", user_id)
            .order("expected_date", desc=True)
            .execute()
        )

        return {
            "recurring_payment": rec_resp.data,
            "billing_cycles": instances_resp.data or [],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch payment history: {str(e)}")


@router.post("/detect")
async def trigger_detection(auth: tuple[str, str] = Depends(get_current_auth)):
    """
    Explicitly trigger recurring payment detection and payment status synchronization.
    """
    user_id, token = auth
    try:
        result = sync_user_recurring_payments(user_id=user_id, token=token)
        return {
            "success": True,
            "message": "Recurring payment detection and payment status synchronized successfully.",
            "data": result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.post("/{payment_id}/confirm")
async def confirm_recurring_payment(
    payment_id: str,
    auth: tuple[str, str] = Depends(get_current_auth),
):
    """
    Manually promote a detected pattern or reactivate a recurring payment.
    Does not modify any original bank transactions.
    """
    user_id, token = auth
    client = get_supabase_client(token)

    try:
        resp = (
            client
            .from_("recurring_payments")
            .update({"is_confirmed": True, "status": "active"})
            .eq("id", payment_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Recurring payment not found or access denied.")

        # Re-sync to generate cycle instances
        updated_data = sync_user_recurring_payments(user_id=user_id, token=token)
        return {"success": True, "message": "Recurring payment confirmed successfully.", "data": updated_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{payment_id}/dismiss")
async def dismiss_recurring_payment(
    payment_id: str,
    auth: tuple[str, str] = Depends(get_current_auth),
):
    """
    Dismiss / Cancel a detected recurring payment or pattern.
    """
    user_id, token = auth
    client = get_supabase_client(token)

    try:
        resp = (
            client
            .from_("recurring_payments")
            .update({"status": "cancelled", "is_confirmed": False})
            .eq("id", payment_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Recurring payment not found or access denied.")

        return {"success": True, "message": "Recurring payment dismissed."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{payment_id}/pause")
async def pause_recurring_payment(
    payment_id: str,
    auth: tuple[str, str] = Depends(get_current_auth),
):
    """
    Pause reminder tracking for an active recurring payment.
    """
    user_id, token = auth
    client = get_supabase_client(token)

    try:
        resp = (
            client
            .from_("recurring_payments")
            .update({"status": "paused"})
            .eq("id", payment_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Recurring payment not found or access denied.")

        return {"success": True, "message": "Recurring payment paused."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{payment_id}/resume")
async def resume_recurring_payment(
    payment_id: str,
    auth: tuple[str, str] = Depends(get_current_auth),
):
    """
    Resume reminder tracking for a paused recurring payment.
    """
    user_id, token = auth
    client = get_supabase_client(token)

    try:
        resp = (
            client
            .from_("recurring_payments")
            .update({"status": "active"})
            .eq("id", payment_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Recurring payment not found or access denied.")

        return {"success": True, "message": "Recurring payment resumed."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{payment_id}/mark-paid")
async def mark_payment_as_paid(
    payment_id: str,
    request: MarkPaidRequest,
    auth: tuple[str, str] = Depends(get_current_auth),
):
    """
    Manually mark the recurring payment billing cycle as PAID.
    Stores record as USER-MARKED PAID and advances the next expected payment date.
    Does NOT modify the underlying bank transaction.
    """
    user_id, token = auth

    try:
        result = manual_mark_paid(
            user_id=user_id,
            payment_id=payment_id,
            paid_date=request.paid_date,
            actual_amount=request.actual_amount,
            notes=request.notes,
            token=token,
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark payment as paid: {str(e)}")
