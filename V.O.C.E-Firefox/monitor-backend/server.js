// ================================================================
//      IMPORTS E CONFIGURAÇÃO INICIAL (VERSÃO OFICIAL LOCAL SQL)
// ================================================================
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const PDFDocument = require('pdfkit');

const classifier = require('./python_classifier.js');

const app = express();
const port = process.env.PORT || 8080;

// ================================================================
//                  CONFIGURAÇÃO DO EXPRESS
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // Permite requisições de qualquer origem

// --- CONFIGURAÇÃO DA SESSÃO ---
app.use(session({
    secret: 'chave-secreta-para-a-versao-oficial-do-tcc',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 1 dia
}));

// Middleware para logar todas as requisições
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ================================================================
//              CONEXÃO COM O BANCO DE DADOS MYSQL
// ================================================================
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'v_o_c_e', // Nome oficial do banco
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig);
console.log('✅ Pool de conexões MySQL configurado para o banco "v_o_c_e".');


// ================================================================
//                  MIDDLEWARE DE AUTENTICAÇÃO
// ================================================================
const requireLogin = (req, res, next) => {
    if (req.session && req.session.professorId) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    res.redirect('/login');
};

// ================================================================
//            ROTAS PÚBLICAS E DE AUTENTICAÇÃO (SQL)
// ================================================================
app.get('/', (req, res) => res.render('landpage', { pageTitle: 'V.O.C.E', isLoggedIn: !!req.session.professorId }));
app.get('/login', (req, res) => res.render('login', { pageTitle: 'Login', message: req.query.message || null }));
app.get('/cadastro', (req, res) => res.render('cadastro', { pageTitle: 'Cadastro' }));

app.post('/cadastro', async (req, res) => {
    const { fullName, username, email, password } = req.body;
    if (!fullName || !username || !email || !password) return res.status(400).send('Todos os campos são obrigatórios.');
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO professors (full_name, username, email, password_hash) VALUES (?, ?, ?, ?)', [fullName, username, email, hashedPassword]);
        res.redirect('/login?message=Cadastro realizado com sucesso!');
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).send('Erro ao cadastrar. O email ou username pode já estar em uso.');
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).render('login', { pageTitle: 'Login', message: 'Email e senha são obrigatórios.' });
    try {
        const [rows] = await pool.query('SELECT * FROM professors WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).render('login', { pageTitle: 'Login', message: 'Email ou senha inválidos.' });
        const professor = rows[0];
        const match = await bcrypt.compare(password, professor.password_hash);
        if (match) {
            req.session.professorId = professor.id;
            req.session.professorName = professor.full_name;
            res.redirect('/dashboard');
        } else {
            res.status(401).render('login', { pageTitle: 'Login', message: 'Email ou senha inválidos.' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).send('Erro interno no servidor.');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Não foi possível fazer logout.');
        res.redirect('/');
    });
});

// ================================================================
//      ROTAS DE PÁGINAS PROTEGIDAS (RENDERIZAÇÃO EJS COM DADOS SQL)
// ================================================================
app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const [classes] = await pool.query('SELECT c.id, c.name FROM classes c JOIN class_members cm ON c.id = cm.class_id WHERE cm.professor_id = ? ORDER BY c.name', [req.session.professorId]);
        const [categoriesResult] = await pool.query('SELECT DISTINCT categoria FROM logs WHERE categoria IS NOT NULL');
        const categories = categoriesResult.map(c => c.categoria);
        res.render('dashboard', { pageTitle: 'Dashboard', professorName: req.session.professorName, classes, categories });
    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        res.status(500).send("Erro ao carregar a página.");
    }
});

app.get('/gerenciamento', requireLogin, async (req, res) => {
    try {
        const [classes] = await pool.query('SELECT c.id, c.name FROM classes c JOIN class_members cm ON c.id = cm.class_id WHERE cm.professor_id = ? ORDER BY c.name', [req.session.professorId]);
        res.render('gerenciamento', { pageTitle: 'Gestão', professorName: req.session.professorName, classes });
    } catch (error) {
        console.error("Erro ao carregar gerenciamento:", error);
        res.status(500).send("Erro ao carregar a página.");
    }
});

