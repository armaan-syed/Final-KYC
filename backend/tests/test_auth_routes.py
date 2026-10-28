from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.routers import auth
from app.schemas.auth import CustomerRegisterRequest, LoginRequest


def _registration_request(**overrides):
    values = {
        "full_name": "Test Customer",
        "date_of_birth": "1990-01-02",
        "gender": "Female",
        "phone_number": "+15551234567",
        "email": "customer@example.com",
        "password": "LocalOnly#123",
        "address_line1": "1 Example Street",
        "city": "Example City",
        "state": "Example State",
        "pincode": "12345",
    }
    values.update(overrides)
    return CustomerRegisterRequest(**values)


def test_register_uses_standard_gender_and_omits_empty_optional_address(monkeypatch):
    sign_up = MagicMock(return_value={"UserSub": "test-sub"})
    monkeypatch.setattr(auth.cognito_idp, "sign_up", sign_up)

    result = auth.register(_registration_request())

    attrs = {item["Name"]: item["Value"] for item in sign_up.call_args.kwargs["UserAttributes"]}
    assert result.cognito_sub == "test-sub"
    assert attrs["gender"] == "Female"
    assert "custom:gender" not in attrs
    assert "custom:address_line2" not in attrs
    assert attrs["custom:date_of_birth"] == "1990-01-02"


def test_register_sends_nonempty_optional_address_line2(monkeypatch):
    sign_up = MagicMock(return_value={"UserSub": "test-sub"})
    monkeypatch.setattr(auth.cognito_idp, "sign_up", sign_up)

    auth.register(_registration_request(address_line2="Apartment 2"))

    attrs = {item["Name"]: item["Value"] for item in sign_up.call_args.kwargs["UserAttributes"]}
    assert attrs["custom:address_line2"] == "Apartment 2"


def test_login_uses_configured_public_password_flow(monkeypatch):
    initiate_auth = MagicMock(
        return_value={
            "AuthenticationResult": {
                "AccessToken": "access",
                "RefreshToken": "refresh",
                "IdToken": "id",
                "ExpiresIn": 3600,
            }
        }
    )
    monkeypatch.setattr(auth.cognito_idp, "initiate_auth", initiate_auth)

    response = auth.login(
        LoginRequest(email="customer@example.com", password="LocalOnly#123")
    )

    assert response.id_token == "id"
    assert initiate_auth.call_args.kwargs["AuthFlow"] == "USER_PASSWORD_AUTH"


@pytest.mark.parametrize("date_of_birth", ["1990-2-03", "1990-02-30", "not-a-date"])
def test_register_schema_rejects_invalid_date_of_birth(date_of_birth):
    with pytest.raises(ValidationError, match="date_of_birth"):
        _registration_request(date_of_birth=date_of_birth)
