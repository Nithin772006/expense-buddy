import joblib

from services.model_paths import model_path

model = None
vectorizer = None

def load_models():
    global model, vectorizer
    model = joblib.load(model_path("expense_classification", "expense_classifier.joblib"))
    vectorizer = joblib.load(model_path("expense_classification", "tfidf_vectorizer.joblib"))

def predict(description: str) -> str:
    # Vectorize the text description
    features = vectorizer.transform([description])
    # Predict using the classifier
    prediction = model.predict(features)
    return prediction[0]

def predict_with_confidence(description: str) -> tuple[str, float]:
    """
    Predict category and return (category, confidence_probability).
    Uses the trained LogisticRegression model's predict_proba.
    """
    features = vectorizer.transform([description])
    prediction = model.predict(features)[0]
    if hasattr(model, 'predict_proba'):
        probs = model.predict_proba(features)[0]
        confidence = float(probs.max())
    else:
        confidence = 1.0
    return prediction, round(confidence, 4)
