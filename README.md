# SistemaPainel - Apontamento de Produção (Setor Painéis)

Interface interativa web conectada ao backend **FastAPI**, banco de dados relacional **SQLite (SQLAlchemy)** e módulo analítico com **Pandas** para apontamento, controle de paradas e cálculo de produtividade e médias de produção por máquina e medida base.

---

## 📁 Estrutura do Projeto

```
SistemaPainel/
├── backend/
│   ├── database.py             # Configuração e Sessão do SQLite
│   ├── models.py               # Modelos ORM (Machines, Products, Sessions, Entries, Stops)
│   ├── schemas.py              # Validações Pydantic
│   ├── crud.py                 # Funções de inserção, consulta e exclusão no banco
│   ├── analytics.py            # Análise estatística e médias de produção com Pandas
│   ├── seed_data.py            # Carga padrão inicial de máquinas e catálogo
│   └── main.py                 # Rotas da API FastAPI e serviço estático
│
├── frontend/
│   ├── index.html              # Interface de Apontamento
│   ├── css/
│   │   └── style.css           # Estilos com design system Azul e Branco
│   └── js/
│       └── app.js              # Lógica da interface, integração com API e paradas dinâmicas
│
├── scripts/
│   ├── catalogo_paineis.json   # Lista de especificações e painéis para carga em lote
│   └── alimentar_base.py       # Script para importar / sincronizar catálogo no SQLite
│
├── iniciar.vbs                 # ▶️ INICIADOR OCULTO (1 clique, sem tela preta)
├── iniciar.bat                 # ▶️ Inicializador padrão via Prompt
├── parar.bat                   # ⏹️ Encerra o servidor FastAPI na porta 7000
├── run_server.py               # Script de execução direta do servidor Python
└── requirements.txt            # Dependências Python (fastapi, uvicorn, sqlalchemy, pandas, pydantic)
```

---

## 🚀 Como Iniciar o Sistema

### Opção 1: Inicialização Oculta (Recomendado)
- Dê 2 cliques no arquivo **`iniciar.vbs`**.
- O servidor iniciará em segundo plano (sem abrir tela preta do terminal) e abrirá automaticamente o navegador no endereço:
  👉 **`http://127.0.0.1:7000`**

### Opção 2: Inicialização via Prompt
- Dê 2 cliques no arquivo **`iniciar.bat`** ou rode:
  ```bash
  python run_server.py
  ```

### Para Encerrar o Servidor:
- Dê 2 cliques no arquivo **`parar.bat`**.

---

## 📊 Como Alimentar o Catálogo de Painéis

Você tem 2 formas simples de alimentar os painéis:

### 1. Pela Própria Interface Web
- Na tela principal, clique no botão **"Catálogo de Painéis"** no cabeçalho.
- Preencha o código (número inteiro), descrição, dimensões, peso unitário e capacidade nominal e clique em *Adicionar ao Banco*.

### 2. Em Lote pelo Arquivo JSON / Script
1. Abra o arquivo [`scripts/catalogo_paineis.json`](file:///c:/Users/felipe.souza/Projetos_PCFELIPE/InterfaceApontamentos/scripts/catalogo_paineis.json).
2. Adicione ou edite os painéis com a seguinte estrutura:
   ```json
   {
     "code": 1006,
     "name": "Painel PIR 100mm - 5,00m",
     "specification": "PIR 100mm Branco x Galvalume",
     "dimensions": "5000 x 1150 x 100mm",
     "unit_weight_kg": 65.0,
     "nominal_capacity_per_hour": 28.0
   }
   ```
3. Execute o script no terminal:
   ```bash
   python scripts/alimentar_base.py
   ```
