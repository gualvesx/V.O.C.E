// server.js (ATUALIZADO COM IA)
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const IA = require('./ia_classifier.js'); // Importa nosso novo módulo

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const POWER_BI_PUSH_URL = 'https://api.powerbi.com/beta/b1051c4b-3b94-41ab-9441-e73a72342fdd/datasets/020fa4f0-cb12-42c3-8727-d4fb58018dc5/rows?experience=power-bi&key=Z3Y1AB0B0wAAfd7W0ywCAMH38nnjQiRtfh4bqE%2Fz7m%2BfAoguSu1g3BPI0iLGcTf7%2FInapK9eeHxJ3O4dP3qg3A%3D%3D';

app.post('/api/data', async (req, res) => {
  const dataFromExtension = req.body;
  console.log('Dados brutos recebidos:', dataFromExtension);

  try {
    // --- LÓGICA DE CLASSIFICAÇÃO COM IA ---
    // Cria uma lista de "promessas", uma para cada log a ser categorizado
    const classificationPromises = dataFromExtension.map(log => IA.categorizar(log.url));

    // Espera todas as chamadas à IA terminarem
    const categories = await Promise.all(classificationPromises);

    // Combina os dados originais com as categorias recebidas da IA
    const enrichedData = dataFromExtension.map((log, index) => ({
      ...log,
      categoria: categories[index] // Adiciona o novo campo "categoria"
    }));
    // ------------------------------------

    console.log('Dados enriquecidos com IA:', enrichedData);

    const responseBI = await fetch(POWER_BI_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrichedData),
    });

    if (responseBI.ok) {
        console.log('Dados enviados para o Power BI com sucesso!');
        res.status(200).send({ message: 'Dados recebidos, classificados e enviados.' });
    } else {
        console.error('Erro ao enviar dados para o Power BI:', responseBI.status, await responseBI.text());
        res.status(500).send({ message: 'Falha ao enviar dados para o Power BI.' });
    }
  } catch (error) {
    console.error('Erro no processamento do servidor:', error);
    res.status(500).send({ message: 'Erro interno no servidor.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});