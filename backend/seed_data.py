from backend.database import engine, Base, SessionLocal
from backend import models

def init_db():
    # Cria todas as tabelas
    Base.metadata.create_all(bind=engine)
    
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
