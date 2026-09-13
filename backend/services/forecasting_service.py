import joblib
import pandas as pd

model = None
features_list = None

def load_models():
    global model, features_list
    model = joblib.load('models/expense_forecasting/forecast_model.joblib')
    features_list = joblib.load('models/expense_forecasting/forecast_features.joblib')

def predict(data_dict: dict) -> dict:
    df = pd.DataFrame([data_dict])[features_list]
    prediction = model.predict(df)
    
    return {"forecasted_amount": float(prediction[0])}
