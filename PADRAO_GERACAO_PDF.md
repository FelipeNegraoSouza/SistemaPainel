# Padrão e Especificação Técnica para Geração de Relatórios PDF

Este documento estabelece a padronagem visual, arquitetural e técnica para geração de relatórios industriais e corporativos em PDF utilizando **Python** e **ReportLab**, baseado no modelo consolidado no `pdf_service.py`.

---

## 1. Visão Geral da Arquitetura

- **Biblioteca**: `reportlab` (módulos `platypus`, `lib.pagesizes`, `lib.styles`, `lib.colors`, `pdfgen.canvas`).
- **Geração em Memória**: Uso de `io.BytesIO()` para renderização direta em buffer de bytes, evitando arquivos temporários em disco.
- **Estrutura de Fluxo**: Uso de `SimpleDocTemplate` + `Flowables` (`Paragraph`, `Table`, `Spacer`, `HRFlowable`, `KeepTogether`).
- **Controle de Paginação**: Canvas de dois passos (`NumberedCanvas`) para contagem dinâmica total (*"Página X de Y"*) e rodapé institucional.

---

## 2. Geometria de Página e Margens

| Propriedade | Valor Padrão (Paisagem) | Valor Padrão (Retrato) |
| :--- | :--- | :--- |
| **Page Size** | `landscape(A4)` (841.89 x 595.27 pt) | `A4` (595.27 x 841.89 pt) |
| **Margem Esquerda** | `20 pt` | `20 pt` |
| **Margem Direita** | `20 pt` | `20 pt` |
| **Margem Superior** | `20 pt` | `20 pt` |
| **Margem Inferior** | `30 pt` (reserva espaço p/ rodapé) | `30 pt` |
| **Largura Útil de Conteúdo** | **~801 pt** (`841.89 - 40`) | **~555 pt** (`595.27 - 40`) |

---

## 3. Design System & Paleta de Cores (Slate Theme)

A paleta adota uma estética executiva/industrial minimalista, moderna e com alto contraste para leitura e impressão física:

| Finalidade | Nome do Tom | Código HEX | Exemplo de Aplicação |
| :--- | :--- | :--- | :--- |
| **Primária / Escura** | Slate 900 | `#0f172a` | Títulos, textos principais, linhas de total |
| **Secundária / Média** | Slate 600 | `#475569` | Subtítulos, descrições secundárias |
| **Muted / Suave** | Slate 500 | `#64748b` | Labels de KPIs, metadados, rodapé institucional |
| **Bordas Principais** | Slate 400 | `#cbd5e1` | Bordas de cards, divisórias e separadores |
| **Grid Interno** | Slate 200 | `#e2e8f0` | Linhas internas de tabelas |
| **Fundo de Cabeçalho** | Slate 100 | `#f1f5f9` | Cabeçalho das tabelas de dados |
| **Fundo de Cards / Totais** | Slate 50 | `#f8fafc` | Fundo do quadro de KPIs e linha de total |
| **Zebra Striping** | Quase Branco | `#fbfcfd` | Linhas pares de tabelas para legibilidade |
| **Destaque / Alerta** | Rose / Red | `#e11d48` / `#ef4444` | Refugos, paradas não programadas, atrasos |
| **Fundo de Alerta** | Red 50 | `#fef2f2` | Cabeçalho e fundo da tabela de paradas |
| **Borda de Alerta** | Red 200 | `#fecaca` | Grid da tabela de paradas |

---

## 4. Tipografia e Estilos de Parágrafo (`ParagraphStyle`)

A tipografia padrão utiliza `Helvetica` e `Helvetica-Bold` com dimensionamento compacto para máxima densidade de informação sem poluição visual.

```python
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

styles = getSampleStyleSheet()

# 1. Título do Documento
title_style = ParagraphStyle(
    'DocTitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=13,
    leading=15,
    textColor=colors.HexColor('#0f172a')
)

# 2. Subtítulo Institucional
subtitle_style = ParagraphStyle(
    'DocSubtitle',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=8,
    leading=10,
    textColor=colors.HexColor('#475569')
)

# 3. Metadados do Cabeçalho (Direita)
meta_header_style = ParagraphStyle(
    'MetaHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=8.5,
    leading=11,
    alignment=2,  # Right
    textColor=colors.HexColor('#0f172a')
)

meta_sub_style = ParagraphStyle(
    'MetaSub',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=7.5,
    leading=10,
    alignment=2,  # Right
    textColor=colors.HexColor('#64748b')
)

# 4. Título de Seção (1., 2., etc.)
section_heading = ParagraphStyle(
    'SectionHeading',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=9,
    leading=12,
    textColor=colors.HexColor('#0f172a'),
    spaceAfter=4
)

# 5. Células de Tabela
cell_text = ParagraphStyle(
    'CellText',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=7.5,
    leading=9.5,
    textColor=colors.HexColor('#0f172a')
)

cell_text_bold = ParagraphStyle(
    'CellTextBold',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=7.5,
    leading=9.5,
    textColor=colors.HexColor('#0f172a')
)

cell_text_center = ParagraphStyle(
    'CellTextCenter',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=7.5,
    leading=9.5,
    alignment=1,  # Center
    textColor=colors.HexColor('#0f172a')
)

cell_text_danger = ParagraphStyle(
    'CellTextDanger',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=7.5,
    leading=9.5,
    alignment=1,
    textColor=colors.HexColor('#e11d48')
)

# 6. Indicadores / KPIs (Cards)
kpi_label_style = ParagraphStyle(
    'KpiLabel',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=7,
    leading=8.5,
    textColor=colors.HexColor('#64748b'),
    alignment=1
)

kpi_val_style = ParagraphStyle(
    'KpiVal',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=10.5,
    leading=12,
    textColor=colors.HexColor('#0f172a'),
    alignment=1
)
```

