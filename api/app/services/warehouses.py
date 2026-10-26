import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Warehouse


def get_or_create(session: Session, costco_number: str, time_zone: str) -> uuid.UUID:
    wh = session.scalar(select(Warehouse).where(Warehouse.costco_number == costco_number))
    if wh is None:
        wh = Warehouse(costco_number=costco_number, time_zone=time_zone)
        session.add(wh)
        session.flush()
    return wh.id
