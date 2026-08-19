import pandas as pd
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from backend import models

def calculate_machine_averages(db: Session, machine_id: int = None) -> List[Dict[str, Any]]:
    """
    Usa Pandas para calcular o tempo médio e ritmo de produção por hora
    para cada medida/especificação de painel em cada máquina.
    """
    # Consulta apontamentos com join em sessão, máquina e produto
    query = (
        db.query(
            models.ProductionEntry.id.label("entry_id"),
            models.ProductionEntry.product_spec_custom.label("product_spec"),
            models.ProductionEntry.qty_produced.label("qty"),
            models.ProductionEntry.net_minutes.label("net_minutes"),
            models.ProductionEntry.gross_minutes.label("gross_minutes"),
            models.ProductionEntry.total_stop_minutes.label("stop_minutes"),
            models.ProductionSession.reference_date.label("reference_date"),
            models.Machine.id.label("machine_id"),
            models.Machine.name.label("machine_name"),
            models.Machine.has_production_control.label("has_control"),
            models.Product.code.label("product_code"),
            models.Product.dimensions.label("dimensions"),
            models.Product.nominal_capacity_per_hour.label("nominal_capacity")
        )
        .join(models.ProductionSession, models.ProductionEntry.session_id == models.ProductionSession.id)
        .join(models.Machine, models.ProductionSession.machine_id == models.Machine.id)
        .outerjoin(models.Product, models.ProductionEntry.product_code == models.Product.code)
    )

    if machine_id:
        query = query.filter(models.Machine.id == machine_id)

    results = query.all()
    if not results:
        return []

    # Criar DataFrame com Pandas
    df = pd.DataFrame([r._asdict() for r in results])

    # Agrupar por Máquina e Especificação do Painel / Medida
    # Preencher valores nulos de dimensões com o próprio nome/especificação caso não tenha catálogo
    df['measure_key'] = df['dimensions'].fillna(df['product_spec'])

    grouped = df.groupby(['machine_name', 'measure_key', 'product_spec']).agg(
        total_qty=('qty', 'sum'),
        total_net_minutes=('net_minutes', 'sum'),
        total_stop_minutes=('stop_minutes', 'sum'),
        total_gross_minutes=('gross_minutes', 'sum'),
        records_count=('entry_id', 'count'),
        nominal_capacity=('nominal_capacity', 'first'),
        product_code=('product_code', 'first')
    ).reset_index()

    output = []
    for _, row in grouped.iterrows():
        net_hours = row['total_net_minutes'] / 60.0
        avg_rate_per_hour = round(row['total_qty'] / net_hours, 2) if net_hours > 0 else 0.0
        
        # Tempo médio em minutos por unidade produzida
        avg_minutes_per_unit = round(row['total_net_minutes'] / row['total_qty'], 2) if row['total_qty'] > 0 else 0.0
        
        nominal = row['nominal_capacity'] if pd.notnull(row['nominal_capacity']) and row['nominal_capacity'] > 0 else None
        efficiency_pct = round((avg_rate_per_hour / nominal) * 100, 1) if nominal and avg_rate_per_hour > 0 else None

        output.append({
            "machine_name": row['machine_name'],
            "product_code": int(row['product_code']) if pd.notnull(row['product_code']) else None,
            "product_spec": row['product_spec'],
            "dimensions": row['measure_key'],
            "total_qty": int(row['total_qty']),
            "total_net_hours": round(net_hours, 2),
            "total_stop_minutes": int(row['total_stop_minutes']),
            "avg_rate_per_hour": avg_rate_per_hour,
            "avg_minutes_per_unit": avg_minutes_per_unit,
            "nominal_capacity": float(nominal) if nominal else None,
            "efficiency_pct": efficiency_pct,
            "records_count": int(row['records_count'])
        })

    return output


def calculate_daily_monthly_production(db: Session, machine_id: int = None) -> Dict[str, Any]:
    """
    Calcula agregados diários e mensais de produção usando Pandas.
    """
    query = (
        db.query(
            models.ProductionEntry.qty_produced.label("qty"),
            models.ProductionEntry.net_minutes.label("net_minutes"),
            models.ProductionSession.reference_date.label("reference_date"),
            models.Machine.name.label("machine_name")
        )
        .join(models.ProductionSession, models.ProductionEntry.session_id == models.ProductionSession.id)
        .join(models.Machine, models.ProductionSession.machine_id == models.Machine.id)
    )

    if machine_id:
        query = query.filter(models.ProductionSession.machine_id == machine_id)

    results = query.all()
    if not results:
        return {"daily": [], "monthly": []}

    df = pd.DataFrame([r._asdict() for r in results])
    df['date'] = pd.to_datetime(df['reference_date'])
    df['month'] = df['date'].dt.strftime('%Y-%m')

    # Agrupado por Dia
    daily_grouped = df.groupby(['reference_date', 'machine_name']).agg(
        total_qty=('qty', 'sum'),
        total_net_minutes=('net_minutes', 'sum')
    ).reset_index()

    daily = []
    for _, row in daily_grouped.iterrows():
        net_h = row['total_net_minutes'] / 60.0
        daily.append({
            "date": row['reference_date'],
            "machine_name": row['machine_name'],
            "total_qty": int(row['total_qty']),
            "avg_rate_per_hour": round(row['total_qty'] / net_h, 2) if net_h > 0 else 0.0
        })

    # Agrupado por Mês
    monthly_grouped = df.groupby(['month', 'machine_name']).agg(
        total_qty=('qty', 'sum'),
        total_net_minutes=('net_minutes', 'sum')
    ).reset_index()

    monthly = []
    for _, row in monthly_grouped.iterrows():
        net_h = row['total_net_minutes'] / 60.0
        monthly.append({
            "month": row['month'],
            "machine_name": row['machine_name'],
            "total_qty": int(row['total_qty']),
            "avg_rate_per_hour": round(row['total_qty'] / net_h, 2) if net_h > 0 else 0.0
        })

    return {"daily": daily, "monthly": monthly}