---

## 5. Componentes Estruturais Padronizados

### A. NumberedCanvas (Numeração e Rodapé em 2 Passos)
Garante numeração exata no formato `Página X de Y` e linha de rodapé com chancela de documento oficial imutável.

```python
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#64748b"))
        
        page_w, _ = landscape(A4)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(20, 22, page_w - 20, 22)
        
        left_text = "Sistema Integrado de Apontamentos Industriais • Documento Oficial Imutável"
        right_text = f"Página {self._pageNumber} de {page_count}"
        
        self.drawString(20, 12, left_text)
        self.drawRightString(page_w - 20, 12, right_text)
        self.restoreState()
```

### B. Cabeçalho Executivo do Documento
Construído com tabela invisível de 2 colunas e `HRFlowable` sólido.

```python
header_data = [
    [
        Paragraph("NOME DO RELATÓRIO / MÓDULO", title_style),
        Paragraph(f"Data Referente: <b>{date_formatted} ({weekday_name})</b>", meta_header_style)
    ],
    [
        Paragraph("SETOR / UNIDADE • DESCRIÇÃO CONSOLIDADA", subtitle_style),
        Paragraph(f"Emissão: {emission_time} • Status: <b>OFICIAL</b>", meta_sub_style)
    ]
]
header_table = Table(header_data, colWidths=[480, 321])
header_table.setStyle(TableStyle([
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ('TOPPADDING', (0, 0), (-1, -1), 0),
    ('LEFTPADDING', (0, 0), (-1, -1), 0),
    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
]))
story.append(header_table)
story.append(Spacer(1, 4))
story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0f172a"), spaceBefore=2, spaceAfter=6))
```

### C. Quadro de Indicadores / Cards de KPIs
Quadro horizontal unificado com múltiplas colunas (ex: 10 colunas ocupando ~801 pt):

```python
kpi_card_data = [
    [
        Paragraph("INDICADOR 1", kpi_label_style),
        Paragraph("INDICADOR 2", kpi_label_style),
        # ...
    ],
    [
        Paragraph("1.250,00 kg", kpi_val_style),
        Paragraph("98.5%", kpi_val_style),
        # ...
    ]
]
col_w = [82, 85, 78, 85, 78, 76, 76, 75, 80, 86]  # Soma = 801 pt
kpi_table = Table(kpi_card_data, colWidths=col_w)
kpi_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
    ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#cbd5e1')),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
    ('TOPPADDING', (0, 0), (-1, 0), 3),
    ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
    ('TOPPADDING', (0, 1), (-1, 1), 1),
    ('BOTTOMPADDING', (0, 1), (-1, 1), 4),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
]))
story.append(kpi_table)
story.append(Spacer(1, 8))
```

### D. Tabela de Dados com Cabeçalho Repetido (`repeatRows=1`) e Zebra
- **`repeatRows=1`**: O cabeçalho se repete automaticamente em quebras de página.
- **Linhas alternadas**: Cor de fundo `#fbfcfd` nas linhas pares.
- **Linha de Totais**: Destaque em `#f8fafc` com linha divisória superior mais forte (`LINEABOVE`).

```python
table_style_commands = [
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
    ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#0f172a')),
    ('INNERGRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#cbd5e1')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 2.5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
    ('LEFTPADDING', (0, 0), (-1, -1), 3),
    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f8fafc')),
    ('LINEABOVE', (0, -1), (-1, -1), 1.0, colors.HexColor('#0f172a'))
]

# Zebra Striping dinâmico
for r_i in range(1, len(entries_rows) - 1):
    if r_i % 2 == 0:
        table_style_commands.append(('BACKGROUND', (0, r_i), (-1, r_i), colors.HexColor('#fbfcfd')))

entries_table.setStyle(TableStyle(table_style_commands))
```

### E. Bloco de Assinaturas Protegido (`KeepTogether`)
Garante que o bloco de validações e assinaturas não seja quebrado ao meio entre páginas.

