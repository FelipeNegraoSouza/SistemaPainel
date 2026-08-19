from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime

# --- SCHEMAS DE MÁQUINAS ---
class MachineBase(BaseModel):
    name: str
    code: Optional[str] = None
    sector: str = "Painéis"
    has_production_control: bool = True

class MachineCreate(MachineBase):
    pass

class MachineResponse(MachineBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- SCHEMAS DE PRODUTOS / ESPECIFICAÇÕES DE PAINÉIS ---
class ProductBase(BaseModel):
    code: int # PK Inteira
    name: str
    specification: Optional[str] = None
    dimensions: Optional[str] = None
    unit_weight_kg: float = 0.0
    nominal_capacity_per_hour: float = 0.0

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    specification: Optional[str] = None
    dimensions: Optional[str] = None
    unit_weight_kg: Optional[float] = None
    nominal_capacity_per_hour: Optional[float] = None

class ProductResponse(ProductBase):
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- SCHEMAS DE PARADAS ---
class StopBase(BaseModel):
    start_time: str
    end_time: str
    reason: str
    duration_minutes: int = 0

class StopCreate(StopBase):
    pass

class StopResponse(StopBase):
    id: int
    entry_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- SCHEMAS DE APONTAMENTOS / INTERVALOS PRODUTIVOS ---
class EntryBase(BaseModel):
    product_code: Optional[int] = None
    product_spec_custom: str
    start_time: str
    end_time: str
    qty_produced: int
    gross_minutes: int = 0
    total_stop_minutes: int = 0
    net_minutes: int = 0
    real_rate_per_hour: float = 0.0

class EntryCreate(EntryBase):
    stops: List[StopCreate] = []

class EntryResponse(EntryBase):
    id: int
    session_id: int
    created_at: datetime
    stops: List[StopResponse] = []
    product: Optional[ProductResponse] = None
    model_config = ConfigDict(from_attributes=True)


# --- SCHEMAS DE FICHA / SESSÃO DO TURNO ---
class SessionBase(BaseModel):
    reference_date: str
    operator_name: str
    shift: str = "Diurno"
    sector: str = "Painéis"
    machine_id: int

class SessionCreate(SessionBase):
    pass

class SessionResponse(SessionBase):
    id: int
    created_at: datetime
    updated_at: datetime
    machine: MachineResponse
    entries: List[EntryResponse] = []
    model_config = ConfigDict(from_attributes=True)


# --- SCHEMAS PARA ANÁLISE / METRICAS PANDAS ---
class MachineAverageMetric(BaseModel):
    machine_name: str
    product_code: Optional[int]
    product_spec: str
    dimensions: Optional[str]
    total_qty: int
    total_net_hours: float
    avg_rate_per_hour: float
    avg_minutes_per_unit: float
    nominal_capacity: Optional[float] = None
    efficiency_pct: Optional[float] = None
