// server.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Precisaremos do fetch para falar com o Power BI

const app = express();
const port = 3000;

// Configurações
app.use(cors()); // Habilita o CORS para que a extensão possa se comunicar
app.use(express.json()); // Permite que o servidor entenda JSON

// A URL que o Power BI vai te fornecer na próxima etapa
const POWER_BI_PUSH_URL = 'https://api.powerbi.com/beta/b1051c4b-3b94-41ab-9441-e73a72342fdd/datasets/020fa4f0-cb12-42c3-8727-d4fb58018dc5/rows?experience=power-bi&key=Z3Y1AB0B0wAAfd7W0ywCAMH38nnjQiRtfh4bqE%2Fz7m%2BfAoguSu1g3BPI0iLGcTf7%2FInapK9eeHxJ3O4dP3qg3A%3D%3D';

// Rota para receber os dados da extensão
app.post('/api/data', async (req, res) => {
  const dataFromExtension = req.body;
  console.log('Dados recebidos da extensão:', dataFromExtension);

  // Etapa 3 virá aqui: Enviar os dados para o Power BI
  try {
    // A API do Power BI espera que os dados estejam dentro de um array
    const response = await fetch(POWER_BI_PUSH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataFromExtension), // O buffer já é um array
    });

    if(response.ok) {
        console.log('Dados enviados para o Power BI com sucesso!');
        res.status(200).send({ message: 'Dados recebidos e enviados para o Power BI.' });
    } else {
        console.error('Erro ao enviar dados para o Power BI:', response.status, await response.text());
        res.status(500).send({ message: 'Falha ao enviar dados para o Power BI.' });
    }

  } catch (error) {
    console.error('Erro na comunicação com o Power BI:', error);
    res.status(500).send({ message: 'Erro interno no servidor.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor backend rodando em http://localhost:${port}`);
});