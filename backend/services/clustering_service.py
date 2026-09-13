import joblib
import pandas as pd

model = None
scaler = None
features_list = None

def load_models():
    global model, scaler, features_list
    model = joblib.load('models/spending_clustering/kmeans_model.joblib')
    scaler = joblib.load('models/spending_clustering/scaler.joblib')
    features_list = joblib.load('models/spending_clustering/cluster_features.joblib')

def predict(data_dict: dict) -> dict:
    df = pd.DataFrame([data_dict])[features_list]
    
    scaled = scaler.transform(df)
    prediction = model.predict(scaled)
    
    return {"cluster": int(prediction[0])}
