"""FastAPI application entry point with Mangum handler for AWS Lambda."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from app.config import settings
from app.routers import auth, customer, kyc, reviewer

app = FastAPI(title="Pramāṇa API", version="1.0.0")

configured_origins = [
    origin.strip()
    for origin in settings.frontend_origin.split(",")
    if origin.strip()
]
# Ensure standard local Vite dev ports and headers are always permitted in development
allowed_origins = list(
    set(
        configured_origins
        + [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
    )
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=300,
)

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
