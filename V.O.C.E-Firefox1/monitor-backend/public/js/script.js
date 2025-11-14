// ================================================================
//      SCRIPT GLOBAL V.O.C.E (Dashboard e Gerenciamento)
// ================================================================

/**
 * Armazena o estado global da aplicação, incluindo dados de sessão,
 * filtros ativos, dados carregados (alunos, logs) e instâncias de UI (gráfico).
 */
let state = {
    activeClassId: null,      // ID da turma selecionada no filtro
    activeClassName: '',      // Nome da turma selecionada
    allStudents: [],          // Cache de TODOS os alunos cadastrados
    studentsInClass: [],      // Cache dos alunos da turma ativa
    editingStudentData: null, // Armazena dados do aluno ao abrir o modal de edição
    currentChartType: 'bar',  // Tipo de gráfico ativo ('bar', 'pie', 'doughnut')
    mainChartInstance: null,  // Instância do Chart.js para destruição
    allLogs: [],              // Cache de todos os logs do dia (bruto)
    allSummary: [],           // Cache de todo o resumo de alunos (bruto)
    logsCurrentPage: 1,       // Página atual da tabela de logs
    logsPerPage: 10,          // Logs exibidos por página
    allProfessors: [],        // Cache de todos os professores (para modal de partilha)
    categories: [],           // Cache de categorias de sites (carregado do EJS)
    currentFilters: {         // Filtros ativos no dashboard
        search: '',
        category: '',
        showAlertsOnly: false,
        studentSearch: '',    // Filtro da lista de alunos no Gerenciamento
    }
};

/**
 * Armazena a URL do log que está sendo editado no modal de categoria.
 * Usado para passar o contexto para a função de salvamento.
 */
let currentlyEditingUrl = null;

// ================================================================
//      CONTROLE GLOBAL DE MODAIS
// ================================================================
// Funções expostas globalmente (window.) para serem chamadas
// por atributos onclick="" no HTML (EJS).

/**
 * Abre o modal "Editar Nome da Turma" (pág. Gerenciamento).
 * @param {string} classId - O ID da turma a ser editada.
 * @param {string} currentName - O nome atual da turma.
 */
window.openEditClassModal = function(classId, currentName) {
    const modal = document.getElementById('editClassModal');
    if (!modal) return;
    document.getElementById('editClassNameInput').value = currentName;
    modal.dataset.classId = classId; // Salva o ID no modal para a função de salvar
    modal.classList.remove('hidden');
}

/**
 * Fecha o modal "Editar Nome da Turma".
 * Esta era a função que causava o erro.
 */
