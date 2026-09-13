from pydantic import BaseModel, Field

class ExpenseClassificationRequest(BaseModel):
    description: str = Field(..., description="The transaction description or text to classify")

class AnomalyDetectionRequest(BaseModel):
    transaction_amount: float
    account_balance: float
    credit_score: float
    has_loan: int
    emi_amount: float
    transaction_hour: int
    amount_balance_ratio: float
    emi_balance_ratio: float
    previous_transaction_count: int
    customer_previous_avg_amount: float
    amount_vs_customer_average: float
    customer_amount_std: float
    customer_amount_zscore: float

class ClusteringRequest(BaseModel):
    total_transactions: int
    total_transaction_amount: float
    average_transaction_amount: float
    median_transaction_amount: float
    transaction_amount_std: float
    average_account_balance: float
    average_credit_score: float
    average_transaction_hour: float
    total_emi_amount: float
    debit_ratio: float
    credit_ratio: float
    merchant_category_diversity: int
    channel_diversity: int

class ForecastingRequest(BaseModel):
    lag_1: float
    lag_2: float
    rolling_3_mean: float
    historical_avg_spending: float
    previous_transaction_count: int
    days_since_previous_expense: int
    previous_std: float
    day_of_week: int
    day_of_month: int
