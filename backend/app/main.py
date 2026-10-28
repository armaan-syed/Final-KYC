"""FastAPI application entry point with Mangum handler for AWS Lambda."""

from fastapi import FastAPI
from mangum import Mangum

from app.routers import auth, customer, kyc, reviewer

app = FastAPI(title="Pramāṇa API", version="1.0.0")

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(customer.router, prefix="/customer", tags=["customer"])
app.include_router(kyc.router, prefix="/kyc", tags=["kyc"])
app.include_router(reviewer.router, prefix="/reviewer", tags=["reviewer"])


@app.get("/health", tags=["health"])
def health_check():
    """Health check endpoint (no auth required)."""
    return {"status": "ok"}


# Mangum wraps the FastAPI app for AWS Lambda execution
handler = Mangum(app, lifespan="off")