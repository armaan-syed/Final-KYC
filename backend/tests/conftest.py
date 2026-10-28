"""Test-only environment values; AWS and database calls are mocked."""

import os

for key, value in {
    "COGNITO_CUSTOMER_POOL_ID": "us-east-1_testCustomer",
    "COGNITO_REVIEWER_POOL_ID": "us-east-1_testReviewer",
    "COGNITO_APP_CLIENT_ID": "test-customer-client",
    "COGNITO_REVIEWER_APP_CLIENT_ID": "test-reviewer-client",
    "S3_DOCUMENTS_BUCKET": "test-documents",
    "SQS_QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/000000000000/test-queue",
    "RDS_PASSWORD": "test-only-password",
}.items():
    os.environ.setdefault(key, value)
