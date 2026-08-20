import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.database import get_db, Base, engine
from backend import models, schemas, crud, analytics, excel_service
from backend.seed_data import init_db

# Inicializa banco e tabelas
init_db()

app = FastAPI(
    title="API de Apontamentos de Produção - Setor Painéis",
    description="Backend modular para coleta de dados industriais, histórico em SQLite e estatísticas com Pandas.",
    version="1.0.0"
)

# Configuração CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Diretório base
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# --- ROTAS DA API ---

@app.get("/api/machines", response_model=List[schemas.MachineResponse])
def list_machines(db: Session = Depends(get_db)):
    """Retorna todas as máquinas cadastradas do setor de painéis."""
    return crud.get_machines(db)


@app.get("/api/products", response_model=List[schemas.ProductResponse])
def list_products(db: Session = Depends(get_db)):
    """Retorna o catálogo de especificações dos painéis."""
    return crud.get_products(db)


@app.post("/api/products", response_model=schemas.ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):
    """Cadastra um novo painel com seu código (PK inteira), medidas, peso e capacidade teórica."""
    existing = crud.get_product_by_code(db, product.code)
    if existing:
        raise HTTPException(status_code=400, detail=f"Já existe um produto cadastrado com o código {product.code}")
    return crud.create_product(db, product)


