from datetime import datetime, timedelta, timezone
from sqlalchemy import func, select
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.package import Package
from app.schemas.package import FEEDBACK_STEPS, SUBMISSION_STEPS
from app.services.iam_service import IamService

NAMES = ["Ana Petrović","Marko Jovanović","Luka Nikolić","Mila Stojanović","Ivan Marković","Sara Ilić","Nikola Popović","Jelena Savić"]
DISCIPLINES = ["Civil","Structural","Electrical","Mechanical","Architectural","Geotechnical"]
TYPES = ["Drawing","Technical Report","Method Statement","Specification","Calculation"]
def flags(keys, count): return {key: i < count for i,key in enumerate(keys)}
def seed():
    with SessionLocal() as db:
        IamService(db).bootstrap()
    if not settings.seed_demo_data: return
    with SessionLocal() as db:
        if (db.scalar(select(func.count()).select_from(Package)) or 0) > 0: return
        now=datetime.now(timezone.utc).replace(tzinfo=None)
        for i in range(12):
            created = now-timedelta(days=[0,1,2,4,6,9,15,24,40,90,180,300][i])
            db.add(Package(document_number=f"DOC-{DISCIPLINES[i%6][:3].upper()}-2026-{i+1:03d}",document_title=f"{DISCIPLINES[i%6]} document {i+1}",document_date=created.date(),document_type=TYPES[i%5],initiator=NAMES[i%8],discipline=DISCIPLINES[i%6],number_of_documents=(i*3)%17+2,transmittal_number=f"TR-2026-{140+i:04d}" if i!=2 else None,workflow_number=f"WF-2026-{80+i:04d}" if i!=4 else None,submission_progress=flags(SUBMISSION_STEPS,(i*2+2)%7),feedback=flags(FEEDBACK_STEPS,i%3),order_index=i,created_at=created))
        db.commit()
if __name__ == "__main__": seed()
