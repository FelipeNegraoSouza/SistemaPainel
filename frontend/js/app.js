/**
 * Sistema de Apontamento de Produção - Setor Painéis
 * Integração com FastAPI + SQLite + Pandas Analytics
 */

document.addEventListener('DOMContentLoaded', () => {
    // Determina URL da API (suporta tanto abrindo via file:/// quanto via http://127.0.0.1:7000)
    const API_BASE_URL = window.location.origin.includes('http') ? window.location.origin : 'http://127.0.0.1:7000';
    const STORAGE_KEY = 'apontamentos_paineis_local_cache';
    
    // --- ESTADO DA APLICAÇÃO ---
    let state = {
        session: {
            id: null,
            date: '',
            operator: '',
            shift: 'Diurno',
            sector: 'Painéis',
            machine_id: 1,
            machine_name: 'Dobra 1'
        },
        machines: [
            { id: 1, name: "Dobra 1", has_production_control: true },
            { id: 2, name: "Dobra 2", has_production_control: true },
            { id: 3, name: "Solda Lateral 1", has_production_control: true },
            { id: 4, name: "Solda Lateral 2", has_production_control: true },
            { id: 5, name: "Solda Ponto 1", has_production_control: true },
            { id: 6, name: "Solda Ponto 2", has_production_control: true },
            { id: 7, name: "Revisão", has_production_control: false },
            { id: 8, name: "Solda Manual", has_production_control: false }
        ],
        productsCatalog: [],
        entries: [],
        allDayEntries: [],
        selectedFilterMachineId: null,
        currentEditingId: null,
        isOnline: false
    };

    const COMMON_STOP_REASONS = [
        "Troca de Bobina / Setup",
        "Ajuste de Injeção de Espuma / PIR / PUR",
        "Manutenção Mecânica",
        "Manutenção Elétrica",
        "Falta de Matéria-Prima (Chapa / Químicos)",
        "Troca de Serra / Corte",
        "Limpeza e Organização da Linha",
        "Refeição / Intervalo Regulamentar",
        "Reunião / DDS / Treinamento",
        "Outro Motivo (Especificar)"
    ];

    // --- ELEMENTOS DO DOM ---
    const dbStatusBadge = document.getElementById('db-status-badge');
    const sessionDateInput = document.getElementById('session-date');
    const sessionMachineSelect = document.getElementById('session-machine');
    const sessionOperatorInput = document.getElementById('session-operator');
    const sessionShiftInput = document.getElementById('session-shift');
    const shiftNightHint = document.getElementById('shift-night-hint');
    const shiftNightText = document.getElementById('shift-night-text');

    const formApontamento = document.getElementById('form-apontamento');
    const formCardTitle = document.getElementById('form-card-title');
    const entryIdInput = document.getElementById('entry-id');
    const entryOperatorInput = document.getElementById('entry-operator');
    const entryMachineSelect = document.getElementById('entry-machine');
    const selectedProductCodeInput = document.getElementById('selected-product-code');
    const productSpecInput = document.getElementById('product-spec');
    const btnClearProduct = document.getElementById('btn-clear-product');
    const productSuggestions = document.getElementById('product-suggestions');
    const productCatalogHint = document.getElementById('product-catalog-hint');
    const hintBaseVal = document.getElementById('hint-base-val');
    const hintCodeVal = document.getElementById('hint-code-val');
    const hintWeight = document.getElementById('hint-weight');
    const hintDescText = document.getElementById('hint-desc-text');

    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const entryShiftInput = document.getElementById('entry-shift');
    const entryShiftIndicator = document.getElementById('entry-shift-indicator');
    const entryShiftBadge = document.getElementById('entry-shift-badge');
    const entryShiftDesc = document.getElementById('entry-shift-desc');
    const productQtyInput = document.getElementById('product-qty');
    const scrapKgInput = document.getElementById('scrap-kg');
    const btnSubmitEntry = document.getElementById('btn-submit-entry');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');

    // Seção de Paradas
    const stopsContainer = document.getElementById('stops-container');
    const btnAddStop = document.getElementById('btn-add-stop');
    const stopsCountBadge = document.getElementById('stops-count');

    // Resumo em Tempo Real
    const summaryGrossTime = document.getElementById('summary-gross-time');
    const summaryStopTime = document.getElementById('summary-stop-time');
    const summaryNetTime = document.getElementById('summary-net-time');
    const summaryRate = document.getElementById('summary-rate');
    const summaryShiftBase = document.getElementById('summary-shift-base');
    const unproductiveReasonInput = document.getElementById('unproductive-reason');

    // Tabela e Listagem
    const entriesTbody = document.getElementById('entries-tbody');
    const emptyEntriesView = document.getElementById('empty-entries-view');
    const entriesCountBadge = document.getElementById('entries-count');
    const currentSheetSubtitle = document.getElementById('current-sheet-subtitle');
    const machineFilterPills = document.getElementById('machine-filter-pills');
    const dayTotalNet = document.getElementById('day-total-net');
    const dayTotalUnproductive = document.getElementById('day-total-unproductive');
    const dayTotalQty = document.getElementById('day-total-qty');
    const kpiTotalUnproductiveTime = document.getElementById('kpi-total-unproductive-time');

    // Duração Oficial dos Turnos: Diurno = 8h 48m (528 min), Noturno = 7h 48m (468 min)
    const SHIFT_MINUTES_DIURNO = 528;
    const SHIFT_MINUTES_NOTURNO = 468;

    function getShiftTotalMinutes(shift) {
        if (shift && String(shift).trim().toLowerCase() === 'noturno') {
            return SHIFT_MINUTES_NOTURNO;
        }
        return SHIFT_MINUTES_DIURNO;
    }

    // Ações Gerais
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    const btnDownloadPdfRecords = document.getElementById('btn-download-pdf-records');
    const btnPrintReport = document.getElementById('btn-print-report');
    const btnPrintRecords = document.getElementById('btn-print-records');
    const btnSyncExcel = document.getElementById('btn-sync-excel');
    const btnSyncExcelText = document.getElementById('btn-sync-excel-text');
    const excelTargetPath = document.getElementById('excel-target-path');
    const excelStatusTag = document.getElementById('excel-status-tag');
    const btnExportJson = document.getElementById('btn-export-json');
    const btnOpenAnalytics = document.getElementById('btn-open-analytics');
    const btnOpenProductsModal = document.getElementById('btn-open-products-modal');

    // Modais
    const modalStopsDetail = document.getElementById('modal-stops-detail');
    const modalStopsContent = document.getElementById('modal-stops-content');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCloseModalFooter = document.getElementById('btn-close-modal-footer');

    const modalAnalytics = document.getElementById('modal-analytics');
    const btnCloseAnalytics = document.getElementById('btn-close-analytics');
    const btnCloseAnalyticsFooter = document.getElementById('btn-close-analytics-footer');
    const filterAnalyticsMachine = document.getElementById('filter-analytics-machine');
    const analyticsTbody = document.getElementById('analytics-tbody');
    const btnDownloadAnalyticsPdf = document.getElementById('btn-download-analytics-pdf');
    const btnPrintAnalyticsPdf = document.getElementById('btn-print-analytics-pdf');
    const btnDownloadAnalyticsPdfFooter = document.getElementById('btn-download-analytics-pdf-footer');

    const modalProducts = document.getElementById('modal-products');
    const btnCloseProducts = document.getElementById('btn-close-products');
    const btnCloseProductsFooter = document.getElementById('btn-close-products-footer');
    const formNewProduct = document.getElementById('form-new-product');
    const productFormTitle = document.getElementById('product-form-title');
    const newProdCode = document.getElementById('new-prod-code');
    const newProdDim = document.getElementById('new-prod-dim');
    const newProdName = document.getElementById('new-prod-name');
    const newProdWeight = document.getElementById('new-prod-weight');
    const btnSubmitProduct = document.getElementById('btn-submit-product');
    const btnSubmitProductText = document.getElementById('btn-submit-product-text');
    const btnCancelEditProd = document.getElementById('btn-cancel-edit-prod');
    const catalogSearchInput = document.getElementById('catalog-search-input');
    const btnSyncCatalogExcel = document.getElementById('btn-sync-catalog-excel');
    const btnSyncCatalogText = document.getElementById('btn-sync-catalog-text');
    const catalogCountBadge = document.getElementById('catalog-count-badge');
    const productsCatalogTbody = document.getElementById('products-catalog-tbody');
    
    // Modal de Regeneração de Planilha Excel
    const btnOpenRegenerateModal = document.getElementById('btn-open-regenerate-modal');
    const btnQuickRegenerate = document.getElementById('btn-quick-regenerate');
    const modalRegenerateExcel = document.getElementById('modal-regenerate-excel');
    const btnCloseRegenerate = document.getElementById('btn-close-regenerate');
    const btnCloseRegenerateFooter = document.getElementById('btn-close-regenerate-footer');
    const regenDateInput = document.getElementById('regen-date-input');
    const regenBtnToday = document.getElementById('regen-btn-today');
    const regenBtnYesterday = document.getElementById('regen-btn-yesterday');
    const regenBtnLastWorkday = document.getElementById('regen-btn-last-workday');
    const regenFileStatusBadge = document.getElementById('regen-file-status-badge');
    const regenStatSessions = document.getElementById('regen-stat-sessions');
    const regenStatEntries = document.getElementById('regen-stat-entries');
    const regenStatPieces = document.getElementById('regen-stat-pieces');
    const regenStatStops = document.getElementById('regen-stat-stops');
    const regenTargetPath = document.getElementById('regen-target-path');
    const regenMachinesTbody = document.getElementById('regen-machines-tbody');
    const regenForceRecreate = document.getElementById('regen-force-recreate');
    const btnRegenExecute = document.getElementById('btn-regen-execute');
    const btnRegenExecuteText = document.getElementById('btn-regen-execute-text');
    const btnRegenDownload = document.getElementById('btn-regen-download');

    let editingProductCode = null;
    let selectedSuggestionIndex = -1;

    // --- FUNÇÕES UTILITÁRIAS ---

    function getDefaultWorkDate() {
        const today = new Date();
        const dayOfWeek = today.getDay();
        let daysToSubtract = 1;

        if (dayOfWeek === 1) daysToSubtract = 3;      // Segunda -> Sexta
        else if (dayOfWeek === 0) daysToSubtract = 2; // Domingo -> Sexta
        else if (dayOfWeek === 6) daysToSubtract = 1; // Sábado -> Sexta

        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - daysToSubtract);

        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function getPreviousNightDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() - 1);
        
        const py = dt.getFullYear();
        const pm = String(dt.getMonth() + 1).padStart(2, '0');
        const pd = String(dt.getDate()).padStart(2, '0');
        return `${py}-${pm}-${pd}`;
    }

    function updateShiftNightHint() {
        // Função no-op após simplificação do cabeçalho
    }

    function timeToMinutes(timeStr) {
        if (!timeStr || !timeStr.includes(':')) return null;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    function formatMinutesToHours(minutes) {
        if (isNaN(minutes) || minutes === null || minutes < 0) return '0h 00m';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${String(m).padStart(2, '0')}m`;
    }

    function calculateTimeDifference(startStr, endStr) {
        const start = timeToMinutes(startStr);
        const end = timeToMinutes(endStr);
        if (start === null || end === null) return 0;
        
        let diff = end - start;
        if (diff < 0) diff += 1440; // Virada de meia-noite
        return diff;
    }

    function detectShiftFromTime(startTimeStr) {
        if (!startTimeStr || !startTimeStr.includes(':')) return 'Diurno';
        const [h, m] = startTimeStr.split(':').map(Number);
        const totalMins = h * 60 + m;
        // Regra: 06:00 (360 min) até 18:00 (1080 min) = Diurno; Restante (18:01 às 05:59) = Noturno
        if (totalMins >= 360 && totalMins <= 1080) {
            return 'Diurno';
        } else {
            return 'Noturno';
        }
    }

    function updateShiftIndicator() {
        if (!entryShiftBadge || !entryShiftIndicator || !entryShiftDesc) return;
        const startTime = startTimeInput.value;
        const shift = detectShiftFromTime(startTime);
        
        if (entryShiftInput) entryShiftInput.value = shift;

        if (shift === 'Diurno') {
            entryShiftIndicator.className = 'entry-shift-indicator diurno';
            entryShiftBadge.className = 'badge-shift diurno';
            entryShiftBadge.innerHTML = '<i class="fa-solid fa-sun"></i> Diurno (06:00 às 18:00)';
            entryShiftDesc.textContent = 'Horário dentro do período diurno (06:00 às 18:00).';
        } else {
            entryShiftIndicator.className = 'entry-shift-indicator noturno';
            entryShiftBadge.className = 'badge-shift noturno';
            entryShiftBadge.innerHTML = '<i class="fa-solid fa-moon"></i> Noturno (Após 18:00 ou antes das 06:00)';
            const dateVal = sessionDateInput.value;
            const prevDate = getPreviousNightDate(dateVal);
            let prevDateDisplay = '';
            if (prevDate) {
                const [py, pm, pd] = prevDate.split('-');
                prevDateDisplay = ` (${pd}/${pm})`;
            }
            entryShiftDesc.textContent = `Turno noturno (18:01 às 05:59) referente à noite anterior${prevDateDisplay}, finalizado pela manhã.`;
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- COMUNICAÇÃO COM O BACKEND FASTAPI + SQLITE ---

    async function checkApiConnection() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/machines`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                state.isOnline = true;
                dbStatusBadge.classList.remove('offline');
                dbStatusBadge.innerHTML = '<i class="fa-solid fa-database"></i> SQLite Conectado (Porta 7000)';
                return true;
            }
        } catch (e) {
            state.isOnline = false;
            dbStatusBadge.classList.add('offline');
            dbStatusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Modo Local (Offline)';
        }
        return false;
    }

    async function loadMachines() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/machines`);
            if (res.ok) {
                state.machines = await res.json();
                renderMachineOptions();
            }
        } catch (e) {
            console.warn("Usando fallback de máquinas locais");
        }
    }

    function renderMachineOptions() {
        if (!state.machines || state.machines.length === 0) return;

        const currentMachineId = state.session.machine_id || 1;
        const optionsHtml = state.machines.map(m => 
            `<option value="${m.id}" ${m.id === currentMachineId ? 'selected' : ''}>
                ${escapeHtml(m.name)} ${!m.has_production_control ? '(Sem controle)' : ''}
            </option>`
        ).join('');

        if (sessionMachineSelect) {
            sessionMachineSelect.innerHTML = optionsHtml;
        }
        if (entryMachineSelect) {
            entryMachineSelect.innerHTML = optionsHtml;
        }

        if (filterAnalyticsMachine) {
            filterAnalyticsMachine.innerHTML = '<option value="">Todas as Máquinas</option>' + 
                state.machines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
        }
    }

    async function loadProductsCatalog() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/products`);
            if (res.ok) {
                state.productsCatalog = await res.json();
                try {
                    localStorage.setItem('products_catalog_cache', JSON.stringify(state.productsCatalog));
                } catch (e) {}
                renderProductsCatalogTable(state.productsCatalog);
                return;
            }
        } catch (e) {
            console.warn("Usando catálogo local / cache:", e);
        }

        try {
            const cached = localStorage.getItem('products_catalog_cache');
            if (cached) {
                state.productsCatalog = JSON.parse(cached);
                renderProductsCatalogTable(state.productsCatalog);
            }
        } catch (err) {
            console.warn("Falha ao ler cache local de produtos:", err);
        }
    }

    function renderProductsCatalogTable(list = null) {
        const items = list !== null ? list : state.productsCatalog;
        if (catalogCountBadge) {
            catalogCountBadge.textContent = `${items.length} de ${state.productsCatalog.length} painéis`;
        }

        if (!items || items.length === 0) {
            productsCatalogTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 1.5rem;">Nenhum painel encontrado.</td></tr>`;
            return;
        }

        productsCatalogTbody.innerHTML = items.map(p => `
            <tr>
                <td><span class="badge-time">#${p.code}</span></td>
                <td><strong style="color: var(--primary-900); font-size: 0.92rem;">${escapeHtml(p.dimensions || '--')}</strong></td>
                <td>
                    <div style="font-weight: 500; font-size: 0.85rem; color: var(--text-main);">${escapeHtml(p.name)}</div>
                </td>
                <td class="text-center"><span class="badge-qty">${p.unit_weight_kg ? p.unit_weight_kg.toFixed(2) + ' kg' : '0.00 kg'}</span></td>
                <td class="text-center" style="white-space: nowrap;">
                    <button type="button" class="btn-icon" data-action="edit-product" data-code="${p.code}" title="Editar Painel">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button type="button" class="btn-icon text-danger" data-action="delete-product" data-code="${p.code}" title="Excluir Painel">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        attachCatalogTableListeners();
    }

    function attachCatalogTableListeners() {
        productsCatalogTbody.querySelectorAll('.btn-icon').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const code = parseInt(btn.dataset.code, 10);
                if (action === 'edit-product') {
                    startEditProduct(code);
                } else if (action === 'delete-product') {
                    deleteProduct(code);
                }
            });
        });
    }

    async function syncSessionWithBackend() {
        const opVal = entryOperatorInput ? entryOperatorInput.value.trim() : (localStorage.getItem('last_operator_name') || 'Operador');
        const shiftFilter = sessionShiftInput ? sessionShiftInput.value : 'Todos';
        const targetMachineId = entryMachineSelect ? parseInt(entryMachineSelect.value, 10) : (sessionMachineSelect ? parseInt(sessionMachineSelect.value, 10) : (state.session.machine_id || 1));
        
        const payload = {
            reference_date: sessionDateInput.value,
            operator_name: opVal || "Operador",
            shift: shiftFilter === 'Todos' ? 'Diurno' : shiftFilter,
            sector: 'Painéis',
            machine_id: targetMachineId
        };

        const selectedMachine = state.machines.find(m => m.id === payload.machine_id);
        const machineName = selectedMachine ? selectedMachine.name : 'Máquina';
        
        state.session = { ...state.session, ...payload, machine_name: machineName };
        if (currentSheetSubtitle) {
            currentSheetSubtitle.textContent = `Data: ${payload.reference_date} | Todas as Máquinas do Dia (Diurno + Noturno)`;
        }

        if (state.isOnline) {
            try {
                // 1. Carrega imediatamente todas as sessões e apontamentos desta data (super rápido do SQLite)
                const shiftParam = shiftFilter && shiftFilter !== 'Todos' ? `&shift=${encodeURIComponent(shiftFilter)}` : '';
                const dayRes = await fetch(`${API_BASE_URL}/api/sessions/day-sessions?date=${payload.reference_date}${shiftParam}`);
                if (dayRes.ok) {
                    const allSessions = await dayRes.json();
                    const allEntries = [];
                    allSessions.forEach(s => {
                        const mName = s.machine ? s.machine.name : `Máquina ${s.machine_id}`;
                        (s.entries || []).forEach(e => {
                            allEntries.push({
                                id: e.id,
                                sessionId: s.id,
                                machineId: s.machine_id,
                                machineName: mName,
                                operatorName: e.operator_name || s.operator_name || 'Operador',
                                shift: e.shift || s.shift || detectShiftFromTime(e.start_time),
                                productSpec: e.product_spec_custom,
                                productCode: e.product_code,
                                startTime: e.start_time,
                                endTime: e.end_time,
                                qty: e.qty_produced,
                                scrapKg: parseFloat(e.scrap_kg) || 0.0,
                                grossMinutes: e.gross_minutes,
                                totalStopMinutes: e.total_stop_minutes,
                                netMinutes: e.net_minutes,
                                ratePerHour: e.real_rate_per_hour,
                                unproductiveReason: e.unproductive_reason || '',
                                stops: (e.stops || []).map(st => ({
                                    id: st.id,
                                    startTime: st.start_time,
                                    endTime: st.end_time,
                                    reason: st.reason,
                                    durationMinutes: st.duration_minutes
                                }))
                            });
                        });
                    });
                    state.allDayEntries = allEntries;
                    renderMachineFilterPills();
                    renderEntriesTable();
                    updateHeaderKPIs();
                }

                // 2. Garante a sessão ativa no banco em paralelo
                fetch(`${API_BASE_URL}/api/sessions/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).then(r => r.ok ? r.json() : null).then(sessionData => {
                    if (sessionData && sessionData.id) {
                        state.session.id = sessionData.id;
                    }
                }).catch(() => {});

                return;
            } catch (e) {
                console.error("Erro ao sincronizar com backend:", e);
            }
        }

        // Fallback local
        renderMachineFilterPills();
        renderEntriesTable();
        updateHeaderKPIs();
    }

    // --- GERENCIAMENTO DE PARADAS DINÂMICAS ---

    function getStopsFromForm() {
        const stopCards = stopsContainer.querySelectorAll('.stop-item-card');
        const stops = [];

        stopCards.forEach(card => {
            const startVal = card.querySelector('.stop-start').value;
            const endVal = card.querySelector('.stop-end').value;
            const reasonVal = card.querySelector('.stop-reason-input').value.trim();
            const duration = calculateTimeDifference(startVal, endVal);

            if (startVal && endVal) {
                stops.push({
                    id: card.dataset.stopId || ('stop_' + Date.now() + Math.random()),
                    startTime: startVal,
                    endTime: endVal,
                    reason: reasonVal || 'Parada não especificada',
                    durationMinutes: duration
                });
            }
        });

        return stops;
    }

    function addStopRow(stopData = null) {
        const emptyMsg = document.getElementById('empty-stops-msg');
        if (emptyMsg) emptyMsg.remove();

        const stopId = stopData ? stopData.id : ('stop_' + Date.now() + Math.floor(Math.random() * 1000));
        const startTime = stopData ? stopData.startTime : (startTimeInput.value || '');
        const endTime = stopData ? stopData.endTime : '';
        const reason = stopData ? stopData.reason : COMMON_STOP_REASONS[0];

        const stopCard = document.createElement('div');
        stopCard.className = 'stop-item-card';
        stopCard.dataset.stopId = stopId;

        const reasonsOptionsHtml = COMMON_STOP_REASONS.map(r => 
            `<option value="${r}" ${r === reason ? 'selected' : ''}>${r}</option>`
        ).join('');

        stopCard.innerHTML = `
            <input type="time" class="stop-start" value="${startTime}" title="Início da Parada" required>
            <input type="time" class="stop-end" value="${endTime}" title="Fim da Parada" required>
            <input type="text" class="stop-reason-input" value="${reason}" placeholder="Motivo da parada" list="reasons-list" required>
            <button type="button" class="btn-remove-stop" title="Remover Parada">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;

        if (!document.getElementById('reasons-list')) {
            const datalist = document.createElement('datalist');
            datalist.id = 'reasons-list';
            datalist.innerHTML = reasonsOptionsHtml;
            document.body.appendChild(datalist);
        }

        stopCard.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', updateLiveSummary);
        });

        stopCard.querySelector('.btn-remove-stop').addEventListener('click', () => {
            stopCard.remove();
            checkEmptyStopsMessage();
            updateLiveSummary();
        });

        stopsContainer.appendChild(stopCard);
        checkEmptyStopsMessage();
        updateLiveSummary();
    }

    function checkEmptyStopsMessage() {
        const stopCards = stopsContainer.querySelectorAll('.stop-item-card');
        stopsCountBadge.textContent = stopCards.length;

        if (stopCards.length === 0 && !document.getElementById('empty-stops-msg')) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'empty-stops-msg';
            emptyMsg.id = 'empty-stops-msg';
            emptyMsg.innerHTML = '<i class="fa-regular fa-circle-check"></i> Nenhuma parada registrada neste intervalo.';
            stopsContainer.appendChild(emptyMsg);
        }
    }

    function clearStopsContainer() {
        stopsContainer.innerHTML = '';
        checkEmptyStopsMessage();
    }

    // --- PESQUISA INTELIGENTE E AUTOCOMPLETE DE PAINÉIS (MEDIDA BASE) ---

    function normalizeText(text) {
        if (!text) return '';
        return String(text)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function tokenizeSearchQuery(text) {
        let norm = normalizeText(text);
        // Separa digitos e letras colados, ex: 700mm -> 700 mm, 43x -> 43 x
        norm = norm.replace(/(\d+)([a-z]+)/g, '$1 $2').replace(/([a-z]+)(\d+)/g, '$1 $2');
        // Sinonimos comuns de busca de painel
        norm = norm.replace(/\bpainel\b|\bpaineis\b/g, 'p corrugado');
        const rawTokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
        // Filtra ruidos para que 'mm' ou 'x' ou 'de' nao travem o match
        const meaningful = rawTokens.filter(t => !['mm', 'x', 'de', 'do', 'da', 'em', 'com'].includes(t));
        return meaningful.length > 0 ? meaningful : rawTokens;
    }

    function searchProducts(query) {
        if (!state.productsCatalog || state.productsCatalog.length === 0) return [];
        if (!query || !query.trim()) {
            return state.productsCatalog.slice(0, 15);
        }

        const qNorm = normalizeText(query);
        const qCode = qNorm.replace(/^#+/, '').trim();
        const qTokens = tokenizeSearchQuery(query);
        const qCompact = qNorm.replace(/[^a-z0-9]/g, '');

        const matches = [];

        for (const p of state.productsCatalog) {
            const codeStr = String(p.code || '');
            const dimNorm = normalizeText(p.dimensions || '');
            const nameNorm = normalizeText(p.name || '');
            const specNorm = normalizeText(p.specification || '');
            const dimCompact = dimNorm.replace(/[^a-z0-9]/g, '');
            const nameCompact = nameNorm.replace(/[^a-z0-9]/g, '');

            let score = 0;

            // 1. Código exato / parcial (ex: #280 ou 280)
            if (qCode) {
                if (codeStr === qCode) score += 1000;
                else if (codeStr.startsWith(qCode)) score += 700;
                else if (codeStr.includes(qCode)) score += 500;
            }

            // 2. Medida compacta direta (ex: "700x43", "700*43", "700 43 180" bate com "700 X 43 X 180")
            if (qCompact) {
                if (dimCompact === qCompact) score += 900;
                else if (dimCompact.startsWith(qCompact)) score += 650;
                else if (dimCompact.includes(qCompact)) score += 450;
                else if (nameCompact.includes(qCompact)) score += 350;
            }

            // 3. Match de tokens em qualquer ordem com expansao de 'P.'
            if (qTokens.length > 0) {
                const fullPool = `${codeStr} ${dimNorm} ${nameNorm} ${specNorm}`.replace(/\bp\.\b/g, 'p painel corrugado');
                const allTokensMatch = qTokens.every(token => fullPool.includes(token));
                if (allTokensMatch) {
                    score += 300 + (qTokens.length * 25);
                    if (qTokens.every(token => dimNorm.includes(token))) {
                        score += 200;
                    }
                }
            }

            if (score > 0) {
                matches.push({ product: p, score });
            }
        }

        matches.sort((a, b) => b.score - a.score);
        return matches.slice(0, 25).map(m => m.product);
    }

    function showProductHint(product) {
        if (!product) {
            productCatalogHint.classList.add('hidden');
            return;
        }
        hintBaseVal.textContent = product.dimensions || product.name;
        hintCodeVal.textContent = `#${product.code}`;
        const weightVal = typeof product.unit_weight_kg === 'number' ? product.unit_weight_kg.toFixed(2) : (parseFloat(product.unit_weight_kg) || 0).toFixed(2);
        hintWeight.innerHTML = `<i class="fa-solid fa-weight-hanging"></i> Peso: <strong>${weightVal} kg</strong>`;
        hintDescText.textContent = product.name || product.dimensions;
        productCatalogHint.classList.remove('hidden');
    }

    function handleProductSearchInput() {
        const rawVal = productSpecInput.value;
        const query = rawVal.trim();
        
        if (!query) {
            btnClearProduct.classList.add('hidden');
            selectedProductCodeInput.value = '';
            productCatalogHint.classList.add('hidden');
            // Exibe os painéis principais do catálogo ao focar/clicar
            const topDefault = (state.productsCatalog || []).slice(0, 20);
            renderProductSuggestions(topDefault);
            return;
        }

        btnClearProduct.classList.remove('hidden');

        const topResults = searchProducts(query);
        renderProductSuggestions(topResults);

        // Se o usuário digitou exatamente o código ou medida correspondente, atualiza o cartão de dados em tempo real
        const qNorm = normalizeText(query);
        const qCode = qNorm.replace(/^#+/, '').trim();
        const qCompact = qNorm.replace(/[^a-z0-9]/g, '');

        const exactMatch = topResults.find(p => {
            const codeStr = String(p.code || '');
            const dimCompact = normalizeText(p.dimensions || '').replace(/[^a-z0-9]/g, '');
            const dimNorm = normalizeText(p.dimensions || '');
            return (qCode && codeStr === qCode) || (qCompact && dimCompact === qCompact) || (dimNorm === qNorm);
        });

        if (exactMatch) {
            selectedProductCodeInput.value = exactMatch.code;
            showProductHint(exactMatch);
        } else if (selectedProductCodeInput.value) {
            const currentSelected = state.productsCatalog.find(p => p.code === parseInt(selectedProductCodeInput.value, 10));
            if (currentSelected) {
                const curDimCompact = normalizeText(currentSelected.dimensions || '').replace(/[^a-z0-9]/g, '');
                if (!curDimCompact.includes(qCompact) && !String(currentSelected.code).includes(qCode)) {
                    selectedProductCodeInput.value = '';
                    productCatalogHint.classList.add('hidden');
                }
            }
        }
    }

    function renderProductSuggestions(products) {
        if (!products || products.length === 0) {
            productSuggestions.innerHTML = `
                <div style="padding: 0.85rem; font-size: 0.85rem; color: var(--text-muted); text-align: center;">
                    Nenhum painel cadastrado com essa medida/código.<br>
                    <small>Você pode continuar digitando a medida livremente.</small>
                </div>
            `;
            productSuggestions.classList.remove('hidden');
            selectedSuggestionIndex = -1;
            return;
        }

        productSuggestions.innerHTML = products.map((p, idx) => {
            const weightVal = typeof p.unit_weight_kg === 'number' ? p.unit_weight_kg.toFixed(2) : (parseFloat(p.unit_weight_kg) || 0).toFixed(2);
            return `
            <div class="product-dropdown-item" data-code="${p.code}" data-index="${idx}">
                <div class="p-item-top">
                    <span class="p-item-dim">${escapeHtml(p.dimensions || p.name)}</span>
                    <div class="p-item-badges">
                        <span class="p-item-code">#${p.code}</span>
                        <span class="p-item-weight"><i class="fa-solid fa-weight-hanging"></i> ${weightVal} kg</span>
                    </div>
                </div>
                <div class="p-item-desc">${escapeHtml(p.name)}</div>
            </div>
            `;
        }).join('');

        selectedSuggestionIndex = -1;
        productSuggestions.classList.remove('hidden');

        productSuggestions.querySelectorAll('.product-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const code = parseInt(item.dataset.code, 10);
                const prod = state.productsCatalog.find(p => p.code === code);
                if (prod) {
                    selectProduct(prod);
                }
            });
        });
    }

    function selectProduct(product) {
        productSpecInput.value = product.dimensions || product.name;
        selectedProductCodeInput.value = product.code;

        showProductHint(product);
        btnClearProduct.classList.remove('hidden');
        hideProductSuggestions();
        startTimeInput.focus();
    }

    function clearSelectedProduct() {
        productSpecInput.value = '';
        selectedProductCodeInput.value = '';
        productCatalogHint.classList.add('hidden');
        btnClearProduct.classList.add('hidden');
        hideProductSuggestions();
        productSpecInput.focus();
    }

    function hideProductSuggestions() {
        productSuggestions.classList.add('hidden');
        selectedSuggestionIndex = -1;
    }

    function handleProductKeyNavigation(e) {
        if (productSuggestions.classList.contains('hidden')) return;

        const items = productSuggestions.querySelectorAll('.product-dropdown-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
            updateActiveSuggestion(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
            updateActiveSuggestion(items);
        } else if (e.key === 'Enter') {
            if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < items.length) {
                e.preventDefault();
                items[selectedSuggestionIndex].click();
            } else if (items.length > 0) {
                e.preventDefault();
                items[0].click();
            }
        } else if (e.key === 'Escape') {
            hideProductSuggestions();
        }
    }

    function updateActiveSuggestion(items) {
        items.forEach((item, idx) => {
            if (idx === selectedSuggestionIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    // --- CÁLCULO DO RESUMO EM TEMPO REAL ---

    function updateLiveSummary() {
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;
        const qty = parseFloat(productQtyInput.value) || 0;

        // Atualiza dinamicamente o indicador visual do turno detectado
        updateShiftIndicator();

        let grossMinutes = 0;
        if (startTime && endTime) {
            grossMinutes = calculateTimeDifference(startTime, endTime);
        }

        const stops = getStopsFromForm();
        const totalStopMinutes = stops.reduce((acc, s) => acc + s.durationMinutes, 0);

        let netMinutes = grossMinutes - totalStopMinutes;
        if (netMinutes < 0) netMinutes = 0;

        summaryGrossTime.textContent = formatMinutesToHours(grossMinutes);
        summaryStopTime.textContent = formatMinutesToHours(totalStopMinutes);
        summaryNetTime.textContent = formatMinutesToHours(netMinutes);

        if (netMinutes > 0 && qty > 0) {
            const hoursDecimal = netMinutes / 60;
            const ratePerHour = (qty / hoursDecimal).toFixed(1);
            summaryRate.textContent = `${ratePerHour} pçs/h`;
        } else {
            summaryRate.textContent = `-- pçs/h`;
        }

        const detectedShift = detectShiftFromTime(startTime);
        if (summaryShiftBase) {
            summaryShiftBase.textContent = detectedShift === 'Noturno' ? '7h 48m (Noturno)' : '8h 48m (Diurno)';
        }
    }

    // --- RENDERIZAÇÃO DA TABELA DE APONTAMENTOS ---


    function getMachineClass(name) {
        const upper = (name || '').toUpperCase();
        if (upper.includes('DOBRA')) return 'dobra';
        if (upper.includes('LATERAL')) return 'solda-lateral';
        if (upper.includes('PONTO')) return 'solda-ponto';
        return 'outros';
    }

    function renderMachineFilterPills() {
        if (!machineFilterPills) return;

        const allEntries = state.allDayEntries || [];
        const machineCounts = {};
        
        allEntries.forEach(e => {
            if (!machineCounts[e.machineId]) {
                machineCounts[e.machineId] = { id: e.machineId, name: e.machineName, count: 0 };
            }
            machineCounts[e.machineId].count++;
        });

        const machinesWithEntries = Object.values(machineCounts);
        
        let html = `
            <button type="button" class="machine-pill ${state.selectedFilterMachineId === null ? 'active' : ''}" data-filter-id="all">
                <i class="fa-solid fa-layer-group"></i> Todas as Máquinas 
                <span class="machine-pill-count">${allEntries.length}</span>
            </button>
        `;

        machinesWithEntries.forEach(m => {
            html += `
                <button type="button" class="machine-pill ${state.selectedFilterMachineId === m.id ? 'active' : ''}" data-filter-id="${m.id}">
                    <i class="fa-solid fa-gear"></i> ${escapeHtml(m.name)} 
                    <span class="machine-pill-count">${m.count}</span>
                </button>
            `;
        });

        machineFilterPills.innerHTML = html;

        machineFilterPills.querySelectorAll('.machine-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const filterVal = btn.dataset.filterId;
                state.selectedFilterMachineId = filterVal === 'all' ? null : parseInt(filterVal, 10);
                renderMachineFilterPills();
                renderEntriesTable();
            });
        });
    }

    function renderEntriesTable() {
        let entriesToDisplay = state.allDayEntries || [];
        if (state.selectedFilterMachineId !== null) {
            entriesToDisplay = entriesToDisplay.filter(e => e.machineId === state.selectedFilterMachineId);
        }

        if (entriesCountBadge) {
            entriesCountBadge.textContent = entriesToDisplay.length;
        }

        if (entriesToDisplay.length === 0) {
            entriesTbody.innerHTML = '';
            emptyEntriesView.classList.remove('hidden');
            dayTotalNet.textContent = '0h 00m';
            if (dayTotalUnproductive) dayTotalUnproductive.textContent = '0h 00m';
            dayTotalQty.textContent = '0';
            return;
        }

        emptyEntriesView.classList.add('hidden');
        entriesTbody.innerHTML = '';

        let sumNetMinutes = 0;
        let sumQty = 0;

        // Ordena por máquina e depois por horário
        const sortedEntries = [...entriesToDisplay].sort((a, b) => {
            const mComp = (a.machineName || '').localeCompare(b.machineName || '');
            if (mComp !== 0) return mComp;
            return (a.startTime || '').localeCompare(b.startTime || '');
        });

        sortedEntries.forEach(entry => {
            sumNetMinutes += entry.netMinutes || 0;
            sumQty += entry.qty || 0;

            const tr = document.createElement('tr');

            let stopsHtml = `<span class="badge-stops-zero">Nenhuma</span>`;
            if (entry.stops && entry.stops.length > 0) {
                stopsHtml = `
                    <button type="button" class="badge-stops-pill" data-entry-id="${entry.id}" title="Ver detalhes das paradas">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        ${entry.stops.length} (${formatMinutesToHours(entry.totalStopMinutes)})
                    </button>
                `;
            }

            const rateDisplay = entry.ratePerHour ? `${entry.ratePerHour} pçs/h` : '--';
            const detectedShift = entry.shift || detectShiftFromTime(entry.startTime);
            const isNight = detectedShift === 'Noturno';
            const shiftClass = isNight ? 'noturno' : 'diurno';
            const shiftIcon = isNight ? 'fa-moon' : 'fa-sun';
            const shiftLabel = isNight ? 'Noturno' : 'Diurno';
            const opDisplay = entry.operatorName || 'Operador';

            const unprodReason = entry.unproductiveReason || entry.unproductive_reason || '';
            const unprodHtml = unprodReason 
                ? `<span class="badge-stops-pill" style="color: #b45309; background: #fef3c7; border: 1px solid #fde68a;" title="${escapeHtml(unprodReason)}"><i class="fa-solid fa-hourglass-half"></i> ${escapeHtml(unprodReason)}</span>`
                : '<span class="text-muted">-</span>';

            tr.innerHTML = `
                <td>
                    <span class="badge-machine ${getMachineClass(entry.machineName)}">
                        <i class="fa-solid fa-gear"></i> ${escapeHtml(entry.machineName)}
                    </span>
                </td>
                <td>
                    <span class="badge-operator" title="Operador da vez: ${escapeHtml(opDisplay)}">
                        <i class="fa-solid fa-user-gear"></i> ${escapeHtml(opDisplay)}
                    </span>
                </td>
                <td>
                    <span class="badge-shift ${shiftClass}" title="Turno: ${shiftLabel}">
                        <i class="fa-solid ${shiftIcon}"></i> ${shiftLabel}
                    </span>
                </td>
                <td><span class="badge-time">${entry.startTime} - ${entry.endTime}</span></td>
                <td><strong>${escapeHtml(entry.productSpec)}</strong></td>
                <td class="text-center"><span class="badge-qty">${entry.qty} pçs</span></td>
                <td class="text-center">${entry.scrapKg > 0 ? `<span class="badge-stops-pill" style="color: #e11d48; font-weight: 700;">${entry.scrapKg.toFixed(2)} kg</span>` : '<span class="text-muted">-</span>'}</td>
                <td class="text-center">${formatMinutesToHours(entry.grossMinutes)}</td>
                <td class="text-center">${stopsHtml}</td>
                <td class="text-center"><strong>${formatMinutesToHours(entry.netMinutes)}</strong></td>
                <td class="text-center"><span class="badge-rate">${rateDisplay}</span></td>
                <td class="text-center">${unprodHtml}</td>
                <td class="text-center">
                    <div class="table-actions">
                        <button type="button" class="btn-icon" data-action="edit" data-id="${entry.id}" title="Editar este intervalo">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="btn-icon" data-action="duplicate" data-id="${entry.id}" title="Duplicar como novo intervalo">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button type="button" class="btn-icon delete" data-action="delete" data-id="${entry.id}" title="Excluir intervalo">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;

            entriesTbody.appendChild(tr);
        });

        // Apuração do Tempo Total de Turno esperado (Diurno: 8h48m = 528 min, Noturno: 7h48m = 468 min)
        const activeMachineShifts = new Set();
        entriesToDisplay.forEach(entry => {
            const shift = entry.shift || detectShiftFromTime(entry.startTime);
            activeMachineShifts.add(`${entry.machineId || entry.machineName}_${shift}`);
        });

        let totalExpectedShiftMinutes = 0;
        activeMachineShifts.forEach(key => {
            const isNight = key.endsWith('_Noturno');
            totalExpectedShiftMinutes += isNight ? SHIFT_MINUTES_NOTURNO : SHIFT_MINUTES_DIURNO;
        });

        const totalUnproductiveMinutes = Math.max(0, totalExpectedShiftMinutes - sumNetMinutes);

        dayTotalNet.textContent = formatMinutesToHours(sumNetMinutes);
        if (dayTotalUnproductive) {
            dayTotalUnproductive.textContent = formatMinutesToHours(totalUnproductiveMinutes);
        }
        dayTotalQty.textContent = sumQty.toLocaleString('pt-BR');

        attachTableActionListeners();
        updateHeaderKPIs();
    }

    // --- ATUALIZAÇÃO DOS CARDS DE KPI DE PRODUÇÃO DIÁRIA NO CABEÇALHO ---

    function updateHeaderKPIs() {
        const allEntries = state.allDayEntries || [];
        let totalDailyKg = 0.0;
        let totalSoldaLateralKg = 0.0;
        let totalDobraKg = 0.0;
        let totalSoldaPontoKg = 0.0;
        let totalDailyScrapKg = 0.0;
        let totalPieces = 0;
        let totalNetMinutes = 0;

        const DEFAULT_META_DIA = 2500.0;

        allEntries.forEach(entry => {
            const qty = entry.qty || 0;
            totalPieces += qty;
            totalNetMinutes += (entry.netMinutes || 0);
            totalDailyScrapKg += (entry.scrapKg || 0.0);

            // Obter peso unitário
            let unitWeight = 0.0;
            if (entry.productCode) {
                const p = state.productsCatalog.find(prod => prod.code === entry.productCode);
                if (p && p.unit_weight_kg) unitWeight = p.unit_weight_kg;
            }
            if (unitWeight === 0.0 && entry.productSpec) {
                const specUpper = (entry.productSpec || '').toUpperCase().trim();
                const p = state.productsCatalog.find(prod => 
                    (prod.dimensions && prod.dimensions.toUpperCase().trim() === specUpper) || 
                    (prod.name && prod.name.toUpperCase().trim() === specUpper) ||
                    (prod.dimensions && specUpper.includes(prod.dimensions.toUpperCase().trim()))
                );
                if (p && p.unit_weight_kg) unitWeight = p.unit_weight_kg;
            }

            const entryKg = qty * unitWeight;
            totalDailyKg += entryKg;

            const mName = (entry.machineName || '').toUpperCase();
            if (mName.includes('LATERAL')) {
                totalSoldaLateralKg += entryKg;
            } else if (mName.includes('DOBRA')) {
                totalDobraKg += entryKg;
            } else if (mName.includes('PONTO')) {
                totalSoldaPontoKg += entryKg;
            }
        });

        const kpiTotalKg = document.getElementById('kpi-total-kg');
        const kpiSoldaLateralKg = document.getElementById('kpi-solda-lateral-kg');
        const kpiLateralPct = document.getElementById('kpi-lateral-pct');
        const kpiLateralProgress = document.getElementById('kpi-lateral-progress');
        const kpiDobraKg = document.getElementById('kpi-dobra-kg');
        const kpiSoldaPontoKg = document.getElementById('kpi-solda-ponto-kg');
        const kpiTotalPieces = document.getElementById('kpi-total-pieces');
        const kpiTotalNetTime = document.getElementById('kpi-total-net-time');
        const kpiTotalScrapKg = document.getElementById('kpi-total-scrap-kg');

        if (kpiTotalKg) {
            kpiTotalKg.textContent = totalDailyKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (kpiSoldaLateralKg) {
            kpiSoldaLateralKg.textContent = totalSoldaLateralKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (kpiDobraKg) {
            kpiDobraKg.textContent = totalDobraKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
        }
        if (kpiSoldaPontoKg) {
            kpiSoldaPontoKg.textContent = totalSoldaPontoKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
        }
        if (kpiTotalPieces) {
            kpiTotalPieces.textContent = totalPieces.toLocaleString('pt-BR') + ' pçs';
        }
        if (kpiTotalNetTime) {
            kpiTotalNetTime.textContent = formatMinutesToHours(totalNetMinutes);
        }
        if (kpiTotalUnproductiveTime) {
            const activeMachineShifts = new Set();
            allEntries.forEach(entry => {
                const shift = entry.shift || detectShiftFromTime(entry.startTime);
                activeMachineShifts.add(`${entry.machineId || entry.machineName}_${shift}`);
            });

            let totalExpectedShiftMinutes = 0;
            activeMachineShifts.forEach(key => {
                const isNight = key.endsWith('_Noturno');
                totalExpectedShiftMinutes += isNight ? SHIFT_MINUTES_NOTURNO : SHIFT_MINUTES_DIURNO;
            });

            const totalUnproductive = Math.max(0, totalExpectedShiftMinutes - totalNetMinutes);
            kpiTotalUnproductiveTime.textContent = formatMinutesToHours(totalUnproductive);
        }
        if (kpiTotalScrapKg) {
            kpiTotalScrapKg.textContent = totalDailyScrapKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
        }

        const pct = DEFAULT_META_DIA > 0 ? (totalSoldaLateralKg / DEFAULT_META_DIA) * 100 : 0;
        if (kpiLateralPct) {
            kpiLateralPct.textContent = `${pct.toFixed(1)}% da Meta`;
            if (pct >= 100) {
                kpiLateralPct.className = 'kpi-badge-pct success';
            } else if (pct >= 70) {
                kpiLateralPct.className = 'kpi-badge-pct warning';
            } else {
                kpiLateralPct.className = 'kpi-badge-pct';
            }
        }
        if (kpiLateralProgress) {
            kpiLateralProgress.style.width = `${Math.min(100, Math.max(0, pct))}%`;
            if (pct >= 100) {
                kpiLateralProgress.style.background = 'linear-gradient(90deg, #059669, #10b981)';
            } else if (pct >= 70) {
                kpiLateralProgress.style.background = 'linear-gradient(90deg, #d97706, #f59e0b)';
            } else {
                kpiLateralProgress.style.background = 'linear-gradient(90deg, #2563eb, #3b82f6)';
            }
        }
    }

    function attachTableActionListeners() {
        entriesTbody.querySelectorAll('.badge-stops-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const entryId = btn.dataset.entryId;
                openStopsModal(entryId);
            });
        });

        entriesTbody.querySelectorAll('.btn-icon').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const id = btn.dataset.id;

                if (action === 'edit') startEditEntry(id);
                else if (action === 'duplicate') duplicateEntry(id);
                else if (action === 'delete') deleteEntry(id);
            });
        });
    }

    // --- FORMULÁRIO DE SUBMISSÃO (SALVAR APONTAMENTO) ---

    async function handleFormSubmit(e) {
        e.preventDefault();

        const operatorName = entryOperatorInput ? entryOperatorInput.value.trim() : '';
        if (!operatorName) {
            alert('Por favor, preencha o campo de Operador da Vez antes de salvar o intervalo.');
            if (entryOperatorInput) {
                entryOperatorInput.classList.add('is-invalid');
                entryOperatorInput.focus();
                entryOperatorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
        if (entryOperatorInput) entryOperatorInput.classList.remove('is-invalid');

        const productSpec = productSpecInput.value.trim();
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;
        const qty = parseInt(productQtyInput.value, 10);
        const scrapKg = scrapKgInput ? (parseFloat(scrapKgInput.value) || 0.0) : 0.0;
        let productCode = selectedProductCodeInput.value ? parseInt(selectedProductCodeInput.value, 10) : null;

        // Auto-identifica o código caso o operador tenha digitado manualmente sem clicar no dropdown
        if (!productCode && productSpec) {
            const matches = searchProducts(productSpec);
            if (matches.length > 0) {
                productCode = matches[0].code;
            }
        }

        if (!productSpec || !startTime || !endTime || isNaN(qty)) {
            alert('Por favor, preencha todos os campos obrigatórios do intervalo.');
            return;
        }

        const selectedMachineId = entryMachineSelect ? parseInt(entryMachineSelect.value, 10) : state.session.machine_id;
        const selectedMachine = state.machines.find(m => m.id === selectedMachineId);
        const machineName = selectedMachine ? selectedMachine.name : (state.session.machine_name || 'Máquina');

        const detectedShift = detectShiftFromTime(startTime);
        const grossMinutes = calculateTimeDifference(startTime, endTime);
        const stops = getStopsFromForm();
        const totalStopMinutes = stops.reduce((acc, s) => acc + s.durationMinutes, 0);
        let netMinutes = grossMinutes - totalStopMinutes;
        if (netMinutes < 0) netMinutes = 0;

        const ratePerHour = netMinutes > 0 ? parseFloat((qty / (netMinutes / 60)).toFixed(2)) : 0.0;
        const unproductiveReason = unproductiveReasonInput ? unproductiveReasonInput.value.trim() : '';

        const entryPayload = {
            machine_id: selectedMachineId,
            operator_name: operatorName,
            shift: detectedShift,
            product_code: productCode,
            product_spec_custom: productSpec,
            start_time: startTime,
            end_time: endTime,
            qty_produced: qty,
            scrap_kg: scrapKg,
            gross_minutes: grossMinutes,
            total_stop_minutes: totalStopMinutes,
            net_minutes: netMinutes,
            real_rate_per_hour: ratePerHour,
            unproductive_reason: unproductiveReason || null,
            stops: stops.map(s => ({
                start_time: s.startTime,
                end_time: s.endTime,
                reason: s.reason,
                duration_minutes: s.durationMinutes
            }))
        };

        // Salva o último operador digitado para facilitar próximos lançamentos consecutivos
        try {
            localStorage.setItem('last_operator_name', operatorName);
        } catch (e) {}

        if (state.isOnline) {
            try {
                let res;
                const isEditing = state.currentEditingId !== null && state.currentEditingId !== undefined && state.currentEditingId !== '';
                const isBackendNumericId = isEditing && !String(state.currentEditingId).startsWith('entry_') && !isNaN(parseInt(state.currentEditingId, 10));

                if (isEditing && isBackendNumericId) {
                    const numericEntryId = parseInt(state.currentEditingId, 10);
                    // Atualiza intervalo existente (PUT) - o backend já move para a sessão da máquina/turno selecionados
                    res = await fetch(`${API_BASE_URL}/api/entries/${numericEntryId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(entryPayload)
                    });
                } else if (state.session.id) {
                    // Cria novo intervalo (POST)
                    res = await fetch(`${API_BASE_URL}/api/sessions/${state.session.id}/entries`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(entryPayload)
                    });
                }

                if (res && res.ok) {
                    await syncSessionWithBackend();
                    resetEntryForm();
                    startTimeInput.value = endTime;
                    endTimeInput.value = '';
                    productQtyInput.value = '';
                    productSpecInput.focus();
                    updateLiveSummary();
                    return;
                }
            } catch (err) {
                console.error("Erro ao salvar no backend:", err);
            }
        }

        // Fallback local
        if (state.currentEditingId) {
            const idx = state.allDayEntries.findIndex(e => String(e.id) === String(state.currentEditingId));
            if (idx !== -1) {
                state.allDayEntries[idx] = {
                    ...state.allDayEntries[idx],
                    machineId: selectedMachineId,
                    machineName: machineName,
                    operatorName: operatorName,
                    shift: detectedShift,
                    productSpec,
                    productCode,
                    startTime,
                    endTime,
                    qty,
                    grossMinutes,
                    stops,
                    totalStopMinutes,
                    netMinutes,
                    ratePerHour,
                    unproductiveReason
                };
            }
        } else {
            const newEntry = {
                id: 'entry_' + Date.now(),
                sessionId: state.session.id,
                machineId: selectedMachineId,
                machineName: machineName,
                operatorName: operatorName,
                shift: detectedShift,
                productSpec,
                productCode,
                startTime,
                endTime,
                qty,
                grossMinutes,
                stops,
                totalStopMinutes,
                netMinutes,
                ratePerHour,
                unproductiveReason
            };
            state.allDayEntries.push(newEntry);
        }

        renderMachineFilterPills();
        renderEntriesTable();
        resetEntryForm();
        startTimeInput.value = endTime;
        endTimeInput.value = '';
        productQtyInput.value = '';
        productSpecInput.focus();
        updateLiveSummary();
    }

    async function deleteEntry(id) {
        if (!confirm('Deseja realmente excluir este intervalo produtivo?')) return;

        const isBackendNumericId = id !== null && id !== undefined && !String(id).startsWith('entry_') && !isNaN(parseInt(id, 10));

        if (state.isOnline && isBackendNumericId) {
            try {
                const numericEntryId = parseInt(id, 10);
                const res = await fetch(`${API_BASE_URL}/api/entries/${numericEntryId}`, { method: 'DELETE' });
                if (res.ok) {
                    await syncSessionWithBackend();
                    return;
                }
            } catch (e) {
                console.error("Erro ao excluir no backend:", e);
            }
        }

        state.allDayEntries = state.allDayEntries.filter(e => String(e.id) !== String(id));
        renderMachineFilterPills();
        renderEntriesTable();
    }

    function startEditEntry(id) {
        const entry = (state.allDayEntries || []).find(e => String(e.id) === String(id));
        if (!entry) return;

        state.currentEditingId = id;
        formCardTitle.textContent = `Editar Intervalo (${entry.machineName})`;
        btnSubmitEntry.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Intervalo';
        btnCancelEdit.classList.remove('hidden');

        entryIdInput.value = entry.id;
        if (entryOperatorInput) {
            entryOperatorInput.value = entry.operatorName || '';
        }
        if (entryMachineSelect && entry.machineId) {
            entryMachineSelect.value = entry.machineId;
        }
        productSpecInput.value = entry.productSpec;
        selectedProductCodeInput.value = entry.productCode || '';
        startTimeInput.value = entry.startTime;
        endTimeInput.value = entry.endTime;
        productQtyInput.value = entry.qty;
        if (scrapKgInput) {
            scrapKgInput.value = entry.scrapKg > 0 ? entry.scrapKg : '';
        }
        if (unproductiveReasonInput) {
            unproductiveReasonInput.value = entry.unproductiveReason || entry.unproductive_reason || '';
        }

        // Tenta achar o produto no catálogo para preencher os hints
        const foundProd = state.productsCatalog.find(p => p.code === entry.productCode || p.dimensions === entry.productSpec || p.name === entry.productSpec);
        if (foundProd) {
            hintBaseVal.textContent = foundProd.dimensions || foundProd.name;
            hintCodeVal.textContent = `#${foundProd.code}`;
            hintWeight.innerHTML = `<i class="fa-solid fa-weight-hanging"></i> Peso: <strong>${foundProd.unit_weight_kg ? foundProd.unit_weight_kg.toFixed(2) + ' kg' : '0.00 kg'}</strong>`;
            hintDescText.textContent = foundProd.name;
            productCatalogHint.classList.remove('hidden');
            btnClearProduct.classList.remove('hidden');
        } else {
            productCatalogHint.classList.add('hidden');
            if (entry.productSpec) btnClearProduct.classList.remove('hidden');
        }

        clearStopsContainer();
        if (entry.stops && entry.stops.length > 0) {
            entry.stops.forEach(stop => addStopRow(stop));
        }

        updateLiveSummary();
        productSpecInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function cancelEdit() {
        state.currentEditingId = null;
        resetEntryForm();
    }

    function resetEntryForm() {
        state.currentEditingId = null;
        formCardTitle.textContent = 'Novo Intervalo Produtivo';
        btnSubmitEntry.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Intervalo na Ficha';
        btnCancelEdit.classList.add('hidden');

        entryIdInput.value = '';
        if (entryOperatorInput) {
            entryOperatorInput.value = localStorage.getItem('last_operator_name') || '';
            entryOperatorInput.classList.remove('is-invalid');
        }
        if (entryMachineSelect && !entryMachineSelect.value) {
            entryMachineSelect.value = state.session.machine_id || 1;
        }
        selectedProductCodeInput.value = '';
        productSpecInput.value = '';
        startTimeInput.value = '';
        endTimeInput.value = '';
        productQtyInput.value = '';
        if (scrapKgInput) scrapKgInput.value = '';
        if (unproductiveReasonInput) unproductiveReasonInput.value = '';
        productCatalogHint.classList.add('hidden');
        btnClearProduct.classList.add('hidden');
        hideProductSuggestions();
        clearStopsContainer();
        updateLiveSummary();
    }

    function duplicateEntry(id) {
        const entry = (state.allDayEntries || []).find(e => String(e.id) === String(id));
        if (!entry) return;

        if (entryOperatorInput && entry.operatorName) {
            entryOperatorInput.value = entry.operatorName;
        }
        if (entryMachineSelect && entry.machineId) {
            entryMachineSelect.value = entry.machineId;
        }

        productSpecInput.value = entry.productSpec;
        selectedProductCodeInput.value = entry.productCode || '';
        startTimeInput.value = entry.endTime;
        endTimeInput.value = '';
        productQtyInput.value = entry.qty;
        if (scrapKgInput) {
            scrapKgInput.value = entry.scrapKg > 0 ? entry.scrapKg : '';
        }
        if (unproductiveReasonInput) {
            unproductiveReasonInput.value = '';
        }

        const foundProd = state.productsCatalog.find(p => p.code === entry.productCode || p.dimensions === entry.productSpec || p.name === entry.productSpec);
        if (foundProd) {
            hintBaseVal.textContent = foundProd.dimensions || foundProd.name;
            hintCodeVal.textContent = `#${foundProd.code}`;
            hintWeight.innerHTML = `<i class="fa-solid fa-weight-hanging"></i> Peso: <strong>${foundProd.unit_weight_kg ? foundProd.unit_weight_kg.toFixed(2) + ' kg' : '0.00 kg'}</strong>`;
            hintDescText.textContent = foundProd.name;
            productCatalogHint.classList.remove('hidden');
            btnClearProduct.classList.remove('hidden');
        }

        clearStopsContainer();
        updateLiveSummary();
        endTimeInput.focus();
    }

    // --- MODAL DE PARADAS ---

    function openStopsModal(entryId) {
        const entry = (state.allDayEntries || []).find(e => String(e.id) === String(entryId));
        if (!entry || !entry.stops || entry.stops.length === 0) return;

        const detectedShift = entry.shift || detectShiftFromTime(entry.startTime);
        const isNight = detectedShift === 'Noturno';
        const shiftClass = isNight ? 'noturno' : 'diurno';
        const shiftLabel = isNight ? 'Noturno' : 'Diurno';

        let contentHtml = `
            <div style="margin-bottom: 1rem; line-height: 1.6;">
                <p><strong>Máquina:</strong> <span class="badge-machine ${getMachineClass(entry.machineName)}">${escapeHtml(entry.machineName)}</span> | <strong>Operador:</strong> <span class="badge-operator"><i class="fa-solid fa-user-gear"></i> ${escapeHtml(entry.operatorName || 'Operador')}</span> | <strong>Turno:</strong> <span class="badge-shift ${shiftClass}">${shiftLabel}</span></p>
                <p><strong>Produto:</strong> ${escapeHtml(entry.productSpec)}</p>
                <p><strong>Horário do Intervalo:</strong> ${entry.startTime} às ${entry.endTime} (${formatMinutesToHours(entry.grossMinutes)})</p>
                <p><strong>Total em Paradas:</strong> <span style="color: var(--warning-600); font-weight: bold;">${formatMinutesToHours(entry.totalStopMinutes)}</span></p>
            </div>
            <h4 style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase;">Relação de Paradas:</h4>
        `;

        entry.stops.forEach((stop, idx) => {
            contentHtml += `
                <div class="modal-stop-card">
                    <div class="stop-reason">${idx + 1}. ${escapeHtml(stop.reason)}</div>
                    <div class="stop-timing">
                        <span>Horário: <strong>${stop.startTime}</strong> às <strong>${stop.endTime}</strong></span>
                        <span>Duração: <strong>${formatMinutesToHours(stop.durationMinutes)}</strong></span>
                    </div>
                </div>
            `;
        });

        modalStopsContent.innerHTML = contentHtml;
        modalStopsDetail.classList.remove('hidden');
    }

    // --- ANALYTICS / MÉDIAS COM PANDAS ---

    async function loadAndShowAnalytics(machineId = '') {
        try {
            const url = machineId ? `${API_BASE_URL}/api/analytics/machine-averages?machine_id=${machineId}` : `${API_BASE_URL}/api/analytics/machine-averages`;
            const res = await fetch(url);
            if (res.ok) {
                const metrics = await res.json();
                renderAnalyticsTable(metrics);
            }
        } catch (e) {
            analyticsTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Não foi possível carregar as análises do backend.</td></tr>`;
        }
        modalAnalytics.classList.remove('hidden');
    }

    function renderAnalyticsTable(metrics) {
        if (!metrics || metrics.length === 0) {
            analyticsTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 2rem;">Nenhum histórico de produção registrado para calcular médias ainda.</td></tr>`;
            return;
        }

        analyticsTbody.innerHTML = metrics.map(m => `
            <tr>
                <td><strong>${escapeHtml(m.machine_name)}</strong></td>
                <td>
                    ${m.product_code ? `<span class="badge-time">#${m.product_code}</span> ` : ''}
                    <strong>${escapeHtml(m.product_spec)}</strong>
                </td>
                <td class="text-center"><span class="badge-qty">${m.total_qty} pçs</span></td>
                <td class="text-center">${m.total_net_hours}h</td>
                <td class="text-center"><span class="badge-rate">${m.avg_rate_per_hour} pçs/h</span></td>
                <td class="text-center">${m.avg_minutes_per_unit} min/pç</td>
                <td class="text-center">${m.nominal_capacity ? m.nominal_capacity + ' pçs/h' : '--'}</td>
            </tr>
        `).join('');
    }

    // --- GESTÃO, EDIÇÃO E SINCRONIZAÇÃO DO CATÁLOGO DE PAINÉIS ---

    function filterCatalogTable() {
        const query = (catalogSearchInput.value || '').trim();
        if (!query) {
            renderProductsCatalogTable(state.productsCatalog);
            return;
        }

        const filtered = searchProducts(query);
        renderProductsCatalogTable(filtered);
    }

    async function syncCatalogFromExcel() {
        if (!state.isOnline) {
            alert('O backend SQLite/FastAPI precisa estar ativo para sincronizar o catálogo da planilha.');
            return;
        }

        const origText = btnSyncCatalogText.textContent;
        btnSyncCatalogExcel.disabled = true;
        btnSyncCatalogText.textContent = 'Sincronizando aba BD...';

        try {
            const res = await fetch(`${API_BASE_URL}/api/products/sync-excel`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                await loadProductsCatalog();
                alert(`✅ Catálogo atualizado com sucesso a partir da aba BD da Planilha Modelo!\n\nTotal de itens no banco: ${data.total_extracted}\nNovos: ${data.new_count}\nAtualizados: ${data.updated_count}`);
            } else {
                const err = await res.json();
                alert(`⚠️ Erro ao sincronizar catálogo do Excel: ${err.detail || 'Falha na operação'}`);
            }
        } catch (e) {
            alert(`⚠️ Erro de comunicação: ${e.message}`);
        } finally {
            btnSyncCatalogExcel.disabled = false;
            btnSyncCatalogText.textContent = origText;
        }
    }

    function startEditProduct(code) {
        const prod = state.productsCatalog.find(p => p.code === code);
        if (!prod) return;

        editingProductCode = code;
        productFormTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Editando Painel <strong>#${code}</strong>`;
        newProdCode.value = prod.code;
        newProdCode.disabled = true;
        newProdDim.value = prod.dimensions || '';
        newProdName.value = prod.name;
        newProdWeight.value = prod.unit_weight_kg || 0;
        btnSubmitProductText.textContent = 'Atualizar no Banco';
        btnCancelEditProd.classList.remove('hidden');

        formNewProduct.scrollIntoView({ behavior: 'smooth', block: 'start' });
        newProdDim.focus();
    }

    function cancelEditProduct() {
        editingProductCode = null;
        productFormTitle.textContent = 'Cadastrar / Editar Painel na Base';
        newProdCode.value = '';
        newProdCode.disabled = false;
        newProdDim.value = '';
        newProdName.value = '';
        newProdWeight.value = '';
        btnSubmitProductText.textContent = 'Salvar no Banco';
        btnCancelEditProd.classList.add('hidden');
    }

    async function handleProductFormSubmit(e) {
        e.preventDefault();

        const code = parseInt(newProdCode.value, 10);
        const dim = newProdDim.value.trim();
        const name = newProdName.value.trim();
        const weight = parseFloat(newProdWeight.value) || 0.0;

        if (isNaN(code) || !name || !dim) {
            alert("Por favor, preencha o código, a medida base e a descrição do painel.");
            return;
        }

        const payload = {
            code: code,
            name: name,
            specification: name,
            dimensions: dim,
            unit_weight_kg: weight,
            nominal_capacity_per_hour: 0.0
        };

        try {
            let res;
            if (editingProductCode) {
                // Atualizar produto existente (PUT)
                res = await fetch(`${API_BASE_URL}/api/products/${editingProductCode}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                // Cadastrar novo produto (POST)
                res = await fetch(`${API_BASE_URL}/api/products`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                alert(`Painel #${code} gravado com sucesso!`);
                cancelEditProduct();
                await loadProductsCatalog();
            } else {
                const err = await res.json();
                alert(`Erro: ${err.detail || 'Falha ao salvar painel'}`);
            }
        } catch (e) {
            alert('Não foi possível conectar ao servidor para gravar o produto.');
        }
    }

    async function deleteProduct(code) {
        const prod = state.productsCatalog.find(p => p.code === code);
        const name = prod ? prod.name : `#${code}`;
        if (!confirm(`Deseja realmente remover o painel ${name} do catálogo?`)) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/products/${code}`, { method: 'DELETE' });
            if (res.ok) {
                alert(`Painel #${code} removido com sucesso.`);
                if (editingProductCode === code) cancelEditProduct();
                await loadProductsCatalog();
            } else {
                const err = await res.json();
                alert(`Erro: ${err.detail || 'Falha ao remover produto'}`);
            }
        } catch (e) {
            alert(`Erro ao conectar ao servidor: ${e.message}`);
        }
    }

    // --- EXPORTAR JSON ---

    function exportDataToJson() {
        const exportPayload = {
            metadata: {
                exportedAt: new Date().toISOString(),
                version: "2.0",
                sector: "Painéis"
            },
            session: state.session,
            entries: state.entries
        };

        const jsonString = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Apontamento_${state.session.machine_name.replace(/\s+/g, '_')}_${state.session.date || 'sem_data'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- INTEGRAÇÃO COM EXCEL (DRIVE Y:) ---

    async function updateExcelStatus() {
        if (!state.isOnline) return;
        const dateVal = sessionDateInput.value;
        if (!dateVal) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/excel/status?date=${dateVal}`);
            if (res.ok) {
                const data = await res.json();
                if (excelTargetPath) {
                    excelTargetPath.textContent = data.target_filepath;
                }
                if (excelStatusTag) {
                    if (data.file_exists) {
                        excelStatusTag.style.background = 'rgba(16, 124, 65, 0.12)';
                        excelStatusTag.style.color = '#107c41';
                        excelStatusTag.style.borderColor = 'rgba(16, 124, 65, 0.3)';
                        excelStatusTag.innerHTML = `<i class="fa-solid fa-file-circle-check"></i> Ficha ${data.file_name} Criada`;
                    } else {
                        excelStatusTag.style.background = 'rgba(234, 136, 36, 0.12)';
                        excelStatusTag.style.color = '#d97706';
                        excelStatusTag.style.borderColor = 'rgba(234, 136, 36, 0.3)';
                        excelStatusTag.innerHTML = `<i class="fa-solid fa-clock"></i> Cópia pendente (${data.file_name})`;
                    }
                }
            }
        } catch (e) {
            console.warn("Não foi possível obter status do Excel:", e);
        }
    }

    async function syncExcelNow() {
        if (!state.isOnline) {
            alert('O backend SQLite/FastAPI precisa estar ativo para sincronizar o arquivo Excel.');
            return;
        }

        const dateVal = sessionDateInput.value;
        const origText = btnSyncExcelText.textContent;
        btnSyncExcel.disabled = true;
        btnSyncExcelText.textContent = 'Sincronizando...';

        try {
            const res = await fetch(`${API_BASE_URL}/api/excel/sync?date=${dateVal}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                await updateExcelStatus();
                alert(`✅ Ficha Diária Excel atualizada com sucesso!\n\nArquivo: ${data.target_filepath}\nApontamentos gravados: ${data.synced_entries_count}`);
            } else {
                const err = await res.json();
                alert(`⚠️ Erro ao sincronizar com o Excel: ${err.detail || 'Falha na operação'}`);
            }
        } catch (e) {
            alert(`⚠️ Erro de comunicação com o servidor: ${e.message}`);
        } finally {
            btnSyncExcel.disabled = false;
            btnSyncExcelText.textContent = origText;
        }
    }

    // --- REGENERAÇÃO DE PLANILHA PASSADA POR DATA ---

    function getFormattedDateOffset(daysOffset = 0) {
        const d = new Date();
        d.setDate(d.getDate() - daysOffset);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    async function loadRegeneratePreview(dateVal) {
        if (!dateVal) return;
        if (!state.isOnline) {
            if (regenFileStatusBadge) {
                regenFileStatusBadge.className = 'badge-status';
                regenFileStatusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
                regenFileStatusBadge.style.color = '#ef4444';
                regenFileStatusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Servidor Offline';
            }
            return;
        }

        if (regenFileStatusBadge) {
            regenFileStatusBadge.className = 'badge-status';
            regenFileStatusBadge.style.background = 'rgba(100, 116, 139, 0.1)';
            regenFileStatusBadge.style.color = '#64748b';
            regenFileStatusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Consultando SQLite...';
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/excel/preview?date=${dateVal}`);
            if (!res.ok) throw new Error('Falha ao obter prévia');
            const data = await res.json();

            // Atualiza estatísticas
            if (regenStatSessions) regenStatSessions.textContent = data.total_sessions || 0;
            if (regenStatEntries) regenStatEntries.textContent = data.total_entries || 0;
            if (regenStatPieces) regenStatPieces.textContent = (data.total_pieces || 0).toLocaleString('pt-BR');
            if (regenStatStops) regenStatStops.textContent = data.total_stops || 0;

            if (regenTargetPath) {
                regenTargetPath.textContent = data.target_filepath || '...';
            }

            // Atualiza badge de arquivo no drive Y
            if (regenFileStatusBadge) {
                if (data.file_exists) {
                    regenFileStatusBadge.style.background = 'rgba(16, 124, 65, 0.12)';
                    regenFileStatusBadge.style.color = '#107c41';
                    regenFileStatusBadge.style.borderColor = 'rgba(16, 124, 65, 0.3)';
                    regenFileStatusBadge.innerHTML = `<i class="fa-solid fa-file-circle-check"></i> Ficha ${data.file_name} Já Existe no Y:`;
                } else {
                    regenFileStatusBadge.style.background = 'rgba(234, 136, 36, 0.12)';
                    regenFileStatusBadge.style.color = '#d97706';
                    regenFileStatusBadge.style.borderColor = 'rgba(234, 136, 36, 0.3)';
                    regenFileStatusBadge.innerHTML = `<i class="fa-solid fa-clock"></i> Arquivo ${data.file_name} Ainda Não Criado`;
                }
            }

            // Renderiza tabela das máquinas
            if (regenMachinesTbody) {
                if (!data.machines || data.machines.length === 0) {
                    regenMachinesTbody.innerHTML = `
                        <tr>
                            <td colspan="6" class="text-center text-muted" style="padding: 1.25rem;">
                                <i class="fa-solid fa-circle-info" style="color: var(--primary-500); margin-right: 4px;"></i>
                                Nenhum apontamento no banco de dados para <strong>${data.date_display}</strong>.
                                <div style="font-size: 0.76rem; margin-top: 4px; color: var(--text-muted);">
                                    A planilha pode ser criada/regerada limpa com o cabeçalho desta data.
                                </div>
                            </td>
                        </tr>
                    `;
                } else {
                    regenMachinesTbody.innerHTML = data.machines.map(m => `
                        <tr>
                            <td><strong>${m.machine_name}</strong></td>
                            <td>${m.operator_name}</td>
                            <td><span class="badge badge-${m.shift === 'Diurno' ? 'day' : 'night'}">${m.shift}</span></td>
                            <td class="text-center"><strong>${m.entries_count}</strong></td>
                            <td class="text-center"><strong>${m.pieces_sum.toLocaleString('pt-BR')}</strong></td>
                            <td class="text-center">${m.stops_sum > 0 ? `<span style="color: var(--warning-600); font-weight: 600;">${m.stops_sum}</span>` : '0'}</td>
                        </tr>
                    `).join('');
                }
            }
        } catch (e) {
            console.error("Erro na prévia:", e);
            if (regenFileStatusBadge) {
                regenFileStatusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
                regenFileStatusBadge.style.color = '#ef4444';
                regenFileStatusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Erro ao consultar prévia';
            }
        }
    }

    function openRegenerateModal(initialDate) {
        const targetDate = initialDate || sessionDateInput.value || getDefaultWorkDate();
        if (regenDateInput) {
            regenDateInput.value = targetDate;
        }
        if (modalRegenerateExcel) {
            modalRegenerateExcel.classList.remove('hidden');
        }
        loadRegeneratePreview(targetDate);
    }

    async function executeRegenerateExcel() {
        if (!state.isOnline) {
            alert('O backend SQLite/FastAPI precisa estar ativo para sincronizar o arquivo Excel.');
            return;
        }

        const dateVal = regenDateInput.value;
        if (!dateVal) {
            alert('Por favor, informe uma data válida.');
            return;
        }

        const forceRecreate = regenForceRecreate ? regenForceRecreate.checked : true;
        const origText = btnRegenExecuteText ? btnRegenExecuteText.textContent : 'Regerar e Salvar no Drive Y:';

        if (btnRegenExecute) {
            btnRegenExecute.disabled = true;
            if (btnRegenExecuteText) btnRegenExecuteText.textContent = 'Processando e gravando...';
        }
        if (btnRegenDownload) btnRegenDownload.disabled = true;

        try {
            const res = await fetch(`${API_BASE_URL}/api/excel/sync?date=${dateVal}&force_recreate=${forceRecreate}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                await loadRegeneratePreview(dateVal);
                if (dateVal === sessionDateInput.value) {
                    await updateExcelStatus();
                }
                alert(`✅ Planilha Excel do dia ${data.date_formatted} regerada com sucesso!\n\nDestino: ${data.target_filepath}\nApontamentos gravados: ${data.synced_entries_count}\nRealizado: ${data.processed_metrics?.realizado_dia_kg || 0} kg`);
            } else {
                const err = await res.json();
                alert(`⚠️ Erro ao regerar planilha no Excel: ${err.detail || 'Falha na operação'}`);
            }
        } catch (e) {
            alert(`⚠️ Erro de comunicação com o servidor: ${e.message}`);
        } finally {
            if (btnRegenExecute) {
                btnRegenExecute.disabled = false;
                if (btnRegenExecuteText) btnRegenExecuteText.textContent = origText;
            }
            if (btnRegenDownload) btnRegenDownload.disabled = false;
        }
    }

    async function executeDownloadExcel() {
        if (!state.isOnline) {
            alert('O backend SQLite/FastAPI precisa estar ativo para baixar a planilha.');
            return;
        }

        const dateVal = regenDateInput.value;
        if (!dateVal) {
            alert('Por favor, informe uma data válida.');
            return;
        }

        const forceRecreate = regenForceRecreate ? regenForceRecreate.checked : false;
        
        if (btnRegenDownload) {
            btnRegenDownload.disabled = true;
            btnRegenDownload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando Download...';
        }

        try {
            const downloadUrl = `${API_BASE_URL}/api/excel/download?date=${dateVal}&force_recreate=${forceRecreate}`;
            const res = await fetch(downloadUrl);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Falha ao baixar planilha' }));
                throw new Error(err.detail || 'Erro na requisição');
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            // Extrai filename do header se houver
            let filename = `Ficha_Producao_${dateVal}.xlsx`;
            const disposition = res.headers.get('content-disposition');
            if (disposition && disposition.includes('filename=')) {
                const match = disposition.match(/filename="?([^"]+)"?/);
                if (match && match[1]) filename = match[1];
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert(`⚠️ Erro ao baixar planilha: ${e.message}`);
        } finally {
            if (btnRegenDownload) {
                btnRegenDownload.disabled = false;
                btnRegenDownload.innerHTML = '<i class="fa-solid fa-download"></i> Baixar Planilha (.xlsx)';
            }
        }
    }

    // --- ATRIBUIÇÃO DE EVENT LISTENERS ---

    formApontamento.addEventListener('submit', handleFormSubmit);
    btnAddStop.addEventListener('click', () => addStopRow());
    btnCancelEdit.addEventListener('click', cancelEdit);

    // Pesquisa e Seleção Inteligente de Painel (Medida Base)
    productSpecInput.addEventListener('input', handleProductSearchInput);
    productSpecInput.addEventListener('keydown', handleProductKeyNavigation);
    productSpecInput.addEventListener('focus', () => {
        handleProductSearchInput();
    });
    productSpecInput.addEventListener('click', () => {
        if (productSuggestions.classList.contains('hidden')) {
            handleProductSearchInput();
        }
    });
    if (btnClearProduct) btnClearProduct.addEventListener('click', clearSelectedProduct);

    // Fechar sugestões ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.product-search-container')) {
            hideProductSuggestions();
        }
    });

    startTimeInput.addEventListener('input', updateLiveSummary);
    endTimeInput.addEventListener('input', updateLiveSummary);
    productQtyInput.addEventListener('input', updateLiveSummary);
    // Impede alteração acidental da quantidade (+1 ou -1) ao rolar a página com a roda do mouse
    productQtyInput.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });

    // Mudanças na Ficha / Sessão e Máquina do Lançamento
    if (sessionMachineSelect) {
        sessionMachineSelect.addEventListener('change', async () => {
            if (!state.currentEditingId && entryMachineSelect) {
                entryMachineSelect.value = sessionMachineSelect.value;
            }
            await syncSessionWithBackend();
        });
    }

    if (entryMachineSelect) {
        entryMachineSelect.addEventListener('change', () => {
            if (state.currentEditingId) {
                const selMachineId = parseInt(entryMachineSelect.value, 10);
                const selMachine = state.machines.find(m => m.id === selMachineId);
                const mName = selMachine ? selMachine.name : 'Máquina';
                formCardTitle.textContent = `Editar Intervalo (${mName})`;
            }
        });
    }

    sessionDateInput.addEventListener('change', async () => {
        updateShiftNightHint();
        await syncSessionWithBackend();
        await updateExcelStatus();
    });

    if (entryOperatorInput) {
        entryOperatorInput.addEventListener('input', () => {
            entryOperatorInput.classList.remove('is-invalid');
        });
    }

    // Ações de Excel
    if (btnSyncExcel) btnSyncExcel.addEventListener('click', syncExcelNow);

    // Modal de Regeneração de Planilha por Data
    if (btnOpenRegenerateModal) {
        btnOpenRegenerateModal.addEventListener('click', () => openRegenerateModal(sessionDateInput.value));
    }
    if (btnQuickRegenerate) {
        btnQuickRegenerate.addEventListener('click', () => openRegenerateModal(sessionDateInput.value));
    }
    if (btnCloseRegenerate) {
        btnCloseRegenerate.addEventListener('click', () => modalRegenerateExcel.classList.add('hidden'));
    }
    if (btnCloseRegenerateFooter) {
        btnCloseRegenerateFooter.addEventListener('click', () => modalRegenerateExcel.classList.add('hidden'));
    }
    if (regenDateInput) {
        regenDateInput.addEventListener('change', () => loadRegeneratePreview(regenDateInput.value));
    }
    if (regenBtnToday) {
        regenBtnToday.addEventListener('click', () => {
            const d = getFormattedDateOffset(0);
            if (regenDateInput) regenDateInput.value = d;
            loadRegeneratePreview(d);
        });
    }
    if (regenBtnYesterday) {
        regenBtnYesterday.addEventListener('click', () => {
            const d = getFormattedDateOffset(1);
            if (regenDateInput) regenDateInput.value = d;
            loadRegeneratePreview(d);
        });
    }
    if (regenBtnLastWorkday) {
        regenBtnLastWorkday.addEventListener('click', () => {
            const d = getDefaultWorkDate();
            if (regenDateInput) regenDateInput.value = d;
            loadRegeneratePreview(d);
        });
    }
    if (btnRegenExecute) {
        btnRegenExecute.addEventListener('click', executeRegenerateExcel);
    }
    if (btnRegenDownload) {
        btnRegenDownload.addEventListener('click', executeDownloadExcel);
    }

    // Analytics
    btnOpenAnalytics.addEventListener('click', () => loadAndShowAnalytics(filterAnalyticsMachine.value));
    filterAnalyticsMachine.addEventListener('change', () => loadAndShowAnalytics(filterAnalyticsMachine.value));
    btnCloseAnalytics.addEventListener('click', () => modalAnalytics.classList.add('hidden'));
    btnCloseAnalyticsFooter.addEventListener('click', () => modalAnalytics.classList.add('hidden'));

    // Modal de Catálogo
    btnOpenProductsModal.addEventListener('click', () => {
        cancelEditProduct();
        if (catalogSearchInput) catalogSearchInput.value = '';
        renderProductsCatalogTable(state.productsCatalog);
        modalProducts.classList.remove('hidden');
    });
    btnCloseProducts.addEventListener('click', () => modalProducts.classList.add('hidden'));
    btnCloseProductsFooter.addEventListener('click', () => modalProducts.classList.add('hidden'));
    formNewProduct.addEventListener('submit', handleProductFormSubmit);
    btnCancelEditProd.addEventListener('click', cancelEditProduct);
    if (catalogSearchInput) catalogSearchInput.addEventListener('input', filterCatalogTable);
    if (btnSyncCatalogExcel) btnSyncCatalogExcel.addEventListener('click', syncCatalogFromExcel);

    // --- IMPRESSÃO / GERAÇÃO DE PDF ---

    function downloadDailyPdf() {
        const dateVal = sessionDateInput ? sessionDateInput.value : '';
        const downloadUrl = `${API_BASE_URL}/api/reports/pdf?date=${dateVal || ''}`;
        window.open(downloadUrl, '_blank');
    }

    function printDailyReport() {
        // Atualiza data de referência e timestamp de emissão
        const dateVal = sessionDateInput ? sessionDateInput.value : '';
        let formattedDate = dateVal || 'Data não informada';
        if (dateVal && dateVal.includes('-')) {
            const [y, m, d] = dateVal.split('-');
            formattedDate = `${d}/${m}/${y}`;
        }

        const printRefDate = document.getElementById('print-ref-date');
        if (printRefDate) printRefDate.textContent = formattedDate;

        const printTimestamp = document.getElementById('print-timestamp');
        if (printTimestamp) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('pt-BR');
            const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            printTimestamp.textContent = `${dateStr} às ${timeStr}`;
        }

        window.print();
    }

    function downloadAnalyticsPdf() {
        const machineId = filterAnalyticsMachine ? filterAnalyticsMachine.value : '';
        const downloadUrl = machineId 
            ? `${API_BASE_URL}/api/reports/machine-averages/pdf?machine_id=${encodeURIComponent(machineId)}`
            : `${API_BASE_URL}/api/reports/machine-averages/pdf`;
        window.open(downloadUrl, '_blank');
    }

    if (btnDownloadPdf) btnDownloadPdf.addEventListener('click', downloadDailyPdf);
    if (btnDownloadPdfRecords) btnDownloadPdfRecords.addEventListener('click', downloadDailyPdf);
    if (btnPrintReport) btnPrintReport.addEventListener('click', printDailyReport);
    if (btnPrintRecords) btnPrintRecords.addEventListener('click', printDailyReport);

    if (btnDownloadAnalyticsPdf) btnDownloadAnalyticsPdf.addEventListener('click', downloadAnalyticsPdf);
    if (btnPrintAnalyticsPdf) btnPrintAnalyticsPdf.addEventListener('click', downloadAnalyticsPdf);
    if (btnDownloadAnalyticsPdfFooter) btnDownloadAnalyticsPdfFooter.addEventListener('click', downloadAnalyticsPdf);

    // Modal de Detalhes de Paradas
    if (btnCloseModal) btnCloseModal.addEventListener('click', () => modalStopsDetail.classList.add('hidden'));
    if (btnCloseModalFooter) btnCloseModalFooter.addEventListener('click', () => modalStopsDetail.classList.add('hidden'));

    btnExportJson.addEventListener('click', exportDataToJson);

    // --- INICIALIZAÇÃO ---
    async function init() {
        renderMachineOptions();
        sessionDateInput.value = getDefaultWorkDate();
        if (entryOperatorInput) {
            entryOperatorInput.value = localStorage.getItem('last_operator_name') || '';
        }
        updateShiftNightHint();
        updateShiftIndicator();
        await checkApiConnection();
        await loadMachines();
        await loadProductsCatalog();
        await syncSessionWithBackend();
        await updateExcelStatus();
        updateLiveSummary();
    }

    init();
});

