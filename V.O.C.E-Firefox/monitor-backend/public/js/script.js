// ================================================================
//                         LÓGICA DO DASHBOARD V.O.C.E
// ================================================================

// Objeto de estado global para armazenar dados e filtros
let state = {
    activeClassId: null,
    activeClassName: '',
    allStudents: [], // Lista de TODOS os alunos (da API /api/students/all)
    studentsInClass: [], // Alunos na turma selecionada
    editingStudentData: null,
    currentChartType: 'bar',
    mainChartInstance: null,
    allLogs: [], // Todos os logs carregados do dia
    allSummary: [], // Todos os resumos de alunos do dia
    logsCurrentPage: 1,
    logsPerPage: 10, // Definido para 10. Mude para 100 se preferir.
    allProfessors: [],
    categories: [], // Lista de categorias disponíveis
    currentFilters: {
        search: '',
        category: '',
        showAlertsOnly: false,
        studentSearch: '',
    }
};

// Variável global para o modal de categoria
let currentlyEditingUrl = null;

// ================================================================
//                   FUNÇÕES AUXILIARES (MODAIS, API)
// ================================================================

// --- FUNÇÕES DE MODAL (GESTÃO) ---
function openEditClassModal(classId, currentName) {
    const modal = document.getElementById('editClassModal');
    if(!modal) return;
    document.getElementById('editClassNameInput').value = currentName;
    modal.dataset.classId = classId;
    modal.classList.remove('hidden');
}

async function openShareModal() {
    if (!state.activeClassId || state.activeClassId === 'null') return;
    const modal = document.getElementById('shareClassModal');
    if (!modal) return;
    document.getElementById('shareClassName').textContent = `"${state.activeClassName}"`;
    await populateShareModal();
    modal.classList.remove('hidden');
}

function closeShareModal() {
    const modal = document.getElementById('shareClassModal');
    if (modal) modal.classList.add('hidden');
}

