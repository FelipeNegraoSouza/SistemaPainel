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
        machines: [],
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
    const sessionMachineSelect = document.getElementById('session-machine');
    const sessionDateInput = document.getElementById('session-date');
    const sessionOperatorInput = document.getElementById('session-operator');
    const sessionShiftInput = document.getElementById('session-shift');
    const shiftNightHint = document.getElementById('shift-night-hint');
    const shiftNightText = document.getElementById('shift-night-text');

    const formApontamento = document.getElementById('form-apontamento');
    const formCardTitle = document.getElementById('form-card-title');
    const entryIdInput = document.getElementById('entry-id');
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
    const productQtyInput = document.getElementById('product-qty');
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

    // Tabela e Listagem
    const entriesTbody = document.getElementById('entries-tbody');
    const emptyEntriesView = document.getElementById('empty-entries-view');
    const entriesCountBadge = document.getElementById('entries-count');
    const currentSheetSubtitle = document.getElementById('current-sheet-subtitle');
    const machineFilterPills = document.getElementById('machine-filter-pills');
    const dayTotalNet = document.getElementById('day-total-net');
    const dayTotalQty = document.getElementById('day-total-qty');

    // Ações Gerais
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
        if (!shiftNightHint || !shiftNightText) return;
        const shift = sessionShiftInput.value;
        const dateVal = sessionDateInput.value;
        if (shift === 'Noturno' && dateVal) {
            const prevDate = getPreviousNightDate(dateVal);
            const [py, pm, pd] = prevDate.split('-');
            const [sy, sm, sd] = dateVal.split('-');
            shiftNightText.innerHTML = `Produção física referente à <strong>noite de ${pd}/${pm}/${py}</strong> (consolidada na planilha de <strong>${sd}/${sm}/${sy}</strong>)`;
            shiftNightHint.classList.remove('hidden');
        } else {
            shiftNightHint.classList.add('hidden');
        }
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

        sessionMachineSelect.innerHTML = state.machines.map(m => 
            `<option value="${m.id}" ${m.id === state.session.machine_id ? 'selected' : ''}>
                ${escapeHtml(m.name)} ${!m.has_production_control ? '(Sem controle)' : ''}
            </option>`
        ).join('');

        filterAnalyticsMachine.innerHTML = '<option value="">Todas as Máquinas</option>' + 
            state.machines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    }

    async function loadProductsCatalog() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/products`);
            if (res.ok) {
                state.productsCatalog = await res.json();
                renderProductsCatalogTable(state.productsCatalog);
            }
        } catch (e) {
            console.warn("Usando catálogo local");
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
        const payload = {
            reference_date: sessionDateInput.value,
            operator_name: sessionOperatorInput.value.trim() || 'Operador Padrão',
            shift: sessionShiftInput.value,
            sector: 'Painéis',
            machine_id: parseInt(sessionMachineSelect.value, 10)
        };

        const selectedMachine = state.machines.find(m => m.id === payload.machine_id);
        const machineName = selectedMachine ? selectedMachine.name : sessionMachineSelect.options[sessionMachineSelect.selectedIndex]?.text || 'Máquina';
        
        state.session = { ...state.session, ...payload, machine_name: machineName };
        if (currentSheetSubtitle) {
            currentSheetSubtitle.textContent = `Data: ${payload.reference_date} | Turno: ${payload.shift}`;
        }

        if (state.isOnline) {
            try {
                // 1. Garante que a ficha da máquina ativa no topo existe no banco
                const res = await fetch(`${API_BASE_URL}/api/sessions/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const sessionData = await res.json();
                    state.session.id = sessionData.id;
                }

                // 2. Carrega todas as sessões e apontamentos de todas as máquinas apontadas nesta data e turno
                const dayRes = await fetch(`${API_BASE_URL}/api/sessions/day-sessions?date=${payload.reference_date}&shift=${encodeURIComponent(payload.shift)}`);
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
                                operatorName: s.operator_name,
                                productSpec: e.product_spec_custom,
                                productCode: e.product_code,
                                startTime: e.start_time,
                                endTime: e.end_time,
                                qty: e.qty_produced,
                                grossMinutes: e.gross_minutes,
                                totalStopMinutes: e.total_stop_minutes,
                                netMinutes: e.net_minutes,
                                ratePerHour: e.real_rate_per_hour,
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
                    return;
                }
            } catch (e) {
                console.error("Erro ao sincronizar com backend:", e);
            }
        }

        // Fallback local
        renderMachineFilterPills();
        renderEntriesTable();
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

    function handleProductSearchInput() {
        const query = productSpecInput.value.trim().toLowerCase();
        
        if (!query) {
            btnClearProduct.classList.add('hidden');
            hideProductSuggestions();
            // Se o usuário limpou o campo, reseta a seleção
            selectedProductCodeInput.value = '';
            productCatalogHint.classList.add('hidden');
            return;
        }

        btnClearProduct.classList.remove('hidden');

        const cleanQuery = query.replace(/\s+/g, ' ');
        const matches = [];

        for (const p of state.productsCatalog) {
            const dimStr = (p.dimensions || '').toLowerCase();
            const codeStr = String(p.code);
            const nameStr = (p.name || '').toLowerCase();

            let score = 0;
            if (dimStr === cleanQuery) score = 100;
            else if (dimStr.startsWith(cleanQuery)) score = 80;
            else if (dimStr.includes(cleanQuery)) score = 60;
            else if (codeStr === cleanQuery) score = 90;
            else if (codeStr.startsWith(cleanQuery)) score = 70;
            else if (nameStr.includes(cleanQuery)) score = 40;

            if (score > 0) {
                matches.push({ product: p, score });
            }
        }

        matches.sort((a, b) => b.score - a.score);
        const topResults = matches.slice(0, 15).map(m => m.product);

        renderProductSuggestions(topResults);
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

        productSuggestions.innerHTML = products.map((p, idx) => `
            <div class="product-dropdown-item" data-code="${p.code}" data-index="${idx}">
                <div class="p-item-top">
                    <span class="p-item-dim">${escapeHtml(p.dimensions || p.name)}</span>
                    <div class="p-item-badges">
                        <span class="p-item-code">#${p.code}</span>
                        <span class="p-item-weight"><i class="fa-solid fa-weight-hanging"></i> ${p.unit_weight_kg ? p.unit_weight_kg.toFixed(2) + ' kg' : '0.00 kg'}</span>
                    </div>
                </div>
                <div class="p-item-desc">${escapeHtml(p.name)}</div>
            </div>
        `).join('');

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
        // Padrão de apontamento: Medida Base!
        productSpecInput.value = product.dimensions || product.name;
        selectedProductCodeInput.value = product.code;

        hintBaseVal.textContent = product.dimensions || product.name;
        hintCodeVal.textContent = `#${product.code}`;
        hintWeight.innerHTML = `<i class="fa-solid fa-weight-hanging"></i> Peso: <strong>${product.unit_weight_kg ? product.unit_weight_kg.toFixed(2) + ' kg' : '0.00 kg'}</strong>`;
        hintDescText.textContent = product.name;

        productCatalogHint.classList.remove('hidden');
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
    }

    // --- RENDERIZAÇÃO DA TABELA DE APONTAMENTOS ---

    function renderEntriesTable() {
        entriesTbody.innerHTML = '';

        if (!state.entries || state.entries.length === 0) {
            emptyEntriesView.classList.remove('hidden');
            entriesCountBadge.textContent = '0';
            dayTotalNet.textContent = '0h 00m';
            dayTotalQty.textContent = '0';
            return;
        }

        emptyEntriesView.classList.add('hidden');
        entriesCountBadge.textContent = state.entries.length;

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

            tr.innerHTML = `
                <td>
                    <span class="badge-machine ${getMachineClass(entry.machineName)}">
                        <i class="fa-solid fa-gear"></i> ${escapeHtml(entry.machineName)}
                    </span>
                </td>
                <td><span class="badge-time">${entry.startTime} - ${entry.endTime}</span></td>
                <td><strong>${escapeHtml(entry.productSpec)}</strong></td>
                <td class="text-center"><span class="badge-qty">${entry.qty} pçs</span></td>
                <td class="text-center">${formatMinutesToHours(entry.grossMinutes)}</td>
                <td class="text-center">${stopsHtml}</td>
                <td class="text-center"><strong>${formatMinutesToHours(entry.netMinutes)}</strong></td>
                <td class="text-center"><span class="badge-rate">${rateDisplay}</span></td>
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

        dayTotalNet.textContent = formatMinutesToHours(sumNetMinutes);
        dayTotalQty.textContent = sumQty.toLocaleString('pt-BR');

        attachTableActionListeners();
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

        const productSpec = productSpecInput.value.trim();
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;
        const qty = parseInt(productQtyInput.value, 10);
        const productCode = selectedProductCodeInput.value ? parseInt(selectedProductCodeInput.value, 10) : null;

        if (!productSpec || !startTime || !endTime || isNaN(qty)) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        const grossMinutes = calculateTimeDifference(startTime, endTime);
        const stops = getStopsFromForm();
        const totalStopMinutes = stops.reduce((acc, s) => acc + s.durationMinutes, 0);
        let netMinutes = grossMinutes - totalStopMinutes;
        if (netMinutes < 0) netMinutes = 0;

        const ratePerHour = netMinutes > 0 ? parseFloat((qty / (netMinutes / 60)).toFixed(2)) : 0.0;

        const entryPayload = {
            product_code: productCode,
            product_spec_custom: productSpec,
            start_time: startTime,
            end_time: endTime,
            qty_produced: qty,
            gross_minutes: grossMinutes,
            total_stop_minutes: totalStopMinutes,
            net_minutes: netMinutes,
            real_rate_per_hour: ratePerHour,
            stops: stops.map(s => ({
                start_time: s.startTime,
                end_time: s.endTime,
                reason: s.reason,
                duration_minutes: s.durationMinutes
            }))
        };

        if (state.isOnline) {
            try {
                let res;
                if (state.currentEditingId && typeof state.currentEditingId !== 'string') {
                    // Atualiza intervalo existente (PUT)
                    res = await fetch(`${API_BASE_URL}/api/entries/${state.currentEditingId}`, {
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
            const idx = state.entries.findIndex(e => String(e.id) === String(state.currentEditingId));
            if (idx !== -1) {
                state.entries[idx] = {
                    ...state.entries[idx],
                    productSpec,
                    productCode,
                    startTime,
                    endTime,
                    qty,
                    grossMinutes,
                    stops,
                    totalStopMinutes,
                    netMinutes,
                    ratePerHour
                };
            }
        } else {
            const newEntry = {
                id: 'entry_' + Date.now(),
                productSpec,
                productCode,
                startTime,
                endTime,
                qty,
                grossMinutes,
                stops,
                totalStopMinutes,
                netMinutes,
                ratePerHour
            };
            state.entries.push(newEntry);
        }

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

        if (state.isOnline && typeof id !== 'string') {
            try {
                const res = await fetch(`${API_BASE_URL}/api/entries/${id}`, { method: 'DELETE' });
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

        // Se for de outra máquina, atualiza o seletor no topo para manter total sincronia
        if (entry.machineId && entry.machineId !== state.session.machine_id) {
            sessionMachineSelect.value = entry.machineId;
            state.session.machine_id = entry.machineId;
            state.session.machine_name = entry.machineName;
            state.session.id = entry.sessionId;
        }

        state.currentEditingId = id;
        formCardTitle.textContent = `Editar Intervalo (${entry.machineName})`;
        btnSubmitEntry.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Intervalo';
        btnCancelEdit.classList.remove('hidden');

        entryIdInput.value = entry.id;
        productSpecInput.value = entry.productSpec;
        selectedProductCodeInput.value = entry.productCode || '';
        startTimeInput.value = entry.startTime;
        endTimeInput.value = entry.endTime;
        productQtyInput.value = entry.qty;

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
        selectedProductCodeInput.value = '';
        productSpecInput.value = '';
        startTimeInput.value = '';
        endTimeInput.value = '';
        productQtyInput.value = '';
        productCatalogHint.classList.add('hidden');
        btnClearProduct.classList.add('hidden');
        hideProductSuggestions();
        clearStopsContainer();
        updateLiveSummary();
    }

    function duplicateEntry(id) {
        const entry = (state.allDayEntries || []).find(e => String(e.id) === String(id));
        if (!entry) return;

        if (entry.machineId && entry.machineId !== state.session.machine_id) {
            sessionMachineSelect.value = entry.machineId;
            state.session.machine_id = entry.machineId;
            state.session.machine_name = entry.machineName;
            state.session.id = entry.sessionId;
        }

        productSpecInput.value = entry.productSpec;
        selectedProductCodeInput.value = entry.productCode || '';
        startTimeInput.value = entry.endTime;
        endTimeInput.value = '';
        productQtyInput.value = entry.qty;

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

        let contentHtml = `
            <div style="margin-bottom: 1rem;">
                <p><strong>Máquina:</strong> <span class="badge-machine ${getMachineClass(entry.machineName)}">${escapeHtml(entry.machineName)}</span></p>
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
        const query = (catalogSearchInput.value || '').trim().toLowerCase();
        if (!query) {
            renderProductsCatalogTable(state.productsCatalog);
            return;
        }

        const filtered = state.productsCatalog.filter(p => {
            const dimStr = (p.dimensions || '').toLowerCase();
            const codeStr = String(p.code);
            const nameStr = (p.name || '').toLowerCase();
            return dimStr.includes(query) || codeStr.includes(query) || nameStr.includes(query);
        });

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

    // --- ATRIBUIÇÃO DE EVENT LISTENERS ---

    formApontamento.addEventListener('submit', handleFormSubmit);
    btnAddStop.addEventListener('click', () => addStopRow());
    btnCancelEdit.addEventListener('click', cancelEdit);

    // Pesquisa e Seleção Inteligente de Painel (Medida Base)
    productSpecInput.addEventListener('input', handleProductSearchInput);
    productSpecInput.addEventListener('keydown', handleProductKeyNavigation);
    productSpecInput.addEventListener('focus', () => {
        if (productSpecInput.value.trim()) handleProductSearchInput();
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

    // Mudanças na Ficha / Sessão
    sessionMachineSelect.addEventListener('change', syncSessionWithBackend);
    sessionDateInput.addEventListener('change', async () => {
        updateShiftNightHint();
        await syncSessionWithBackend();
        await updateExcelStatus();
    });
    sessionOperatorInput.addEventListener('change', syncSessionWithBackend);
    sessionShiftInput.addEventListener('change', async () => {
        updateShiftNightHint();
        await syncSessionWithBackend();
    });

    // Ações de Excel
    if (btnSyncExcel) btnSyncExcel.addEventListener('click', syncExcelNow);

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

    // Modal de Detalhes de Paradas
    btnCloseModal.addEventListener('click', () => modalStopsDetail.classList.add('hidden'));
    btnCloseModalFooter.addEventListener('click', () => modalStopsDetail.classList.add('hidden'));

    btnExportJson.addEventListener('click', exportDataToJson);

    // --- INICIALIZAÇÃO ---
    async function init() {
        sessionDateInput.value = getDefaultWorkDate();
        updateShiftNightHint();
        await checkApiConnection();
        await loadMachines();
        await loadProductsCatalog();
        await syncSessionWithBackend();
        await updateExcelStatus();
        updateLiveSummary();
    }

    init();
});