app.get('/perfil', requireLogin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT full_name, username, email FROM professors WHERE id = ?', [req.session.professorId]);
        if(rows.length === 0) return res.redirect('/logout');
        res.render('perfil', { pageTitle: 'Meu Perfil', user: rows[0], success: req.query.success, professorName: req.session.professorName });
    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
        res.status(500).send("Erro ao carregar a página.");
    }
});

app.post('/perfil', requireLogin, async (req, res) => {
    const { fullName } = req.body;
    if (!fullName) return res.redirect('/perfil');
    try {
        await pool.query('UPDATE professors SET full_name = ? WHERE id = ?', [fullName, req.session.professorId]);
        req.session.professorName = fullName;
        res.redirect('/perfil?success=true');
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        res.status(500).send("Erro ao atualizar perfil.");
    }
});

// ================================================================
//      APIs PROTEGIDAS DE GESTÃO E DADOS (SQL)
// ================================================================

// --- Coleta de Logs ---
app.post('/api/logs', async (req, res) => {
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    if (!logs || logs.length === 0) return res.status(400).send('Nenhum log recebido.');
    try {
        const sql = 'INSERT INTO logs (aluno_id, url, duration, categoria, timestamp) VALUES ?';
        const values = await Promise.all(logs.map(async (log) => {
            const category = await classifier.categorizar(log.url);
            return [log.aluno_id, log.url, log.durationSeconds, category, new Date(log.timestamp)];
        }));
        await pool.query(sql, [values]);
        res.status(200).send('Logs salvos com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar logs no MySQL:', error);
        res.status(500).send('Erro interno ao processar os logs.');
    }
});

// --- Gestão de Turmas ---
app.post('/api/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    const owner_id = req.session.professorId;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [classResult] = await connection.query('INSERT INTO classes (name, owner_id) VALUES (?, ?)', [name, owner_id]);
        const classId = classResult.insertId;
        await connection.query('INSERT INTO class_members (class_id, professor_id) VALUES (?, ?)', [classId, owner_id]);
        await connection.commit();
        res.json({ success: true, message: 'Turma criada com sucesso!', classId });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro ao criar turma' });
    } finally {
        connection.release();
    }
});

app.delete('/api/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const professorId = req.session.professorId;
    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0 || rows[0].owner_id !== professorId) {
            return res.status(403).json({ error: 'Apenas o dono da turma pode removê-la.' });
        }
        // ON DELETE CASCADE no banco de dados cuidará da limpeza das tabelas de junção
        await pool.query('DELETE FROM classes WHERE id = ?', [classId]);
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
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0 || rows[0].owner_id !== req.session.professorId) {
            return res.status(403).json({ error: 'Apenas o dono da turma pode compartilhá-la.' });
        }
        await pool.query('INSERT IGNORE INTO class_members (class_id, professor_id) VALUES (?, ?)', [classId, professorId]);
        res.json({ success: true, message: 'Turma compartilhada com sucesso!' });
    } catch (error) {
        console.error("Erro ao compartilhar turma:", error);
        res.status(500).json({ error: 'Erro interno ao compartilhar turma.' });
    }
});

app.delete('/api/classes/:classId/remove-member/:professorId', requireLogin, async (req, res) => {
    const { classId, professorId } = req.params;
    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        const ownerId = rows.length > 0 ? rows[0].owner_id : null;
        if (ownerId !== req.session.professorId) {
            return res.status(403).json({ error: 'Apenas o dono da turma pode remover membros.' });
        }
        if (ownerId == professorId) {
            return res.status(400).json({ error: 'O dono da turma não pode ser removido.' });
        }
        await pool.query('DELETE FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, professorId]);
        res.json({ success: true, message: 'Professor removido da turma!' });
    } catch (error) {
        console.error("Erro ao remover membro da turma:", error);
        res.status(500).json({ error: 'Erro interno ao remover membro.' });
    }
});

app.get('/api/classes/:classId/members', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const [members] = await pool.query(`
            SELECT p.id, p.full_name, (c.owner_id = p.id) as isOwner
            FROM professors p
            JOIN class_members cm ON p.id = cm.professor_id
            JOIN classes c ON cm.class_id = c.id
            WHERE cm.class_id = ?
        `, [classId]);
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        const isCurrentUserOwner = rows.length > 0 && rows[0].owner_id === req.session.professorId;
        res.json({ members, isCurrentUserOwner });
    } catch (error) {
        console.error("Erro ao buscar membros da turma:", error);
        res.status(500).json({ error: "Erro ao buscar membros." });
    }
});