async function populateShareModal() {
    const professorsList = document.getElementById('professorsToShareList');
    const currentMembersList = document.getElementById('currentClassMembers');
    if (!professorsList || !currentMembersList) return;
    professorsList.innerHTML = '<option value="">A carregar...</option>';
    currentMembersList.innerHTML = '<li>A carregar...</li>';
    try {
        const [allProfs, { members, isCurrentUserOwner }] = await Promise.all([
            apiCall('/api/professors/list'),
            apiCall(`/api/classes/${state.activeClassId}/members`)
        ]);
        state.allProfessors = allProfs;
        const currentMemberIds = members.map(m => m.id);
        professorsList.innerHTML = '<option value="">Selecione um professor...</option>';
        state.allProfessors.forEach(prof => {
            if (!currentMemberIds.includes(prof.id)) {
                const option = document.createElement('option');
                option.value = prof.id;
                option.textContent = `${prof.full_name} (${prof.username})`;
                professorsList.appendChild(option);
            }
        });
        currentMembersList.innerHTML = '';
        members.forEach(member => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center text-sm p-2 rounded-md hover:bg-gray-100';
            let memberHTML = `<div class="flex items-center"><svg class="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg><span>${member.full_name}</span></div>`;
            if (member.isOwner) {
                memberHTML += `<span class="ml-2 text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-semibold">Dono</span>`;
            } else if (isCurrentUserOwner) {
                memberHTML += `<button data-professor-id="${member.id}" class="remove-member-btn text-red-500 hover:text-red-700"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>`;
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

function openEditStudentModal(student) {
    state.editingStudentData = student;
    const modal = document.getElementById('editStudentModal');
    if(!modal) return;
    document.getElementById('editStudentNameInput').value = student.full_name;
    document.getElementById('editStudentCpfInput').value = student.cpf || '';
    document.getElementById('editStudentPcIdInput').value = student.pc_id || '';
    modal.classList.remove('hidden');
}

function closeStudentModal() {
    document.getElementById('editStudentModal')?.classList.add('hidden');
}

// --- FUNÇÕES MODAL DE ALERTA E CATEGORIA ---
function openAlertLogsModal(title, logs) {
    const modal = document.getElementById('alertLogsModal');
    const titleEl = document.getElementById('alertLogsTitle');
    const container = document.getElementById('alertLogsContainer');
    if (!modal || !titleEl || !container) return;
    titleEl.textContent = title;
    container.innerHTML = '';
    if (!logs || logs.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum log encontrado para este alerta.</p>';
    } else {
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

function closeAlertLogsModal() {
    document.getElementById('alertLogsModal')?.classList.add('hidden');
}

function openCategoryModal(url, currentCategory) {
    const modal = document.getElementById('categoryEditModal');
    const urlDisplay = document.getElementById('modalUrlDisplay');
    const categoryListDiv = document.getElementById('modalCategoryList');
    if (!modal || !urlDisplay || !categoryListDiv) {
        console.error("Elementos do modal de categoria não encontrados!");
        return;
    }
    currentlyEditingUrl = url;
    urlDisplay.textContent = url;
    categoryListDiv.innerHTML = '';
    const availableCategories = [...new Set(['Não Categorizado', ...state.categories])].sort();
    availableCategories.forEach(category => {
        const label = document.createElement('label');
        label.className = "flex items-center p-2 rounded hover:bg-gray-100 cursor-pointer";
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'modalCategoryOption';
        input.value = category;
        input.className = "form-radio h-4 w-4 text-red-600 focus:ring-red-500";
        if (category === currentCategory) {
            input.checked = true;
        }
        const span = document.createElement('span');
        span.className = "ml-3 text-sm text-gray-800";
        span.textContent = category;
        label.appendChild(input);
        label.appendChild(span);
        categoryListDiv.appendChild(label);
    });
    modal.classList.remove('hidden');
}

function closeCategoryModal() {
    const modal = document.getElementById('categoryEditModal');
    if (modal) modal.classList.add('hidden');
    currentlyEditingUrl = null;
}

// --- FUNÇÃO DE API GENÉRICA ---
async function apiCall(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    const responseData = await response.json().catch(() => ({})); // Tenta fazer parse, ou retorna {}
    if (!response.ok) {
        // Usa a mensagem de erro do JSON ou o statusText
        const errorMessage = responseData.error || response.statusText;
        console.error(`Falha na API ${method} ${url}:`, errorMessage);
        throw new Error(errorMessage);
    }
    return responseData; // Retorna os dados JSON
}

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---
function renderAllStudents() {
    const container = document.getElementById('all-students-list');
    if (!container) return;
    const searchTerm = state.currentFilters.studentSearch.toLowerCase();
    const filteredStudents = state.allStudents.filter(student => student.full_name.toLowerCase().includes(searchTerm));
    container.innerHTML = '';
    if (filteredStudents.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm p-2">Nenhum aluno encontrado.</p>`;
        return;
    }
    const studentsInClassIds = state.studentsInClass.map(s => s.id);
    filteredStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        const isAlreadyInClass = state.activeClassId && state.activeClassId !== 'null' && studentsInClassIds.includes(student.id);
        studentDiv.className = `flex justify-between items-center p-2 rounded ${isAlreadyInClass ? 'bg-green-100 text-gray-400' : 'bg-gray-50'}`;
        studentDiv.innerHTML = `
            <div class="flex items-center">
                <span class="${!isAlreadyInClass ? 'cursor-grab' : ''}" draggable="${!isAlreadyInClass}" data-student-id="${student.id}">${student.full_name}</span>
                <button data-student-json='${JSON.stringify(student)}' class="btn-edit-student ml-2 text-gray-400 hover:text-blue-600 text-xs">✏️</button>
            </div>
            <button data-student-id="${student.id}" class="btn-add-student text-green-500 hover:text-green-700 text-xl font-bold w-6 h-6 flex items-center justify-center ${state.activeClassId && state.activeClassId !== 'null' && !isAlreadyInClass ? '' : 'hidden'}"
            >+</button>
        `;
        container.appendChild(studentDiv);
    });
}

function renderStudentsInClass() {
    const container = document.getElementById('students-in-class-list');
    if (!container) return;
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

// --- FUNÇÃO DE FILTRAGEM PRINCIPAL (CORRIGIDA) ---
function applyFiltersAndRender() {
    const { search, category, showAlertsOnly } = state.currentFilters;
    const searchTerm = search.toLowerCase();

    // --- LÓGICA PARA FILTRO DE TURMA ---
    const isClassFilterActive = state.activeClassId && state.activeClassId !== 'null';
    let classStudentIdentifiers = null;
    if (isClassFilterActive) {
        classStudentIdentifiers = state.studentsInClass.reduce((ids, student) => {
            if (student.cpf) ids.push(student.cpf.toLowerCase());
            if (student.pc_id) ids.push(student.pc_id.toLowerCase());
            return ids;
        }, []);
    }

    // --- LÓGICA PARA IDENTIFICAR ALUNO POR NOME OU ID ---
    let targetStudentIdentifiers = null;
    const studentByNameMatch = state.allStudents.find(student => student.full_name && student.full_name.toLowerCase() === searchTerm);
    if (studentByNameMatch) {
        targetStudentIdentifiers = [studentByNameMatch.cpf, studentByNameMatch.pc_id].filter(Boolean).map(id => id.toLowerCase());
        console.log(`Filtrando por NOME: "${searchTerm}". IDs encontrados:`, targetStudentIdentifiers);
    } else {
        const studentByIdMatch = state.allStudents.find(student => (student.pc_id && student.pc_id.toLowerCase() === searchTerm) || (student.cpf && student.cpf.toLowerCase() === searchTerm));
        if (studentByIdMatch) {
             targetStudentIdentifiers = [studentByIdMatch.cpf, studentByIdMatch.pc_id].filter(Boolean).map(id => id.toLowerCase());
            console.log(`Filtrando por ID: "${searchTerm}". IDs encontrados:`, targetStudentIdentifiers);
        }
    }

    // --- FILTRAR TABELA DE RESUMO ---
    const filteredSummary = state.allSummary.filter(user => {
        const matchesClass = !isClassFilterActive || (user.aluno_id && classStudentIdentifiers.includes(user.aluno_id.toLowerCase()));
        if (!matchesClass) return false;
        const matchesSearch = searchTerm === '' || (user.student_name && user.student_name.toLowerCase().includes(searchTerm)) || (user.aluno_id && user.aluno_id.toLowerCase().includes(searchTerm));
        const matchesAlert = !showAlertsOnly || user.has_red_alert || user.has_blue_alert;
        return matchesSearch && matchesAlert;
    });

    // --- FILTRAR TABELA DE LOGS ---
    const filteredLogs = state.allLogs.filter(log => {
        const matchesClass = !isClassFilterActive || (log.aluno_id && classStudentIdentifiers.includes(log.aluno_id.toLowerCase()));
        if (!matchesClass) return false;
        let matchesSearch = false;
        if (targetStudentIdentifiers && targetStudentIdentifiers.length > 0) {
            matchesSearch = log.aluno_id && targetStudentIdentifiers.includes(log.aluno_id.toLowerCase());
        } else if (!targetStudentIdentifiers && searchTerm !== '') {
            matchesSearch = (log.student_name && log.student_name.toLowerCase().includes(searchTerm)) || (log.aluno_id && log.aluno_id.toLowerCase().includes(searchTerm)) || (log.url && log.url.toLowerCase().includes(searchTerm));
        } else {
             matchesSearch = true;
        }
        const matchesCategory = category === '' || log.categoria === category;
        const matchesAlert = !showAlertsOnly || ['Rede Social', 'Streaming & Jogos', 'IA'].includes(log.categoria);
        return matchesSearch && matchesCategory && matchesAlert;
    });

    // --- RENDERIZAR TUDO ---
    console.log(`Renderizando ${filteredSummary.length} usuários no resumo e ${filteredLogs.length} logs na tabela.`);
    updateUserSummaryTable(filteredSummary);
    updateLogsTable(filteredLogs);
    updateChart(filteredLogs);
}

// --- FUNÇÃO DE PAGINAÇÃO ---
function renderPaginationControls(totalLogs) {
    const container = document.getElementById('logs-pagination-container');
    if (!container) return;
    const totalPages = Math.ceil(totalLogs / state.logsPerPage);
    container.innerHTML = '';
    if (totalPages <= 1) return;
    let paginationHTML = '<div class="flex justify-center items-center space-x-2 mt-4">';
    paginationHTML += `<button class="pagination-btn ${state.logsCurrentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${state.logsCurrentPage - 1}" ${state.logsCurrentPage === 1 ? 'disabled' : ''}>Anterior</button>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i === state.logsCurrentPage) { paginationHTML += `<span class="px-3 py-1 bg-red-700 text-white rounded-md text-sm">${i}</span>`; }
        else if (i <= 2 || i >= totalPages - 1 || (i >= state.logsCurrentPage - 1 && i <= state.logsCurrentPage + 1)) { paginationHTML += `<button class="pagination-btn" data-page="${i}">${i}</button>`; }
        else if (i === 3 || i === totalPages - 2) { paginationHTML += `<span class="px-2">...</span>`; }
    }
    paginationHTML += `<button class="pagination-btn ${state.logsCurrentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${state.logsCurrentPage + 1}" ${state.logsCurrentPage === totalPages ? 'disabled' : ''}>Próximo</button>`;
    paginationHTML += '</div>';
    container.innerHTML = paginationHTML;
}

// --- FUNÇÃO RENDERIZA TABELA DE LOGS (CORRIGIDA) ---
function updateLogsTable(logs) {
    const tableBody = document.getElementById('logsTableBody');
    const logsCount = document.getElementById('logs-count');
    if (!tableBody || !logsCount) return;

    logsCount.textContent = logs.length;
    tableBody.innerHTML = ''; 

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
        row.className = '';
        if (['Rede Social', 'Streaming & Jogos'].includes(currentCategory)) {
            row.classList.add('bg-red-50', 'text-red-800', 'font-medium');
        } else if (currentCategory === 'IA') {
            row.classList.add('bg-blue-50', 'text-blue-800', 'font-medium');
        }
        
        // Gera o HTML da linha com o GATILHO DO MODAL
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
    renderPaginationControls(logs.length);
}

// --- FUNÇÃO RENDERIZA TABELA DE RESUMO (CORRIGIDA) ---
function updateUserSummaryTable(users) {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    console.log("[updateUserSummaryTable] Renderizando resumo para", users.length, "usuários.");

    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhum dado de atividade para a seleção atual.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    users.forEach((user, index) => {
        // Log de depuração para os 3 primeiros
        if (index < 3) {
            console.log(`  -> User: ${user.student_name || user.aluno_id}, has_red_alert: ${user.has_red_alert} (Tipo: ${typeof user.has_red_alert}), has_blue_alert: ${user.has_blue_alert} (Tipo: ${typeof user.has_blue_alert})`);
        }

        const row = document.createElement('tr');
        const displayId = user.aluno_id || 'ID_Desconhecido';
        row.dataset.alunoId = displayId;
        row.classList.add('cursor-pointer', 'hover:bg-gray-50', 'summary-row');

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
    console.log("[updateUserSummaryTable] Renderização do resumo concluída.");
}

// --- FUNÇÃO RENDERIZA GRÁFICO (COM CLIQUE) ---
function updateChart(logs) {
    const chartCanvas = document.getElementById('mainChart');
    if (!chartCanvas) return;
    if (state.mainChartInstance) state.mainChartInstance.destroy();
    const siteUsage = logs.reduce((acc, log) => {
        if (log.url) acc[log.url] = (acc[log.url] || 0) + log.duration;
        return acc;
    }, {});
    const topSites = Object.entries(siteUsage).sort(([, a], [, b]) => b - a).slice(0, 10);
    const chartLabels = topSites.map(site => site[0]);
    const chartData = topSites.map(site => site[1]);
    const backgroundColors = ['rgba(220, 38, 38, 0.7)', 'rgba(153, 27, 27, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(248, 113, 113, 0.7)', 'rgba(252, 165, 165, 0.7)'];
    state.mainChartInstance = new Chart(chartCanvas.getContext('2d'), {
        type: state.currentChartType,
        data: {
            labels: chartLabels.length > 0 ? chartLabels : ['Nenhum dado para exibir'],
            datasets: [{ 
                label: 'Tempo de Uso (s)', 
                data: chartData.length > 0 ? chartData : [0],
                backgroundColor: backgroundColors 
            }]
        },
        options: {
            indexAxis: state.currentChartType === 'bar' ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: state.currentChartType !== 'bar' },
                tooltip: {
                     callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) label += (context.parsed / 60).toFixed(1) + ' min'; 
                            return label;
                        }
                    }
                }
            },
            onClick: (event, activeElements, chart) => {
                if (activeElements.length > 0) {
                    const dataIndex = activeElements[0].index;
                    const clickedUrl = chart.data.labels[dataIndex];
                    if (clickedUrl && clickedUrl !== 'Nenhum dado para exibir') {
                        console.log(`Gráfico clicado: ${clickedUrl}`);
                        const searchInput = document.getElementById('search-input');
                        if (searchInput) {
                            searchInput.value = clickedUrl;
                            state.currentFilters.search = clickedUrl;
                            state.logsCurrentPage = 1;
                            applyFiltersAndRender();
                            const logsSection = document.getElementById('logsTableBody')?.closest('section');
                            if (logsSection) {
                                logsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }
                    }
                }
            }
        }
    });
}

// --- FUNÇÕES DE API (GESTÃO) ---
async function createClass() {
    const nameInput = document.getElementById('newClassName');
    if (!nameInput) return;
    const name = nameInput.value.trim();
    if (!name) return Swal.fire('Erro!', 'O nome da turma não pode estar vazio.', 'error');
    try {
        const result = await apiCall('/api/classes', 'POST', { name });
        await Swal.fire('Sucesso!', result.message, 'success');
        window.location.reload();
    } catch (error) { Swal.fire('Erro!', error.message, 'error'); }
}

async function deleteClass(classId) {
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
            window.location.reload(); // Recarrega para atualizar a lista de turmas
        } catch (error) { Swal.fire('Erro!', error.message, 'error'); }
    }
}

async function saveClassChanges() {
    // Esta função requer uma rota PUT /api/classes/:classId no backend
    console.warn("Funcionalidade 'saveClassChanges' chamada, mas a rota PUT /api/classes/:classId não está implementada no server.js fornecido.");
    Swal.fire('Aviso', 'A lógica para salvar alterações de turma ainda não foi implementada no servidor.', 'info');
}

async function saveStudentChanges() {
    if (!state.editingStudentData) return;
    const studentId = state.editingStudentData.id;
    const updatedData = {
        fullName: document.getElementById('editStudentNameInput').value.trim(),
        cpf: document.getElementById('editStudentCpfInput').value.trim(),
        pc_id: document.getElementById('editStudentPcIdInput').value.trim()
    };
    if (!updatedData.fullName) return Swal.fire('Erro!', 'O nome do aluno é obrigatório.', 'error');
    try {
        // Esta função requer uma rota PUT /api/students/:studentId no backend
        console.warn("Funcionalidade 'saveStudentChanges' chamada, mas a rota PUT /api/students/:studentId não está implementada no server.js fornecido.");
        Swal.fire('Aviso', 'A lógica para salvar alterações de aluno ainda não foi implementada no servidor.', 'info');
        
        // --- Código de Exemplo se a API existisse ---
        // await apiCall(`/api/students/${studentId}`, 'PUT', updatedData);
        // Swal.fire('Sucesso!', 'Dados do aluno atualizados!', 'success');
        // closeStudentModal();
        // await fetchAllStudents(); // Recarrega a lista de alunos
        // renderAllStudents(); // Re-renderiza
    } catch (error) { Swal.fire('Erro!', error.message, 'error'); }
}

// --- FUNÇÕES DE FETCH ---
async function fetchAllStudents() {
    try {
        state.allStudents = await apiCall('/api/students/all');
        console.log(`Carregados ${state.allStudents.length} alunos para o estado.`);
    } catch (error) {
        console.error("Falha ao buscar a lista de todos os alunos:", error);
    }
}

async function fetchStudentsInClass(classId) {
    if (!classId || classId === 'null') {
        state.studentsInClass = [];
        return;
    }
    try {
        state.studentsInClass = await apiCall(`/api/classes/${classId}/students`);
    } catch (error) {
        console.error(`Falha ao buscar alunos da turma ${classId}:`, error);
        state.studentsInClass = [];
    }
}

async function fetchDataPanels() {
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
        updateUserSummaryTable([]);
        updateLogsTable([]);
        updateChart([]);
    }
}

// --- LÓGICA DE SELEÇÃO DE TURMA ---
async function handleClassSelection(selectedId, selectedName) {
    state.activeClassId = selectedId;
    state.activeClassName = selectedName;
    localStorage.setItem('selectedClassId', selectedId || 'null');
    localStorage.setItem('selectedClassName', selectedName || '');
    
    await fetchStudentsInClass(state.activeClassId); // Busca alunos da turma

    const studentManagementPanel = document.getElementById('student-management-panel');
    if (studentManagementPanel) {
        const classStudentsPanel = document.getElementById('class-students-panel');
        const editBtn = document.getElementById('editClassBtn');
        const deleteBtn = document.getElementById('deleteClassBtn');
        const shareBtn = document.getElementById('shareClassBtn');
        const classInstructions = document.getElementById('class-instructions');
        const classNameInList = document.getElementById('class-name-in-list');

        if (state.activeClassId && state.activeClassId !== 'null') {
            if (classStudentsPanel) classStudentsPanel.classList.remove('hidden');
            if (classNameInList) classNameInList.textContent = state.activeClassName;
            if (classInstructions) classInstructions.style.display = 'none';
            if (editBtn) editBtn.disabled = false;
            if (deleteBtn) deleteBtn.disabled = false;
            if (shareBtn) shareBtn.disabled = false;
        } else {
            if (classStudentsPanel) classStudentsPanel.classList.add('hidden');
            if (classNameInList) classNameInList.textContent = 'Nenhuma selecionada';
            if (classInstructions) classInstructions.style.display = 'block';
            if (editBtn) editBtn.disabled = true;
            if (deleteBtn) deleteBtn.disabled = true;
            if (shareBtn) shareBtn.disabled = true;
        }
        renderStudentsInClass();
        renderAllStudents();
    }

    if (document.getElementById('dashboard-content')) {
        state.logsCurrentPage = 1;
        applyFiltersAndRender();
    }
}

// ================================================================
//      PONTO DE ENTRADA PRINCIPAL (DOMContentLoaded)
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM carregado. Iniciando script...");

    // --- 1. Carregar Dados Essenciais ---
    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        // Tenta buscar categorias do EJS (carregadas pelo servidor)
        state.categories = Array.from(categorySelect.options)
                                 .map(option => option.value)
                                 .filter(value => value !== '');
        console.log('Categorias carregadas do EJS para o estado:', state.categories);
    } else {
        state.categories = []; // Fallback
        console.warn('Select de categorias #category-select não encontrado no DOM.');
    }
    
    // Carrega TODOS os alunos (para filtros) e os dados iniciais (logs/resumo)
    // Usar Promise.all para carregar em paralelo
    await Promise.all([
        fetchAllStudents(),
        fetchDataPanels()
    ]);
    console.log("Dados iniciais (alunos e painel) carregados.");

    // --- 2. Lógica do Relatório PDF ---
    const downloadBtn = document.getElementById('downloadPdfBtn');
    const dateInput = document.getElementById('reportDate');
    const errorDiv = document.getElementById('reportError');

    if (downloadBtn && dateInput && errorDiv) {
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const todayLocal = new Date(today.getTime() - (offset*60*1000));
        dateInput.value = todayLocal.toISOString().split('T')[0]; // Define data de HOJE como padrão

        downloadBtn.addEventListener('click', function() {
            const selectedDate = dateInput.value;
            errorDiv.textContent = '';
            if (!selectedDate) {
                errorDiv.textContent = 'Por favor, selecione uma data.';
                return;
            }
            window.location.href = `/api/download-report/${selectedDate}`;
        });
    }

    // --- 3. Listeners da Página de Gerenciamento ---
    // (Verifica se estamos na página de gerenciamento)
    const studentManagementPanel = document.getElementById('student-management-panel');
    if (studentManagementPanel) {
        console.log("Página de Gerenciamento detectada. Anexando listeners...");
        
        document.getElementById('createClassBtn')?.addEventListener('click', createClass);
        document.getElementById('editClassBtn')?.addEventListener('click', () => {
            if(state.activeClassId && state.activeClassId !== 'null') openEditClassModal(state.activeClassId, state.activeClassName);
        });
        document.getElementById('shareClassBtn')?.addEventListener('click', openShareModal);
        document.getElementById('deleteClassBtn')?.addEventListener('click', () => {
            if(state.activeClassId && state.activeClassId !== 'null') deleteClass(state.activeClassId);
        });
        
        document.getElementById('saveClassChangesBtn')?.addEventListener('click', saveClassChanges);
        document.getElementById('saveStudentChangesBtn')?.addEventListener('click', saveStudentChanges);
        
        document.getElementById('addProfessorToClassBtn')?.addEventListener('click', async () => {
            const professorId = document.getElementById('professorsToShareList').value;
            if (!professorId) return Swal.fire('Atenção!', 'Por favor, selecione um professor.', 'warning');
            try {
                await apiCall(`/api/classes/${state.activeClassId}/share`, 'POST', { professorId });
                Swal.fire('Sucesso!', 'Professor adicionado à turma!', 'success');
                await populateShareModal();
            } catch (error) { Swal.fire('Erro!', `Erro ao partilhar a turma: ${error.message}`, 'error'); }
        });

        document.getElementById('currentClassMembers')?.addEventListener('click', async (e) => {
            const removeButton = e.target.closest('.remove-member-btn');
            if (removeButton) {
                const professorId = removeButton.dataset.professorId;
                const swalResult = await Swal.fire({ title: 'Tem a certeza?', text: "Deseja remover este professor da turma?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Sim, remover!', cancelButtonText: 'Cancelar' });
                if (swalResult.isConfirmed) {
                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/remove-member/${professorId}`, 'DELETE');
                        Swal.fire('Sucesso!', 'Professor removido com sucesso!', 'success');
                        await populateShareModal();
                    } catch (error) { Swal.fire('Erro!', `Erro ao remover professor: ${error.message}`, 'error'); }
                }
            }
        });

        const allStudentsList = document.getElementById('all-students-list');
        if (allStudentsList) {
             allStudentsList.addEventListener('click', async (e) => {
                const addButton = e.target.closest('.btn-add-student');
                if (addButton) {
                    const studentId = addButton.dataset.studentId;
                    const originalContent = addButton.innerHTML;
                    addButton.innerHTML = `<svg class="animate-spin h-5 w-5 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
                    addButton.disabled = true;
                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/add-student`, 'POST', { studentId });
                        await fetchStudentsInClass(state.activeClassId);
                        renderStudentsInClass();
                        renderAllStudents();
                    } catch (error) { Swal.fire('Erro!', error.message, 'error'); }
                    finally { addButton.innerHTML = originalContent; addButton.disabled = false; }
                }
                if (e.target.closest('.btn-edit-student')) {
                    const studentData = JSON.parse(e.target.closest('.btn-edit-student').dataset.studentJson);
                    openEditStudentModal(studentData);
                }
            });
            allStudentsList.addEventListener('dragstart', e => {
                 const target = e.target.closest('[data-student-id]');
                 if (target) e.dataTransfer.setData('text/plain', target.dataset.studentId);
            });
        }

        const classStudentsList = document.getElementById('students-in-class-list');
        if (classStudentsList) {
             classStudentsList.addEventListener('click', async (e) => {
                const removeButton = e.target.closest('.btn-remove-student');
                if (removeButton) {
                    const studentId = removeButton.dataset.studentId;
                    const swalResult = await Swal.fire({ title: 'Tem certeza?', text: "Deseja remover este aluno da turma?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Sim, remover!', cancelButtonText: 'Cancelar' });
                    if (swalResult.isConfirmed) {
                         removeButton.disabled = true; removeButton.textContent = 'Removendo...';
                        try {
                            await apiCall(`/api/classes/${state.activeClassId}/remove-student/${studentId}`, 'DELETE');
                            await fetchStudentsInClass(state.activeClassId);
                            renderStudentsInClass();
                            renderAllStudents();
                        } catch(error) { Swal.fire('Erro!', error.message, 'error'); removeButton.disabled = false; removeButton.textContent = 'Remover'; }
                    }
                }
            });
        }
        
        document.getElementById('addStudentForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const studentData = Object.fromEntries(formData.entries());
            try {
                const result = await apiCall('/api/students', 'POST', studentData);
                state.allStudents.push(result.student);
                state.allStudents.sort((a, b) => a.full_name.localeCompare(b.full_name));
                renderAllStudents();
                e.target.reset();
                Swal.fire('Sucesso!', 'Aluno adicionado com sucesso!', 'success');
            } catch(error) { Swal.fire('Erro!', error.message, 'error'); }
        });
        
        document.getElementById('toggle-create-class-form')?.addEventListener('click', () => document.getElementById('create-class-form-container').classList.toggle('hidden'));
        document.getElementById('toggle-add-student-form')?.addEventListener('click', () => document.getElementById('add-student-form-container').classList.toggle('hidden'));
        document.getElementById('student-search-input')?.addEventListener('input', (e) => {
            state.currentFilters.studentSearch = e.target.value;
            renderAllStudents();
        });

        // Inicializa a seleção de turma (após dados carregados)
        // handleClassSelection(null, ''); // Movido para a seção global
    }

    // --- 4. Listeners da Página do Dashboard ---
    const dashboardContent = document.getElementById('dashboard-content');
    if (dashboardContent) {
        console.log("Página do Dashboard detectada. Anexando listeners...");

        // Renderiza dados iniciais (agora que estão carregados)
        applyFiltersAndRender();
        
        // Botões do Gráfico
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.currentChartType = btn.dataset.type;
                document.querySelectorAll('.chart-btn').forEach(b => {
                    b.classList.remove('active', 'bg-red-700', 'text-white');
                    b.classList.add('bg-gray-200', 'text-gray-700');
                });
                btn.classList.add('active', 'bg-red-700', 'text-white');
                btn.classList.remove('bg-gray-200', 'text-gray-700');
                applyFiltersAndRender();
            });
        });

        // Botões de Filtro
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
        
        // Paginação
        const logsPaginationContainer = document.getElementById('logs-pagination-container');
        if (logsPaginationContainer) {
            logsPaginationContainer.addEventListener('click', (e) => {
                if (e.target.matches('.pagination-btn') && !e.target.disabled) {
                    const page = parseInt(e.target.dataset.page, 10);
                    if (page) {
                        state.logsCurrentPage = page;
                        applyFiltersAndRender();
                    }
                }
            });
        }
    }
    
    // --- 5. Listeners Globais (aplicam-se a ambas as páginas) ---

    // Listener para seleção de Turma (Filtro)
    const classSelect = document.getElementById('classSelect');
    if(classSelect) {
        const savedClassId = localStorage.getItem('selectedClassId') || 'null';
        const savedClassName = localStorage.getItem('selectedClassName') || 'Visão Geral (Todas as Turmas)';
        classSelect.value = savedClassId;
        await handleClassSelection(savedClassId, savedClassName); 
        
        classSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            handleClassSelection(e.target.value, selectedOption.text);
        });
    }

    // Listener para clicar na Tabela de Resumo (Filtro por Aluno E Botões de Alerta)
    const usersTableBody = document.getElementById('usersTableBody');
    const searchInput = document.getElementById('search-input');
    if (usersTableBody && searchInput) {
        usersTableBody.addEventListener('click', async (e) => { // Tornar async
            const alertButton = e.target.closest('.alert-btn');
            const clickedRow = e.target.closest('tr.summary-row');
            
            if (alertButton) { // Clicou no botão de alerta
                e.stopPropagation(); // Impede o clique de acionar o filtro da linha
                const alunoId = alertButton.dataset.alunoId;
                const alertType = alertButton.dataset.alertType;
                try {
                    console.log(`Buscando alertas: /api/alerts/${alunoId}/${alertType}`);
                    const logs = await apiCall(`/api/alerts/${encodeURIComponent(alunoId)}/${alertType}`);
                    const title = `Logs de Alerta (${alertType === 'red' ? 'Acesso Indevido' : 'Uso de IA'}) para ${alunoId}`;
                    openAlertLogsModal(title, logs);
                } catch (error) {
                    Swal.fire('Erro!', "Erro ao buscar os logs de alerta: " + error.message, 'error');
                }
            } else if (clickedRow) { // Clicou na linha (mas não no botão)
                const studentNameElement = clickedRow.querySelector('td:nth-child(2)'); // Segunda coluna (Nome)
                const studentName = studentNameElement ? studentNameElement.textContent.trim() : null;
                if (studentName) {
                    console.log(`Linha do resumo clicada para: ${studentName}`);
                    searchInput.value = studentName;
                    state.currentFilters.search = studentName;
                    state.logsCurrentPage = 1;
                    applyFiltersAndRender();
                    const logsSection = document.getElementById('logsTableBody')?.closest('section');
                    if (logsSection) {
                        logsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }
        });
    }
    
    // Listener para clicar na Tabela de Logs (Abrir Modal de Categoria)
    const logsTableBody = document.getElementById('logsTableBody');
    if (logsTableBody) {
        logsTableBody.addEventListener('click', (e) => {
            const categoryTrigger = e.target.closest('.category-edit-modal-trigger');
            if (categoryTrigger) {
                const url = categoryTrigger.dataset.url;
                const currentCategory = categoryTrigger.dataset.currentCategory;
                console.log(`Abrindo modal de categoria para: URL=${url}, Categoria Atual=${currentCategory}`);
                openCategoryModal(url, currentCategory);
            }
        });
    }
    
    // Listeners para os botões do Modal de Categoria
    const confirmCategoryBtn = document.getElementById('confirmCategoryChangeBtn');
    const cancelCategoryBtn = document.getElementById('cancelCategoryChangeBtn');
    const closeCategoryModalBtn = document.getElementById('closeCategoryModalBtn');
    const categoryModal = document.getElementById('categoryEditModal');

    if (confirmCategoryBtn) {
        confirmCategoryBtn.addEventListener('click', async () => {
            const selectedRadio = document.querySelector('input[name="modalCategoryOption"]:checked');
            if (!selectedRadio) return Swal.fire('Atenção!', 'Por favor, selecione uma categoria.', 'warning');
            
            const newCategory = selectedRadio.value;
            const url = currentlyEditingUrl;
            if (!url) { console.error("Erro: URL não definida ao confirmar."); closeCategoryModal(); return; }
            
            const triggerSpan = logsTableBody?.querySelector(`span[data-url="${url}"].category-edit-modal-trigger`);
            const originalCategory = triggerSpan ? triggerSpan.dataset.currentCategory : 'Não Categorizado';

            if (newCategory !== originalCategory) {
                try {
                    Swal.showLoading();
                    const result = await apiCall('/api/override-category', 'POST', { url: url, newCategory: newCategory });
                    await Swal.fire('Sucesso!', result.message, 'success');
                    
                    // Atualiza a UI imediatamente
                    document.querySelectorAll(`span[data-url="${url}"].category-edit-modal-trigger`).forEach(span => {
                         span.textContent = newCategory;
                         span.dataset.currentCategory = newCategory;
                         const row = span.closest('tr');
                         if (row) {
                            row.className = '';
                            const isRedAlert = ['Rede Social', 'Streaming & Jogos'].includes(newCategory);
                            const isBlueAlert = newCategory === 'IA';
                            if (isRedAlert) row.classList.add('bg-red-50', 'text-red-800', 'font-medium');
                            if (isBlueAlert) row.classList.add('bg-blue-50', 'text-blue-800', 'font-medium');
                         }
                    });
                    
                    // Recarrega os dados do painel para ATUALIZAR O RESUMO (alertas)
                    await fetchDataPanels();
                    applyFiltersAndRender(); // Re-renderiza tudo com dados frescos
                    
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
    
    // Listeners para fechar o modal de categoria
    if (cancelCategoryBtn) cancelCategoryBtn.addEventListener('click', closeCategoryModal);
    if (closeCategoryModalBtn) closeCategoryModalBtn.addEventListener('click', closeCategoryModal);
    if (categoryModal) {
        categoryModal.addEventListener('click', (e) => {
             if (e.target === categoryModal) closeCategoryModal(); // Clicar no overlay
        });
    }

    // Listeners globais para fechar modais de GESTÃO (se incluídos de partials)
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
         btn.addEventListener('click', (e) => {
             e.target.closest('.fixed.inset-0')?.classList.add('hidden');
         });
    });

    console.log("Todos os listeners do DOMContentLoaded foram anexados.");
});