window.closeModals = function() {
    const modal = document.getElementById('editClassModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Abre o modal "Partilhar Turma" (pág. Gerenciamento).
 * Preenche o nome da turma e chama a função de popular o conteúdo.
 */
window.openShareModal = async function() {
    if (!state.activeClassId || state.activeClassId === 'null') return;
    const modal = document.getElementById('shareClassModal');
    if (!modal) return;
    document.getElementById('shareClassName').textContent = `"${state.activeClassName}"`;
    await populateShareModal(); // Busca professores e membros
    modal.classList.remove('hidden');
}

/**
 * Fecha o modal "Partilhar Turma".
 */
window.closeShareModal = function() {
    const modal = document.getElementById('shareClassModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Abre o modal "Editar Dados do Aluno" (pág. Gerenciamento).
 * @param {object} student - O objeto completo do aluno.
 */
window.openEditStudentModal = function(student) {
    state.editingStudentData = student; // Salva o aluno no estado global
    const modal = document.getElementById('editStudentModal');
    if (!modal) return;
    // Preenche os campos do modal com os dados do aluno
    document.getElementById('editStudentNameInput').value = student.full_name;
    document.getElementById('editStudentCpfInput').value = student.cpf || '';
    document.getElementById('editStudentPcIdInput').value = student.pc_id || '';
    modal.classList.remove('hidden');
}

/**
 * Fecha o modal "Editar Dados do Aluno".
 */
window.closeStudentModal = function() {
    document.getElementById('editStudentModal')?.classList.add('hidden');
    state.editingStudentData = null; // Limpa o estado
}

/**
 * Abre o modal "Logs de Alerta" (pág. Dashboard).
 * @param {string} title - O título do modal (ex: "Logs de Alerta para Aluno X").
 * @param {Array} logs - A lista de logs de alerta filtrada.
 */
window.openAlertLogsModal = function(title, logs) {
    const modal = document.getElementById('alertLogsModal');
    const titleEl = document.getElementById('alertLogsTitle');
    const container = document.getElementById('alertLogsContainer');
    if (!modal || !titleEl || !container) return;

    titleEl.textContent = title;
    container.innerHTML = ''; // Limpa o conteúdo anterior

    if (!logs || logs.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum log encontrado para este alerta.</p>';
    } else {
        // Cria a tabela de logs de alerta dinamicamente
        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-200';
        let tableHTML = `<thead class="bg-gray-100"><tr>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">URL</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Duração (s)</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Categoria</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Data/Hora</th>
        </tr></thead><tbody class="bg-white divide-y divide-gray-200">`;
        
        logs.forEach(log => {
            const url = log.url || 'N/A';
            const duration = log.duration || 0;
            const category = log.categoria || 'N/A';
            const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'N/A';
            tableHTML += `<tr>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700"><a href="http://${url}" target="_blank" class="text-blue-600 hover:underline">${url}</a></td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${duration}s</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${category}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${timestamp}</td>
            </tr>`;
        });

        tableHTML += '</tbody>';
        table.innerHTML = tableHTML;
        container.appendChild(table);
    }
    modal.classList.remove('hidden');
}

/**
 * Fecha o modal "Logs de Alerta".
 */
window.closeAlertLogsModal = function() {
    document.getElementById('alertLogsModal')?.classList.add('hidden');
}

/**
 * Abre o modal "Tour Guiado" (pág. Dashboard).
 */
window.openTutorialModal = function() {
    const tutorialModal = document.getElementById('tutorialModal');
    if (tutorialModal) {
        tutorialModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Trava o scroll da página
        currentTourStep = 1; // Reinicia o tour
        updateTourDisplay();
    }
}

/**
 * Fecha o modal "Tour Guiado".
 */
window.closeTutorialModal = function() {
    const tutorialModal = document.getElementById('tutorialModal');
    if (tutorialModal) {
        tutorialModal.classList.add('hidden');
        document.body.style.overflow = ''; // Restaura o scroll
    }
}

/**
 * Abre o modal "Editar Categoria" (pág. Dashboard).
 * @param {string} url - A URL do log (usada como chave).
 * @param {string} currentCategory - A categoria atual.
 */
window.openCategoryModal = function(url, currentCategory) {
    const modal = document.getElementById('categoryEditModal');
    const urlDisplay = document.getElementById('modalUrlDisplay');
    const categoryListDiv = document.getElementById('modalCategoryList');
    if (!modal || !urlDisplay || !categoryListDiv) {
        console.error("Elementos do modal de categoria não encontrados!");
        return;
    }

    currentlyEditingUrl = url; // Salva a URL no estado global temporário
    urlDisplay.textContent = url;
    categoryListDiv.innerHTML = ''; // Limpa as opções anteriores

    // Cria a lista de opções de rádio para as categorias
    const availableCategories = [...new Set(['Não Categorizado', ...state.categories])].sort();
    availableCategories.forEach(category => {
        const label = document.createElement('label');
        label.className = "flex items-center p-2 rounded hover:bg-gray-100 cursor-pointer";
        label.innerHTML = `
            <input type="radio" name="modalCategoryOption" value="${category}" class="form-radio h-4 w-4 text-red-600 focus:ring-red-500" ${category === currentCategory ? 'checked' : ''}>
            <span class="ml-3 text-sm text-gray-800">${category}</span>
        `;
        categoryListDiv.appendChild(label);
    });
    
    modal.classList.remove('hidden');
}

/**
 * Fecha o modal "Editar Categoria".
 */
window.closeCategoryModal = function() {
    const modal = document.getElementById('categoryEditModal');
    if (modal) modal.classList.add('hidden');
    currentlyEditingUrl = null; // Limpa a URL em edição
}

// ================================================================
//      CONTROLE DO TOUR GUIADO (Dashboard)
// ================================================================

let currentTourStep = 1; // Estado do passo atual do tour
const totalTourSteps = 3;  // Total de passos

/**
 * Avança para o próximo passo do tour.
 */
window.nextStep = function() {
    if (currentTourStep < totalTourSteps) {
        currentTourStep++;
        updateTourDisplay();
    }
}

/**
 * Retorna para o passo anterior do tour.
 */
window.prevStep = function() {
    if (currentTourStep > 1) {
        currentTourStep--;
        updateTourDisplay();
    }
}

/**
 * Atualiza a visibilidade dos painéis de passos e botões do tour.
 */
function updateTourDisplay() {
    // Esconde todos os painéis de passos
    document.querySelectorAll('.tour-step').forEach(step => {
        step.classList.add('hidden');
    });

    // Mostra o painel do passo atual
    const currentStepElement = document.getElementById(`step-${currentTourStep}`);
    if (currentStepElement) {
        currentStepElement.classList.remove('hidden');
    }

    // Atualiza o contador (ex: "1 de 3")
    document.getElementById('currentStep').textContent = currentTourStep;

    // Controla a visibilidade dos botões
    const prevBtn = document.getElementById('prevStepBtn');
    const nextBtn = document.getElementById('nextStepBtn');
    const finishBtn = document.getElementById('finishTourBtn');

    prevBtn.classList.toggle('hidden', currentTourStep === 1); // Esconde "Voltar" no passo 1
    nextBtn.classList.toggle('hidden', currentTourStep === totalTourSteps); // Esconde "Próximo" no último passo
    finishBtn.classList.toggle('hidden', currentTourStep !== totalTourSteps); // Mostra "Finalizar" apenas no último passo
}

// ================================================================
//      FUNÇÕES DE API (Requisições ao Backend)
// ================================================================

/**
 * Wrapper genérico para requisições fetch (GET, POST, DELETE).
 * Lida com headers JSON e tratamento de erros.
 * @param {string} url - O endpoint da API.
 * @param {string} [method='GET'] - O método HTTP.
 * @param {object} [body=null] - O corpo da requisição (para POST/PUT).
 * @returns {Promise<object>} Os dados da resposta JSON.
 */
async function apiCall(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Envia cookies de sessão
    };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const responseData = await response.json().catch(() => ({})); // Tenta parse, senão retorna {}

    if (!response.ok) {
        // Extrai a mensagem de erro do backend ou usa o statusText
        const errorMessage = responseData.error || response.statusText;
        console.error(`Falha na API ${method} ${url}:`, errorMessage);
        throw new Error(errorMessage); // Lança o erro para o Swal.fire
    }
    return responseData; // Retorna os dados de sucesso
}

/**
 * Busca e popula o modal de partilha com membros atuais e professores disponíveis.
 */
async function populateShareModal() {
    const professorsList = document.getElementById('professorsToShareList');
    const currentMembersList = document.getElementById('currentClassMembers');
    if (!professorsList || !currentMembersList) return;

    // Define estado de carregamento
    professorsList.innerHTML = '<option value="">A carregar...</option>';
    currentMembersList.innerHTML = '<li>A carregar...</li>';

    try {
        // Busca professores e membros em paralelo
        const [allProfs, { members, isCurrentUserOwner }] = await Promise.all([
            apiCall('/api/professors/list'), // Todos os professores
            apiCall(`/api/classes/${state.activeClassId}/members`) // Membros da turma
        ]);

        state.allProfessors = allProfs; // Salva no cache
        const currentMemberIds = members.map(m => m.id);

        // Popula o <select> de professores (apenas os que NÃO são membros)
        professorsList.innerHTML = '<option value="">Selecione um professor...</option>';
        state.allProfessors.forEach(prof => {
            if (!currentMemberIds.includes(prof.id)) {
                const option = document.createElement('option');
                option.value = prof.id;
                option.textContent = `${prof.full_name} (${prof.username})`;
                professorsList.appendChild(option);
            }
        });

        // Popula a lista <ul> de membros atuais
        currentMembersList.innerHTML = '';
        members.forEach(member => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center text-sm p-2 rounded-md hover:bg-gray-100';
            
            let memberHTML = `
                <div class="flex items-center">
                    <svg class="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    <span>${member.full_name}</span>
                </div>`;
            
            if (member.isOwner) {
                memberHTML += `<span class="ml-2 text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-semibold">Dono</span>`;
            } else if (isCurrentUserOwner) {
                // Adiciona botão de remover se o usuário for o dono
                memberHTML += `<button data-professor-id="${member.id}" class="remove-member-btn text-red-500 hover:text-red-700" title="Remover Professor">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                              </button>`;
            }
            li.innerHTML = memberHTML;
            currentMembersList.appendChild(li);
        });

    } catch (error) {
        console.error("Erro ao popular o modal de partilha:", error);
        professorsList.innerHTML = '<option value="">Erro ao carregar</option>';
        currentMembersList.innerHTML = '<li>Erro ao carregar</li>';
    }
}

/**
 * Busca todos os alunos cadastrados no sistema e salva no 'state.allStudents'.
 */
async function fetchAllStudents() {
    try {
        state.allStudents = await apiCall('/api/students/all');
        console.log(`Carregados ${state.allStudents.length} alunos para o estado.`);
    } catch (error) {
        console.error("Falha ao buscar a lista de todos os alunos:", error);
    }
}

/**
 * Busca os alunos associados à turma selecionada e salva no 'state.studentsInClass'.
 * @param {string} classId - O ID da turma.
 */
async function fetchStudentsInClass(classId) {
    if (!classId || classId === 'null') {
        state.studentsInClass = []; // Limpa se "Todas as Turmas" for selecionado
        return;
    }
    try {
        state.studentsInClass = await apiCall(`/api/classes/${classId}/students`);
    } catch (error) {
        console.error(`Falha ao buscar alunos da turma ${classId}:`, error);
        state.studentsInClass = []; // Reseta em caso de erro
    }
}

/**
 * Busca os dados principais do dashboard (logs e resumo do dia) e salva no estado.
 */
async function fetchDataPanels() {
    // Só executa se estiver na página do dashboard
    if (!document.getElementById('dashboard-content')) return;
    try {
        console.log("Buscando dados do painel (/api/data)...");
        const { logs, summary } = await apiCall(`/api/data`);
        state.allLogs = logs;
        state.allSummary = summary;
        console.log("Dados do painel recebidos:", { logsCount: logs.length, summaryCount: summary.length });
    } catch (error) {
        console.error("Erro ao buscar dados do painel:", error);
        Swal.fire('Erro de Rede', 'Não foi possível carregar os dados do painel. Verifique a conexão com o servidor.', 'error');
        // Limpa as tabelas em caso de erro
        updateUserSummaryTable([]);
        updateLogsTable([]);
        updateChart([]);
    }
}

// ================================================================
//      LÓGICA DE RENDERIZAÇÃO E FILTRAGEM
// ================================================================

/**
 * Renderiza a lista "Todos os Alunos" na pág. Gerenciamento.
 * Filtra com base na busca e destaca alunos já presentes na turma ativa.
 */
function renderAllStudents() {
    const container = document.getElementById('all-students-list');
    if (!container) return; // Só executa na pág. Gerenciamento

    // Filtra alunos com base no input de busca
    const searchTerm = state.currentFilters.studentSearch.toLowerCase();
    const filteredStudents = state.allStudents.filter(student => 
        student.full_name.toLowerCase().includes(searchTerm)
    );

    container.innerHTML = '';
    if (filteredStudents.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm p-2">Nenhum aluno encontrado.</p>`;
        return;
    }

    const studentsInClassIds = state.studentsInClass.map(s => s.id);

    filteredStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        const isAlreadyInClass = state.activeClassId && state.activeClassId !== 'null' && studentsInClassIds.includes(student.id);
        
        // Aplica estilo diferente se o aluno já estiver na turma
        studentDiv.className = `flex justify-between items-center p-2 rounded ${isAlreadyInClass ? 'bg-green-100 text-gray-400' : 'bg-gray-50'}`;
        
        studentDiv.innerHTML = `
            <div class="flex items-center">
                <span class="${!isAlreadyInClass ? 'cursor-grab' : ''}" draggable="${!isAlreadyInClass}" data-student-id="${student.id}">${student.full_name}</span>
                <button data-student-json='${JSON.stringify(student)}' class="btn-edit-student ml-2 text-gray-400 hover:text-blue-600 text-xs" title="Editar Aluno">✏️</button>
            </div>
            <button data-student-id="${student.id}" class="btn-add-student text-green-500 hover:text-green-700 text-xl font-bold w-6 h-6 flex items-center justify-center ${state.activeClassId && state.activeClassId !== 'null' && !isAlreadyInClass ? '' : 'hidden'}"
             title="Adicionar à turma">+</button>
        `;
        container.appendChild(studentDiv);
    });
}

