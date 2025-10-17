// ================================================================
//                         IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// Importa o conector do Firestore para as sessões
const { FirestoreStore } = require('@google-cloud/connect-firestore');

const classifier = require('./python_classifier.js');

const serviceAccount = require('./firebase/firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

const app = express();
const port = process.env.PORT || 8080;

// ================================================================
//                         CONFIGURAÇÃO DO EXPRESS
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de CORS mais robusta
const corsOptions = {
  origin: `http://localhost:${port}`,
  credentials: true,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração da Sessão para usar o Firestore
app.use(session({
    store: new FirestoreStore({
        dataset: db,
        kind: 'express-sessions', // Nome da coleção que será criada no Firestore
    }),
    secret: process.env.SESSION_SECRET || 'segredo-muito-forte-aqui',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Correto para localhost
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 dia
    }
}));


// ================================================================
//                         MIDDLEWARE
// ================================================================
const requireLogin = (req, res, next) => {
    if (req.session && req.session.uid) {
        return next();
    }
    // Para requisições de API, retorna um erro 401 em vez de redirecionar
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    res.redirect('/login');
};

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ================================================================
//                         ROTAS PÚBLICAS E DE AUTENTICAÇÃO
// ================================================================

app.get('/', (req, res) => {
    res.render('landpage', {
        pageTitle: 'V.O.C.E - Monitorização Inteligente',
        isLoggedIn: !!req.session.uid
    });
});

app.get('/login', (req, res) => res.render('login', { pageTitle: 'Login - V.O.C.E', message: req.query.message || null }));
app.get('/cadastro', (req, res) => res.render('cadastro', { pageTitle: 'Cadastro - V.O.C.E' }));

app.post('/createProfile', async (req, res) => {
    const { uid, fullName, username } = req.body;
    if (!uid || !fullName || !username) {
        return res.status(400).json({ error: 'Dados incompletos para criar perfil.' });
    }
    try {
        await db.collection('professors').doc(uid).set({
            full_name: fullName,
            username: username
        });
        res.status(201).json({ success: true, message: 'Perfil do professor criado com sucesso.' });
    } catch (error) {
        console.error('Erro ao criar perfil no Firestore:', error);
        try { await auth.deleteUser(uid); } catch (e) { console.error('Falha ao limpar user do Auth', e); }
        res.status(500).json({ error: 'Não foi possível salvar o perfil do usuário.' });
    }
});

app.post('/sessionLogin', async (req, res) => {
    const { idToken } = req.body;
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const professorDoc = await db.collection('professors').doc(uid).get();
        if (!professorDoc.exists) {
            throw new Error('Professor não encontrado no Firestore.');
        }

        req.session.uid = uid;
        req.session.professorName = professorDoc.data().full_name;

        // Salva a sessão manualmente antes de responder para evitar race conditions
        req.session.save((err) => {
            if (err) {
                console.error('Erro ao salvar a sessão:', err);
                return res.status(500).json({ error: 'Falha ao salvar a sessão.' });
            }
            res.status(200).json({ success: true });
        });

    } catch (error) {
        console.error('Erro no login da sessão:', error.message);
        res.status(401).json({ error: 'Falha na autenticação.' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return console.log(err);
        }
        res.redirect('/');
    });
});

// Rota para o frontend checar a autenticação
app.get('/api/check-auth', requireLogin, (req, res) => {
    res.status(200).json({ success: true, message: 'Autenticado' });
});

// ================================================================
//                         ROTA PARA RECEBER LOGS DA EXTENSÃO
// ================================================================
app.post('/api/logs', async (req, res) => {
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    if (!logs || logs.length === 0) return res.status(400).send('Nenhum log recebido.');
    try {
        const batch = db.batch();
        for (const log of logs) {
            if (log.url && log.durationSeconds) {
                const category = await classifier.categorizar(log.url);
                const logRef = db.collection('logs').doc();
                batch.set(logRef, {
                    aluno_id: log.aluno_id,
                    url: log.url,
                    duration: log.durationSeconds,
                    timestamp: new Date(log.timestamp),
                    categoria: category
                });
            }
        }
        await batch.commit();
        res.status(200).send('Logs recebidos e processados com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar logs no Firestore:', error);
        res.status(500).send('Erro interno ao processar os logs.');
    }
});