@app.put("/api/products/{code}", response_model=schemas.ProductResponse)
def update_product(code: int, product_data: schemas.ProductUpdate, db: Session = Depends(get_db)):
    """Atualiza as informações de um painel existente."""
    updated = crud.update_product(db, code, product_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return updated


@app.delete("/api/products/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(code: int, db: Session = Depends(get_db)):
    """Remove um painel do catálogo."""
    success = crud.delete_product(db, code)
    if not success:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return None


@app.post("/api/products/sync-excel")
def sync_products_excel(db: Session = Depends(get_db)):
    """Sincroniza o catálogo de painéis diretamente da aba 'BD' da planilha modelo no drive Y:."""
    try:
        result = excel_service.sync_catalog_from_excel_bd(db)
        return result
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar catálogo do Excel: {str(ex)}")


@app.post("/api/sessions/sync", response_model=schemas.SessionResponse)
def sync_session(session_data: schemas.SessionCreate, db: Session = Depends(get_db)):
    """
    Cria ou recupera a ficha de produção da data, máquina e turno selecionados,
    retornando todos os apontamentos já gravados no banco.
    Garante também a cópia do arquivo modelo se o arquivo diário não existir.
    """
    try:
        excel_service.ensure_daily_sheet_exists(session_data.reference_date)
    except Exception as e:
        print(f"[Aviso Excel] Não foi possível verificar/criar planilha diária: {e}")

    session = crud.get_or_create_session(db, session_data)
    return session


@app.get("/api/sessions/day-sessions", response_model=List[schemas.SessionResponse])
def get_day_sessions(date: str, shift: Optional[str] = None, db: Session = Depends(get_db)):
    """Retorna todas as sessões e apontamentos de todas as máquinas para a data e turno informados."""
    return crud.get_sessions_by_date(db, date, shift)


@app.get("/api/sessions/{session_id}", response_model=schemas.SessionResponse)
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = crud.get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Ficha de produção não encontrada")
    return session


@app.post("/api/sessions/{session_id}/entries", response_model=schemas.EntryResponse, status_code=status.HTTP_201_CREATED)
def add_entry_to_session(session_id: int, entry_data: schemas.EntryCreate, db: Session = Depends(get_db)):
    """Grava um novo intervalo produtivo com suas paradas no banco de dados e sincroniza no Excel."""
    session = crud.get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Ficha de produção não encontrada")
    
    new_entry = crud.create_entry(db, session_id, entry_data)
    
    # Sincroniza automaticamente com o arquivo Excel do dia
    try:
        excel_service.sync_date_to_excel(session.reference_date, db)
    except Exception as e:
        print(f"[Aviso Excel] Falha no auto-sync: {e}")

    return new_entry


@app.put("/api/entries/{entry_id}", response_model=schemas.EntryResponse)
def update_entry(entry_id: int, entry_data: schemas.EntryCreate, db: Session = Depends(get_db)):
    """Atualiza um intervalo produtivo já gravado e ressincroniza o Excel."""
    updated = crud.update_entry(db, entry_id, entry_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    
    if updated.session and updated.session.reference_date:
        try:
            excel_service.sync_date_to_excel(updated.session.reference_date, db)
        except Exception as e:
            print(f"[Aviso Excel] Falha no auto-sync após edição: {e}")

    return updated


@app.delete("/api/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    """Exclui um intervalo produtivo do banco e atualiza a planilha Excel."""
    # Obter a data da sessão antes de excluir para sincronizar o Excel
    entry = db.query(models.ProductionEntry).filter(models.ProductionEntry.id == entry_id).first()
    ref_date = entry.session.reference_date if entry and entry.session else None

    success = crud.delete_entry(db, entry_id)
    if not success:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    
    if ref_date:
        try:
            excel_service.sync_date_to_excel(ref_date, db)
        except Exception as e:
            print(f"[Aviso Excel] Falha no auto-sync após exclusão: {e}")

    return None


@app.get("/api/analytics/machine-averages", response_model=List[schemas.MachineAverageMetric])
def get_machine_averages(machine_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Retorna a média histórica de ritmo (peças/h) e tempo médio por unidade
    calculados com Pandas para cada medida/painel em cada máquina.
    """
    return analytics.calculate_machine_averages(db, machine_id)


@app.get("/api/analytics/production-summary")
def get_production_summary(machine_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Retorna totalizadores e médias diárias e mensais calculados com Pandas."""
    return analytics.calculate_daily_monthly_production(db, machine_id)


# --- ROTAS DE GESTÃO DA PLANILHA DIÁRIA EXCEL (DRIVE Y:) ---

@app.get("/api/excel/status")
def get_excel_status(date: Optional[str] = None):
    """
    Retorna o status da planilha Excel do dia referente, informando se o arquivo
    já existe no drive Y: e o caminho onde está/será salvo.
    """
    try:
        ref_date = date or ""
        paths = excel_service.resolve_paths(ref_date)
        return {
            "status": "success",
            "date_formatted": paths["date_formatted"],
            "date_iso": paths["date_iso"],
            "target_dir": paths["target_dir"],
            "target_filepath": paths["target_filepath"],
            "file_name": paths["file_name"],
            "file_exists": paths["file_exists"],
            "template_path": paths["template_path"],
            "template_exists": paths["template_exists"]
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Erro ao verificar status do Excel: {str(ex)}")


@app.get("/api/excel/preview")
def get_excel_preview(date: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Retorna o resumo prévio dos apontamentos do SQLite para a data informada
    e o status do arquivo correspondente no drive Y:.
    """
    try:
        ref_date = date or ""
        return excel_service.get_date_preview(ref_date, db)
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Erro ao obter prévia da planilha: {str(ex)}")


@app.post("/api/excel/sync")
def sync_excel_sheet(date: Optional[str] = None, force_recreate: bool = False, db: Session = Depends(get_db)):
    """
    Garante a criação do arquivo diário copiando o modelo se necessário (ou recriando do zero
    caso force_recreate=True) e sincroniza todos os apontamentos da data no arquivo Excel.
    """
    try:
        ref_date = date or ""
        result = excel_service.sync_date_to_excel(ref_date, db, force_recreate=force_recreate)
        return result
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar com planilha Excel: {str(ex)}")


@app.get("/api/excel/download")
def download_excel_sheet(date: Optional[str] = None, force_recreate: bool = False, db: Session = Depends(get_db)):
    """
    Sincroniza/garante a planilha da data informada e retorna o arquivo .xlsx
    diretamente para download no navegador.
    """
    try:
        ref_date = date or ""
        paths = excel_service.resolve_paths(ref_date)
        target_filepath = paths["target_filepath"]
        
        # Garante que a planilha esteja gerada e sincronizada
        excel_service.sync_date_to_excel(ref_date, db, force_recreate=force_recreate)
        
        if not os.path.exists(target_filepath):
            raise HTTPException(status_code=404, detail="Arquivo Excel não encontrado após geração.")

        return FileResponse(
            path=target_filepath,
            filename=paths["file_name"],
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Erro ao baixar planilha Excel: {str(ex)}")


# Servir arquivos estáticos do frontend (CSS, JS, imagens)
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=7000, reload=True)
