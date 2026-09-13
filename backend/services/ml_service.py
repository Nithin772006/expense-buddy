"""
ml_service.py — Central ML Service for Expense Buddy.

Orchestrates all 4 trained ML models on real user transaction data:
1. Expense Classification (LogisticRegression + TF-IDF)
2. Anomaly Detection (Isolation Forest)
3. Spending Behavior Clustering (KMeans)
4. Expense Forecasting (HistGradientBoostingRegressor)
"""

import logging
from datetime import datetime, timezone
from typing import Optional
import numpy as np

from services import (
    classification_service,
    anomaly_service,
    clustering_service,
    forecasting_service,
)
from services.supabase_client import get_supabase_client

logger = logging.getLogger("expense_buddy.ml")
logging.basicConfig(level=logging.INFO)

CLUSTER_METADATA = {
    0: {
        "label": "Active High Spenders",
        "description": "Frequent transactions with high spending volume.",
    },
    1: {
        "label": "Balanced Customers",
        "description": "Moderate, well-distributed spending patterns.",
    },
    2: {
        "label": "Ultra High-Value Customers",
        "description": "Very large transaction amounts, top-tier customers.",
    },
    3: {
        "label": "Premium High-Value Customers",
        "description": "High-value transactions with premium spending habits.",
    },
    4: {
        "label": "Frequent Essential Spenders",
        "description": "High frequency of small, essential transactions.",
    },
}


# ── 1. Classification Helper ──────────────────────────────────────────────────

def classify_transaction(description: str, existing_category: Optional[str] = None) -> tuple[str, Optional[float]]:
    """
    Classify transaction text into one of the 10 expense categories.
    Preserves existing category if manually set and valid.
    Returns (category, confidence).
    """
    if existing_category and existing_category.strip() and existing_category.strip().lower() != "uncategorized":
        return existing_category, None

    clean_desc = (description or "").strip()
    if not clean_desc:
        return "Miscellaneous", 0.5

    try:
        category, confidence = classification_service.predict_with_confidence(clean_desc)
        return category, confidence
    except Exception as e:
        logger.warning(f"[ML] Classification error for '{clean_desc}': {e}")
        return "Miscellaneous", None


# ── 2. Anomaly Detection Helper ───────────────────────────────────────────────

def detect_transaction_anomaly(tx: dict, user_stats: Optional[dict] = None) -> bool:
    """
    Evaluate a transaction using the Isolation Forest model.
    Derives feature statistics from user's actual historical patterns.
    """
    amount = float(tx.get("amount") or 0.0)
    balance = float(tx.get("account_balance") or 0.0)
    if balance <= 0:
        # Fallback balance heuristic if not supplied
        balance = amount * 5.0 if amount > 0 else 10000.0

    stats = user_stats or {}
    prev_avg = float(stats.get("avg_amount", amount))
    prev_std = float(stats.get("std_amount", amount * 0.1))
    if prev_std <= 0:
        prev_std = max(amount * 0.1, 1.0)
    prev_count = int(stats.get("count", 10))

    zscore = (amount - prev_avg) / prev_std if prev_std > 0 else 0.0
    amount_vs_avg = amount / prev_avg if prev_avg > 0 else 1.0

    # Extract transaction hour if available
    hour = 12
    tx_date_val = tx.get("created_at") or tx.get("transaction_date")
    if tx_date_val:
        try:
            if isinstance(tx_date_val, str) and "T" in tx_date_val:
                dt = datetime.fromisoformat(tx_date_val.replace("Z", "+00:00"))
                hour = dt.hour
        except Exception:
            hour = 12

    anomaly_features = {
        "transaction_amount": amount,
        "account_balance": balance,
        "credit_score": float(tx.get("credit_score") or 700.0),
        "has_loan": int(tx.get("has_loan") or 0),
        "emi_amount": float(tx.get("emi_amount") or 0.0),
        "transaction_hour": hour,
        "amount_balance_ratio": amount / balance if balance > 0 else 0.0,
        "emi_balance_ratio": (float(tx.get("emi_amount") or 0.0) / balance) if balance > 0 else 0.0,
        "previous_transaction_count": max(1, prev_count),
        "customer_previous_avg_amount": prev_avg,
        "amount_vs_customer_average": amount_vs_avg,
        "customer_amount_std": prev_std,
        "customer_amount_zscore": zscore,
    }

    try:
        res = anomaly_service.predict(anomaly_features)
        return bool(res.get("is_anomaly", False))
    except Exception as e:
        logger.warning(f"[ML] Anomaly prediction error: {e}")
        return False


# ── 3. Spending Behavior Clustering Helper ───────────────────────────────────