// ================================================================
//                         ROTAS DE PÁGINAS PROTEGIDAS
// ================================================================
app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const { uid, professorName } = req.session;
        const classesSnapshot = await db.collection('classes').where('member_ids', 'array-contains', uid).orderBy('name').get();
        const classes = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const logsSnapshot = await db.collection('logs').select('categoria').get();
        const categories = [...new Set(logsSnapshot.docs.map(doc => doc.data().categoria).filter(Boolean))];

        res.render('dashboard', {
            pageTitle: 'Dashboard',
            professorName,
            classes,
            categories
        });
    } catch (error) {
        console.error("Erro ao carregar o dashboard:", error);
        res.status(500).send("Erro ao carregar o dashboard.");
    }
});

app.get('/gerenciamento', requireLogin, async (req, res) => {
    try {
        const { uid, professorName } = req.session;
        const classesSnapshot = await db.collection('classes').where('member_ids', 'array-contains', uid).orderBy('name').get();
        const classes = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('gerenciamento', {
            pageTitle: 'Gestão de Turmas e Alunos',
            professorName,
            classes
        });
    } catch (error) {
        console.error("Erro ao carregar a página de gerenciamento:", error);
        res.status(500).send("Erro ao carregar a página de gerenciamento.");
    }
});

app.get('/perfil', requireLogin, async (req, res) => {
    try {
        const { uid } = req.session;
        const doc = await db.collection('professors').doc(uid).get();
        if(!doc.exists) return res.redirect('/logout');
        res.render('perfil', {
            pageTitle: 'Meu Perfil',
            user: doc.data(),
            success: req.query.success
        });
    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
        res.status(500).send("Erro ao carregar perfil.");
    }
});

app.post('/perfil', requireLogin, async (req, res) => {
    const { fullName } = req.body;
    const { uid } = req.session;
    if (!fullName) return res.redirect('/perfil');
    try {
        await db.collection('professors').doc(uid).update({ full_name: fullName });
        req.session.professorName = fullName;
        res.redirect('/perfil?success=true');
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        res.status(500).send("Erro ao atualizar perfil.");
    }
});

// ================================================================
//                         APIs PROTEGIDAS DE GESTÃO E DADOS
// ================================================================

// --- APIs de Turmas ---
app.post('/api/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    const { uid } = req.session;
    if (!name) return res.status(400).json({ error: 'Nome da turma é obrigatório' });
    try {
        const docRef = await db.collection('classes').add({ 
            name, 
            owner_id: uid,
            member_ids: [uid],
            student_ids: [] 
        });
        res.json({ success: true, message: 'Turma criada com sucesso!', classId: docRef.id });
    } catch (error) {
        console.error('Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro ao criar turma' });
    }
});

app.delete('/api/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    try {
        const classRef = db.collection('classes').doc(classId);
        const doc = await classRef.get();
        if (!doc.exists || doc.data().owner_id !== req.session.uid) {
            return res.status(403).json({ error: 'Apenas o dono da turma pode removê-la.' });
        }
        await classRef.delete();
        res.json({ success: true, message: 'Turma removida com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover turma:', error);
        res.status(500).json({ error: 'Erro ao remover a turma.' });
    }
});

app.post('/api/classes/:classId/share', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { professorId } = req.body;
    if (!professorId) return res.status(400).json({ error: 'ID do professor é obrigatório.' });
    try {
        const classRef = db.collection('classes').doc(classId);
        const doc = await classRef.get();
        if (!doc.exists || doc.data().owner_id !== req.session.uid) {
            return res.status(403).json({ error: 'Apenas o dono da turma pode partilhá-la.' });
        }
        await classRef.update({
            member_ids: FieldValue.arrayUnion(professorId)
        });
        res.json({ success: true, message: 'Turma partilhada com sucesso!' });
    } catch (error) {
        console.error("Erro ao partilhar turma:", error);
        res.status(500).json({ error: 'Erro interno ao partilhar turma.' });
    }
});

app.delete('/api/classes/:classId/remove-member/:professorId', requireLogin, async (req, res) => {
    const { classId, professorId } = req.params;
    if (!professorId) return res.status(400).json({ error: 'ID do professor é obrigatório.' });
    try {
        const classRef = db.collection('classes').doc(classId);
        const doc = await classRef.get();
        if (!doc.exists || doc.data().owner_id !== req.session.uid) {
            return res.status(403).json({ error: 'Apenas o dono da turma pode remover membros.' });
        }
        if (doc.data().owner_id === professorId) {
            return res.status(400).json({ error: 'O dono da turma não pode ser removido.' });
        }
        await classRef.update({
            member_ids: FieldValue.arrayRemove(professorId)
        });
        res.json({ success: true, message: 'Professor removido da turma!' });
    } catch (error) {
        console.error("Erro ao remover membro da turma:", error);
        res.status(500).json({ error: 'Erro interno ao remover membro.' });
    }
});