/**
 * Renderiza a lista "Alunos na Turma" na pág. Gerenciamento.
 */
function renderStudentsInClass() {
    const container = document.getElementById('students-in-class-list');
    if (!container) return; // Só executa na pág. Gerenciamento

    container.innerHTML = '';
    if (state.studentsInClass.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm text-center py-4">Arraste um aluno da lista à esquerda para adicioná-lo aqui.</p>`;
        return;
    }

    state.studentsInClass.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'flex justify-between items-center bg-white p-2 rounded shadow-sm border';
        studentDiv.innerHTML = `
            <span>${student.full_name}</span>
            <button data-student-id="${student.id}" class="btn-remove-student text-red-500 hover:text-red-700 text-sm font-semibold">Remover</button>
        `;
        container.appendChild(studentDiv);
    });
}

/**
 * Função central que aplica TODOS os filtros (Dashboard) e re-renderiza
 * o Resumo, os Logs e o Gráfico com os dados filtrados.
 */
function applyFiltersAndRender() {
    const { search, category, showAlertsOnly } = state.currentFilters;
    const searchTerm = search.toLowerCase();

    // 1. FILTRO DE TURMA: Verifica se uma turma está ativa
    const isClassFilterActive = state.activeClassId && state.activeClassId !== 'null';
    let classStudentIdentifiers = null;
    if (isClassFilterActive) {
        // Cria uma lista de IDs (CPF e PC_ID) dos alunos na turma
        classStudentIdentifiers = state.studentsInClass.reduce((ids, student) => {
            if (student.cpf) ids.push(student.cpf.toLowerCase());
            if (student.pc_id) ids.push(student.pc_id.toLowerCase());
            return ids;
        }, []);
    }

    // 2. FILTRO DE PESQUISA (Aluno Específico):
    // Verifica se a pesquisa corresponde a um nome de aluno ou ID
    let targetStudentIdentifiers = null;
    const studentByNameMatch = state.allStudents.find(student => student.full_name && student.full_name.toLowerCase() === searchTerm);
    
    if (studentByNameMatch) {
        // Se a pesquisa for um nome exato, filtra apenas por esse aluno
        targetStudentIdentifiers = [studentByNameMatch.cpf, studentByNameMatch.pc_id].filter(Boolean).map(id => id.toLowerCase());
    } else {
        // Se não for nome, verifica se é um ID exato
        const studentByIdMatch = state.allStudents.find(student => (student.pc_id && student.pc_id.toLowerCase() === searchTerm) || (student.cpf && student.cpf.toLowerCase() === searchTerm));
        if (studentByIdMatch) {
            targetStudentIdentifiers = [studentByIdMatch.cpf, studentByIdMatch.pc_id].filter(Boolean).map(id => id.toLowerCase());
        }
    }

    // 3. FILTRAR TABELA DE RESUMO
    const filteredSummary = state.allSummary.filter(user => {
        // Filtro de Turma
        const matchesClass = !isClassFilterActive || (user.aluno_id && classStudentIdentifiers.includes(user.aluno_id.toLowerCase()));
        if (!matchesClass) return false;
        
        // Filtro de Pesquisa (termo genérico)
        const matchesSearch = searchTerm === '' || 
                              (user.student_name && user.student_name.toLowerCase().includes(searchTerm)) || 
                              (user.aluno_id && user.aluno_id.toLowerCase().includes(searchTerm));
        
        // Filtro de Alerta
        const matchesAlert = !showAlertsOnly || user.has_red_alert || user.has_blue_alert;
        
        return matchesSearch && matchesAlert;
    });

    // 4. FILTRAR TABELA DE LOGS
    const filteredLogs = state.allLogs.filter(log => {
        // Filtro de Turma
        const matchesClass = !isClassFilterActive || (log.aluno_id && classStudentIdentifiers.includes(log.aluno_id.toLowerCase()));
        if (!matchesClass) return false;

        // Filtro de Pesquisa (lógica complexa)
        let matchesSearch = false;
        if (targetStudentIdentifiers && targetStudentIdentifiers.length > 0) {
            // Se um aluno específico foi selecionado (pelo resumo ou nome exato)
            matchesSearch = log.aluno_id && targetStudentIdentifiers.includes(log.aluno_id.toLowerCase());
        } else if (!targetStudentIdentifiers && searchTerm !== '') {
            // Se for uma pesquisa genérica (URL, parte do nome, etc.)
            matchesSearch = (log.student_name && log.student_name.toLowerCase().includes(searchTerm)) || 
                              (log.aluno_id && log.aluno_id.toLowerCase().includes(searchTerm)) || 
                              (log.url && log.url.toLowerCase().includes(searchTerm));
        } else {
            // Se a pesquisa estiver vazia
             matchesSearch = true;
        }

        // Filtro de Categoria
        const matchesCategory = category === '' || log.categoria === category;
        
        // Filtro de Alerta
        const matchesAlert = !showAlertsOnly || ['Rede Social', 'Streaming & Jogos', 'IA'].includes(log.categoria);

        return matchesSearch && matchesCategory && matchesAlert;
    });

    // 5. RENDERIZAR TUDO
    console.log(`Renderizando ${filteredSummary.length} usuários no resumo e ${filteredLogs.length} logs na tabela.`);
    updateUserSummaryTable(filteredSummary);
    updateLogsTable(filteredLogs);
    updateChart(filteredLogs);
}

