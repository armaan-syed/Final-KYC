from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from app.models.kyc import KYCDecision, KYCCase
from app.routers.reviewer import get_dashboard, list_cases
from app.services import kyc_service
from app.services.kyc_service import KYCService


def test_dashboard_counts_today_transitions(monkeypatch):
    db = MagicMock()
    query = MagicMock()
    query.filter.return_value = query
    query.count.side_effect = [11, 2, 3, 4, 1]
    db.query.return_value = query

    result = get_dashboard(reviewer=SimpleNamespace(), db=db)

    assert result.total_cases == 11
    assert result.pending_review == 2
    assert result.auto_verified_today == 3
    assert result.approved_today == 4
    assert result.rejected_today == 1
    # Four status-specific queries apply a UTC-day transition boundary.
    assert query.filter.call_count == 4
    for call in query.filter.call_args_list[1:]:
        assert "updated_at" in " ".join(str(arg) for arg in call.args)


def test_list_cases_applies_status_and_pagination():
    case = SimpleNamespace(
        id=uuid4(),
        customer_id=uuid4(),
        status="REVIEW_REQUIRED",
        updated_at=datetime.now(timezone.utc),
    )
    db = MagicMock()
    query = MagicMock()
    query.order_by.return_value = query
    query.filter.return_value = query
    query.count.return_value = 21
    query.offset.return_value.limit.return_value.all.return_value = [case]
    db.query.return_value = query

    response = list_cases(
        reviewer=SimpleNamespace(), db=db, page=2, page_size=10, status="REVIEW_REQUIRED"
    )

    assert response["total"] == 21
    assert response["page"] == 2
    assert response["cases"][0]["status"] == "REVIEW_REQUIRED"
    query.offset.assert_called_once_with(10)
    query.offset.return_value.limit.assert_called_once_with(10)
    query.filter.assert_called_once()


def _decision_test_database(customer):
    db = MagicMock()

    def query_for(model):
        query = MagicMock()
        filter_query = MagicMock()
        filter_query.first.return_value = None if model is KYCDecision else customer
        query.filter_by.return_value = filter_query
        return query

    db.query.side_effect = query_for
    return db


def test_decision_is_committed_before_notifications(monkeypatch):
    events = []
    customer = SimpleNamespace(
        id=uuid4(), email="customer@example.test", full_name="Customer", phone_number="+15550000000"
    )
    db = _decision_test_database(customer)
    db.commit.side_effect = lambda: events.append("commit")
    db.flush.return_value = None
    monkeypatch.setattr(kyc_service, "send_sms", lambda *_: events.append("sms") or True)
    monkeypatch.setattr(kyc_service, "send_email", lambda *_: events.append("email") or True)

    case = SimpleNamespace(id=uuid4(), customer_id=customer.id, status="REVIEW_REQUIRED")
    attempt = SimpleNamespace(id=uuid4(), status="REVIEW_REQUIRED", completed_at=None)
    reviewer = SimpleNamespace(cognito_sub="reviewer-sub")

    result = KYCService(db).record_decision(
        case, attempt, reviewer, "REJECTED", notes="See portal for details"
    )

    assert result["decision"] == "REJECTED"
    assert case.status == "REJECTED"
    assert attempt.status == "REJECTED"
    assert events[0] == "commit"
    assert events[1:3] == ["sms", "commit"]
    assert "email" in events
    assert db.commit.call_count == 3  # decision + SMS audit + email audit


def test_invalid_decision_transition_sends_no_notification(monkeypatch):
    customer = SimpleNamespace(id=uuid4(), email="x@example.test", full_name="x", phone_number="+1")
    db = _decision_test_database(customer)
    send_email = MagicMock()
    monkeypatch.setattr(kyc_service, "send_email", send_email)
    case = SimpleNamespace(id=uuid4(), customer_id=customer.id, status="PENDING")
    attempt = SimpleNamespace(id=uuid4(), status="PROCESSING", completed_at=None)

    try:
        KYCService(db).record_decision(
            case, attempt, SimpleNamespace(cognito_sub="reviewer"), "APPROVED"
        )
    except ValueError:
        pass
    else:
        raise AssertionError("invalid transition should raise ValueError")

    send_email.assert_not_called()
    db.commit.assert_not_called()
