from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from backend import models, schemas

# --- MÁQUINAS ---
def get_machines(db: Session) -> List[models.Machine]:
    return db.query(models.Machine).order_by(models.Machine.id).all()

def get_machine_by_id(db: Session, machine_id: int) -> Optional[models.Machine]:
    return db.query(models.Machine).filter(models.Machine.id == machine_id).first()

def create_machine(db: Session, machine: schemas.MachineCreate) -> models.Machine:
    db_machine = models.Machine(**machine.model_dump())
    db.add(db_machine)
    db.commit()
    db.refresh(db_machine)
    return db_machine


# --- PRODUTOS / PAINÉIS ---
def get_products(db: Session) -> List[models.Product]:
    return db.query(models.Product).order_by(models.Product.code).all()

def get_product_by_code(db: Session, code: int) -> Optional[models.Product]:
    return db.query(models.Product).filter(models.Product.code == code).first()

def create_product(db: Session, product: schemas.ProductCreate) -> models.Product:
    db_product = models.Product(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

def update_product(db: Session, code: int, product_data: schemas.ProductUpdate) -> Optional[models.Product]:
    prod = get_product_by_code(db, code)
    if not prod:
        return None
    data = product_data.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(prod, k, v)
    db.commit()
    db.refresh(prod)
    return prod

def delete_product(db: Session, code: int) -> bool:
    prod = get_product_by_code(db, code)
    if not prod:
        return False
    db.delete(prod)
    db.commit()
    return True


# --- FICHAS / SESSÕES DE PRODUÇÃO ---
def get_previous_night_date(date_str: str) -> str:
    """Calcula a data do turno noturno (sempre a noite anterior: ex. Segunda refere-se a Domingo à noite)."""
    try:
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d")
        prev = dt - timedelta(days=1)
        return prev.strftime("%Y-%m-%d")
    except Exception:
        return date_str

def get_effective_session_date(reference_date: str, shift: str) -> str:
    """Para o turno Noturno de uma planilha, a produção física refere-se à noite anterior (ex: Domingo à noite para planilha de Segunda)."""
    if shift == "Noturno":
        return get_previous_night_date(reference_date)
    return reference_date

def get_or_create_session(db: Session, session_data: schemas.SessionCreate) -> models.ProductionSession:
    # Ajusta data efetiva se for turno noturno
    effective_date = get_effective_session_date(session_data.reference_date, session_data.shift)

    # Procura se já existe ficha aberta para essa data efetiva, máquina e turno
    existing = db.query(models.ProductionSession).filter(
        models.ProductionSession.reference_date == effective_date,
        models.ProductionSession.machine_id == session_data.machine_id,
        models.ProductionSession.shift == session_data.shift
    ).first()

    if existing:
        # Atualiza operador caso tenha mudado
        if session_data.operator_name:
            existing.operator_name = session_data.operator_name
            db.commit()
            db.refresh(existing)
        return existing

    session_dict = session_data.model_dump()
    session_dict["reference_date"] = effective_date
    db_session = models.ProductionSession(**session_dict)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

def get_session_by_id(db: Session, session_id: int) -> Optional[models.ProductionSession]:
    return db.query(models.ProductionSession).filter(models.ProductionSession.id == session_id).first()

def get_sessions_by_date(db: Session, date: str, shift: Optional[str] = None) -> List[models.ProductionSession]:
    prev_date = get_previous_night_date(date)
    if shift == "Diurno":
        return db.query(models.ProductionSession).filter(
            models.ProductionSession.reference_date == date,
            models.ProductionSession.shift == "Diurno"
        ).order_by(models.ProductionSession.machine_id).all()
    elif shift == "Noturno":
        return db.query(models.ProductionSession).filter(
            or_(
                and_(models.ProductionSession.reference_date == prev_date, models.ProductionSession.shift == "Noturno"),
                and_(models.ProductionSession.reference_date == date, models.ProductionSession.shift == "Noturno")
            )
        ).order_by(models.ProductionSession.machine_id).all()
    else:
        # Retorna todas as sessões que compõem a planilha da data (Diurno da data + Noturno da noite anterior)
        return db.query(models.ProductionSession).filter(
            or_(
                and_(models.ProductionSession.reference_date == date, models.ProductionSession.shift == "Diurno"),
                and_(models.ProductionSession.reference_date == prev_date, models.ProductionSession.shift == "Noturno"),
                and_(models.ProductionSession.reference_date == date, models.ProductionSession.shift == "Noturno")
            )
        ).order_by(models.ProductionSession.machine_id).all()



# --- APONTAMENTOS / INTERVALOS ---
def _calculate_time_difference_minutes(start_str: str, end_str: str) -> int:
    try:
        h1, m1 = map(int, start_str.split(":"))
        h2, m2 = map(int, end_str.split(":"))
        diff = (h2 * 60 + m2) - (h1 * 60 + m1)
        if diff < 0:
            diff += 1440 # Cobre virada de meia-noite
        return diff
    except Exception:
        return 0

def create_entry(db: Session, session_id: int, entry_data: schemas.EntryCreate) -> models.ProductionEntry:
    # Se o produto tem código, vincula ao catálogo
    product_code = entry_data.product_code
    if product_code:
        prod = get_product_by_code(db, product_code)
        if not prod:
            product_code = None

    # Calcula e valida tempos caso não tenham sido passados
    gross_minutes = entry_data.gross_minutes
    if not gross_minutes or gross_minutes == 0:
        gross_minutes = _calculate_time_difference_minutes(entry_data.start_time, entry_data.end_time)

    # Soma paradas
    stop_objs = []
    total_stop_minutes = 0
    for stop in entry_data.stops:
        duration = stop.duration_minutes
        if not duration or duration == 0:
            duration = _calculate_time_difference_minutes(stop.start_time, stop.end_time)
        total_stop_minutes += duration
        stop_objs.append((stop, duration))

    net_minutes = max(0, gross_minutes - total_stop_minutes)
    
    qty = entry_data.qty_produced or 0
    real_rate_per_hour = entry_data.real_rate_per_hour
    if not real_rate_per_hour or real_rate_per_hour == 0.0:
        if net_minutes > 0 and qty > 0:
            real_rate_per_hour = round(qty / (net_minutes / 60.0), 2)
        else:
            real_rate_per_hour = 0.0

    db_entry = models.ProductionEntry(
        session_id=session_id,
        product_code=product_code,
        product_spec_custom=entry_data.product_spec_custom,
        start_time=entry_data.start_time,
        end_time=entry_data.end_time,
        gross_minutes=gross_minutes,
        qty_produced=qty,
        total_stop_minutes=total_stop_minutes,
        net_minutes=net_minutes,
        real_rate_per_hour=real_rate_per_hour
    )
    db.add(db_entry)
    db.flush() # Para gerar db_entry.id

    # Adicionar paradas detalhadas
    for stop, duration in stop_objs:
        db_stop = models.ProductionStop(
            entry_id=db_entry.id,
            start_time=stop.start_time,
            end_time=stop.end_time,
            reason=stop.reason,
            duration_minutes=duration
        )
        db.add(db_stop)

    db.commit()
    db.refresh(db_entry)
    return db_entry

def update_entry(db: Session, entry_id: int, entry_data: schemas.EntryCreate) -> Optional[models.ProductionEntry]:
    db_entry = db.query(models.ProductionEntry).filter(models.ProductionEntry.id == entry_id).first()
    if not db_entry:
        return None

    # Se o produto tem código, vincula ao catálogo
    product_code = entry_data.product_code
    if product_code:
        prod = get_product_by_code(db, product_code)
        if not prod:
            product_code = None

    gross_minutes = entry_data.gross_minutes
    if not gross_minutes or gross_minutes == 0:
        gross_minutes = _calculate_time_difference_minutes(entry_data.start_time, entry_data.end_time)

    # Limpa paradas antigas do intervalo
    db.query(models.ProductionStop).filter(models.ProductionStop.entry_id == entry_id).delete()

    stop_objs = []
    total_stop_minutes = 0
    for stop in entry_data.stops:
        duration = stop.duration_minutes
        if not duration or duration == 0:
            duration = _calculate_time_difference_minutes(stop.start_time, stop.end_time)
        total_stop_minutes += duration
        stop_objs.append((stop, duration))

    net_minutes = max(0, gross_minutes - total_stop_minutes)
    qty = entry_data.qty_produced or 0
    real_rate_per_hour = entry_data.real_rate_per_hour
    if not real_rate_per_hour or real_rate_per_hour == 0.0:
        if net_minutes > 0 and qty > 0:
            real_rate_per_hour = round(qty / (net_minutes / 60.0), 2)
        else:
            real_rate_per_hour = 0.0

    db_entry.product_code = product_code
    db_entry.product_spec_custom = entry_data.product_spec_custom
    db_entry.start_time = entry_data.start_time
    db_entry.end_time = entry_data.end_time
    db_entry.gross_minutes = gross_minutes
    db_entry.qty_produced = qty
    db_entry.total_stop_minutes = total_stop_minutes
    db_entry.net_minutes = net_minutes
    db_entry.real_rate_per_hour = real_rate_per_hour

    for stop, duration in stop_objs:
        db_stop = models.ProductionStop(
            entry_id=db_entry.id,
            start_time=stop.start_time,
            end_time=stop.end_time,
            reason=stop.reason,
            duration_minutes=duration
        )
        db.add(db_stop)

    db.commit()
    db.refresh(db_entry)
    return db_entry

def delete_entry(db: Session, entry_id: int) -> bool:
    db_entry = db.query(models.ProductionEntry).filter(models.ProductionEntry.id == entry_id).first()
    if not db_entry:
        return False
    db.delete(db_entry)
    db.commit()
    return True