/**
 * Renderiza os controles de paginação para a tabela de logs.
 * @param {number} totalLogs - O número total de logs *filtrados*.
 */
function renderPaginationControls(totalLogs) {
    const container = document.getElementById('logs-pagination-container');
    if (!container) return;

    const totalPages = Math.ceil(totalLogs / state.logsPerPage);
    container.innerHTML = '';
    if (totalPages <= 1) return; // Não mostra paginação se couber em 1 página

    let paginationHTML = '<div class="flex justify-center items-center space-x-2 mt-4">';
    
    // Botão "Anterior"
    paginationHTML += `<button class="pagination-btn ${state.logsCurrentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${state.logsCurrentPage - 1}" ${state.logsCurrentPage === 1 ? 'disabled' : ''}>Anterior</button>`;
    
    // Números das Páginas (com lógica de "...")
    for (let i = 1; i <= totalPages; i++) {
        if (i === state.logsCurrentPage) {
            paginationHTML += `<span class="px-3 py-1 bg-red-700 text-white rounded-md text-sm">${i}</span>`;
        } else if (i <= 2 || i >= totalPages - 1 || (i >= state.logsCurrentPage - 1 && i <= state.logsCurrentPage + 1)) {
            paginationHTML += `<button class="pagination-btn" data-page="${i}">${i}</button>`;
        } else if (i === 3 || i === totalPages - 2) {
            paginationHTML += `<span class="px-2">...</span>`;
        }
    }
    
    // Botão "Próximo"
    paginationHTML += `<button class="pagination-btn ${state.logsCurrentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${state.logsCurrentPage + 1}" ${state.logsCurrentPage === totalPages ? 'disabled' : ''}>Próximo</button>`;
    paginationHTML += '</div>';
    
    container.innerHTML = paginationHTML;
}

/**
 * Renderiza a tabela de logs detalhados (pág. Dashboard).
 * @param {Array} logs - A lista de logs *já filtrada*.
 */
function updateLogsTable(logs) {
    const tableBody = document.getElementById('logsTableBody');
    const logsCount = document.getElementById('logs-count');
    if (!tableBody || !logsCount) return;

    logsCount.textContent = logs.length;
    tableBody.innerHTML = ''; 

    // Aplica a paginação
    const startIndex = (state.logsCurrentPage - 1) * state.logsPerPage;
    const endIndex = startIndex + state.logsPerPage;
    const paginatedLogs = logs.slice(startIndex, endIndex);

    if (paginatedLogs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhum log encontrado para a seleção atual.</td></tr>';
        renderPaginationControls(logs.length);
        return;
    }

    const fragment = document.createDocumentFragment();
    
    paginatedLogs.forEach(log => {
        const row = document.createElement('tr');
        const currentCategory = log.categoria || 'Não Categorizado'; 
        
        // Colore a linha com base na categoria
        if (['Rede Social', 'Streaming & Jogos'].includes(currentCategory)) {
            row.classList.add('bg-red-50', 'text-red-800', 'font-medium');
        } else if (currentCategory === 'IA') {
            row.classList.add('bg-blue-50', 'text-blue-800', 'font-medium');
        }
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.student_name || `<i>${log.aluno_id}</i>`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <a href="http://${log.url}" target="_blank" class="text-blue-600 hover:underline">${log.url || 'N/A'}</a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.duration || 0}s</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm category-cell">
                <span class="category-edit-modal-trigger cursor-pointer hover:underline text-blue-600"
                      title="Clique para alterar a categoria de ${log.url || ''}"
                      data-url="${log.url || ''}"
                      data-current-category="${currentCategory}">
                    ${currentCategory}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'N/A'}</td>
        `;
        
        fragment.appendChild(row);
    }); 

    tableBody.appendChild(fragment);
    renderPaginationControls(logs.length); // Renderiza a paginação
}

/**
 * Renderiza a tabela de resumo de atividade (pág. Dashboard).
 * @param {Array} users - A lista de resumos de usuário *já filtrada*.
 */
function updateUserSummaryTable(users) {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhum dado de atividade para a seleção atual.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    users.forEach((user) => {
        const row = document.createElement('tr');
        const displayId = user.aluno_id || 'ID_Desconhecido';
        row.dataset.alunoId = displayId;
        row.classList.add('cursor-pointer', 'hover:bg-gray-50', 'summary-row');

        // Define os ícones de status (Alerta Vermelho, Azul ou OK)
        let statusHTML = '';
        let hasAlert = false;
        if (user.has_red_alert) {
            statusHTML += `<button data-aluno-id="${displayId}" data-alert-type="red" class="alert-btn text-xl cursor-pointer mr-2" title="Mostrar logs de Acesso Indevido (Rede Social, Jogos)">⚠️</button>`;
            hasAlert = true;
        }
        if (user.has_blue_alert) {
            statusHTML += `<button data-aluno-id="${displayId}" data-alert-type="blue" class="alert-btn text-xl cursor-pointer" title="Mostrar logs de Uso de IA">🔹</button>`;
            hasAlert = true;
        }
        if (!hasAlert) {
             statusHTML = '<span class="text-green-500 text-xl" title="Nenhuma categoria de alerta detectada">✅</span>';
        }

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm">${statusHTML}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.student_name || `<i>Aluno Desconhecido</i>`}</td>
            <td class_name="px-6 py-4 whitespace-nowrap text-sm">${displayId}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${(user.total_duration / 60).toFixed(1)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${user.log_count}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${user.last_activity ? new Date(user.last_activity).toLocaleString('pt-BR') : 'N/A'}</td>
        `;
        fragment.appendChild(row);
    });
    tableBody.appendChild(fragment);
}