// --- Gestão de Alunos ---
app.post('/api/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id } = req.body;
    if (!fullName) return res.status(400).json({ error: 'Nome do aluno é obrigatório' });
    try {
        const [result] = await pool.query('INSERT INTO students (full_name, cpf, pc_id) VALUES (?, ?, ?)', [fullName, cpf || null, pc_id || null]);
        res.json({ success: true, student: { id: result.insertId, fullName, cpf, pc_id } });
    } catch (error) {
        console.error('Erro ao criar aluno:', error);
        res.status(500).json({ error: 'Erro ao criar aluno. CPF ou PC_ID pode já existir.' });
    }
});

app.get('/api/students/all', requireLogin, async (req, res) => {
    try {
        const [students] = await pool.query('SELECT * FROM students ORDER BY full_name');
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar todos os alunos:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos' });
    }
});

app.get('/api/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const [students] = await pool.query(`
            SELECT s.* FROM students s
            JOIN class_students cs ON s.id = cs.student_id
            WHERE cs.class_id = ? ORDER BY s.full_name
        `, [classId]);
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos da turma' });
    }
});

app.post('/api/classes/:classId/add-student', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { studentId } = req.body;
    try {
        await pool.query('INSERT IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, studentId]);
        res.json({ success: true, message: 'Aluno adicionado à turma!' });
    } catch (error) {
        console.error('Erro ao adicionar aluno à turma:', error);
        res.status(500).json({ error: 'Erro ao associar aluno.' });
    }
});

app.delete('/api/classes/:classId/remove-student/:studentId', requireLogin, async (req, res) => {
    const { classId, studentId } = req.params;
    try {
        await pool.query('DELETE FROM class_students WHERE class_id = ? AND student_id = ?', [classId, studentId]);
        res.json({ success: true, message: 'Aluno removido da turma!' });
    } catch (error) {
        console.error('Erro ao remover aluno da turma:', error);
        res.status(500).json({ error: 'Erro ao remover aluno.' });
    }
});

// --- Listagem de Professores ---
app.get('/api/professors/list', requireLogin, async (req, res) => {
    try {
        const [professors] = await pool.query('SELECT id, full_name, username, email FROM professors WHERE id != ?', [req.session.professorId]);
        res.json(professors);
    } catch (error) {
        console.error("Erro ao listar professores:", error);
        res.status(500).json({ error: 'Erro ao buscar professores.' });
    }
});

// --- Dados para Dashboard e Alertas ---
app.get('/api/data', requireLogin, async (req, res) => {
    try {
        const [logs] = await pool.query(`SELECT l.*, s.full_name as student_name FROM logs l LEFT JOIN students s ON l.aluno_id = s.pc_id OR l.aluno_id = s.cpf WHERE DATE(l.timestamp) = CURDATE() ORDER BY l.timestamp DESC`);
        const [summary] = await pool.query(`SELECT s.full_name as student_name, COALESCE(s.pc_id, s.cpf) as aluno_id, COALESCE(SUM(l.duration), 0) as total_duration, COALESCE(COUNT(l.id), 0) as log_count, MAX(l.timestamp) as last_activity FROM students s LEFT JOIN logs l ON (s.pc_id = l.aluno_id OR s.cpf = l.aluno_id) AND DATE(l.timestamp) = CURDATE() GROUP BY s.id, s.full_name, s.pc_id, s.cpf ORDER BY last_activity DESC, s.full_name ASC`);
        const [redAlertResult] = await pool.query(`SELECT DISTINCT aluno_id FROM logs WHERE categoria IN ('Rede Social', 'Streaming & Jogos')`);
        const [blueAlertResult] = await pool.query(`SELECT DISTINCT aluno_id FROM logs WHERE categoria = 'IA'`);

        const redAlertStudents = new Set(redAlertResult.map(r => r.aluno_id));
        const blueAlertStudents = new Set(blueAlertResult.map(r => r.aluno_id));

        const finalSummary = summary.map(s => ({
            ...s,
            has_red_alert: redAlertStudents.has(s.aluno_id),
            has_blue_alert: blueAlertStudents.has(s.aluno_id)
        }));
        
        res.json({ logs, summary: finalSummary });
    } catch (err) {
        console.error('ERRO na rota /api/data:', err);
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

app.get('/api/alerts/:alunoId/:type', requireLogin, async (req, res) => {
    const alunoId = decodeURIComponent(req.params.alunoId);
    const { type } = req.params;
    let categories;
    if (type === 'red') categories = ['Rede Social', 'Streaming & Jogos'];
    else if (type === 'blue') categories = ['IA'];
    else return res.status(400).json({ error: 'Tipo de alerta inválido.' });

    try {
        const [logs] = await pool.query('SELECT * FROM logs WHERE aluno_id = ? AND categoria IN (?) ORDER BY timestamp DESC', [alunoId, categories]);
        res.json(logs);
    } catch (err) {
        console.error('ERRO na rota /api/alerts/:alunoId:', err);
        res.status(500).json({ error: 'Erro ao buscar logs de alerta.' });
    }
});

// --- Relatório em PDF ---
app.get('/api/download-report/:date', requireLogin, async (req, res) => {
    try {
        const [students] = await pool.query('SELECT full_name, cpf, pc_id FROM students');
        const studentNameMap = new Map();
        students.forEach(s => {
            if (s.pc_id) studentNameMap.set(s.pc_id, s.full_name);
            if (s.cpf) studentNameMap.set(s.cpf, s.full_name);
        });

        const dateStr = req.params.date;
        const requestedDate = new Date(dateStr + 'T12:00:00Z');
        if (isNaN(requestedDate.getTime())) return res.status(400).send('Formato de data inválido. Use AAAA-MM-DD.');
        
        const todayStr = new Date().toISOString().split('T')[0];
        let dataSource, logsResult;

        if (dateStr === todayStr) {
            dataSource = 'Logs do Dia (em tempo real)';
            [logsResult] = await pool.query('SELECT aluno_id, url, SUM(duration) as total_duration, COUNT(*) as count FROM logs WHERE DATE(timestamp) = CURDATE() GROUP BY aluno_id, url');
        } else {
            dataSource = 'Logs Arquivados';
            const [rows] = await pool.query('SELECT daily_logs FROM old_logs WHERE archive_date = ?', [dateStr]);
            // Esta parte precisa de uma transformação mais complexa do JSON para um formato unificado
            // Por simplicidade, vamos focar nos logs do dia, que é o mais comum. A lógica do `old_logs` pode ser adicionada depois.
            return res.status(500).send("Relatórios de dias passados ainda não implementados nesta versão.");
        }

        if (logsResult.length === 0) return res.status(404).send('Nenhum log encontrado para esta data.');

        const aggregatedData = {};
        logsResult.forEach(row => {
            if (!aggregatedData[row.aluno_id]) aggregatedData[row.aluno_id] = {};
            aggregatedData[row.aluno_id][row.url] = { total_duration: row.total_duration, count: row.count };
        });

        const doc = new PDFDocument({ margin: 50 });
        const filename = `relatorio-logs-${dateStr}.pdf`;
        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        doc.fontSize(18).text('Relatório de Atividade de Alunos', { align: 'center' });
        doc.fontSize(12).text(`Data: ${requestedDate.toLocaleDateString('pt-BR')} | Fonte: ${dataSource}`, { align: 'center' });
        doc.moveDown(2);

        for (const alunoId in aggregatedData) {
            const displayName = studentNameMap.get(alunoId) || alunoId;
            doc.fontSize(14).font('Helvetica-Bold').text(`Aluno: ${displayName}`);
            doc.moveDown(0.5);
            for (const url in aggregatedData[alunoId]) {
                const details = aggregatedData[alunoId][url];
                const durationMinutes = (details.total_duration / 60).toFixed(1);
                doc.fontSize(10).font('Helvetica').text(`  - URL: ${url} | Duração: ${durationMinutes} min | Acessos: ${details.count}`);
            }
            doc.moveDown(1.5);
        }
        doc.end();
    } catch (error) {
        console.error('ERRO CRÍTICO ao gerar relatório em PDF:', error);
        res.status(500).send('Erro interno ao gerar o relatório.');
    }
});

// Rota de fallback para erro 404
app.use((req, res, next) => {
    res.status(404).render('404', { pageTitle: 'Página Não Encontrada', isLoggedIn: !!req.session.professorId });
});

// ================================================================
//                      INICIALIZAÇÃO DO SERVIDOR
// ================================================================
app.listen(port, () => {
    console.log(`🚀 Servidor oficial V.O.C.E rodando em http://localhost:${port}`);
});