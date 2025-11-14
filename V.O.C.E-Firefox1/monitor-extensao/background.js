// URL do seu backend onde os logs serão enviados
const BACKEND_URL = "http://localhost:3000/log"; 

// --- Estado de Rastreamento (em memória) ---
let currentActiveLog = {
    tabId: null,
    host: null,
    startTime: null
};

// --- Funções Principais ---

/**
 * Inicializa a extensão, configurando o alarme de batch e 
 * carregando o estado inicial de rastreamento.
 */
async function initializeExtension() {
    console.log("Monitor V.O.C.E (Acumulador v2 - CHROME 5 MIN): Inicializando...");
    
    // Garante que temos um 'periodStartTime' inicial no storage
    try {
        const data = await chrome.storage.local.get("periodStartTime");
        if (!data.periodStartTime) {
            console.log("Definindo 'periodStartTime' inicial.");
            await chrome.storage.local.set({ periodStartTime: Date.now() });
        }
    } catch (e) {
        console.error("Erro ao definir periodStartTime inicial:", e);
    }
    
    // Configura o alarme de 5 minutos
    chrome.alarms.create("batchLogUpload", {
        delayInMinutes: 1,  // Primeira execução em 1 min (para teste inicial)
        periodInMinutes: 5  // Repete a cada 5 MINUTOS
    });

    // Adiciona listener para o alarme
    chrome.alarms.onAlarm.addListener(handleAlarm);

    // Adiciona listeners de eventos do navegador
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated); // Removido filtro de propriedades, pois o 'chrome' lida diferente
    chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
    
    // Tenta definir o estado inicial na aba ativa
    updateActiveTab();
}

/**
 * Obtém a aba ativa atual e inicia o rastreamento dela.
 */
async function updateActiveTab() {
    try {
        // API 'chrome.tabs.query'
        let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            const activeTab = tabs[0];
            if (activeTab.url && activeTab.id) {
                startTrackingNewHost(activeTab.id, activeTab.url);
            }
        }
    } catch (error) {
        console.error("Erro ao obter aba ativa:", error);
    }
}

/**
 * Chamado quando o usuário muda de aba, URL ou foco.
 * Finaliza o log anterior (calcula duração) e o ACUMULA no storage.
 * Inicia o rastreamento de um novo host.
 */
async function startTrackingNewHost(tabId, url) {
    const newHost = getHostFromUrl(url);

    // Se o host for o mesmo, não faz nada.
    if (newHost === currentActiveLog.host) {
        return;
    }

    // 1. Acumula o tempo da sessão anterior (se houver)
    await accumulateCurrentSession();

    // 2. Inicia o novo rastreamento (se o host for válido)
    if (newHost) {
        console.log(`Rastreando novo host: ${newHost}`);
        currentActiveLog = {
            tabId: tabId,
            host: newHost,
            startTime: Date.now()
        };
    } else {
        // Se for uma aba inválida (ex: about:blank), apenas paramos o anterior.
        currentActiveLog = { tabId: null, host: null, startTime: null };
    }
}

/**
 * Pega a sessão ativa atual, calcula sua duração e SOMA no
 * 'logAccumulator' salvo no storage.
 */
async function accumulateCurrentSession() {
    // Só faz algo se houver um host e tempo de início válidos
    if (!currentActiveLog.host || !currentActiveLog.startTime) {
        return;
    }

    const endTime = Date.now();
    const durationMs = endTime - currentActiveLog.startTime;

    // Só registra se o tempo for significativo (ex: mais de 5 segundos)
    if (durationMs > 5000) { 
        try {
            let data = await chrome.storage.local.get("logAccumulator");
            let accumulator = data.logAccumulator || {};

            // Soma a duração atual à duração existente (ou zera se não existir)
            const existingDuration = accumulator[currentActiveLog.host] || 0;
            accumulator[currentActiveLog.host] = existingDuration + durationMs;

            // Salva o acumulador atualizado
            await chrome.storage.local.set({ logAccumulator: accumulator });
            
            console.log(`Acumulou ${Math.round(durationMs / 1000)}s para ${currentActiveLog.host}. Total: ${Math.round(accumulator[currentActiveLog.host] / 1000)}s`);

        } catch (error) {
            console.error("Erro ao acumular log no storage:", error);
        }
    }
}

/**
 * Envia os dados ACUMULADOS para o servidor e limpa o storage.
 */