```python
from reportlab.platypus import KeepTogether

sig_data = [
    [
        Paragraph("___________________________________<br/><b>OPERADOR / RESPONSÁVEL</b><br/><font size=6 color='#64748b'>Lançamento Físico</font>", cell_text_center),
        Paragraph("___________________________________<br/><b>LÍDER DE TURNO</b><br/><font size=6 color='#64748b'>Validação de Eficiência</font>", cell_text_center),
        Paragraph("___________________________________<br/><b>SUPERVISÃO / QUALIDADE</b><br/><font size=6 color='#64748b'>Aprovação Final</font>", cell_text_center)
    ]
]
sig_table = Table(sig_data, colWidths=[260, 260, 281])
sig_table.setStyle(TableStyle([
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
]))
story.append(KeepTogether([sig_table]))
```

---

## 6. Padrões de Formatação de Dados (Helpers PT-BR)

### Formatação Numérica com Vírgula e Ponto:
```python
def format_currency_br(val: float) -> str:
    return f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def format_int_br(val: int) -> str:
    return f"{val:,}".replace(",", ".")
```

### Formatação de Minutos para Horas:
```python
def format_minutes_to_hours(minutes: Optional[int]) -> str:
    if not minutes or minutes <= 0:
        return "0h 00m"
    h = minutes // 60
    m = minutes % 60
    return f"{h}h {m:02d}m"
```

---

## 7. Template Base / Boilerplate para Novos Módulos

Copie o esqueleto abaixo para iniciar um novo gerador de PDF seguindo integralmente este padrão:

```python
import io
from datetime import datetime
from typing import List, Dict, Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#64748b"))
        page_w, _ = landscape(A4)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(20, 22, page_w - 20, 22)
        
        self.drawString(20, 12, "Sistema Corporativo • Relatório Oficial Imutável")
        self.drawRightString(page_w - 20, 12, f"Página {self._pageNumber} de {page_count}")
        self.restoreState()


def generate_custom_report_pdf(data_items: List[Dict[str, Any]]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=20,
        rightMargin=20,
        topMargin=20,
        bottomMargin=30
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('DocTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=13, leading=15, textColor=colors.HexColor('#0f172a'))
    subtitle_style = ParagraphStyle('DocSubtitle', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, textColor=colors.HexColor('#475569'))
    meta_header_style = ParagraphStyle('MetaHeader', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, leading=11, alignment=2, textColor=colors.HexColor('#0f172a'))
    meta_sub_style = ParagraphStyle('MetaSub', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=10, alignment=2, textColor=colors.HexColor('#64748b'))
    section_heading = ParagraphStyle('SectionHeading', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=colors.HexColor('#0f172a'), spaceAfter=4)
    cell_text = ParagraphStyle('CellText', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=colors.HexColor('#0f172a'))
    cell_text_bold = ParagraphStyle('CellTextBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9.5, textColor=colors.HexColor('#0f172a'))
    cell_text_center = ParagraphStyle('CellTextCenter', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, alignment=1, textColor=colors.HexColor('#0f172a'))

    story = []

    # 1. Cabeçalho
    now_str = datetime.now().strftime("%d/%m/%Y às %H:%M")
    header_table = Table([
        [Paragraph("TÍTULO DO RELATÓRIO", title_style), Paragraph(f"Data: <b>{datetime.now().strftime('%d/%m/%Y')}</b>", meta_header_style)],
        [Paragraph("SUBTÍTULO / SETOR OPERACIONAL", subtitle_style), Paragraph(f"Emissão: {now_str} • Status: <b>OFICIAL</b>", meta_sub_style)]
    ], colWidths=[480, 321])
    header_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 1)]))
    story.append(header_table)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0f172a"), spaceBefore=2, spaceAfter=6))

    # 2. Tabela de Dados
    story.append(Paragraph("1. REGISTROS DETALHADOS", section_heading))
    headers = [Paragraph("<b>Item</b>", cell_text_bold), Paragraph("<b>Descrição</b>", cell_text_bold), Paragraph("<b>Status</b>", cell_text_center)]
    table_rows = [headers]
    
    for item in data_items:
        table_rows.append([
            Paragraph(str(item.get("id", "-")), cell_text_bold),
            Paragraph(str(item.get("name", "-")), cell_text),
            Paragraph(str(item.get("status", "-")), cell_text_center),
        ])

    table = Table(table_rows, colWidths=[100, 600, 101], repeatRows=1)
    table_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#0f172a')),
        ('INNERGRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
    ]
    for i in range(1, len(table_rows)):
        if i % 2 == 0:
            table_style.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#fbfcfd')))
    table.setStyle(TableStyle(table_style))
    story.append(table)
    story.append(Spacer(1, 10))

    # 3. Assinaturas
    sig_table = Table([[
        Paragraph("____________________________<br/><b>RESPONSÁVEL</b>", cell_text_center),
        Paragraph("____________________________<br/><b>SUPERVISOR</b>", cell_text_center)
    ]], colWidths=[400, 401])
    sig_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('TOPPADDING', (0,0), (-1,-1), 8)]))
    story.append(KeepTogether([sig_table]))

    doc.build(story, canvasmaker=NumberedCanvas)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
```
