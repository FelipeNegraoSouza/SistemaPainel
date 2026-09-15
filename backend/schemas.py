# ============================================================
# SCHEMAS — Contratos de dados da API (Pydantic)
#
# Função: validar, filtrar e formatar o que ENTRA e SAI da API.
# São a "alfândega" entre o cliente HTTP e o banco.
#
# Padrão usado aqui:
#   XxxBase     -> campos comuns (herança)
#   XxxCreate   -> o que o cliente PODE enviar para criar
#   XxxUpdate   -> campos opcionais para atualização parcial
#   XxxResponse -> o que a API DEVOLVE (inclui id, datas, etc.)
#
# Regras importantes:
#   - Optional[X] = None  -> campo opcional, pode vir vazio
#   - valor sem Optional  -> campo obrigatório
#   - campo com default   -> se não vier, assume o valor padrão
#   - campos fora do schema NÃO entram (filtro de segurança)
#
# model_config = ConfigDict(from_attributes=True):
#   permite montar o schema a partir de um OBJETO (ex: model
#   SQLAlchemy), não só de um dicionário. É a ponte
#   models (banco) -> schemas (API).
#
# Schemas de métricas (ex: MachineAverageMetric) são só SAÍDA:
# não representam tabela, só o formato do cálculo do analytics.
# ============================================================

# ------------------------------------------------------------
# BaseModel (Pydantic): classe mãe dos schemas.
# Só por herdar dela, a classe ganha:
#   - validação automática dos tipos
#   - conversão quando possível (ex: "123" -> 123)
#   - erro claro se faltar campo obrigatório
#   - aplicação de valores padrão (default=...)
#   - serialização para dict/JSON (.model_dump(), .model_dump_json())
#
# Diferença dos dois "Base" do projeto:
#   Base       (SQLAlchemy) -> mapeia classe em TABELA do banco
#   BaseModel  (Pydantic)   -> valida dados que ENTRAM/SAEM da API
#
# Herança em cadeia:
#   BaseModel (Pydantic)
#       └─ MachineBase      -> campos comuns
#             ├─ MachineCreate    -> entrada (criar)
#             └─ MachineResponse  -> saída (devolver)
# ------------------------------------------------------------
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime

# --- SCHEMAS DE MÁQUINAS ---


class MachineBase(BaseModel):               #herda o basemodel
    name: str
    code: Optional[str] = None
    sector: str = "Painéis"
    has_production_control: bool = True

class MachineCreate(MachineBase):           #herda machineBase que herda Basemodel
    pass

class MachineResponse(MachineBase):         #herda machineBase que herda Basemodel
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# O exemplo de herança acima vale para todos abaixo


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
    operator_name: Optional[str] = None
    shift: Optional[str] = None
    product_code: Optional[int] = None
    product_spec_custom: str
    start_time: str
    end_time: str
    qty_produced: int
    scrap_kg: float = 0.0
    gross_minutes: int = 0
    total_stop_minutes: int = 0
    net_minutes: int = 0
    real_rate_per_hour: float = 0.0
    machine_id: Optional[int] = None
    unproductive_reason: Optional[str] = None

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
    operator_name: Optional[str] = "Operador"
    shift: str = "Diurno"
    sector: str = "Painéis"
    machine_id: int
    unproductive_notes: Optional[str] = None

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
