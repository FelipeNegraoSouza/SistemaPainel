import io
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

from backend import models

# Constantes de Metas
DEFAULT_META_DIA = 2500.0
DEFAULT_META_MES = 52500.0

class NumberedCanvas(canvas.Canvas):
    """
    Canvas com numeração de páginas em dois passos (Página X de Y)
    e rodapé institucional padronizado.
    """
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
        
        # Linha separadora do rodapé
        page_w, page_h = landscape(A4)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(20, 22, page_w - 20, 22)
        
        # Textos do rodapé
        left_text = "Sistema Integrado de Apontamentos Industriais • Setor de Painéis Corrugados • Documento Oficial Imutável"
        right_text = f"Página {self._pageNumber} de {page_count}"
        
        self.drawString(20, 12, left_text)
        self.drawRightString(page_w - 20, 12, right_text)
        self.restoreState()


def get_previous_night_date(date_str: str) -> str:
    try:
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d")
        prev = dt - timedelta(days=1)
        return prev.strftime("%Y-%m-%d")
    except Exception:
        return date_str


def format_minutes_to_hours(minutes: Optional[int]) -> str:
    if not minutes or minutes <= 0:
        return "0h 00m"
    h = minutes // 60
    m = minutes % 60
    return f"{h}h {m:02d}m"


def calculate_month_accumulated_solda_lateral(db: Session, date_obj: datetime, current_day_solda_l: float) -> float:
    """
    Calcula a produção acumulada no mês da Solda Lateral até a data informada.
    """
    try:
        first_day_of_month = date_obj.replace(day=1)
        first_day_str = first_day_of_month.strftime("%Y-%m-%d")
        current_date_str = date_obj.strftime("%Y-%m-%d")

        sessions_month = db.query(models.ProductionSession).join(models.Machine).filter(
            models.ProductionSession.reference_date >= first_day_str,
            models.ProductionSession.reference_date <= current_date_str,
            models.Machine.name.ilike("%SOLDA LATERAL%")
        ).all()

        total_accumulated = 0.0
        for s in sessions_month:
            for e in s.entries:
                qty = e.qty_produced or 0
                unit_w = 0.0
                if e.product and e.product.unit_weight_kg:
                    unit_w = float(e.product.unit_weight_kg)
                total_accumulated += (qty * unit_w)

        return round(total_accumulated, 2)
    except Exception:
        return current_day_solda_l