app.get('/api/classes/:classId/members', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const classDoc = await db.collection('classes').doc(classId).get();
        if (!classDoc.exists || !classDoc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }
        const memberIds = classDoc.data().member_ids || [];
        const ownerId = classDoc.data().owner_id;

        if (memberIds.length === 0) return res.json({ members: [], isCurrentUserOwner: false });
        
        const memberRefs = memberIds.map(id => db.collection('professors').doc(id));
        const memberDocs = await db.getAll(...memberRefs);
        
        const members = memberDocs.map(doc => ({
            id: doc.id,
            full_name: doc.exists ? doc.data().full_name : 'Utilizador Desconhecido',
            isOwner: doc.id === ownerId
        }));

        res.json({ members, isCurrentUserOwner: req.session.uid === ownerId });
    } catch (error) {
        console.error("Erro ao buscar membros da turma:", error);
        res.status(500).json({ error: "Erro ao buscar membros." });
    }
});

// --- APIs de Professores e Alunos ---
app.get('/api/professors/list', requireLogin, async (req, res) => {
    try {
        const snapshot = await db.collection('professors').get();
        const professors = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(prof => prof.id !== req.session.uid);
        res.json(professors);
    } catch (error) {
        console.error("Erro ao listar professores:", error);
        res.status(500).json({ error: 'Erro ao buscar professores.' });
    }
});

app.post('/api/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id } = req.body;
    if (!fullName) return res.status(400).json({ error: 'Nome do aluno é obrigatório' });
    try {
        const studentData = { full_name: fullName, cpf: cpf || null, pc_id: pc_id || null };
        const docRef = await db.collection('students').add(studentData);
        res.json({ success: true, message: 'Aluno criado com sucesso!', student: { id: docRef.id, ...studentData } });
    } catch (error) {
        console.error('Erro ao criar aluno:', error);
        res.status(500).json({ error: 'Erro ao criar aluno' });
    }
});

app.get('/api/students/all', requireLogin, async (req, res) => {
    try {
        const snapshot = await db.collection('students').orderBy('full_name').get();
        const students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar todos os alunos:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos' });
    }
});

app.get('/api/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const classDoc = await db.collection('classes').doc(classId).get();
        if (!classDoc.exists || !classDoc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json([]);
        }
        const studentIds = classDoc.data().student_ids || [];
        if (studentIds.length === 0) return res.json([]);
        
        const studentRefs = studentIds.map(id => db.collection('students').doc(id));
        const studentDocs = await db.getAll(...studentRefs);
        const students = studentDocs.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos da turma' });
    }
});

app.post('/api/classes/:classId/add-student', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const { studentId } = req.body;
        const classRef = db.collection('classes').doc(classId);
        const classDoc = await classRef.get();
        if (!classDoc.exists || !classDoc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json({error: 'Permissão negada'});
        }
        await classRef.update({
            student_ids: FieldValue.arrayUnion(studentId)
        });
        res.json({ success: true, message: 'Aluno adicionado à turma!' });
    } catch (error) {
        console.error('Erro ao adicionar aluno à turma:', error);
        res.status(500).json({ error: 'Erro ao associar aluno.' });
    }
});

app.delete('/api/classes/:classId/remove-student/:studentId', requireLogin, async (req, res) => {
    try {
        const { classId, studentId } = req.params;
        const classRef = db.collection('classes').doc(classId);
        const classDoc = await classRef.get();
        if (!classDoc.exists || !classDoc.data().member_ids.includes(req.session.uid)) {
            return res.status(403).json({error: 'Permissão negada'});
        }
        await classRef.update({
            student_ids: FieldValue.arrayRemove(studentId)
        });
        res.json({ success: true, message: 'Aluno removido da turma!' });
    } catch (error) {
        console.error('Erro ao remover aluno da turma:', error);
        res.status(500).json({ error: 'Erro ao remover aluno.' });
    }
});