async function sendLogsToServer() {
    let data;
    try {
        // Pega o acumulador E a data de início do período
        data = await chrome.storage.local.get(["logAccumulator", "periodStartTime"]);
    } catch (error) {
        console.error("Erro ao ler storage:", error);
        return;
    }
    
    const accumulator = data.logAccumulator || {};
    // Usa o 'periodStartTime' salvo, ou define agora como fallback
    const periodStart = data.periodStartTime || (Date.now() - (5 * 60 * 1000)); // Fallback: 5 min atrás
    const periodEnd = Date.now();
    
    const hosts = Object.keys(accumulator);

    if (hosts.length === 0) {
        console.log("Acumulador vazio. Nada a enviar.");
        return;
    }

    console.log(`Enviando ${hosts.length} logs acumulados para o backend...`);

    // Transforma o objeto acumulador em um array de logs
    // CADA LOG enviado terá o tempo de início e fim do PERÍODO
    const logPayload = hosts.map(host => ({
        host: host,
        totalDurationMs: accumulator[host],
        periodStartTime: new Date(periodStart).toISOString(),
        periodEndTime: new Date(periodEnd).toISOString()
    }));
    
    console.log("Payload a ser enviado:", JSON.stringify(logPayload, null, 2));

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(logPayload), // Envia o array de totais
        });

        if (response.ok) {
            console.log("Logs acumulados enviados com sucesso.");
            // Limpa o acumulador E define o INÍCIO do PRÓXIMO período
            await chrome.storage.local.set({ 
                logAccumulator: {},
                periodStartTime: periodEnd // O fim deste período é o início do próximo
            });
        } else {
            console.error("Falha ao enviar logs:", response.status, await response.text());
        }
    } catch (error) {
        console.error("Erro de rede ao enviar logs:", error);
    }
}


// --- Handlers de Eventos ---

/**
 * Chamado quando o usuário troca de aba.
 */
function handleTabActivated(activeInfo) {
    console.log(`Aba ativada: ${activeInfo.tabId}`);
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) {
             console.error(chrome.runtime.lastError.message);
             return;
        }
        if (tab.url) {
            // 'startTracking' vai acumular a sessão da aba anterior
            startTrackingNewHost(tab.id, tab.url);
        }
    });
}

/**
 * Chamado quando uma aba é atualizada (navegação).
 */
function handleTabUpdated(tabId, changeInfo, tab) {
    // Só nos importamos se a URL mudou na aba ATIVA e está "completa"
    if (tab.active && changeInfo.status === "complete" && tab.url) {
        console.log(`Aba atualizada: ${tabId}, URL: ${tab.url}`);
        // 'startTracking' vai acumular a sessão da URL anterior
        startTrackingNewHost(tabId, tab.url);
    }
}

/**
 * Chamado quando o foco muda para outra janela (ou fora do navegador).
 */
async function handleWindowFocusChanged(windowId) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // O usuário mudou para outro aplicativo (fora do Chrome)
        console.log("Foco do navegador perdido.");
        // Acumula a sessão atual
        await accumulateCurrentSession();
        // Para de rastrear (zera o log ativo)
        currentActiveLog = { tabId: null, host: null, startTime: null };
    } else {
        // O usuário voltou para o navegador
        console.log("Foco do navegador recuperado.");
        // Reinicia o rastreamento da aba ativa
        updateActiveTab(); 
    }
}

/**
 * Chamado pelo alarme (a cada 5 minutos).
 */
async function handleAlarm(alarm) {
    if (alarm.name === "batchLogUpload") {
        console.log("Alarme 'batchLogUpload' (5min) disparado. Enviando logs...");
        
        // 1. Acumula o que quer que esteja ativo agora
        await accumulateCurrentSession();
        
        // 2. Importante: Reinicia o startTime da sessão ativa
        if (currentActiveLog.host) {
            currentActiveLog.startTime = Date.now();
        }
        
        // 3. Envia tudo que foi acumulado no storage
        await sendLogsToServer();
    }
}


// --- Funções Utilitárias ---

/**
 * Extrai o hostname (ex: "www.google.com") de uma URL.
 * Retorna null se a URL for inválida ou de um protocolo interno.
 */
function getHostFromUrl(url) {
    try {
        const parsedUrl = new URL(url);
        // Ignora protocolos internos da extensão ou navegador
        if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
            return parsedUrl.hostname;
        }
        // Ignora chrome://, about:blank, etc.
        return null; 
    } catch (e) {
        // URL inválida (ex: na 'nova aba' antes de carregar)
        return null;
    }
}

// Inicia a extensão
initializeExtension();