/**
 * Renderiza o gráfico principal (pág. Dashboard).
 * @param {Array} logs - A lista de logs *já filtrada*.
 */
function updateChart(logs) {
    const chartCanvas = document.getElementById('mainChart');
    if (!chartCanvas) return;
    
    // Destrói o gráfico anterior para evitar sobreposição
    if (state.mainChartInstance) {
        state.mainChartInstance.destroy();
    }

    // Agrega o tempo de uso por URL
    const siteUsage = logs.reduce((acc, log) => {
        if (log.url) acc[log.url] = (acc[log.url] || 0) + log.duration;
        return acc;
    }, {});

    // Pega o Top 10 sites
    const topSites = Object.entries(siteUsage).sort(([, a], [, b]) => b - a).slice(0, 10);
    const chartLabels = topSites.map(site => site[0]);
    const chartData = topSites.map(site => site[1]);
    const backgroundColors = ['rgba(220, 38, 38, 0.7)', 'rgba(153, 27, 27, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(248, 113, 113, 0.7)', 'rgba(252, 165, 165, 0.7)'];

    // Cria a nova instância do gráfico
    state.mainChartInstance = new Chart(chartCanvas.getContext('2d'), {
        type: state.currentChartType, // 'bar', 'pie', etc.
        data: {
            labels: chartLabels.length > 0 ? chartLabels : ['Nenhum dado para exibir'],
            datasets: [{ 
                label: 'Tempo de Uso (s)', 
                data: chartData.length > 0 ? chartData : [0],
                backgroundColor: backgroundColors 
            }]
        },
        options: {
            indexAxis: state.currentChartType === 'bar' ? 'y' : 'x', // Barras horizontais
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: state.currentChartType !== 'bar' }, // Legenda para 'pie' e 'doughnut'
                tooltip: {
                     callbacks: {
                        label: function(context) { // Formata tooltip para minutos
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) label += (context.parsed / 60).toFixed(1) + ' min'; 
                            return label;
                        }
                    }
                }
            },
            onClick: (event, activeElements, chart) => {
                // Permite clicar em uma barra do gráfico para filtrar
                if (activeElements.length > 0) {
                    const dataIndex = activeElements[0].index;
                    const clickedUrl = chart.data.labels[dataIndex];
                    if (clickedUrl && clickedUrl !== 'Nenhum dado para exibir') {
                        // Coloca a URL clicada na barra de pesquisa e filtra
                        const searchInput = document.getElementById('search-input');
                        if (searchInput) {
                            searchInput.value = clickedUrl;
                            state.currentFilters.search = clickedUrl;
                            state.logsCurrentPage = 1;
                            applyFiltersAndRender();
                            // Rola a página para a tabela de logs
                            document.getElementById('logsTableBody')?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                }
            }
        }
    });
}

// ================================================================
//      LÓGICA DE AÇÕES (Botões de Gerenciamento)
// ================================================================

/**
 * Chama a API para criar uma nova turma (pág. Gerenciamento).
 */
async function createClass() {
    const nameInput = document.getElementById('newClassName');
    if (!nameInput) return;
    const name = nameInput.value.trim();
    if (!name) return Swal.fire('Erro!', 'O nome da turma não pode estar vazio.', 'error');

    try {
        const result = await apiCall('/api/classes', 'POST', { name });
        await Swal.fire('Sucesso!', result.message, 'success');
        window.location.reload(); // Recarrega para mostrar a nova turma
    } catch (error) { 
        Swal.fire('Erro!', error.message, 'error'); 
    }
}

/**
 * Chama a API para deletar uma turma (pág. Gerenciamento).
 * @param {string} classId - O ID da turma a ser deletada.
 */
async function deleteClass(classId) {
    // Pede confirmação
    const result = await Swal.fire({
        title: 'Tem a certeza?',
        text: "ATENÇÃO: Isso removerá a turma permanentemente.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, remover!',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const result = await apiCall(`/api/classes/${classId}`, 'DELETE');
            await Swal.fire('Removida!', result.message, 'success');
            window.location.reload(); // Recarrega para remover da lista
        } catch (error) { 
            Swal.fire('Erro!', error.message, 'error'); 
        }
    }
}

/**
 * Chama a API para salvar as mudanças no nome da turma (pág. Gerenciamento).
 */
async function saveClassChanges() {
    const modal = document.getElementById('editClassModal');
    if (!modal) return;
    
    const classId = modal.dataset.classId; // Pega o ID salvo no modal
    const newNameInput = document.getElementById('editClassNameInput');
    const newName = newNameInput ? newNameInput.value.trim() : '';

    if (!newName) {
        return Swal.fire('Erro!', 'O nome da turma não pode estar vazio.', 'error');
    }
    if (!classId || classId === 'null') {
         return Swal.fire('Erro!', 'ID da turma não encontrado. Tente novamente.', 'error');
    }

    try {
        // Rota adicionada no server.js
        const result = await apiCall(`/api/classes/${classId}/edit`, 'POST', { newName });
        await Swal.fire('Sucesso!', result.message, 'success');
        window.location.reload(); // Recarrega para ver a mudança
    } catch (error) {
        Swal.fire('Erro!', error.message, 'error');
    }
}

