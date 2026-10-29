from sqlalchemy import Date

from app.models.customer import Customer


def test_customer_date_of_birth_uses_calendar_date_type():
    assert isinstance(Customer.__table__.c.date_of_birth.type, Date)
