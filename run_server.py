import uvicorn

if __name__ == "__main__":
    print("Iniciando API de Apontamentos de Produção - Setor Painéis...")
    print("Acesse no navegador: http://127.0.0.1:7000")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=7000, reload=True)