/**
 * Chama a API para salvar as mudanças nos dados do aluno (pág. Gerenciamento).
 */
async function saveStudentChanges() {
    if (!state.editingStudentData) return;

    const studentId = state.editingStudentData.id;
    const updatedData = {
        fullName: document.getElementById('editStudentNameInput').value.trim(),
        cpf: document.getElementById('editStudentCpfInput').value.trim(),
        pc_id: document.getElementById('editStudentPcIdInput').value.trim()
    };

    if (!updatedData.fullName) {
        return Swal.fire('Erro!', 'O nome do aluno é obrigatório.', 'error');
    }

    try {
        // Rota adicionada no server.js
        const result = await apiCall(`/api/students/${studentId}/edit`, 'POST', updatedData);
        await Swal.fire('Sucesso!', result.message, 'success');
        
        closeStudentModal();
        await fetchAllStudents(); // Recarrega o cache de alunos
        renderAllStudents();      // Re-renderiza a lista "Todos os Alunos"
        
        // Se o aluno estava na turma, atualiza a lista da turma também
        if (state.studentsInClass.some(s => s.id === studentId)) {
            await fetchStudentsInClass(state.activeClassId);
            renderStudentsInClass();
        }

    } catch (error) {
        Swal.fire('Erro!', error.message, 'error');
    }
}

// ================================================================
//      LÓGICA DE EVENTOS (Listeners)
// ================================================================

/**
 * Gerencia a seleção de turma no <select> (Filtro Global).
 * Atualiza o 'state' e o 'localStorage' e recarrega os painéis.
 * @param {string} selectedId - O ID da turma selecionada (ou 'null').
 * @param {string} selectedName - O nome da turma selecionada.
 */
async function handleClassSelection(selectedId, selectedName) {
    // Atualiza o estado
    state.activeClassId = selectedId;
    state.activeClassName = selectedName;
    
    // Salva a seleção para persistir entre reloads
    localStorage.setItem('selectedClassId', selectedId || 'null');
    localStorage.setItem('selectedClassName', selectedName || '');
    
    // Busca os alunos da turma selecionada
    await fetchStudentsInClass(state.activeClassId);

    // Se estiver na pág. Gerenciamento, atualiza a UI de gerenciamento
    const studentManagementPanel = document.getElementById('student-management-panel');
    if (studentManagementPanel) {
        const classStudentsPanel = document.getElementById('class-students-panel');
        const editBtn = document.getElementById('editClassBtn');
        const deleteBtn = document.getElementById('deleteClassBtn');
        const shareBtn = document.getElementById('shareClassBtn');
        const classInstructions = document.getElementById('class-instructions');
        const classNameInList = document.getElementById('class-name-in-list');

        const isTurmaSelected = state.activeClassId && state.activeClassId !== 'null';
        
        if (classStudentsPanel) classStudentsPanel.classList.toggle('hidden', !isTurmaSelected);
        if (classNameInList) classNameInList.textContent = isTurmaSelected ? state.activeClassName : 'Nenhuma selecionada';
        if (classInstructions) classInstructions.style.display = isTurmaSelected ? 'none' : 'block';
        if (editBtn) editBtn.disabled = !isTurmaSelected;
        if (deleteBtn) deleteBtn.disabled = !isTurmaSelected;
        if (shareBtn) shareBtn.disabled = !isTurmaSelected;
        
        renderStudentsInClass(); // Atualiza a lista "Alunos na Turma"
        renderAllStudents();     // Atualiza a lista "Todos os Alunos" (para destacar)
    }

    // Se estiver na pág. Dashboard, aplica o filtro de turma
    if (document.getElementById('dashboard-content')) {
        state.logsCurrentPage = 1; // Reseta a paginação
        applyFiltersAndRender();
    }
}

