from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth


client = TestClient(app)


def test_auth_api_exposes_registration_and_confirmation_only():
    paths = {route.path for route in app.routes}

    assert "/auth/register" in paths
    assert "/auth/confirm" in paths
    assert "/auth/login" not in paths
    assert "/auth/refresh" not in paths
    assert "/auth/logout" not in paths


def test_registration_uses_cognito_standard_gender_attribute(monkeypatch):
    class CognitoStub:
        def sign_up(self, **kwargs):
            self.request = kwargs
            return {"UserSub": "customer-sub"}

    cognito = CognitoStub()
    monkeypatch.setattr(auth, "cognito_idp", cognito)

    response = client.post(
        "/auth/register",
        json={
            "full_name": "Test Customer",
            "date_of_birth": "2000-01-02",
            "gender": "Female",
            "phone_number": "+15551234567",
            "email": "customer@example.com",
            "password": "TestPassword123!",
            "address_line1": "1 Test Street",
            "address_line2": None,
            "city": "Test City",
            "state": "Test State",
            "pincode": "12345",
        },
    )

    assert response.status_code == 201
    attributes = {item["Name"]: item["Value"] for item in cognito.request["UserAttributes"]}
    assert attributes["gender"] == "Female"
    assert "custom:gender" not in attributes
