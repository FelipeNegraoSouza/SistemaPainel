import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# ============================================================
# CAMINHOS
# BASE_DIR: pasta raiz do projeto (sobe um nível a partir deste arquivo)
# DB_PATH:  caminho completo do arquivo SQLite que É o banco em si
# URL:      string de conexão que diz ao SQLAlchemy onde o banco está
#           formato: dialeto:///caminho/do/arquivo
# ============================================================
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "apontamentos.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# ============================================================
# ENGINE: motor de conexão com o banco.
# É ele que executa o SQL de verdade e gerencia o pool de conexões.
# check_same_thread=False: necessário no SQLite para permitir que
# múltiplas threads (FastAPI) usem a mesma conexão.
# ============================================================
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

# ============================================================
# SessionLocal: FÁBRICA de sessões (não é uma sessão).
# Cada chamada SessionLocal() cria uma sessão nova e independente.
# - autocommit=False: precisa chamar db.commit() manualmente
# - autoflush=False:  não envia mudanças pendentes antes de cada query
# - bind=engine:      usa o motor acima
# ============================================================
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ============================================================
# Base: classe base que TODOS os models herdam.
# É o que permite o SQLAlchemy mapear classes Python em tabelas.
# ============================================================
Base = declarative_base()

# ============================================================
# get_db: dependency do FastAPI.
# Abre uma sessão por requisição, entrega via yield e garante
# o fechamento no final (mesmo se der erro).
# Uso nas rotas: db: Session = Depends(get_db)
# ============================================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()