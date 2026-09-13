from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from schemas.request_models import (
    ExpenseClassificationRequest,
    AnomalyDetectionRequest,
    ClusteringRequest,
    ForecastingRequest
)
from services import classification_service, anomaly_service, clustering_service, forecasting_service
from routers.import_router import router as import_router
from routers.ml_router import router as ml_router

load_dotenv()

# Load models on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        classification_service.load_models()
        anomaly_service.load_models()
        clustering_service.load_models()
        forecasting_service.load_models()
        yield
    except Exception as e:
        print(f"Failed to load models: {e}")
        raise e

app = FastAPI(title="Expense Buddy ML API", lifespan=lifespan)

# Add CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(import_router)
app.include_router(ml_router)

@app.get("/")
def read_root():
    # Redirect root URL to the interactive Swagger UI
    return RedirectResponse(url="/docs")

@app.get("/health")
def health_check():
    # Verify all models are loaded
    models_loaded = all([
        classification_service.model is not None,
        anomaly_service.model is not None,
        clustering_service.model is not None,
        forecasting_service.model is not None
    ])
    
    status = "healthy" if models_loaded else "unhealthy"
    
    return {
        "status": status,
        "models_loaded": models_loaded,
        "services": {
            "classification": classification_service.model is not None,
            "anomaly": anomaly_service.model is not None,
            "clustering": clustering_service.model is not None,
            "forecasting": forecasting_service.model is not None
        }
    }

@app.post("/predict/expense")
def predict_expense(request: ExpenseClassificationRequest):
    try:
        category = classification_service.predict(request.description)
        return {"category": category}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/anomaly")
def predict_anomaly(request: AnomalyDetectionRequest):
    try:
        result = anomaly_service.predict(request.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/cluster")
def predict_cluster(request: ClusteringRequest):
    try:
        result = clustering_service.predict(request.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/forecast")
def predict_forecast(request: ForecastingRequest):
    try:
        result = forecasting_service.predict(request.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
