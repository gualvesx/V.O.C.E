// [REMOVIDAS] As duas linhas abaixo foram removidas
// const {onRequest} = require("firebase-functions/v2/https");
// const {logger} = require("firebase-functions");

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore} = require("firebase-admin/firestore");
const {initializeApp} = require("firebase-admin/app");

initializeApp();
const db = getFirestore();

// ====================================================================================
// FUNÇÃO 1: Arquiva e Agrega Logs Antigos (Roda todo dia às 3h da manhã)
// ====================================================================================
exports.archiveOldLogs = onSchedule("every day 03:00", async (event) => {
  console.log("Iniciando a função de arquivamento de logs...");

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
  const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));

  const logsToArchiveQuery = db.collection("logs")
      .where("timestamp", ">=", startOfYesterday)
      .where("timestamp", "<=", endOfYesterday);

  const snapshot = await logsToArchiveQuery.get();

  if (snapshot.empty) {
    console.log("Nenhum log de ontem para arquivar.");
    return null;
  }

  console.log(`Encontrados ${snapshot.size} logs para arquivar.`);

  const aggregatedLogs = {};
  const docsToDelete = [];

  snapshot.forEach((doc) => {
    const log = doc.data();
    const {aluno_id, url, duration} = log;

    if (!aggregatedLogs[aluno_id]) {
      aggregatedLogs[aluno_id] = {};
    }
    if (!aggregatedLogs[aluno_id][url]) {
      aggregatedLogs[aluno_id][url] = {total_duration: 0, count: 0};
    }

    aggregatedLogs[aluno_id][url].total_duration += duration;
    aggregatedLogs[aluno_id][url].count += 1;

    docsToDelete.push(doc.ref);
  });

  const batch = db.batch();
  for (const aluno_id in aggregatedLogs) {
    const archiveRef = db.collection("old_logs").doc();
    batch.set(archiveRef, {
      aluno_id: aluno_id,
      archive_date: startOfYesterday,
      daily_logs: aggregatedLogs[aluno_id],
    });
  }

  docsToDelete.forEach((ref) => batch.delete(ref));

  await batch.commit();
  console.log(`Arquivamento concluído. ${docsToDelete.length} logs originais foram agregados e removidos.`);
  return null;
});


// ====================================================================================
// FUNÇÃO 2: Exclui Logs Arquivados com Mais de 5 Dias (Roda todo dia às 4h da manhã)
// ====================================================================================
exports.deleteExpiredLogs = onSchedule("every day 04:00", async (event) => {
  console.log("Iniciando a função de exclusão de logs expirados...");

  const now = new Date();
  const fiveDaysAgo = new Date(now);
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const expiredLogsQuery = db.collection("old_logs")
      .where("archive_date", "<", fiveDaysAgo);

  const snapshot = await expiredLogsQuery.get();

  if (snapshot.empty) {
    console.log("Nenhum log expirado para excluir.");
    return null;
  }

  const batch = db.batch();
  snapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`${snapshot.size} logs arquivados expirados foram excluídos.`);
  return null;
});