/**
 * Ponto de entrada principal. Executado quando o DOM está pronto.
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM carregado. Iniciando script...");

    // --- 1. Carregar Dados Essenciais ---
    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        // Carrega as categorias do <select> (renderizado pelo EJS) para o estado
        state.categories = Array.from(categorySelect.options)
                                 .map(option => option.value)
                                 .filter(value => value !== '');
    }
    
    // Carrega dados iniciais (alunos e logs/resumo) em paralelo
    await Promise.all([
        fetchAllStudents(), // Necessário para filtros de nome e gerenciamento
        fetchDataPanels()   // Necessário para o dashboard
    ]);
    console.log("Dados iniciais (alunos e painel) carregados.");

    // --- 2. Lógica do Relatório PDF (Dashboard) ---
    const downloadBtn = document.getElementById('downloadPdfBtn');
    const dateInput = document.getElementById('reportDate');
    const errorDiv = document.getElementById('reportError');
    if (downloadBtn && dateInput && errorDiv) {
        // Define a data de HOJE como padrão no input
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const todayLocal = new Date(today.getTime() - (offset*60*1000));
        dateInput.value = todayLocal.toISOString().split('T')[0]; 

        downloadBtn.addEventListener('click', function() {
            const selectedDate = dateInput.value;
            errorDiv.textContent = '';
            if (!selectedDate) {
                errorDiv.textContent = 'Por favor, selecione uma data.';
                return;
            }
            // Redireciona o navegador para a rota de download
            window.location.href = `/api/download-report/${selectedDate}`;
        });
    }

    // --- 3. Listeners da Página de Gerenciamento ---
    const studentManagementPanel = document.getElementById('student-management-panel');
    if (studentManagementPanel) {
        console.log("Página de Gerenciamento detectada. Anexando listeners...");
        
        // Botões de Ação da Turma
        document.getElementById('createClassBtn')?.addEventListener('click', createClass);
        document.getElementById('editClassBtn')?.addEventListener('click', () => {
            if(state.activeClassId && state.activeClassId !== 'null') openEditClassModal(state.activeClassId, state.activeClassName);
        });
        document.getElementById('shareClassBtn')?.addEventListener('click', openShareModal);
        document.getElementById('deleteClassBtn')?.addEventListener('click', () => {
            if(state.activeClassId && state.activeClassId !== 'null') deleteClass(state.activeClassId);
        });
        
        // Botões de Ação dos Modais
        document.getElementById('saveClassChangesBtn')?.addEventListener('click', saveClassChanges);
        document.getElementById('saveStudentChangesBtn')?.addEventListener('click', saveStudentChanges);
        
        // Listener do Modal de Partilha (Adicionar Professor)
        document.getElementById('addProfessorToClassBtn')?.addEventListener('click', async () => {
            const professorId = document.getElementById('professorsToShareList').value;
            if (!professorId) return Swal.fire('Atenção!', 'Por favor, selecione um professor.', 'warning');
            try {
                await apiCall(`/api/classes/${state.activeClassId}/share`, 'POST', { professorId });
                Swal.fire('Sucesso!', 'Professor adicionado à turma!', 'success');
                await populateShareModal(); // Atualiza o modal
            } catch (error) { Swal.fire('Erro!', `Erro ao partilhar a turma: ${error.message}`, 'error'); }
        });

        // Listener do Modal de Partilha (Remover Membro)
        document.getElementById('currentClassMembers')?.addEventListener('click', async (e) => {
            const removeButton = e.target.closest('.remove-member-btn');
            if (removeButton) {
                const professorId = removeButton.dataset.professorId;
                const swalResult = await Swal.fire({ title: 'Tem a certeza?', text: "Deseja remover este professor da turma?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Sim, remover!', cancelButtonText: 'Cancelar' });
                if (swalResult.isConfirmed) {
                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/remove-member/${professorId}`, 'DELETE');
                        Swal.fire('Sucesso!', 'Professor removido com sucesso!', 'success');
                        await populateShareModal(); // Atualiza o modal
                    } catch (error) { Swal.fire('Erro!', `Erro ao remover professor: ${error.message}`, 'error'); }
                }
            }
        });

        // Listeners da Lista "Todos os Alunos" (Adicionar, Editar)
        const allStudentsList = document.getElementById('all-students-list');
        if (allStudentsList) {
             allStudentsList.addEventListener('click', async (e) => {
                // Clicou em ADICIONAR (+)
                const addButton = e.target.closest('.btn-add-student');
                if (addButton) {
                    const studentId = addButton.dataset.studentId;
                    addButton.innerHTML = `<svg class="animate-spin h-5 w-5 text-gray-600" ...></svg>`; // Spinner
                    addButton.disabled = true;
                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/add-student`, 'POST', { studentId });
                        await fetchStudentsInClass(state.activeClassId);
                        renderStudentsInClass(); // Atualiza painel da direita
                        renderAllStudents();     // Atualiza painel da esquerda
                    } catch (error) { Swal.fire('Erro!', error.message, 'error'); }
                }
                // Clicou em EDITAR (lápis)
                if (e.target.closest('.btn-edit-student')) {
                    const studentData = JSON.parse(e.target.closest('.btn-edit-student').dataset.studentJson);
                    openEditStudentModal(studentData);
                }
            });
            // Listener para Drag-and-Drop
            allStudentsList.addEventListener('dragstart', e => {
                 const target = e.target.closest('[data-student-id]');
                 if (target) e.dataTransfer.setData('text/plain', target.dataset.studentId);
            });
        }

        // Listener da Lista "Alunos na Turma" (Remover)
        const classStudentsList = document.getElementById('students-in-class-list');
        if (classStudentsList) {
             classStudentsList.addEventListener('click', async (e) => {
                const removeButton = e.target.closest('.btn-remove-student');
                if (removeButton) {
                    const studentId = removeButton.dataset.studentId;
                    const swalResult = await Swal.fire({ title: 'Tem certeza?', text: "Deseja remover este aluno da turma?", icon: 'warning', });
                    if (swalResult.isConfirmed) {
                         removeButton.disabled = true; removeButton.textContent = 'Removendo...';
                        try {
                            await apiCall(`/api/classes/${state.activeClassId}/remove-student/${studentId}`, 'DELETE');
                            await fetchStudentsInClass(state.activeClassId);
                            renderStudentsInClass();
                            renderAllStudents();
                        } catch(error) { /* ... */ }
                    }
                }
            });
        }
        
        // Listener do Formulário "Adicionar Novo Aluno"
        document.getElementById('addStudentForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const studentData = Object.fromEntries(formData.entries());
            try {
                const result = await apiCall('/api/students', 'POST', studentData);
                state.allStudents.push(result.student); // Adiciona ao cache
                state.allStudents.sort((a, b) => a.full_name.localeCompare(b.full_name));
                renderAllStudents(); // Re-renderiza a lista
                e.target.reset();
                Swal.fire('Sucesso!', 'Aluno adicionado com sucesso!', 'success');
            } catch(error) { Swal.fire('Erro!', error.message, 'error'); }
        });
        
        // Listeners dos botões "Adicionar Turma" e "Adicionar Aluno" (toggle)
        document.getElementById('toggle-create-class-form')?.addEventListener('click', () => document.getElementById('create-class-form-container').classList.toggle('hidden'));
        document.getElementById('toggle-add-student-form')?.addEventListener('click', () => document.getElementById('add-student-form-container').classList.toggle('hidden'));
        // Listener da Busca de Alunos
        document.getElementById('student-search-input')?.addEventListener('input', (e) => {
            state.currentFilters.studentSearch = e.target.value;
            renderAllStudents();
        });
    }

    // --- 4. Listeners da Página do Dashboard ---
    const dashboardContent = document.getElementById('dashboard-content');
    if (dashboardContent) {
        console.log("Página do Dashboard detectada. Anexando listeners...");

        // Renderiza os dados iniciais (já carregados)
        applyFiltersAndRender();
        
        // Botões de Tipo de Gráfico
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.currentChartType = btn.dataset.type;
                // Atualiza estilo dos botões
                document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active', 'bg-red-700', 'text-white'));
                btn.classList.add('active', 'bg-red-700', 'text-white');
                applyFiltersAndRender(); // Re-renderiza o gráfico
            });
        });

        // Botões de Filtro (Aplicar / Limpar)
        document.getElementById('apply-filters-btn')?.addEventListener('click', () => {
            state.logsCurrentPage = 1;
            state.currentFilters.search = document.getElementById('search-input').value;
            state.currentFilters.category = document.getElementById('category-select').value;
            state.currentFilters.showAlertsOnly = document.getElementById('show-alerts-checkbox').checked;
            applyFiltersAndRender();
        });
        document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
            state.logsCurrentPage = 1;
            document.getElementById('search-input').value = '';
            document.getElementById('category-select').value = '';
            document.getElementById('show-alerts-checkbox').checked = false;
            state.currentFilters.search = '';
            state.currentFilters.category = '';
            state.currentFilters.showAlertsOnly = false;
            applyFiltersAndRender();
        });
        
        // Listener de Paginação (Tabela de Logs)
        document.getElementById('logs-pagination-container')?.addEventListener('click', (e) => {
            if (e.target.matches('.pagination-btn') && !e.target.disabled) {
                const page = parseInt(e.target.dataset.page, 10);
                if (page) {
                    state.logsCurrentPage = page;
                    applyFiltersAndRender();
                }
            }
        });
    }
    
    // --- 5. Listeners Globais (Ambas as Páginas) ---

    // Listener do <select> de Turma (Filtro)
    const classSelect = document.getElementById('classSelect');
    if(classSelect) {
        // Recupera a última turma selecionada do localStorage
        const savedClassId = localStorage.getItem('selectedClassId') || 'null';
        const savedClassName = localStorage.getItem('selectedClassName') || 'Visão Geral (Todas as Turmas)';
        classSelect.value = savedClassId;
        
        // Aplica a seleção inicial
        await handleClassSelection(savedClassId, savedClassName); 
        
        // Adiciona o listener para futuras mudanças
        classSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            handleClassSelection(e.target.value, selectedOption.text);
        });
    }

    // Listener da Tabela de Resumo (Clicar na Linha ou no Ícone de Alerta)
    const usersTableBody = document.getElementById('usersTableBody');
    if (usersTableBody) {
        usersTableBody.addEventListener('click', async (e) => {
            const alertButton = e.target.closest('.alert-btn');
            const clickedRow = e.target.closest('tr.summary-row');
            
            if (alertButton) { // Ação: Clicou no ícone de ALERTA (⚠️ ou 🔹)
                e.stopPropagation(); // Impede que o clique na linha seja acionado
                const alunoId = alertButton.dataset.alunoId;
                const alertType = alertButton.dataset.alertType;
                try {
                    // Busca os logs específicos desse alerta
                    const logs = await apiCall(`/api/alerts/${encodeURIComponent(alunoId)}/${alertType}`);
                    const title = `Logs de Alerta (${alertType === 'red' ? 'Acesso Indevido' : 'Uso de IA'}) para ${alunoId}`;
                    openAlertLogsModal(title, logs);
                } catch (error) {
                    Swal.fire('Erro!', "Erro ao buscar os logs de alerta: " + error.message, 'error');
                }
            } else if (clickedRow) { // Ação: Clicou na LINHA (para filtrar)
                const studentNameElement = clickedRow.querySelector('td:nth-child(2)'); // Coluna do Nome
                const studentName = studentNameElement ? studentNameElement.textContent.trim() : null;
                if (studentName) {
                    // Coloca o nome do aluno na barra de pesquisa e filtra
                    const searchInput = document.getElementById('search-input');
                    if (searchInput) searchInput.value = studentName;
                    state.currentFilters.search = studentName;
                    state.logsCurrentPage = 1;
                    applyFiltersAndRender();
                    // Rola para a tabela de logs
                    document.getElementById('logsTableBody')?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }
    
    // Listener da Tabela de Logs (Clicar na Categoria para Editar)
    const logsTableBody = document.getElementById('logsTableBody');
    if (logsTableBody) {
        logsTableBody.addEventListener('click', (e) => {
            const categoryTrigger = e.target.closest('.category-edit-modal-trigger');
            if (categoryTrigger) {
                const url = categoryTrigger.dataset.url;
                const currentCategory = categoryTrigger.dataset.currentCategory;
                openCategoryModal(url, currentCategory);
            }
        });
    }
    
    // Listeners do Modal de Edição de Categoria
    const confirmCategoryBtn = document.getElementById('confirmCategoryChangeBtn');
    if (confirmCategoryBtn) {
        confirmCategoryBtn.addEventListener('click', async () => {
            const selectedRadio = document.querySelector('input[name="modalCategoryOption"]:checked');
            if (!selectedRadio) return Swal.fire('Atenção!', 'Por favor, selecione uma categoria.', 'warning');
            
            const newCategory = selectedRadio.value;
            const url = currentlyEditingUrl;
            if (!url) { closeCategoryModal(); return; }
            
            const triggerSpan = logsTableBody?.querySelector(`span[data-url="${url}"].category-edit-modal-trigger`);
            const originalCategory = triggerSpan ? triggerSpan.dataset.currentCategory : 'Não Categorizado';

            if (newCategory !== originalCategory) {
                try {
                    Swal.showLoading();
                    // Envia a mudança para o backend (salva o "override")
                    const result = await apiCall('/api/override-category', 'POST', { url: url, newCategory: newCategory });
                    await Swal.fire('Sucesso!', result.message, 'success');
                    
                    // Atualiza a UI imediatamente (muda a cor da linha e texto)
                    document.querySelectorAll(`span[data-url="${url}"].category-edit-modal-trigger`).forEach(span => {
                         span.textContent = newCategory;
                         span.dataset.currentCategory = newCategory;
                         const row = span.closest('tr');
                         if (row) {
                            row.className = '';
                            if (['Rede Social', 'Streaming & Jogos'].includes(newCategory)) row.classList.add('bg-red-50', 'text-red-800', 'font-medium');
                            if (newCategory === 'IA') row.classList.add('bg-blue-50', 'text-blue-800', 'font-medium');
                         }
                    });
                    
                    // Recarrega todos os dados, pois os alertas no Resumo podem ter mudado
                    await fetchDataPanels();
                    applyFiltersAndRender(); // Re-renderiza tudo
                    
                    closeCategoryModal();
                } catch (error) {
                    Swal.fire('Erro!', error.message || 'Não foi possível salvar a categoria.', 'error');
                    closeCategoryModal();
                }
            } else {
                 Swal.fire({ title: 'Nenhuma alteração', text: 'Você selecionou a mesma categoria.', icon: 'info', timer: 1500, showConfirmButton: false });
                 closeCategoryModal();
            }
        });
    }
    
    // Listeners genéricos para fechar modais (botões "Cancelar" ou "X")
    document.getElementById('cancelCategoryChangeBtn')?.addEventListener('click', closeCategoryModal);
    document.getElementById('closeCategoryModalBtn')?.addEventListener('click', closeCategoryModal);
    document.getElementById('categoryEditModal')?.addEventListener('click', (e) => {
         if (e.target === e.currentTarget) closeCategoryModal(); // Clicar no overlay
    });

    // Listeners genéricos para botões de fechar (com a classe .modal-close-btn)
    // Usado nos modais de Gerenciamento que não têm `onclick=""`
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
         btn.addEventListener('click', (e) => {
             // Encontra o modal pai mais próximo e o esconde
             e.target.closest('.fixed.inset-0')?.classList.add('hidden');
         });
    });

    console.log("Todos os listeners do DOMContentLoaded foram anexados.");
});