def compute_user_spending_cluster(transactions: list[dict]) -> Optional[dict]:
    """
    Derive the 13 clustering features from user transactions and predict customer segment.
    """
    if not transactions:
        return None

    n = len(transactions)
    amounts = [float(t.get("amount") or 0.0) for t in transactions]
    total_amount = float(sum(amounts))
    avg_amount = total_amount / n if n > 0 else 0.0
    median_amount = float(np.median(amounts)) if amounts else 0.0
    std_amount = float(np.std(amounts)) if n > 1 else 0.0

    balances = [float(t["account_balance"]) for t in transactions if t.get("account_balance") is not None]
    avg_balance = float(np.mean(balances)) if balances else max(avg_amount * 10.0, 30000.0)

    # Categories & channels diversity
    categories = {t.get("category") for t in transactions if t.get("category")}
    channels = {t.get("payment_method") or t.get("source") for t in transactions if t.get("payment_method") or t.get("source")}
    cat_diversity = max(1, len(categories))
    channel_diversity = max(1, len(channels))

    # Debit vs credit ratio
    debit_count = sum(1 for t in transactions if (t.get("transaction_type") or "debit").lower() == "debit")
    credit_count = sum(1 for t in transactions if (t.get("transaction_type") or "").lower() == "credit")
    debit_ratio = debit_count / n if n > 0 else 1.0
    credit_ratio = credit_count / n if n > 0 else 0.0

    cluster_features = {
        "total_transactions": int(n),
        "total_transaction_amount": round(total_amount, 2),
        "average_transaction_amount": round(avg_amount, 2),
        "median_transaction_amount": round(median_amount, 2),
        "transaction_amount_std": round(std_amount, 2),
        "average_account_balance": round(avg_balance, 2),
        "average_credit_score": 720.0,
        "average_transaction_hour": 14.0,
        "total_emi_amount": 0.0,
        "debit_ratio": round(debit_ratio, 4),
        "credit_ratio": round(credit_ratio, 4),
        "merchant_category_diversity": int(cat_diversity),
        "channel_diversity": int(channel_diversity),
    }

    try:
        cluster_res = clustering_service.predict(cluster_features)
        cluster_id = int(cluster_res["cluster"])
        meta = CLUSTER_METADATA.get(cluster_id, {
            "label": f"Cluster {cluster_id}",
            "description": "Spending pattern segment.",
        })
        logger.info(f"[ML] Spending cluster calculated: cluster {cluster_id} ({meta['label']})")
        return {
            "cluster": cluster_id,
            "cluster_label": meta["label"],
            "cluster_description": meta["description"],
            "features_snapshot": cluster_features,
        }
    except Exception as e:
        logger.error(f"[ML] Failed to compute spending cluster: {e}")
        return None


# ── 4. Expense Forecasting Helper ────────────────────────────────────────────

def compute_user_expense_forecast(transactions: list[dict]) -> dict:
    """
    Generate the Stage A hybrid expense forecast from the user's transactions.
    """
    from services import forecast_service
    return forecast_service.generate_hybrid_forecast_from_transactions(transactions)



# ── 5. Main Process Orchestrator ─────────────────────────────────────────────

