// background.js

// Usaremos um objeto para rastrear o tempo de início de cada aba
let activeTabs = {};
let userId = 'carregando...';
// Onde guardaremos os dados antes de enviar
let dataBuffer = [];
// URL do nosso backend
const BACKEND_URL = 'http://localhost:3000/api/data';

// Função para enviar os dados para o servidor
async function sendDataToServer() {
  if (dataBuffer.length === 0) {
    return; // Não envia nada se o buffer estiver vazio
  }

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataBuffer),
    });

    if (response.ok) {
      console.log('Dados enviados com sucesso:', dataBuffer);
      dataBuffer = []; // Limpa o buffer após o envio bem-sucedido
    } else {
      console.error('Falha ao enviar dados:', response.statusText);
    }
  } catch (error) {
    console.error('Erro de rede ao enviar dados:', error);
  }
}

// Função para registrar o tempo gasto
function recordTime(tabId, url) {
  if (activeTabs[tabId]) {
    const startTime = activeTabs[tabId].startTime;
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const domain = new URL(url).hostname; // Extrai apenas o domínio (ex: www.google.com)

    // Apenas registra se o tempo for significativo (ex: > 5 segundos)
    if (durationSeconds > 5) {
      dataBuffer.push({
        aluno_id: userId, // <-- USANDO O EMAIL
        url: domain,
        durationSeconds: durationSeconds,
        timestamp: new Date().toISOString()
      });
      console.log(`[${userId}] Tempo para ${domain}: ${durationSeconds}s`);
    }
  }
}

// Evento disparado quando o usuário troca de aba
chrome.tabs.onActivated.addListener(activeInfo => {
  // Primeiro, grava o tempo da aba anterior, se houver
  const previousTabId = Object.keys(activeTabs)[0];
  if (previousTabId) {
    chrome.tabs.get(parseInt(previousTabId), (tab) => {
        if (!chrome.runtime.lastError && tab && tab.url) {
             recordTime(parseInt(previousTabId), tab.url);
        }
        delete activeTabs[previousTabId];
    });
  }

  // Agora, registra o início da nova aba ativa
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!chrome.runtime.lastError && tab.url && tab.url.startsWith('http')) {
      activeTabs[tab.id] = { startTime: Date.now() };
    }
  });
});

// Evento disparado quando uma URL na aba é atualizada
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url) {
        // Se a URL mudou, registra o tempo da URL antiga e reinicia o contador
        recordTime(tabId, changeInfo.url);
        activeTabs[tabId] = { startTime: Date.now() };
    }
});


// Cria um alarme para enviar os dados periodicamente (a cada 5 minutos)
chrome.alarms.create('sendData', { periodInMinutes: 5 });

// Escuta o alarme
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'sendData') {
    sendDataToServer();
  }
});

// Pega a informação do usuário quando a extensão inicia
chrome.identity.getProfileUserInfo((userInfo) => {
  if (userInfo && userInfo.email) {
    userId = userInfo.email;
  } else {
    userId = 'email_nao_disponivel';
  }
  console.log('Usuário identificado como:', userId);
});