// --- API de Dados e Alertas ---
app.get('/api/data', requireLogin, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // --- BUSCA DE DADOS EM PARALELO ---
        const [
            studentsSnapshot, 
            logsSnapshot, 
            redAlertSnapshot, 
            blueAlertSnapshot
        ] = await Promise.all([
            db.collection('students').get(),
            db.collection('logs').where('timestamp', '>=', today).get(),
            db.collection('logs').where('categoria', 'in', ['Rede Social', 'Streaming & Jogos']).select('aluno_id').get(),
            db.collection('logs').where('categoria', '==', 'IA').select('aluno_id').get()
        ]);

        // 1. Mapeia todos os alunos para fácil acesso
        const allStudents = new Map();
        studentsSnapshot.forEach(doc => {
            const data = doc.data();
            // Usamos o ID do documento como chave principal para o aluno
            allStudents.set(doc.id, { 
                id: doc.id,
                full_name: data.full_name,
                // Adicionamos os identificadores (cpf/pc_id) em um array para busca
                identifiers: [data.cpf, data.pc_id].filter(Boolean) 
            });
        });

        // 2. Processa os logs de HOJE para calcular atividade diária
        const dailyActivity = {};
        logsSnapshot.forEach(doc => {
            const log = doc.data();
            const studentId = log.aluno_id;
            if (!dailyActivity[studentId]) {
                dailyActivity[studentId] = { total_duration: 0, log_count: 0, last_activity: new Date(0) };
            }
            dailyActivity[studentId].total_duration += log.duration;
            dailyActivity[studentId].log_count += 1;
            const logTimestamp = log.timestamp.toDate();
            if (logTimestamp > dailyActivity[studentId].last_activity) {
                dailyActivity[studentId].last_activity = logTimestamp;
            }
        });

        // 3. Cria conjuntos de IDs de alunos com alertas HISTÓRICOS
        const redAlertStudents = new Set(redAlertSnapshot.docs.map(doc => doc.data().aluno_id));
        const blueAlertStudents = new Set(blueAlertSnapshot.docs.map(doc => doc.data().aluno_id));

        // 4. Monta o resumo final a partir da lista de TODOS os alunos
        const summary = [];
        // Itera sobre o mapa de todos os alunos, e não sobre os logs
        for (const student of allStudents.values()) {
            // Encontra o ID bruto (cpf ou pc_id) que pode estar nos logs
            const studentLogId = student.identifiers.find(id => dailyActivity[id] || redAlertStudents.has(id) || blueAlertStudents.has(id)) || student.identifiers[0] || student.id;
            
            const activity = dailyActivity[studentLogId] || { total_duration: 0, log_count: 0, last_activity: null };

            summary.push({
                aluno_id: studentLogId,
                student_name: student.full_name,
                total_duration: activity.total_duration,
                log_count: activity.log_count,
                last_activity: activity.last_activity,
                has_red_alert: student.identifiers.some(id => redAlertStudents.has(id)),
                has_blue_alert: student.identifiers.some(id => blueAlertStudents.has(id)),
            });
        }

        // Os logs enviados para a tabela continuam sendo apenas os de hoje
        const logs = logsSnapshot.docs.map(doc => {
            const log = doc.data();
            let studentName = log.aluno_id;
            for (const student of allStudents.values()) {
                if (student.identifiers.includes(log.aluno_id)) {
                    studentName = student.full_name;
                    break;
                }
            }
            return {
                ...log,
                student_name: studentName,
                timestamp: log.timestamp.toDate().toISOString(),
            };
        });

        res.json({
            logs,
            summary: summary.sort((a, b) => (b.last_activity || 0) - (a.last_activity || 0)),
        });

    } catch (err) {
        console.error('ERRO na rota /api/data:', err);
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

app.get('/api/alerts/:alunoId/:type', requireLogin, async (req, res) => {
    try {
        const alunoId = decodeURIComponent(req.params.alunoId);
        const { type } = req.params;
        let categories;
        if (type === 'red') {
            categories = ['Rede Social', 'Streaming & Jogos'];
        } else if (type === 'blue') {
            categories = ['IA'];
        } else {
            return res.status(400).json({ error: 'Tipo de alerta inválido.' });
        }
        const snapshot = await db.collection('logs')
            .where('aluno_id', '==', alunoId)
            .where('categoria', 'in', categories)
            .orderBy('timestamp', 'desc')
            .get();
        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            const timestamp = (data.timestamp && typeof data.timestamp.toDate === 'function')
                ? data.timestamp.toDate().toISOString()
                : null;
            return { ...data, timestamp: timestamp };
        });
        res.json(logs);
    } catch (err) {
        console.error('ERRO na rota /api/alerts/:alunoId:', err);
        res.status(500).json({ error: 'Erro ao buscar logs de alerta.' });
    }
});

// Rota de fallback para erro 404
app.use((req, res) => {
    res.status(404).send("Página não encontrada");
});


// ================================================================
//                         INICIALIZAÇÃO DO SERVIDOR
// ================================================================
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    console.log(`Acesse a aplicação em http://localhost:${port}`);
});