def process_user_transactions(
    user_id: str,
    force_recompute: bool = False,
    token: Optional[str] = None,
) -> dict:
    """
    Process authenticated user's transactions:
    1. Fetches user transactions from Supabase.
    2. Runs Classification + Anomaly detection on unclassified/unverified rows.
    3. Batch updates transactions table in Supabase.
    4. Computes spending behavior cluster (KMeans).
    5. Computes expense forecast (HistGradientBoosting).
    6. Persists summary to user_ml_profiles.
    Returns processing metrics.
    """
    logger.info(f"[ML] Processing started for user_id={user_id} (force={force_recompute})")
    client = get_supabase_client(token)

    # 1. Fetch transactions
    response = (
        client
        .from_("transactions")
        .select("*")
        .eq("user_id", user_id)
        .order("transaction_date", desc=False)
        .execute()
    )
    transactions = response.data or []
    total_tx_count = len(transactions)

    if total_tx_count == 0:
        return {
            "processed_transactions": 0,
            "total_transactions": 0,
            "classified": 0,
            "anomalies_detected": 0,
            "cluster": None,
            "cluster_label": None,
            "forecast": {"available": False, "reason": "No transactions found."},
        }


    # Calculate user baseline stats for anomaly detection
    amounts = [float(t.get("amount") or 0.0) for t in transactions]
    user_stats = {
        "avg_amount": float(np.mean(amounts)) if amounts else 0.0,
        "std_amount": float(np.std(amounts)) if len(amounts) > 1 else 0.0,
        "count": total_tx_count,
    }

    # 2. Identify rows needing classification or anomaly detection
    classified_count = 0
    anomalies_detected = 0
    updated_rows = []

    for tx in transactions:
        tx_id = tx["id"]
        category = tx.get("category")
        confidence = tx.get("classification_confidence")
        is_anomaly = tx.get("is_anomaly")

        needs_classification = (
            force_recompute
            or not category
            or category.strip().lower() == "uncategorized"
            or confidence is None
        )
        needs_anomaly = force_recompute or is_anomaly is None

        updates = {}
        if needs_classification:
            new_cat, new_conf = classify_transaction(tx.get("description", ""), category)
            updates["category"] = new_cat
            if new_conf is not None:
                updates["classification_confidence"] = new_conf
            classified_count += 1
        else:
            new_cat = category

        if needs_anomaly:
            anomaly_flag = detect_transaction_anomaly(tx, user_stats)
            updates["is_anomaly"] = anomaly_flag
            # Keep anomaly_score NULL per requirement since existing model produces binary status
            updates["anomaly_score"] = None
            if anomaly_flag:
                anomalies_detected += 1
        elif is_anomaly:
            anomalies_detected += 1

        if updates:
            updates["id"] = tx_id
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            updated_rows.append(updates)

    # 3. Update transaction rows in Supabase
    if updated_rows:
        logger.info(f"[ML] Updating {len(updated_rows)} transaction records in Supabase")
        for chunk_start in range(0, len(updated_rows), 50):
            chunk = updated_rows[chunk_start : chunk_start + 50]
            for row in chunk:
                r_id = row["id"]
                data = {k: v for k, v in row.items() if k != "id"}
                client.from_("transactions").update(data).eq("id", r_id).execute()

    logger.info(f"[ML] Classification completed: {classified_count} transactions")
    logger.info(f"[ML] Anomaly detection completed: {anomalies_detected} anomalies")

    # 4. Compute User-Level Spending Cluster
    cluster_result = compute_user_spending_cluster(transactions)

    # 5. Compute User-Level Forecast
    forecast_result = compute_user_expense_forecast(transactions)

    # 6. Upsert user_ml_profiles
    total_spend = sum(float(t.get("amount") or 0.0) for t in transactions if (t.get("transaction_type") or "debit").lower() == "debit")
    profile_data = {
        "user_id": user_id,
        "total_transactions": total_tx_count,
        "total_spending": round(total_spend, 2),
        "last_processed_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if cluster_result:
        profile_data["cluster"] = cluster_result["cluster"]
        profile_data["cluster_label"] = cluster_result["cluster_label"]
        profile_data["cluster_description"] = cluster_result["cluster_description"]
        profile_data["features_snapshot"] = cluster_result["features_snapshot"]

    if forecast_result:
        profile_data["forecasted_amount"] = forecast_result.get("ml_prediction")
        profile_data["forecast_features"] = forecast_result

    try:
        client.from_("user_ml_profiles").upsert(profile_data).execute()
        logger.info(f"[ML] user_ml_profiles updated for user_id={user_id}")
    except Exception as e:
        logger.error(f"[ML] Error upserting user_ml_profiles: {e}")

    return {
        "processed_transactions": len(updated_rows),
        "total_transactions": total_tx_count,
        "classified": classified_count,
        "anomalies_detected": anomalies_detected,
        "cluster": cluster_result["cluster"] if cluster_result else None,
        "cluster_label": cluster_result["cluster_label"] if cluster_result else None,
        "cluster_description": cluster_result["cluster_description"] if cluster_result else None,
        "forecast": forecast_result,
    }


def update_user_ml_profile(user_id: str, token: Optional[str] = None) -> Optional[dict]:
    """
    Lightweight user profile refresh: re-computes cluster & forecast
    without re-evaluating each individual transaction.
    Ideal for invoking right after a statement import.
    """
    try:
        client = get_supabase_client(token)
        response = (
            client
            .from_("transactions")
            .select("*")
            .eq("user_id", user_id)
            .order("transaction_date", desc=False)
            .execute()
        )
        transactions = response.data or []
        if not transactions:
            return None

        cluster_result = compute_user_spending_cluster(transactions)
        forecast_result = compute_user_expense_forecast(transactions)
        total_spend = sum(float(t.get("amount") or 0.0) for t in transactions if (t.get("transaction_type") or "debit").lower() == "debit")

        profile_data = {
            "user_id": user_id,
            "total_transactions": len(transactions),
            "total_spending": round(total_spend, 2),
            "last_processed_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if cluster_result:
            profile_data["cluster"] = cluster_result["cluster"]
            profile_data["cluster_label"] = cluster_result["cluster_label"]
            profile_data["cluster_description"] = cluster_result["cluster_description"]
            profile_data["features_snapshot"] = cluster_result["features_snapshot"]
        if forecast_result:
            profile_data["forecasted_amount"] = forecast_result.get("ml_prediction")
            profile_data["forecast_features"] = forecast_result

        client.from_("user_ml_profiles").upsert(profile_data).execute()
        return profile_data
    except Exception as e:
        logger.error(f"[ML] update_user_ml_profile failed for {user_id}: {e}")
        return None
