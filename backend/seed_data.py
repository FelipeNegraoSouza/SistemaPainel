# ============================================================
# SEED — Inicialização do banco (primeira execução)
#
# Faz 3 coisas:
#   1. create_all: cria tabelas que ainda não existem.
#   2. Migração light: via PRAGMA + ALTER TABLE, adiciona
#      colunas novas em bancos antigos (SQLite apenas).
#      Obs: só ADICIONA coluna. Não remove, renomeia ou
#      altera tipo. Se precisar disso, usar Alembic.
#   3. Seed: insere as 8 máquinas padrão se a tabela estiver
#      vazia. Roda só uma vez (idempotente).
#
# Product fica vazio de propósito: o catálogo é sincronizado
# depois pela função sync_catalog_from_excel_bd do services.excel.
#
# Executado diretamente: python seeddata.py
# OU importado e chamado pelo main.py (verificar).
# ============================================================
from sqlalchemy import text
from backend.database import engine, Base, SessionLocal
from backend import models

def init_db():
    # Cria todas as tabelas
    Base.metadata.create_all(bind=engine)

    # Migração leve para adicionar novas colunas se não existirem no SQLite
    with engine.connect() as conn:
        try:
            entry_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(production_entries)")).fetchall()]
            if "unproductive_reason" not in entry_cols:
                conn.execute(text("ALTER TABLE production_entries ADD COLUMN unproductive_reason VARCHAR(250)"))
                conn.commit()
                print("[OK] Coluna 'unproductive_reason' adicionada em 'production_entries'.")
        except Exception as e:
            print(f"[Aviso Migração] entries: {e}")

        try:
            session_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(production_sessions)")).fetchall()]
            if "unproductive_notes" not in session_cols:
                conn.execute(text("ALTER TABLE production_sessions ADD COLUMN unproductive_notes TEXT"))
                conn.commit()
                print("[OK] Coluna 'unproductive_notes' adicionada em 'production_sessions'.")
        except Exception as e:
            print(f"[Aviso Migração] sessions: {e}")
    
    db = SessionLocal()
    try:
        # 1. Seed de Máquinas
        if db.query(models.Machine).count() == 0:
            machines = [
                models.Machine(name="Dobra 1", code="DOB-01", sector="Painéis", has_production_control=True),
                models.Machine(name="Dobra 2", code="DOB-02", sector="Painéis", has_production_control=True),
                models.Machine(name="Solda Lateral 1", code="SOL-LAT-01", sector="Painéis", has_production_control=True),
                models.Machine(name="Solda Lateral 2", code="SOL-LAT-02", sector="Painéis", has_production_control=True),
                models.Machine(name="Solda Ponto 1", code="SOL-PTO-01", sector="Painéis", has_production_control=True),
                models.Machine(name="Solda Ponto 2", code="SOL-PTO-02", sector="Painéis", has_production_control=True),
                models.Machine(name="Revisão", code="REV-01", sector="Painéis", has_production_control=False),
                models.Machine(name="Solda Manual", code="SOL-MAN-01", sector="Painéis", has_production_control=False),
            ]
            db.add_all(machines)
            db.commit()
            print("[OK] Maquinas cadastradas com sucesso.")

        # 2. Catálogo de Painéis (inicialmente vazio para cadastro real pelo usuário)
        pass
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
