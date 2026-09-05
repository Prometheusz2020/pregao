/**
 * PNCP Scraper & Dashboard - Frontend Application Logic
 * Integrates live data fetching, state management, KPI calculations,
 * reactive filtering, UI rendering, modal views, and data exports.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Application State ---
  const state = {
    rawItems: [],
    filteredItems: [],
    activeView: 'grid', // 'grid' | 'table'
    selectedItem: null,
    isLoading: false,
    filters: {
      searchTerm: '',
      valorMax: 500000, // default 500k
      modalidade: '8', // default 8 (Dispensa)
      orderBy: 'valor-desc',
      dateRange: 'today'
    }
  };

  // --- DOM Element References ---
  const elements = {
    // KPIs
    kpiTotalItens: document.getElementById('kpiTotalItens'),
    kpiValorTotal: document.getElementById('kpiValorTotal'),
    kpiValorMedio: document.getElementById('kpiValorMedio'),
    kpiMaiorValor: document.getElementById('kpiMaiorValor'),
    kpiMaiorOrgao: document.getElementById('kpiMaiorOrgao'),
    
    // Inputs & Filters
    searchInput: document.getElementById('searchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    modalidadeSelect: document.getElementById('modalidadeSelect'),
    orderSelect: document.getElementById('orderSelect'),
    valorRange: document.getElementById('valorRange'),
    valorRangeLabel: document.getElementById('valorRangeLabel'),
    presetChips: document.querySelectorAll('.preset-chip'),
    dateSelect: document.getElementById('dateSelect'),
    resultsCountBadge: document.getElementById('resultsCountBadge'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    btnEmptyReset: document.getElementById('btnEmptyReset'),

    // View Toggles
    btnViewGrid: document.getElementById('btnViewGrid'),
    btnViewTable: document.getElementById('btnViewTable'),
    gridView: document.getElementById('gridView'),
    tableView: document.getElementById('tableView'),
    tableBody: document.getElementById('tableBody'),
    
    // Containers & States
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    apiStatusPill: document.getElementById('apiStatusPill'),
    
    // Header & Actions
    btnRefresh: document.getElementById('btnRefresh'),
    btnExportToggle: document.getElementById('btnExportToggle'),
    exportMenu: document.getElementById('exportMenu'),
    btnExportCSV: document.getElementById('btnExportCSV'),
    btnExportJSON: document.getElementById('btnExportJSON'),

    // Modal
    detailsModal: document.getElementById('detailsModal'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    modalBadgeModalidade: document.getElementById('modalBadgeModalidade'),
    modalOrgao: document.getElementById('modalOrgao'),
    modalValor: document.getElementById('modalValor'),
    modalObjeto: document.getElementById('modalObjeto'),
    modalCNPJ: document.getElementById('modalCNPJ'),
    modalNumeroControle: document.getElementById('modalNumeroControle'),
    modalAno: document.getElementById('modalAno'),
    modalDataPublicacao: document.getElementById('modalDataPublicacao'),
    btnCopyLink: document.getElementById('btnCopyLink'),
    btnOpenPNCP: document.getElementById('btnOpenPNCP'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
  };

  // --- Modalidades Dictionary ---
  const modalidadesMap = {
    '1': 'Leilão - Eletrônico',
    '2': 'Diálogo Competitivo',
    '3': 'Concurso',
    '4': 'Concorrência - Eletrônica',
    '5': 'Concorrência - Presencial',
    '6': 'Pregão - Eletrônico',
    '7': 'Pregão - Presencial',
    '8': 'Dispensa de Licitação',
    '9': 'Inexigibilidade',
    '10': 'Manifestação de Interesse',
    '11': 'Pré-qualificação',
    '12': 'Credenciamento'
  };

  // --- Initialize App ---
  init();

  function init() {
    setupEventListeners();
    fetchPNCPData();
  }

  // --- API Fetch Function ---
  async function fetchPNCPData() {
    setLoadingState(true);
    updateApiStatus('Consultando PNCP...', 'blue');

    const formattedDate = getFormattedDate(state.filters.dateRange);
    const modalidade = state.filters.modalidade === 'all' ? '' : state.filters.modalidade;

    const url = new URL('https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao');
    url.searchParams.set('dataInicial', formattedDate);
    url.searchParams.set('dataFinal', formattedDate);
    if (modalidade) {
      url.searchParams.set('codigoModalidadeContratacao', modalidade);
    }
    url.searchParams.set('pagina', '1');
    url.searchParams.set('tamanhoPagina', '50');

    try {
      const response = await fetch(url.toString(), {
        headers: { 'accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Erro na API: HTTP ${response.status}`);
      }

      const data = await response.json();
      state.rawItems = data.data || [];
      updateApiStatus('Conectado ao PNCP', 'green');
      showToast(`Carregadas ${state.rawItems.length} contratações do PNCP.`);
    } catch (error) {
      console.warn('Falha ao conectar à API pública do PNCP. Carregando dados de demonstração...', error.message);
      updateApiStatus('Modo Offline / Demo', 'amber');
      state.rawItems = getMockData();
      showToast('Dados de demonstração carregados com sucesso.');
    } finally {
      setLoadingState(false);
      applyFiltersAndRender();
    }
  }

  // --- Date Calculation Helper ---
  function getFormattedDate(rangeOption) {
    const d = new Date();
    if (rangeOption === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  // --- Filter & Sorting Logic ---
  function applyFiltersAndRender() {
    const term = state.filters.searchTerm.toLowerCase().trim();
    const maxVal = Number(state.filters.valorMax);
    const modSelect = state.filters.modalidade;

    state.filteredItems = state.rawItems.filter(item => {
      const valor = Number(item.valorTotalEstimado || 0);
      const orgao = (item.orgaoEntidade?.razaoSocial || '').toLowerCase();
      const objeto = (item.objetoCompra || '').toLowerCase();
      const codigoMod = String(item.modalidadeId || item.codigoModalidadeContratacao || '');

      // Valor filter (skip filter if maxVal >= 1000000)
      const atendeValor = maxVal >= 1000000 ? true : (valor <= maxVal);

      // Search term filter
      const atendeTermo = term
        ? (orgao.includes(term) || objeto.includes(term))
        : true;

      // Modalidade filter
      const atendeModalidade = modSelect === 'all'
        ? true
        : (codigoMod === modSelect || !codigoMod);

      return atendeValor && atendeTermo && atendeModalidade;
    });

    // Sorting
    sortItems(state.filteredItems, state.filters.orderBy);

    // Update UI
    renderKPIs();
    renderMainContent();
    updateFilterSummary();
  }

  function sortItems(items, orderBy) {
    items.sort((a, b) => {
      const valA = Number(a.valorTotalEstimado || 0);
      const valB = Number(b.valorTotalEstimado || 0);
      const orgaoA = (a.orgaoEntidade?.razaoSocial || '').toLowerCase();
      const orgaoB = (b.orgaoEntidade?.razaoSocial || '').toLowerCase();
      const objetoA = (a.objetoCompra || '').toLowerCase();
      const objetoB = (b.objetoCompra || '').toLowerCase();

      switch (orderBy) {
        case 'valor-desc':
          return valB - valA;
        case 'valor-asc':
          return valA - valB;
        case 'orgao-asc':
          return orgaoA.localeCompare(orgaoB);
        case 'objeto-asc':
          return objetoA.localeCompare(objetoB);
        default:
          return valB - valA;
      }
    });
  }

  // --- Render KPI Statistics ---
  function renderKPIs() {
    const items = state.filteredItems;
    const count = items.length;

    if (count === 0) {
      elements.kpiTotalItens.textContent = '0';
      elements.kpiValorTotal.textContent = 'R$ 0,00';
      elements.kpiValorMedio.textContent = 'R$ 0,00';
      elements.kpiMaiorValor.textContent = 'R$ 0,00';
      elements.kpiMaiorOrgao.textContent = 'Sem registros';
      return;
    }

    const totalValor = items.reduce((acc, curr) => acc + Number(curr.valorTotalEstimado || 0), 0);
    const mediaValor = totalValor / count;
    
    // Maior Valor
    const maiorItem = [...items].sort((a, b) => Number(b.valorTotalEstimado || 0) - Number(a.valorTotalEstimado || 0))[0];
    const maxVal = Number(maiorItem.valorTotalEstimado || 0);
    const maiorOrgaoStr = maiorItem.orgaoEntidade?.razaoSocial || 'Não informado';

    elements.kpiTotalItens.textContent = count.toLocaleString('pt-BR');
    elements.kpiValorTotal.textContent = formatCurrency(totalValor);
    elements.kpiValorMedio.textContent = formatCurrency(mediaValor);
    elements.kpiMaiorValor.textContent = formatCurrency(maxVal);
    elements.kpiMaiorOrgao.textContent = truncateText(maiorOrgaoStr, 28);
  }

  // --- Render Main Results ---
  function renderMainContent() {
    if (state.filteredItems.length === 0) {
      elements.gridView.classList.add('hidden');
      elements.tableView.classList.add('hidden');
      elements.emptyState.classList.remove('hidden');
      return;
    }

    elements.emptyState.classList.add('hidden');

    if (state.activeView === 'grid') {
      elements.tableView.classList.add('hidden');
      elements.gridView.classList.remove('hidden');
      renderGridView();
    } else {
      elements.gridView.classList.add('hidden');
      elements.tableView.classList.remove('hidden');
      renderTableView();
    }
  }

  // Render Grid Cards
  function renderGridView() {
    elements.gridView.innerHTML = '';
    
    state.filteredItems.forEach(item => {
      const card = document.createElement('article');
      card.className = 'opportunity-card';
      
      const modalidadeNome = modalidadesMap[item.modalidadeId || item.codigoModalidadeContratacao] || 'Dispensa / Licitação';
      const valorFormatted = formatCurrency(item.valorTotalEstimado);
      const orgaoNome = item.orgaoEntidade?.razaoSocial || 'Órgão Não Informado';
      const objetoText = item.objetoCompra || 'Sem descrição do objeto.';
      const linkPNCP = getPNCPEditalLink(item);

      card.innerHTML = `
        <div class="card-top">
          <span class="badge-modalidade">${modalidadeNome}</span>
          <span class="price-tag">${valorFormatted}</span>
        </div>

        <div class="card-body">
          <div class="card-orgao">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
            <span>${escapeHTML(orgaoNome)}</span>
          </div>
          <p class="card-objeto">${escapeHTML(objetoText)}</p>
        </div>

        <div class="card-footer">
          <div class="card-footer-actions">
            <button class="btn btn-secondary btn-card-action btn-detalhes" data-id="${item.numeroControlePNCP || Math.random()}">
              Ver Detalhes
            </button>
            <a href="${linkPNCP}" target="_blank" rel="noopener" class="btn btn-primary btn-card-action">
              <span>Edital PNCP</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        </div>
      `;

      // Event listener for details
      const btnDetalhes = card.querySelector('.btn-detalhes');
      btnDetalhes.addEventListener('click', () => openModal(item));

      elements.gridView.appendChild(card);
    });
  }

  // Render Table View
  function renderTableView() {
    elements.tableBody.innerHTML = '';

    state.filteredItems.forEach(item => {
      const tr = document.createElement('tr');
      const modalidadeNome = modalidadesMap[item.modalidadeId || item.codigoModalidadeContratacao] || 'Dispensa / Licitação';
      const valorFormatted = formatCurrency(item.valorTotalEstimado);
      const orgaoNome = item.orgaoEntidade?.razaoSocial || 'Órgão Não Informado';
      const objetoText = item.objetoCompra || 'Sem descrição.';
      const linkPNCP = getPNCPEditalLink(item);

      tr.innerHTML = `
        <td class="td-orgao">${escapeHTML(orgaoNome)}</td>
        <td class="td-objeto" title="${escapeHTML(objetoText)}">${escapeHTML(objetoText)}</td>
        <td class="td-valor text-right">${valorFormatted}</td>
        <td><span class="badge-modalidade">${modalidadeNome}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-table-detalhes" style="padding:4px 8px; font-size:0.78rem;">Ver</button>
            <a href="${linkPNCP}" target="_blank" rel="noopener" class="btn btn-primary" style="padding:4px 8px; font-size:0.78rem;">Edital</a>
          </div>
        </td>
      `;

      tr.querySelector('.btn-table-detalhes').addEventListener('click', () => openModal(item));
      elements.tableBody.appendChild(tr);
    });
  }

  // --- Modal Operations ---
  function openModal(item) {
    state.selectedItem = item;

    const modalidadeNome = modalidadesMap[item.modalidadeId || item.codigoModalidadeContratacao] || 'Dispensa de Licitação';
    elements.modalBadgeModalidade.textContent = modalidadeNome;
    elements.modalOrgao.textContent = item.orgaoEntidade?.razaoSocial || 'Órgão Não Informado';
    elements.modalValor.textContent = formatCurrency(item.valorTotalEstimado);
    elements.modalObjeto.textContent = item.objetoCompra || 'Descrição indisponível no momento.';
    elements.modalCNPJ.textContent = item.orgaoEntidade?.cnpj || 'Não informado';
    elements.modalNumeroControle.textContent = item.numeroControlePNCP || 'N/A';
    elements.modalAno.textContent = item.anoCompra || item.anoProcesso || new Date().getFullYear();
    elements.modalDataPublicacao.textContent = formatDate(item.dataPublicacaoPncp || item.createdAt);

    const link = getPNCPEditalLink(item);
    elements.btnOpenPNCP.setAttribute('href', link);

    elements.detailsModal.classList.remove('hidden');
    elements.detailsModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    elements.detailsModal.classList.add('hidden');
    elements.detailsModal.setAttribute('aria-hidden', 'true');
    state.selectedItem = null;
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Search input (debounce 250ms)
    let searchTimeout;
    elements.searchInput.addEventListener('input', (e) => {
      state.filters.searchTerm = e.target.value;
      
      if (e.target.value) {
        elements.btnClearSearch.classList.remove('hidden');
      } else {
        elements.btnClearSearch.classList.add('hidden');
      }

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(applyFiltersAndRender, 250);
    });

    elements.btnClearSearch.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.filters.searchTerm = '';
      elements.btnClearSearch.classList.add('hidden');
      applyFiltersAndRender();
    });

    // Selects
    elements.modalidadeSelect.addEventListener('change', (e) => {
      state.filters.modalidade = e.target.value;
      fetchPNCPData(); // Refetch for modalidade filter
    });

    elements.orderSelect.addEventListener('change', (e) => {
      state.filters.orderBy = e.target.value;
      applyFiltersAndRender();
    });

    elements.dateSelect.addEventListener('change', (e) => {
      state.filters.dateRange = e.target.value;
      fetchPNCPData();
    });

    // Range Slider & Presets
    elements.valorRange.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      state.filters.valorMax = val;
      elements.valorRangeLabel.textContent = val >= 1000000 ? 'Sem limite' : formatCurrency(val);
      
      // Update chips active state
      elements.presetChips.forEach(chip => {
        if (Number(chip.getAttribute('data-value')) === val) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });

      applyFiltersAndRender();
    });

    elements.presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const val = Number(chip.getAttribute('data-value'));
        elements.valorRange.value = val;
        state.filters.valorMax = val;
        elements.valorRangeLabel.textContent = val >= 1000000 ? 'Sem limite' : formatCurrency(val);

        elements.presetChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        applyFiltersAndRender();
      });
    });

    // Reset filters
    elements.btnResetFilters.addEventListener('click', resetFilters);
    elements.btnEmptyReset.addEventListener('click', resetFilters);

    // View Toggles
    elements.btnViewGrid.addEventListener('click', () => {
      state.activeView = 'grid';
      elements.btnViewGrid.classList.add('active');
      elements.btnViewTable.classList.remove('active');
      renderMainContent();
    });

    elements.btnViewTable.addEventListener('click', () => {
      state.activeView = 'table';
      elements.btnViewTable.classList.add('active');
      elements.btnViewGrid.classList.remove('active');
      renderMainContent();
    });

    // Refresh & Export
    elements.btnRefresh.addEventListener('click', () => {
      fetchPNCPData();
    });

    elements.btnExportToggle.addEventListener('click', () => {
      elements.exportMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!elements.exportDropdown?.contains(e.target) && !elements.btnExportToggle.contains(e.target)) {
        elements.exportMenu.classList.add('hidden');
      }
    });

    elements.btnExportCSV.addEventListener('click', () => {
      exportToCSV();
      elements.exportMenu.classList.add('hidden');
    });

    elements.btnExportJSON.addEventListener('click', () => {
      exportToJSON();
      elements.exportMenu.classList.add('hidden');
    });

    // Modal Close handlers
    elements.btnCloseModal.addEventListener('click', closeModal);
    elements.detailsModal.addEventListener('click', (e) => {
      if (e.target === elements.detailsModal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.detailsModal.classList.contains('hidden')) {
        closeModal();
      }
    });

    // Copy Link button in modal
    elements.btnCopyLink.addEventListener('click', () => {
      if (state.selectedItem) {
        const link = getPNCPEditalLink(state.selectedItem);
        navigator.clipboard.writeText(link).then(() => {
          showToast('Link do edital copiado com sucesso!');
        }).catch(() => {
          showToast('Erro ao copiar link.');
        });
      }
    });
  }

  function resetFilters() {
    elements.searchInput.value = '';
    state.filters.searchTerm = '';
    elements.btnClearSearch.classList.add('hidden');

    elements.valorRange.value = 500000;
    state.filters.valorMax = 500000;
    elements.valorRangeLabel.textContent = 'R$ 500.000,00';

    elements.presetChips.forEach(chip => {
      if (chip.getAttribute('data-value') === '500000') chip.classList.add('active');
      else chip.classList.remove('active');
    });

    elements.orderSelect.value = 'valor-desc';
    state.filters.orderBy = 'valor-desc';

    applyFiltersAndRender();
    showToast('Filtros restaurados para o padrão.');
  }

  function updateFilterSummary() {
    const total = state.filteredItems.length;
    elements.resultsCountBadge.textContent = `Exibindo ${total} ${total === 1 ? 'oportunidade' : 'oportunidades'}`;
  }

  // --- Export Utilities ---
  function exportToCSV() {
    if (state.filteredItems.length === 0) {
      showToast('Nenhum item disponível para exportação.');
      return;
    }

    const headers = ['Órgão', 'CNPJ', 'Objeto', 'Valor Estimado (R$)', 'Modalidade', 'Link PNCP'];
    const rows = state.filteredItems.map(item => [
      `"${(item.orgaoEntidade?.razaoSocial || '').replace(/"/g, '""')}"`,
      `"${item.orgaoEntidade?.cnpj || ''}"`,
      `"${(item.objetoCompra || '').replace(/"/g, '""')}"`,
      Number(item.valorTotalEstimado || 0).toFixed(2),
      `"${modalidadesMap[item.modalidadeId || item.codigoModalidadeContratacao] || 'Dispensa'}"`,
      `"${getPNCPEditalLink(item)}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pncp_oportunidades_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Relatório CSV exportado!');
  }

  function exportToJSON() {
    if (state.filteredItems.length === 0) {
      showToast('Nenhum item disponível para exportação.');
      return;
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.filteredItems, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `pncp_oportunidades_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Arquivo JSON exportado!');
  }

  // --- Helpers ---
  function getPNCPEditalLink(item) {
    if (item.numeroControlePNCP) {
      return `https://pncp.gov.br/app/editais/${item.numeroControlePNCP}`;
    }
    return 'https://pncp.gov.br/app/editais';
  }

  function formatCurrency(value) {
    const val = Number(value || 0);
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Não informada';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  }

  function truncateText(str, maxLength = 30) {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  function setLoadingState(loading) {
    state.isLoading = loading;
    if (loading) {
      elements.loadingState.classList.remove('hidden');
      elements.gridView.classList.add('hidden');
      elements.tableView.classList.add('hidden');
      elements.emptyState.classList.add('hidden');
    } else {
      elements.loadingState.classList.add('hidden');
    }
  }

  function updateApiStatus(text, colorClass) {
    const dot = elements.apiStatusPill.querySelector('.status-dot');
    const textEl = elements.apiStatusPill.querySelector('.status-text');
    dot.className = `status-dot ${colorClass}`;
    textEl.textContent = text;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- Fallback Mock Data (In case PNCP API blocks CORS in local static files) ---
  function getMockData() {
    return [
      {
        numeroControlePNCP: '32165706000108-1-000087/2026',
        objetoCompra: 'CONTRATAÇÃO DE SERVIÇO MÉDICO VETERINÁRIO E REALIZAÇÃO DOS EXAMES DE BRUCELOSE E TUBERCULOSE PARA A 35º EXPOSIÇÃO AGROPECUÁRIA',
        valorTotalEstimado: 11296.20,
        modalidadeId: 8,
        codigoModalidadeContratacao: 8,
        anoCompra: 2026,
        dataPublicacaoPncp: new Date().toISOString(),
        orgaoEntidade: {
          razaoSocial: 'MUNICIPIO DE SUMIDOURO',
          cnpj: '32.165.706/0001-08'
        }
      },
      {
        numeroControlePNCP: '18428888000123-1-000186/2026',
        objetoCompra: 'CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA PRESTAÇÃO DE SERVIÇOS TÉCNICOS DE PESQUISA, LEVANTAMENTO HISTÓRICO-CULTURAL E ELABORAÇÃO DE GUIA TURÍSTICO',
        valorTotalEstimado: 20300.00,
        modalidadeId: 8,
        codigoModalidadeContratacao: 8,
        anoCompra: 2026,
        dataPublicacaoPncp: new Date().toISOString(),
        orgaoEntidade: {
          razaoSocial: 'MUNICIPIO DE CONQUISTA',
          cnpj: '18.428.888/0001-23'
        }
      },
      {
        numeroControlePNCP: '18306688000106-1-000113/2026',
        objetoCompra: 'CONTRATAÇÃO DE EMPRESA ESPECIALIZADA EM PRESTAÇÃO DE SERVIÇO E FORNECIMENTO DE INTERNET BANDA LARGA POR LINK DEDICADO 300 MBPS',
        valorTotalEstimado: 19600.00,
        modalidadeId: 8,
        codigoModalidadeContratacao: 8,
        anoCompra: 2026,
        dataPublicacaoPncp: new Date().toISOString(),
        orgaoEntidade: {
          razaoSocial: 'MUNICIPIO DE IGUATAMA',
          cnpj: '18.306.688/0001-06'
        }
      },
      {
        numeroControlePNCP: '07954480000179-1-022980/2026',
        objetoCompra: 'SERVIÇO DE MANUTENÇÃO PREVENTIVA E CORRETIVA DE MÁQUINAS E EQUIPAMENTOS PESADOS DA SECRETARIA DE OBRAS',
        valorTotalEstimado: 38817.50,
        modalidadeId: 8,
        codigoModalidadeContratacao: 8,
        anoCompra: 2026,
        dataPublicacaoPncp: new Date().toISOString(),
        orgaoEntidade: {
          razaoSocial: 'GOVERNO DO ESTADO DO CEARA',
          cnpj: '07.954.480/0001-79'
        }
      },
      {
        numeroControlePNCP: '10817343000105-1-000003/2027',
        objetoCompra: 'PRESTAÇÃO DE SERVIÇOS TÉCNICO-PROFISSIONAIS ESPECIALIZADOS DE CONSULTORIA E APOIO OPERACIONAL NÃO CONTINUADO',
        valorTotalEstimado: 42018.96,
        modalidadeId: 8,
        codigoModalidadeContratacao: 8,
        anoCompra: 2026,
        dataPublicacaoPncp: new Date().toISOString(),
        orgaoEntidade: {
          razaoSocial: 'INSTITUTO FEDERAL DE EDUCACAO DE RONDONIA',
          cnpj: '10.817.343/0001-05'
        }
      },
      {
        numeroControlePNCP: '91573048000144-1-000266/2026',
        objetoCompra: 'CONTRATAÇÃO DE EMPRESA COM GEÓLOGO HABILITADO PARA ANÁLISE DE PROCESSOS DE LICENCIAMENTO AMBIENTAL DE CASCALHEIRAS MUNICIPAIS',
        valorTotalEstimado: 4416.67,
        modalidadeId: 8,
        codigoModalidadeContratacao: 8,
        anoCompra: 2026,
        dataPublicacaoPncp: new Date().toISOString(),
        orgaoEntidade: {
          razaoSocial: 'MUNICIPIO DE ITACURUBI',
          cnpj: '91.573.048/0001-44'
        }
      },
      {
        numeroControlePNCP: '13825500000104-1-000122/2026',
        objetoCompra: 'CONTRATAÇÃO DE SERVIÇOS DE SEGURO AUTOMOTIVO PARA A FROTA OFICIAL DAS SECRETARIAS MUNICIPAIS DE SAÚDE E ASSISTÊNCIA SOCIAL',
        valorTotalEstimado: 35500.96,
        modalidadeId: 8,
        codigoModalidadeContratacao: 8,
        anoCompra: 2026,
        dataPublicacaoPncp: new Date().toISOString(),
        orgaoEntidade: {
          razaoSocial: 'MUNICIPIO DE SAO MIGUEL DAS MATAS',
          cnpj: '13.825.500/0001-04'
        }
      }
    ];
  }
});
