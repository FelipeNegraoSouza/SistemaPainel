from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, 
    DateTime, Date, ForeignKey, Text
)
from sqlalchemy.orm import relationship
from backend.database import Base

class Machine(Base):
    """
    Cadastro das Máquinas do Setor de Painéis
    """
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)  # Ex: "Dobra 1", "Solda Lateral 1"
    code = Column(String(50), nullable=True)                 # Ex: "DOB-01"
    sector = Column(String(50), default="Painéis")
    has_production_control = Column(Boolean, default=True)   # False para Revisão e Solda Manual
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    sessions = relationship("ProductionSession", back_populates="machine")


class Product(Base):
    """
    Especificações Gerais dos Painéis (Catálogo de Produtos)
    A PK é o código referente do tipo Integer
    """
    __tablename__ = "products"

    code = Column(Integer, primary_key=True, index=True)      # Código referente (PK Inteira)
    name = Column(String(200), nullable=False)                 # Descrição / Nome comercial
    specification = Column(String(250), nullable=True)         # Ex: PIR 50mm Branco/Branco
    dimensions = Column(String(100), nullable=True)            # Medidas (ex: 3500 x 1150 x 50mm)
    unit_weight_kg = Column(Float, default=0.0)                # Peso unitário em kg
    nominal_capacity_per_hour = Column(Float, default=0.0)     # Capacidade teórica nominal (unidades/h)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    entries = relationship("ProductionEntry", back_populates="product")


class ProductionSession(Base):
    """
    Ficha de Produção do Turno / Máquina
    """
    __tablename__ = "production_sessions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    reference_date = Column(String(10), nullable=False, index=True) # YYYY-MM-DD
    operator_name = Column(String(150), nullable=False)
    shift = Column(String(50), default="Diurno")
    sector = Column(String(50), default="Painéis")
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    machine = relationship("Machine", back_populates="sessions")
    entries = relationship("ProductionEntry", back_populates="session", cascade="all, delete-orphan")


class ProductionEntry(Base):
    """
    Intervalo Produtivo de uma Ficha
    """
    __tablename__ = "production_entries"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("production_sessions.id"), nullable=False)
    product_code = Column(Integer, ForeignKey("products.code"), nullable=True) # Vinculado à PK inteira
    product_spec_custom = Column(String(250), nullable=False)                  # Texto digitado / descrição
    
    start_time = Column(String(5), nullable=False)  # HH:mm
    end_time = Column(String(5), nullable=False)    # HH:mm
    
    gross_minutes = Column(Integer, default=0)
    qty_produced = Column(Integer, default=0)
    total_stop_minutes = Column(Integer, default=0)
    net_minutes = Column(Integer, default=0)
    real_rate_per_hour = Column(Float, default=0.0) # Peças/h líquidas realizadas
    
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    session = relationship("ProductionSession", back_populates="entries")
    product = relationship("Product", back_populates="entries")
    stops = relationship("ProductionStop", back_populates="entry", cascade="all, delete-orphan")


class ProductionStop(Base):
    """
    Paradas ocorridas dentro de um Intervalo Produtivo
    """
    __tablename__ = "production_stops"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    entry_id = Column(Integer, ForeignKey("production_entries.id"), nullable=False)
    start_time = Column(String(5), nullable=False) # HH:mm
    end_time = Column(String(5), nullable=False)   # HH:mm
    reason = Column(String(250), nullable=False)   # Motivo da parada
    duration_minutes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    entry = relationship("ProductionEntry", back_populates="stops")