def generate_daily_production_pdf(reference_date: str, db: Session) -> bytes:
    """
    Gera o Relatório Diário de Produção em PDF de alta resolução,
    estruturado e imutável para a data de referência informada.
    """
    # 1. Normalização de datas
    try:
        date_obj = datetime.strptime(reference_date.strip(), "%Y-%m-%d")
    except Exception:
        date_obj = datetime.now()
        reference_date = date_obj.strftime("%Y-%m-%d")

    date_formatted = date_obj.strftime("%d/%m/%Y")
    prev_date_iso = get_previous_night_date(reference_date)
    weekdays_pt = ["SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO", "DOMINGO"]
    weekday_name = weekdays_pt[date_obj.weekday()]

    # 2. Consulta de sessões e apontamentos no SQLite
    sessions = db.query(models.ProductionSession).filter(
        or_(
            and_(models.ProductionSession.reference_date == reference_date, models.ProductionSession.shift == "Diurno"),
            and_(models.ProductionSession.reference_date == prev_date_iso, models.ProductionSession.shift == "Noturno"),
            and_(models.ProductionSession.reference_date == reference_date, models.ProductionSession.shift == "Noturno")
        )
    ).all()

    # 3. Consolidação de apontamentos e métricas
    all_entries = []
    all_stops = []
    
    total_daily_kg = 0.0
    total_solda_lateral_kg = 0.0
    total_dobra_kg = 0.0
    total_solda_ponto_kg = 0.0
    total_outros_kg = 0.0
    
    total_pieces = 0
    total_gross_minutes = 0
    total_stop_minutes = 0
    total_net_minutes = 0
    total_scrap_kg = 0.0

    for s in sessions:
        m_name = s.machine.name if s.machine else f"Máquina {s.machine_id}"
        s_op = s.operator_name or "Operador"
        
        for e in s.entries:
            qty = e.qty_produced or 0
            scrap = float(getattr(e, 'scrap_kg', 0.0) or 0.0)
            gross = e.gross_minutes or 0
            stops_min = e.total_stop_minutes or 0
            net = e.net_minutes or 0
            rate = e.real_rate_per_hour or 0.0
            
            # Peso unitário
            unit_weight = 0.0
            if e.product and e.product.unit_weight_kg:
                unit_weight = float(e.product.unit_weight_kg)
            
            item_kg = round(qty * unit_weight, 2)
            
            total_pieces += qty
            total_daily_kg += item_kg
            total_scrap_kg += scrap
            total_gross_minutes += gross
            total_stop_minutes += stops_min
            total_net_minutes += net
            
            m_upper = m_name.upper()
            if "LATERAL" in m_upper:
                total_solda_lateral_kg += item_kg
            elif "DOBRA" in m_upper:
                total_dobra_kg += item_kg
            elif "PONTO" in m_upper:
                total_solda_ponto_kg += item_kg
            else:
                total_outros_kg += item_kg

            all_entries.append({
                "machine": m_name,
                "operator": e.operator_name or s_op,
                "shift": e.shift or s.shift or "Diurno",
                "start_time": e.start_time,
                "end_time": e.end_time,
                "product_spec": e.product_spec_custom or (e.product.name if e.product else "Painel"),
                "product_code": e.product_code or "-",
                "qty": qty,
                "weight_kg": item_kg,
                "scrap_kg": scrap,
                "gross_min": gross,
                "stop_min": stops_min,
                "net_min": net,
                "rate": rate
            })

            for st in (e.stops or []):
                all_stops.append({
                    "machine": m_name,
                    "operator": e.operator_name or s_op,
                    "interval": f"{st.start_time} - {st.end_time}",
                    "duration": st.duration_minutes,
                    "reason": st.reason
                })

    # Ordenação dos apontamentos
    all_entries.sort(key=lambda x: (x["machine"], x["start_time"]))

    # Cálculos de Metas
    meta_dia = DEFAULT_META_DIA
    pct_meta_dia = (total_solda_lateral_kg / meta_dia * 100.0) if meta_dia > 0 else 0.0
    
    meta_mes = DEFAULT_META_MES
    acumulado_mes = calculate_month_accumulated_solda_lateral(db, date_obj, total_solda_lateral_kg)
    pct_meta_mes = (acumulado_mes / meta_mes * 100.0) if meta_mes > 0 else 0.0

    # 4. Configuração do Documento ReportLab
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
    
    # Estilos Tipográficos Customizados
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=15,
        textColor=colors.HexColor('#0f172a')
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#475569')
    )
    meta_header_style = ParagraphStyle(
        'MetaHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        alignment=2, # Right
        textColor=colors.HexColor('#0f172a')
    )
    meta_sub_style = ParagraphStyle(
        'MetaSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        alignment=2,
        textColor=colors.HexColor('#64748b')
    )
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=4
    )
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
        alignment=1, # Center
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

    story = []

    # --- CABEÇALHO DO RELATÓRIO ---
    emission_time = datetime.now().strftime("%d/%m/%Y às %H:%M")
    header_data = [
        [
            Paragraph("RELATÓRIO DIÁRIO DE APONTAMENTO DE PRODUÇÃO", title_style),
            Paragraph(f"Data Referente: <b>{date_formatted} ({weekday_name})</b>", meta_header_style)
        ],
        [
            Paragraph("SETOR DE PAINÉIS CORRUGADOS • FICHA CONSOLIDADA INDUSTRIAL", subtitle_style),
            Paragraph(f"Emissão do Laudo: {emission_time} • Status: <b>OFICIAL</b>", meta_sub_style)
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

    # --- QUADRO DE INDICADORES / KPIS CONSOLIDADOS ---
    kpi_card_data = [
        [
            Paragraph("PRODUÇÃO TOTAL (KG)", kpi_label_style),
            Paragraph("SOLDA LATERAL / ACAB.", kpi_label_style),
            Paragraph("% META DIA (2.500 kg)", kpi_label_style),
            Paragraph("ACUMULADO MÊS (KG)", kpi_label_style),
            Paragraph("% META MÊS (52.500 kg)", kpi_label_style),
            Paragraph("DOBRA (KG)", kpi_label_style),
            Paragraph("SOLDA PONTO (KG)", kpi_label_style),
            Paragraph("TOTAL PEÇAS", kpi_label_style),
            Paragraph("TEMPO LÍQUIDO", kpi_label_style),
            Paragraph("REFUGO / PERDAS", kpi_label_style)
        ],
        [
            Paragraph(f"{total_daily_kg:,.2f} kg".replace(",", "X").replace(".", ",").replace("X", "."), kpi_val_style),
            Paragraph(f"{total_solda_lateral_kg:,.2f} kg".replace(",", "X").replace(".", ",").replace("X", "."), kpi_val_style),
            Paragraph(f"{pct_meta_dia:.1f}%", kpi_val_style),
            Paragraph(f"{acumulado_mes:,.2f} kg".replace(",", "X").replace(".", ",").replace("X", "."), kpi_val_style),
            Paragraph(f"{pct_meta_mes:.1f}%", kpi_val_style),
            Paragraph(f"{total_dobra_kg:,.2f} kg".replace(",", "X").replace(".", ",").replace("X", "."), kpi_val_style),
            Paragraph(f"{total_solda_ponto_kg:,.2f} kg".replace(",", "X").replace(".", ",").replace("X", "."), kpi_val_style),
            Paragraph(f"{total_pieces:,} pçs".replace(",", "."), kpi_val_style),
            Paragraph(format_minutes_to_hours(total_net_minutes), kpi_val_style),
            Paragraph(f"{total_scrap_kg:,.2f} kg".replace(",", "X").replace(".", ",").replace("X", "."), ParagraphStyle('KpiScrap', parent=kpi_val_style, textColor=colors.HexColor("#e11d48")))
        ]
    ]
    
    # 801 pt disponíveis para 10 colunas (~80pt cada)
    col_w = [82, 85, 78, 85, 78, 76, 76, 75, 80, 86]
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

    # --- TABELA DE APONTAMENTOS DE PRODUÇÃO ---
    story.append(Paragraph("1. REGISTRO DETALHADO DOS INTERVALOS PRODUTIVOS", section_heading))

    table_headers = [
        Paragraph("<b>Máquina</b>", cell_text_bold),
        Paragraph("<b>Operador</b>", cell_text_bold),
        Paragraph("<b>Turno</b>", cell_text_center),
        Paragraph("<b>Horário</b>", cell_text_center),
        Paragraph("<b>Medida Base / Painel</b>", cell_text_bold),
        Paragraph("<b>Qtd</b>", cell_text_center),
        Paragraph("<b>Peso (kg)</b>", cell_text_center),
        Paragraph("<b>Refugo (kg)</b>", cell_text_center),
        Paragraph("<b>T. Bruto</b>", cell_text_center),
        Paragraph("<b>Paradas</b>", cell_text_center),
        Paragraph("<b>T. Líquido</b>", cell_text_center),
        Paragraph("<b>Ritmo</b>", cell_text_center)
    ]

    entries_rows = [table_headers]

    if not all_entries:
        empty_row = [Paragraph("<i>Nenhum intervalo produtivo registrado nesta data.</i>", cell_text_center)] + [""] * 11
        entries_rows.append(empty_row)
    else:
        for e in all_entries:
            row = [
                Paragraph(e["machine"], cell_text_bold),
                Paragraph(e["operator"], cell_text),
                Paragraph(e["shift"], cell_text_center),
                Paragraph(f"{e['start_time']} - {e['end_time']}", cell_text_center),
                Paragraph(e["product_spec"], cell_text),
                Paragraph(f"{e['qty']} pçs", cell_text_center),
                Paragraph(f"{e['weight_kg']:.2f}".replace(".", ","), cell_text_center),
                Paragraph(f"{e['scrap_kg']:.2f}".replace(".", ",") if e["scrap_kg"] > 0 else "-", cell_text_danger if e["scrap_kg"] > 0 else cell_text_center),
                Paragraph(format_minutes_to_hours(e["gross_min"]), cell_text_center),
                Paragraph(f"{e['stop_min']}m" if e["stop_min"] > 0 else "-", cell_text_center),
                Paragraph(f"<b>{format_minutes_to_hours(e['net_min'])}</b>", cell_text_center),
                Paragraph(f"{e['rate']:.1f} p/h" if e["rate"] > 0 else "-", cell_text_center)
            ]
            entries_rows.append(row)

    # Linha de Totais da Tabela
    total_row = [
        Paragraph("<b>TOTAIS DO DIA:</b>", cell_text_bold),
        Paragraph(f"<b>{len(all_entries)} apontamentos</b>", cell_text),
        Paragraph("-", cell_text_center),
        Paragraph("-", cell_text_center),
        Paragraph("-", cell_text_center),
        Paragraph(f"<b>{total_pieces:,} pçs</b>".replace(",", "."), cell_text_center),
        Paragraph(f"<b>{total_daily_kg:,.2f} kg</b>".replace(",", "X").replace(".", ",").replace("X", "."), cell_text_center),
        Paragraph(f"<b>{total_scrap_kg:,.2f} kg</b>".replace(",", "X").replace(".", ",").replace("X", "."), cell_text_danger if total_scrap_kg > 0 else cell_text_center),
        Paragraph(f"<b>{format_minutes_to_hours(total_gross_minutes)}</b>", cell_text_center),
        Paragraph(f"<b>{total_stop_minutes}m</b>", cell_text_center),
        Paragraph(f"<b>{format_minutes_to_hours(total_net_minutes)}</b>", cell_text_center),
        Paragraph("-", cell_text_center)
    ]
    entries_rows.append(total_row)

    # Larguras das 12 colunas (Total = 801 pt)
    entries_widths = [75, 80, 52, 65, 175, 48, 56, 54, 48, 44, 54, 50]
    
    entries_table = Table(entries_rows, colWidths=entries_widths, repeatRows=1)
    
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

    # Destaque de linhas alternadas
    if all_entries:
        for r_i in range(1, len(entries_rows) - 1):
            if r_i % 2 == 0:
                table_style_commands.append(('BACKGROUND', (0, r_i), (-1, r_i), colors.HexColor('#fbfcfd')))

    entries_table.setStyle(TableStyle(table_style_commands))
    story.append(entries_table)
    story.append(Spacer(1, 8))

    # --- QUADRO DE PARADAS DETALHADAS (SE HOUVER) ---
    if all_stops:
        story.append(Paragraph("2. DETALHAMENTO DE PARADAS REGISTRADAS", section_heading))
        
        stops_headers = [
            Paragraph("<b>Máquina</b>", cell_text_bold),
            Paragraph("<b>Operador</b>", cell_text_bold),
            Paragraph("<b>Horário da Parada</b>", cell_text_center),
            Paragraph("<b>Duração</b>", cell_text_center),
            Paragraph("<b>Motivo / Causa da Ocorrência</b>", cell_text_bold)
        ]
        stops_rows = [stops_headers]
        for st in all_stops:
            stops_rows.append([
                Paragraph(st["machine"], cell_text),
                Paragraph(st["operator"], cell_text),
                Paragraph(st["interval"], cell_text_center),
                Paragraph(f"<b>{st['duration']} min</b>", cell_text_center),
                Paragraph(st["reason"], cell_text)
            ])

        stops_widths = [110, 130, 95, 75, 391]
        stops_table = Table(stops_rows, colWidths=stops_widths, repeatRows=1)
        stops_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#fef2f2')),
            ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#ef4444')),
            ('INNERGRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#fecaca')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(stops_table)
        story.append(Spacer(1, 10))

    # --- BLOCO DE ASSINATURAS FORMAIS DE FÁBRICA ---
    sig_data = [
        [
            Paragraph("___________________________________________________<br/><b>OPERADOR / APONTADOR</b><br/><font size=6 color='#64748b'>Responsável pelo Lançamento Físico</font>", cell_text_center),
            Paragraph("___________________________________________________<br/><b>LÍDER DE PRODUÇÃO / TURNO</b><br/><font size=6 color='#64748b'>Validação de Eficiência e Horários</font>", cell_text_center),
            Paragraph("___________________________________________________<br/><b>SUPERVISÃO / PCP / QUALIDADE</b><br/><font size=6 color='#64748b'>Aprovação Final e Fechamento Diário</font>", cell_text_center)
        ]
    ]
    sig_table = Table(sig_data, colWidths=[260, 260, 281])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    
    # Mantém o bloco de assinaturas sempre íntegro
    story.append(KeepTogether([sig_table]))

    # Constrói o documento PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes


def generate_averages_report_pdf(db: Session, machine_id: Optional[int] = None) -> bytes:
    """
    Gera o Relatório Histórico Oficial de Médias e Produtividade por Hora em PDF
    a partir das estatísticas calculadas com Pandas.
    """
    from backend import analytics

    # 1. Obtenção das métricas
    metrics = analytics.calculate_machine_averages(db, machine_id=machine_id)

    # Identificação da máquina se filtrada
    machine_label = "Todas as Máquinas"
    if machine_id:
        machine_obj = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
        if machine_obj:
            machine_label = machine_obj.name

    # 2. Consolidação de KPIs gerais
    total_qty = sum(m.get("total_qty", 0) for m in metrics)
    total_net_hours = sum(m.get("total_net_hours", 0.0) for m in metrics)
    total_stop_minutes = sum(m.get("total_stop_minutes", 0) for m in metrics)
    total_records = sum(m.get("records_count", 0) for m in metrics)
    count_specs = len(metrics)

    avg_rate_overall = round(total_qty / total_net_hours, 2) if total_net_hours > 0 else 0.0
    avg_minutes_per_unit_overall = round((total_net_hours * 60.0) / total_qty, 2) if total_qty > 0 else 0.0

    # 3. Configuração do Documento ReportLab
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

    # Estilos Tipográficos Customizados
    title_style = ParagraphStyle(
        'AvgDocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=15,
        textColor=colors.HexColor('#0f172a')
    )
    subtitle_style = ParagraphStyle(
        'AvgDocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#475569')
    )
    meta_header_style = ParagraphStyle(
        'AvgMetaHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        alignment=2,
        textColor=colors.HexColor('#0f172a')
    )
    meta_sub_style = ParagraphStyle(
        'AvgMetaSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        alignment=2,
        textColor=colors.HexColor('#64748b')
    )
    section_heading = ParagraphStyle(
        'AvgSectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=4
    )
    cell_text = ParagraphStyle(
        'AvgCellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#0f172a')
    )
    cell_text_bold = ParagraphStyle(
        'AvgCellTextBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#0f172a')
    )
    cell_text_center = ParagraphStyle(
        'AvgCellTextCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        alignment=1,
        textColor=colors.HexColor('#0f172a')
    )
    cell_text_badge = ParagraphStyle(
        'AvgCellTextBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        alignment=1,
        textColor=colors.HexColor('#0369a1')
    )
    kpi_label_style = ParagraphStyle(
        'AvgKpiLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=colors.HexColor('#64748b'),
        alignment=1
    )
    kpi_val_style = ParagraphStyle(
        'AvgKpiVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=12,
        textColor=colors.HexColor('#0f172a'),
        alignment=1
    )

    story = []

    # --- CABEÇALHO DO RELATÓRIO ---
    emission_time = datetime.now().strftime("%d/%m/%Y às %H:%M")
    header_data = [
        [
            Paragraph("RELATÓRIO DE MÉDIAS DE TEMPO DE PRODUÇÃO E PRODUTIVIDADE", title_style),
            Paragraph(f"Filtro: <b>{machine_label}</b>", meta_header_style)
        ],
        [
            Paragraph("SETOR DE PAINÉIS CORRUGADOS • ANÁLISE ESTATÍSTICA DE TEMPOS E RITMO POR HORA (PANDAS)", subtitle_style),
            Paragraph(f"Emissão do Laudo: {emission_time} • Status: <b>OFICIAL</b>", meta_sub_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[500, 301])
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

    # --- QUADRO DE INDICADORES / KPIS CONSOLIDADOS ---
    kpi_card_data = [
        [
            Paragraph("TOTAL DE PEÇAS", kpi_label_style),
            Paragraph("HORAS LÍQUIDAS", kpi_label_style),
            Paragraph("RITMO MÉDIO GERAL", kpi_label_style),
            Paragraph("TEMPO MÉDIO / PEÇA", kpi_label_style),
            Paragraph("PARADAS ACUMULADAS", kpi_label_style),
            Paragraph("MEDIDAS / MODELOS", kpi_label_style),
            Paragraph("TOTAL LANÇAMENTOS", kpi_label_style)
        ],
        [
            Paragraph(f"{total_qty:,} pçs".replace(",", "."), kpi_val_style),
            Paragraph(f"{total_net_hours:.2f} h".replace(".", ","), kpi_val_style),
            Paragraph(f"{avg_rate_overall:.2f} pçs/h".replace(".", ","), ParagraphStyle('KpiHighlight', parent=kpi_val_style, textColor=colors.HexColor("#0369a1"))),
            Paragraph(f"{avg_minutes_per_unit_overall:.2f} min/pç".replace(".", ","), kpi_val_style),
            Paragraph(format_minutes_to_hours(total_stop_minutes), ParagraphStyle('KpiWarn', parent=kpi_val_style, textColor=colors.HexColor("#b45309") if total_stop_minutes > 0 else colors.HexColor("#0f172a"))),
            Paragraph(f"{count_specs} itens", kpi_val_style),
            Paragraph(f"{total_records} registros", kpi_val_style)
        ]
    ]

    col_w_kpi = [115, 114, 118, 118, 114, 110, 112] # 801 pt total
    kpi_table = Table(kpi_card_data, colWidths=col_w_kpi)
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

    # --- TABELA DE MÉDIAS E PRODUTIVIDADE ---
    story.append(Paragraph("1. RELAÇÃO CONSOLIDADA DE RITMO HORÁRIO E TEMPO MÉDIO POR MÁQUINA E ESPECIFICAÇÃO", section_heading))

    table_headers = [
        Paragraph("<b>Máquina</b>", cell_text_bold),
        Paragraph("<b>Cód.</b>", cell_text_center),
        Paragraph("<b>Medida Base (Destaque)</b>", cell_text_bold),
        Paragraph("<b>Especificação Completa / Descrição</b>", cell_text_bold),
        Paragraph("<b>Qtd Total</b>", cell_text_center),
        Paragraph("<b>Horas Líq.</b>", cell_text_center),
        Paragraph("<b>Ritmo Médio</b>", cell_text_center),
        Paragraph("<b>T. Médio / Pç</b>", cell_text_center),
        Paragraph("<b>Cap. Teórica</b>", cell_text_center),
        Paragraph("<b>Eficiência</b>", cell_text_center)
    ]

    rows = [table_headers]

    if not metrics:
        empty_row = [Paragraph("<i>Nenhum histórico produtivo encontrado para os filtros selecionados.</i>", cell_text_center)] + [""] * 9
        rows.append(empty_row)
    else:
        for m in metrics:
            p_code = str(m.get("product_code") or "-")
            dimensions = m.get("dimensions") or "-"
            spec = m.get("product_spec") or "-"
            qty = m.get("total_qty", 0)
            net_h = m.get("total_net_hours", 0.0)
            rate = m.get("avg_rate_per_hour", 0.0)
            min_per_unit = m.get("avg_minutes_per_unit", 0.0)
            nominal = m.get("nominal_capacity")
            eff = m.get("efficiency_pct")

            nominal_str = f"{nominal:.1f} p/h".replace(".", ",") if nominal else "-"
            eff_str = f"<b>{eff:.1f}%</b>".replace(".", ",") if eff is not None else "-"

            row = [
                Paragraph(m.get("machine_name", "-"), cell_text_bold),
                Paragraph(p_code, cell_text_center),
                Paragraph(dimensions, cell_text_bold),
                Paragraph(spec, cell_text),
                Paragraph(f"{qty:,} pçs".replace(",", "."), cell_text_center),
                Paragraph(f"{net_h:.2f} h".replace(".", ","), cell_text_center),
                Paragraph(f"<b>{rate:.2f} p/h</b>".replace(".", ","), cell_text_badge),
                Paragraph(f"{min_per_unit:.2f} min".replace(".", ","), cell_text_center),
                Paragraph(nominal_str, cell_text_center),
                Paragraph(eff_str, cell_text_center)
            ]
            rows.append(row)

    # Linha de Totais da Tabela
    total_row = [
        Paragraph("<b>TOTAIS / MÉDIA GERAL:</b>", cell_text_bold),
        Paragraph(f"<b>{count_specs} itens</b>", cell_text_center),
        Paragraph("-", cell_text_center),
        Paragraph(f"<b>{total_records} apontamentos consolidados</b>", cell_text),
        Paragraph(f"<b>{total_qty:,} pçs</b>".replace(",", "."), cell_text_center),
        Paragraph(f"<b>{total_net_hours:.2f} h</b>".replace(".", ","), cell_text_center),
        Paragraph(f"<b>{avg_rate_overall:.2f} p/h</b>".replace(".", ","), cell_text_badge),
        Paragraph(f"<b>{avg_minutes_per_unit_overall:.2f} min</b>".replace(".", ","), cell_text_center),
        Paragraph("-", cell_text_center),
        Paragraph("-", cell_text_center)
    ]
    rows.append(total_row)

    # Larguras das 10 colunas (Total = 801 pt)
    # 85 + 40 + 105 + 195 + 56 + 50 + 70 + 65 + 65 + 70 = 801
    table_widths = [85, 40, 105, 195, 56, 50, 70, 65, 65, 70]

    averages_table = Table(rows, colWidths=table_widths, repeatRows=1)

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

    # Zebra striping
    if metrics:
        for r_i in range(1, len(rows) - 1):
            if r_i % 2 == 0:
                table_style_commands.append(('BACKGROUND', (0, r_i), (-1, r_i), colors.HexColor('#fbfcfd')))

    averages_table.setStyle(TableStyle(table_style_commands))
    story.append(averages_table)
    story.append(Spacer(1, 12))

    # --- BLOCO DE ASSINATURAS FORMAIS DE FÁBRICA ---
    sig_data = [
        [
            Paragraph("___________________________________________________<br/><b>ENGENHARIA DE PROCESSO / TEMPOS & MÉTODOS</b><br/><font size=6 color='#64748b'>Validação de Capacidade e Padrões</font>", cell_text_center),
            Paragraph("___________________________________________________<br/><b>SUPERVISÃO GERAL DE PRODUÇÃO</b><br/><font size=6 color='#64748b'>Acompanhamento de Eficiência de Chão de Fábrica</font>", cell_text_center),
            Paragraph("___________________________________________________<br/><b>PCP / DIRETORIA INDUSTRIAL</b><br/><font size=6 color='#64748b'>Homologação e Planejamento da Demanda</font>", cell_text_center)
        ]
    ]
    sig_table = Table(sig_data, colWidths=[260, 260, 281])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    story.append(KeepTogether([sig_table]))

    # Constrói o documento PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    return pdf_bytes

