# ============================================================
# CRUD — Acesso ao banco + regras de negócio embutidas.
#
# Padrão geral das funções simples:
#   db.query(Model).filter(...).all() / .first()   -> ler
#   db.add(Model(**dados))                          -> criar
#   db.commit() + db.refresh(obj)                   -> salvar
#   db.delete(obj) + db.commit()                    -> deletar
#
# ATENÇÃO: algumas funções aqui NÃO são CRUD puro, carregam
# regra de negócio (turno, cálculo de tempo, roteamento de
# sessão). Conceitualmente pertenceriam a services/, mas
# ficaram aqui por conveniência.
#   - get_previous_night_date / get_effective_session_date
#   - get_or_create_session
#   - get_sessions_by_date
#   - detect_shift_from_time
#   - create_entry / update_entry
# ============================================================
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

# Regra do domínio: a planilha de Segunda à noite refere-se
# à produção física de Domingo à noite.
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

# Durações fixas por turno (usadas no cálculo de eficiência).
# Se a regra da fábrica mudar, altere aqui.
SHIFT_DURATION_DIURNO = 528   # 8h 48m (8 * 60 + 48)
SHIFT_DURATION_NOTURNO = 468  # 7h 48m (7 * 60 + 48)

def get_shift_duration_minutes(shift: Optional[str]) -> int:
    """Retorna a duração total do turno em minutos: Diurno = 8h48m (528 min), Noturno = 7h48m (468 min)."""
    if shift and str(shift).strip().lower() == "noturno":
        return SHIFT_DURATION_NOTURNO
    return SHIFT_DURATION_DIURNO

def detect_shift_from_time(start_str: str) -> str:
    """
    Detecta se o horário de início pertence ao período Diurno (06:00 às 18:00)
    ou Noturno (após as 18:00 ou antes das 06:00 - noite anterior).
    """
    try:
        if not start_str or ":" not in start_str:
            return "Diurno"
        h, m = map(int, start_str.strip().split(":"))
        total_mins = h * 60 + m
        # 06:00 = 360 mins, 18:00 = 1080 mins (6 às 18 max)
        if 360 <= total_mins <= 1080:
            return "Diurno"
        else:
            return "Noturno"
    except Exception:
        return "Diurno"

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
    current_session = db.query(models.ProductionSession).filter(models.ProductionSession.id == session_id).first()
    
    # Detecta turno do apontamento conforme a regra: 06:00 às 18:00 = Diurno, restante = Noturno
    detected_shift = entry_data.shift or detect_shift_from_time(entry_data.start_time)
    target_machine_id = entry_data.machine_id if entry_data.machine_id else (current_session.machine_id if current_session else 1)
    
    # Se a máquina ou o turno foram alterados/detectados diferente da sessão original, roteia para a sessão correspondente
    if current_session:
        # Data base da ficha
        base_ref_date = current_session.reference_date
        # Se a sessão atual era noturna, sua data efetiva já era prev_date; recupera a data da ficha se necessário
        target_effective_date = get_effective_session_date(base_ref_date, detected_shift)
        
        target_session = db.query(models.ProductionSession).filter(
            models.ProductionSession.reference_date == target_effective_date,
            models.ProductionSession.machine_id == target_machine_id,
            models.ProductionSession.shift == detected_shift
        ).first()
        
        if not target_session:
            target_session = models.ProductionSession(
                reference_date=target_effective_date,
                operator_name=entry_data.operator_name or current_session.operator_name or "Operador",
                shift=detected_shift,
                sector=current_session.sector,
                machine_id=target_machine_id
            )
            db.add(target_session)
            db.commit()
            db.refresh(target_session)
        session_id = target_session.id

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
        operator_name=entry_data.operator_name,
        shift=detected_shift,
        product_code=product_code,
        product_spec_custom=entry_data.product_spec_custom,
        start_time=entry_data.start_time,
        end_time=entry_data.end_time,
        gross_minutes=gross_minutes,
        qty_produced=qty,
        scrap_kg=float(entry_data.scrap_kg or 0.0),
        total_stop_minutes=total_stop_minutes,
        net_minutes=net_minutes,
        real_rate_per_hour=real_rate_per_hour,
        unproductive_reason=entry_data.unproductive_reason
    )
    db.add(db_entry)
    db.flush() # gera o id do entry SEM commitar, para usar nas paradas

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

# Estratégia: apaga todas as paradas antigas e recria as novas.
# Mais simples que diff, mas gera novos IDs a cada update.
def update_entry(db: Session, entry_id: int, entry_data: schemas.EntryCreate) -> Optional[models.ProductionEntry]:
    db_entry = db.query(models.ProductionEntry).filter(models.ProductionEntry.id == entry_id).first()
    if not db_entry:
        return None

    # Detecta turno conforme regra 06:00-18:00 Diurno vs Noturno
    detected_shift = entry_data.shift or detect_shift_from_time(entry_data.start_time)
    
    current_session = db_entry.session or db.query(models.ProductionSession).filter(models.ProductionSession.id == db_entry.session_id).first()
    target_machine_id = entry_data.machine_id if entry_data.machine_id else (current_session.machine_id if current_session else 1)

    # Se a máquina ou o turno foram alterados na edição, move o intervalo para a sessão correspondente
    if current_session and (target_machine_id != current_session.machine_id or detected_shift != current_session.shift):
        base_ref_date = current_session.reference_date
        target_effective_date = get_effective_session_date(base_ref_date, detected_shift)
        target_session = db.query(models.ProductionSession).filter(
            models.ProductionSession.reference_date == target_effective_date,
            models.ProductionSession.machine_id == target_machine_id,
            models.ProductionSession.shift == detected_shift
        ).first()
        if not target_session:
            target_session = models.ProductionSession(
                reference_date=target_effective_date,
                operator_name=entry_data.operator_name or current_session.operator_name or "Operador",
                shift=detected_shift,
                sector=current_session.sector,
                machine_id=target_machine_id
            )
            db.add(target_session)
            db.commit()
            db.refresh(target_session)
        db_entry.session_id = target_session.id

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

    db_entry.operator_name = entry_data.operator_name
    db_entry.shift = detected_shift
    db_entry.product_code = product_code
    db_entry.product_spec_custom = entry_data.product_spec_custom
    db_entry.start_time = entry_data.start_time
    db_entry.end_time = entry_data.end_time
    db_entry.gross_minutes = gross_minutes
    db_entry.qty_produced = qty
    db_entry.scrap_kg = float(entry_data.scrap_kg or 0.0)
    db_entry.total_stop_minutes = total_stop_minutes
    db_entry.net_minutes = net_minutes
    db_entry.real_rate_per_hour = real_rate_per_hour
    db_entry.unproductive_reason = entry_data.unproductive_reason

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

