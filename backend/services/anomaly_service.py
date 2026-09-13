import joblib
import pandas as pd

model = None
imputer = None
scaler = None
features_list = None

def load_models():
    global model, imputer, scaler, features_list
    model = joblib.load('models/anomaly_detection/anomaly_detector.joblib')
    imputer = joblib.load('models/anomaly_detection/anomaly_imputer.joblib')
    scaler = joblib.load('models/anomaly_detection/anomaly_scaler.joblib')
    features_list = joblib.load('models/anomaly_detection/anomaly_features.joblib')

def predict(data_dict: dict) -> dict:
    # Convert input to DataFrame matching exactly the expected features
    df = pd.DataFrame([data_dict])[features_list]
    
    # Preprocess with imputer and scaler
    imputed = imputer.transform(df)
    scaled = scaler.transform(imputed)
    
    # Predict anomaly (1 = anomaly, 0 = normal or similar depending on IsolationForest)
    prediction = model.predict(scaled)
    # IsolationForest outputs -1 for outliers and 1 for inliers. Let's map it to a boolean "is_anomaly"
    is_anomaly = bool(prediction[0] == -1)
    
    return {"is_anomaly": is_anomaly}
