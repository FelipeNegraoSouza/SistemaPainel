import sys
import os

# Ajusta path para importar módulos do backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import SessionLocal, engine, Base
from backend import models, crud, schemas, excel_service, analytics

def run_diagnostic():
    print("=" * 60)
    print("INICIANDO VARREDURA COMPLETA DO SISTEMA")
    print("=" * 60)
    
    db = SessionLocal()
    errors = []
    
    # 1. Teste de Banco de Dados
    try:
        machines = crud.get_machines(db)
        print(f"[OK] Banco de Dados conectado: {len(machines)} maquinas cadastradas.")
        for m in machines:
            print(f"     - ID {m.id}: {m.name} (Controle: {m.has_production_control})")
    except Exception as e:
        errors.append(f"Erro ao listar maquinas: {e}")

    # 2. Teste de Produtos / Catalogo
    try:
        products = crud.get_products(db)
        print(f"[OK] Catalogo de Produtos: {len(products)} produtos carregados.")
        if products:
            sample = products[0]
            print(f"     - Exemplo: Cod {sample.code} | {sample.dimensions} | Peso: {sample.unit_weight_kg} kg")
    except Exception as e:
        errors.append(f"Erro ao listar produtos: {e}")

    # 3. Teste de Fichas / Sessoes do Dia
    try:
        test_date = "2026-08-25"
        sessions = crud.get_sessions_by_date(db, test_date)
        print(f"[OK] Fichas para a data {test_date}: {len(sessions)} sessoes encontradas.")
    except Exception as e:
        errors.append(f"Erro ao consultar sessoes por data: {e}")

    # 4. Teste de Excel Service (Caminhos, Preview e Lookup)
    try:
        paths = excel_service.resolve_paths("2026-08-25")
        print(f"[OK] Excel Service - Resolucao de caminhos: {paths['file_name']} em {paths['target_dir']}")
        
        preview = excel_service.get_date_preview("2026-08-25", db)
        print(f"[OK] Excel Service - Preview da data: {preview['total_entries']} apontamentos, {preview['total_pieces']} pecas.")
    except Exception as e:
        errors.append(f"Erro no Excel Service: {e}")

    # 5. Teste de Analytics / Pandas
    try:
        averages = analytics.calculate_machine_averages(db)
        print(f"[OK] Analytics (Pandas): {len(averages)} registros de produtividade calculados.")
    except Exception as e:
        errors.append(f"Erro no modulo Analytics: {e}")

    db.close()

    print("=" * 60)
    if errors:
        print(f"RESULTADO: {len(errors)} ERRO(S) ENCONTRADO(S):")
        for err in errors:
            print(f"  [FALHA] {err}")
        return False
    else:
        print("RESULTADO: TODOS OS TESTES DO BACKEND PASSARAM COM SUCESSO!")
        return True

if __name__ == "__main__":
    success = run_diagnostic()
    sys.exit(0 if success else 1)
