// ================================================================
//      IMPORTS E CONFIGURAÇÃO INICIAL (VERSÃO OFICIAL LOCAL SQL)
// ================================================================
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Driver MySQL
const bcrypt = require('bcrypt'); // Para senhas
const PDFDocument = require('pdfkit'); // Para relatórios PDF
const nodemailer = require('nodemailer'); // Para envio de email
const crypto = require('crypto'); // Para tokens seguros

// Classificador de IA
const classifier = require('./python_classifier.js');

const app = express();
const port = process.env.PORT || 8081;

// ================================================================
//                  CONFIGURAÇÃO DO EXPRESS
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: '*', // Permite qualquer origem (Para testes é OK, para produção, defina o domínio específico)
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));// Permite requisições de qualquer origem

// --- CONFIGURAÇÃO DA SESSÃO ---
app.use(session({
    secret: 'chave-secreta-para-a-versao-oficial-do-tcc-muito-segura',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 1 dia
}));

// Middleware de log de requisições
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- CONFIGURAÇÃO DO NODEMAILER (Transportador de Email) ---
const transporter = nodemailer.createTransport({
    service: 'gmail', // Usa a configuração padrão do Gmail
    auth: {
        user: 'vocetcc@gmail.com', // O seu email do Gmail
        pass: 'stsegnhjltbkamla',   // A SENHA DE APP de 16 dígitos que você gerou
    },
});

// Verifica a conexão do Nodemailer ao iniciar
transporter.verify(function (error, success) {
  if (error) {
    console.error("Erro na configuração do Nodemailer:", error);
  } else {
    console.log("✅ Nodemailer configurado e pronto para enviar emails.");
  }
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
        return next(); // Usuário está logado, prossegue
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Não autorizado. Faça login para continuar.' });
    }
    res.redirect('/login');
};

// ================================================================
//            ROTAS PÚBLICAS E DE AUTENTICAÇÃO (SQL)
// ================================================================

// --- Página Inicial, Login, Cadastro ---
app.get('/', (req, res) => res.render('landpage', { pageTitle: 'V.O.C.E', isLoggedIn: !!req.session.professorId }));
app.get('/login', (req, res) => res.render('login', { pageTitle: 'Login', message: req.query.message || null }));
app.get('/cadastro', (req, res) => res.render('cadastro', { pageTitle: 'Cadastro' }));

// --- Rota de Cadastro (responde com JSON) ---
app.post('/cadastro', async (req, res) => {
    const { fullName, username, email, password } = req.body;
    if (!fullName || !username || !email || !password) {
        return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO professors (full_name, username, email, password_hash) VALUES (?, ?, ?, ?)', [fullName, username, email, hashedPassword]);
        res.status(201).json({ success: true, message: 'Cadastro realizado com sucesso!' });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Email ou nome de usuário já está em uso.' });
        }
        res.status(500).json({ success: false, message: 'Erro interno ao tentar realizar o cadastro.' });
    }
});

// --- Rota de Login (responde com JSON) ---
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios.' });
    }
    try {
        const [rows] = await pool.query('SELECT * FROM professors WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Email ou senha inválidos.' });
        }
        const professor = rows[0];
        const match = await bcrypt.compare(password, professor.password_hash);
        if (match) {
            req.session.professorId = professor.id;
            req.session.professorName = professor.full_name;
            req.session.save((err) => { // Salva a sessão antes de responder
                if (err) {
                    console.error('Erro ao salvar sessão:', err);
                    return res.status(500).json({ success: false, message: 'Erro interno ao iniciar sessão.' });
                }
                res.status(200).json({ success: true }); // Responde sucesso
            });
        } else {
            res.status(401).json({ success: false, message: 'Email ou senha inválidos.' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor durante o login.' });
    }
});

// --- Rota de Logout ---
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) { console.error('Erro ao destruir sessão:', err); return res.status(500).send('Não foi possível fazer logout.'); }
        res.clearCookie('connect.sid'); // Limpa o cookie da sessão
        res.redirect('/');
    });
});

// --- Rota POST /forgot-password ---
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email é obrigatório.' });
    try {
        const [rows] = await pool.query('SELECT id, full_name FROM professors WHERE email = ?', [email]);
        if (rows.length === 0) {
            console.log(`Tentativa de reset para email não encontrado: ${email}`);
            return res.json({ success: true, message: 'Se o email estiver cadastrado, um link de redefinição foi enviado.' });
        }
        const professor = rows[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 hora
        await pool.query('DELETE FROM password_resets WHERE professor_id = ?', [professor.id]);
        await pool.query('INSERT INTO password_resets (professor_id, token_hash, expires_at) VALUES (?, ?, ?)', [professor.id, tokenHash, expiresAt]);
        const resetLink = `http://localhost:${port}/reset-password?token=${resetToken}`;
        await transporter.sendMail({
            from: '"Sistema V.O.C.E" <vocetcc@gmail.com>', // Seu email do Gmail
            to: email,
            subject: 'Redefinição de Senha - Sistema V.O.C.E',
            html: `<p>Olá ${professor.full_name},</p><p>Clique no link para redefinir sua senha: <a href="${resetLink}">Redefinir Minha Senha</a></p><p>Este link expira em 1 hora.</p>`,
        });
        console.log(`Email de reset enviado para ${email}`);
        res.json({ success: true, message: 'Se o email estiver cadastrado, um link de redefinição foi enviado.' });
    } catch (error) {
        console.error('Erro em /forgot-password:', error);
        res.json({ success: true, message: 'Se o email estiver cadastrado, um link de redefinição foi enviado.' });
    }
});

// --- ROTA GET /reset-password ---
app.get('/reset-password', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).render('error', { pageTitle: 'Erro', message: 'Token de redefinição ausente ou inválido.' });
    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const [rows] = await pool.query('SELECT professor_id FROM password_resets WHERE token_hash = ? AND expires_at > NOW()', [tokenHash]);
        if (rows.length === 0) return res.status(400).render('error', { pageTitle: 'Erro', message: 'Token de redefinição inválido ou expirado.' });
        res.render('reset-password', { pageTitle: 'Redefinir Senha', token: token, error: null });
    } catch (error) {
        console.error('Erro em GET /reset-password:', error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro interno ao verificar o token.' });
    }
});

// --- ROTA POST /reset-password ---
app.post('/reset-password', async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword || !confirmPassword) return res.status(400).render('reset-password', { pageTitle: 'Redefinir Senha', token: token, error: 'Todos os campos são obrigatórios.' });
    if (newPassword.length < 6) return res.status(400).render('reset-password', { pageTitle: 'Redefinir Senha', token: token, error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    if (newPassword !== confirmPassword) return res.status(400).render('reset-password', { pageTitle: 'Redefinir Senha', token: token, error: 'As senhas não coincidem.' });
    let connection;
    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT professor_id FROM password_resets WHERE token_hash = ? AND expires_at > NOW() FOR UPDATE', [tokenHash]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(400).render('error', { pageTitle: 'Erro', message: 'Token de redefinição inválido ou expirado.' });
        }
        const professorId = rows[0].professor_id;
        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        await connection.query('UPDATE professors SET password_hash = ? WHERE id = ?', [newHashedPassword, professorId]);
        await connection.query('DELETE FROM password_resets WHERE token_hash = ?', [tokenHash]);
        await connection.commit();
        res.redirect('/login?message=Senha redefinida com sucesso! Faça o login com a nova senha.');
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erro em POST /reset-password:', error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro interno ao redefinir a senha.' });
    } finally {
        if (connection) connection.release();
    }
});

// ================================================================
//      ROTAS DE PÁGINAS PROTEGIDAS (RENDERIZAÇÃO EJS)
// ================================================================
app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const [classes] = await pool.query('SELECT c.id, c.name FROM classes c JOIN class_members cm ON c.id = cm.class_id WHERE cm.professor_id = ? ORDER BY c.name', [req.session.professorId]);
        // Puxa as categorias tanto dos logs quanto dos overrides manuais
        const [categoriesLogs] = await pool.query('SELECT DISTINCT categoria FROM logs WHERE categoria IS NOT NULL');
        const [categoriesOverrides] = await pool.query('SELECT DISTINCT category FROM category_overrides WHERE category IS NOT NULL');
        const allCats = new Set([...categoriesLogs.map(c => c.categoria), ...categoriesOverrides.map(c => c.category)]);
        const categories = [...allCats].sort();
        
        res.render('dashboard', { pageTitle: 'Dashboard', professorName: req.session.professorName, classes, categories });
    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro ao carregar o dashboard.', isLoggedIn: true, professorName: req.session.professorName });
    }
});

app.get('/gerenciamento', requireLogin, async (req, res) => {
    try {
        const [classes] = await pool.query('SELECT c.id, c.name FROM classes c JOIN class_members cm ON c.id = cm.class_id WHERE cm.professor_id = ? ORDER BY c.name', [req.session.professorId]);
        res.render('gerenciamento', { pageTitle: 'Gestão', professorName: req.session.professorName, classes });
    } catch (error) {
        console.error("Erro ao carregar gerenciamento:", error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro ao carregar a página de gerenciamento.', isLoggedIn: true, professorName: req.session.professorName });
    }
});

app.get('/perfil', requireLogin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, full_name, username, email FROM professors WHERE id = ?', [req.session.professorId]);
        if (rows.length === 0) return res.redirect('/logout');
        res.render('perfil', { pageTitle: 'Meu Perfil', user: rows[0], success: req.query.success, error: req.query.error || null, professorName: req.session.professorName });
    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro ao carregar o perfil.', isLoggedIn: true, professorName: req.session.professorName });
    }
});

app.post('/perfil', requireLogin, async (req, res) => {
    const { fullName } = req.body;
    if (!fullName || fullName.trim() === '') return res.redirect('/perfil?error=Nome não pode ser vazio');
    try {
        await pool.query('UPDATE professors SET full_name = ? WHERE id = ?', [fullName.trim(), req.session.professorId]);
        req.session.professorName = fullName.trim();
        req.session.save(err => {
            if (err) console.error('Erro ao salvar nome na sessão:', err);
            res.redirect('/perfil?success=true');
        });
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        res.status(500).render('error', { pageTitle: 'Erro', message: 'Erro ao atualizar o perfil.', isLoggedIn: true, professorName: req.session.professorName });
    }
});

// ================================================================
//      APIs PROTEGIDAS DE GESTÃO E DADOS (SQL)
// ================================================================

// --- Função Auxiliar de Hostname ---
function extractHostname(urlString) {
    if (!urlString) return ''; // Retorna vazio se a URL for nula/undefined
    try {
        let fullUrl = urlString.startsWith('http://') || urlString.startsWith('https://') ? urlString : `http://${urlString}`;
        return new URL(fullUrl).hostname.toLowerCase();
    } catch (e) {
        return urlString.toLowerCase(); // Retorna a string original (ex: 'localhost') em minúsculas
    }
}

// --- API: Coleta de Logs ---
app.post('/api/logs', async (req, res) => {
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    if (!logs || logs.length === 0) return res.status(400).send('Nenhum log recebido.');
    try {
        const uniqueHostnames = [...new Set(logs.map(log => extractHostname(log.url)).filter(Boolean))];
        let overrides = {};
        if (uniqueHostnames.length > 0) {
            const [overrideRows] = await pool.query('SELECT hostname, category FROM category_overrides WHERE hostname IN (?)', [uniqueHostnames]);
            overrides = overrideRows.reduce((map, row) => { map[row.hostname] = row.category; return map; }, {});
        }
        const sql = 'INSERT INTO logs (aluno_id, url, duration, categoria, timestamp) VALUES ?';
        const values = await Promise.all(logs.map(async (log) => {
            let category = 'Não Categorizado';
            let hostname = extractHostname(log.url);
            if (overrides[hostname]) {
                category = overrides[hostname];
            } else if (log.url) {
                category = await classifier.categorizar(log.url);
            }
            return [ log.aluno_id, log.url || '', log.durationSeconds || 0, category, new Date(log.timestamp || Date.now()) ];
        }));
        if (values.length > 0) { await pool.query(sql, [values]); }
        res.status(200).send('Logs salvos com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar logs no MySQL com overrides:', error);
        res.status(500).send('Erro interno ao processar os logs.');
    }
});

// --- API: Override de Categoria ---
app.post('/api/override-category', requireLogin, async (req, res) => {
    console.log("\n--- [SAVE OVERRIDE] Recebido POST /api/override-category ---");
    const { url, newCategory } = req.body;
    const professorId = req.session.professorId;
    console.log("--- [SAVE OVERRIDE] Dados Recebidos:", { url, newCategory, professorId });
    if (!url || !newCategory || newCategory.trim() === '' || !professorId) {
        console.warn("--- [SAVE OVERRIDE] Falha na validação (dados ausentes):", { url, newCategory, professorId });
        return res.status(400).json({ error: 'Dados inválidos ou sessão expirada.' });
    }
    let hostname = extractHostname(url);
    if (!hostname) {
         console.warn("--- [SAVE OVERRIDE] Falha: Hostname resultou em vazio.");
         return res.status(400).json({ error: 'URL inválida.' });
    }
    const finalCategory = newCategory.trim();
    let connection;
    try {
        const sql = `INSERT INTO category_overrides (hostname, category, updated_by_professor_id) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE category = VALUES(category), updated_by_professor_id = VALUES(updated_by_professor_id), updated_at = NOW();`;
        const values = [hostname, finalCategory, professorId];
        console.log("--- [SAVE OVERRIDE] Executando SQL:", pool.format(sql, values));
        connection = await pool.getConnection();
        const [result] = await connection.query(sql, values);
        console.log("--- [SAVE OVERRIDE] Resultado da Query MySQL:", result);
        if (result.affectedRows > 0 || result.warningStatus === 0) {
             console.log(`--- [SAVE OVERRIDE] SUCESSO: ${result.affectedRows} linha(s) afetada(s).`);
             res.json({ success: true, message: `Categoria para "${hostname}" definida como "${finalCategory}".` });
        } else {
             console.warn("--- [SAVE OVERRIDE] ATENÇÃO: Nenhuma linha afetada.", result);
             res.status(500).json({ error: 'Não foi possível confirmar a alteração no banco de dados.' });
        }
    } catch (error) {
        console.error('--- [SAVE OVERRIDE] ERRO FATAL durante a query:', error);
        res.status(500).json({ error: 'Erro interno ao salvar a regra (verifique o console do servidor).' });
    } finally {
         if (connection) connection.release();
         console.log("--- [SAVE OVERRIDE] Fim do processamento ---");
    }
});

// --- API: Alterar Senha (Logado) ---
app.post('/api/change-password', requireLogin, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const professorId = req.session.professorId;
    if (!currentPassword || !newPassword || !confirmPassword) return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
    if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: 'A nova senha e a confirmação não coincidem.' });
    if (newPassword === currentPassword) return res.status(400).json({ success: false, message: 'A nova senha não pode ser igual à senha atual.' });
    try {
        const [rows] = await pool.query('SELECT password_hash FROM professors WHERE id = ?', [professorId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const currentHashedPassword = rows[0].password_hash;
        const isMatch = await bcrypt.compare(currentPassword, currentHashedPassword);
        if (!isMatch) return res.status(401).json({ success: false, message: 'A senha atual está incorreta.' });
        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE professors SET password_hash = ? WHERE id = ?', [newHashedPassword, professorId]);
        res.json({ success: true, message: 'Senha alterada com sucesso!' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor ao tentar alterar a senha.' });
    }
});

// --- API: Gestão de Turmas ---
app.post('/api/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Nome da turma é obrigatório.' });
    const owner_id = req.session.professorId;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [classResult] = await connection.query('INSERT INTO classes (name, owner_id) VALUES (?, ?)', [name.trim(), owner_id]);
        const classId = classResult.insertId;
        await connection.query('INSERT INTO class_members (class_id, professor_id) VALUES (?, ?)', [classId, owner_id]);
        await connection.commit();
        res.status(201).json({ success: true, message: 'Turma criada com sucesso!', classId: classId });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro interno ao criar turma.' });
    } finally {
        connection.release();
    }
});

app.delete('/api/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const professorId = req.session.professorId;
    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });
        if (rows[0].owner_id !== professorId) return res.status(403).json({ error: 'Apenas o dono pode remover a turma.' });
        await pool.query('DELETE FROM classes WHERE id = ?', [classId]);
        res.json({ success: true, message: 'Turma removida com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover turma:', error);
        res.status(500).json({ error: 'Erro interno ao remover a turma.' });
    }
});

app.post('/api/classes/:classId/share', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { professorId: professorToShareId } = req.body;
    if (!professorToShareId) return res.status(400).json({ error: 'ID do professor para compartilhar é obrigatório.' });
    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });
        if (rows[0].owner_id !== req.session.professorId) return res.status(403).json({ error: 'Apenas o dono pode compartilhar a turma.' });
        const [profExists] = await pool.query('SELECT id FROM professors WHERE id = ?', [professorToShareId]);
        if (profExists.length === 0) return res.status(404).json({ error: 'Professor a ser adicionado não encontrado.' });
        await pool.query('INSERT IGNORE INTO class_members (class_id, professor_id) VALUES (?, ?)', [classId, professorToShareId]);
        res.json({ success: true, message: 'Turma compartilhada com sucesso!' });
    } catch (error) {
        console.error("Erro ao compartilhar turma:", error);
        res.status(500).json({ error: 'Erro interno ao compartilhar turma.' });
    }
});

app.delete('/api/classes/:classId/remove-member/:professorId', requireLogin, async (req, res) => {
    const { classId, professorId: memberToRemoveId } = req.params;
    if (!memberToRemoveId) return res.status(400).json({ error: 'ID do professor a remover é obrigatório.' });
    try {
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Turma não encontrada.' });
        const ownerId = rows[0].owner_id;
        if (ownerId !== req.session.professorId) return res.status(403).json({ error: 'Apenas o dono pode remover membros.' });
        if (ownerId == memberToRemoveId) return res.status(400).json({ error: 'O dono da turma não pode ser removido.' });
        const [result] = await pool.query('DELETE FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, memberToRemoveId]);
        if (result.affectedRows > 0) res.json({ success: true, message: 'Professor removido da turma!' });
        else res.status(404).json({ error: 'Professor não encontrado nesta turma.' });
    } catch (error) {
        console.error("Erro ao remover membro da turma:", error);
        res.status(500).json({ error: 'Erro interno ao remover membro.' });
    }
});

app.get('/api/classes/:classId/members', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não é membro desta turma.' });
        const [members] = await pool.query(`SELECT p.id, p.full_name, p.username, (c.owner_id = p.id) as isOwner FROM professors p JOIN class_members cm ON p.id = cm.professor_id JOIN classes c ON cm.class_id = c.id WHERE cm.class_id = ? ORDER BY p.full_name`, [classId]);
        const [rows] = await pool.query('SELECT owner_id FROM classes WHERE id = ?', [classId]);
        const isCurrentUserOwner = rows.length > 0 && rows[0].owner_id === req.session.professorId;
        res.json({ members, isCurrentUserOwner });
    } catch (error) {
        console.error("Erro ao buscar membros da turma:", error);
        res.status(500).json({ error: "Erro interno ao buscar membros." });
    }
});

// --- API: Gestão de Alunos ---
app.post('/api/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id } = req.body;
    if (!fullName || fullName.trim() === '') return res.status(400).json({ error: 'Nome do aluno é obrigatório.' });
    const cleanCpf = cpf ? cpf.trim() : null;
    const cleanPcId = pc_id ? pc_id.trim() : null;
    try {
        const [result] = await pool.query('INSERT INTO students (full_name, cpf, pc_id) VALUES (?, ?, ?)', [fullName.trim(), cleanCpf || null, cleanPcId || null]);
        res.status(201).json({ success: true, student: { id: result.insertId, full_name: fullName.trim(), cpf: cleanCpf, pc_id: cleanPcId } });
    } catch (error) {
        console.error('Erro ao criar aluno:', error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'CPF ou ID do PC já cadastrado.' });
        res.status(500).json({ error: 'Erro interno ao criar aluno.' });
    }
});

app.get('/api/students/all', requireLogin, async (req, res) => {
    try {
        const [students] = await pool.query('SELECT * FROM students ORDER BY full_name');
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar todos os alunos:', error);
        res.status(500).json({ error: 'Erro interno ao buscar alunos.' });
    }
});

app.get('/api/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não tem permissão para ver os alunos desta turma.' });
        const [students] = await pool.query(`SELECT s.* FROM students s JOIN class_students cs ON s.id = cs.student_id WHERE cs.class_id = ? ORDER BY s.full_name`, [classId]);
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro interno ao buscar alunos da turma.' });
    }
});

app.post('/api/classes/:classId/add-student', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'ID do aluno é obrigatório.' });
    try {
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não tem permissão para adicionar alunos.' });
        const [studentExists] = await pool.query('SELECT id FROM students WHERE id = ?', [studentId]);
        if (studentExists.length === 0) return res.status(404).json({ error: 'Aluno não encontrado.' });
        await pool.query('INSERT IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, studentId]);
        res.json({ success: true, message: 'Aluno adicionado à turma!' });
    } catch (error) {
        console.error('Erro ao adicionar aluno à turma:', error);
        res.status(500).json({ error: 'Erro interno ao associar aluno.' });
    }
});

app.delete('/api/classes/:classId/remove-student/:studentId', requireLogin, async (req, res) => {
    const { classId, studentId } = req.params;
    try {
        const [isMember] = await pool.query('SELECT 1 FROM class_members WHERE class_id = ? AND professor_id = ?', [classId, req.session.professorId]);
        if (isMember.length === 0) return res.status(403).json({ error: 'Você não tem permissão para remover alunos.' });
        const [result] = await pool.query('DELETE FROM class_students WHERE class_id = ? AND student_id = ?', [classId, studentId]);
        if (result.affectedRows > 0) res.json({ success: true, message: 'Aluno removido da turma!' });
        else res.status(404).json({ error: 'Aluno não encontrado nesta turma.' });
    } catch (error) {
        console.error('Erro ao remover aluno da turma:', error);
        res.status(500).json({ error: 'Erro interno ao remover aluno.' });
    }
});

// --- API: Listagem de Professores ---
app.get('/api/professors/list', requireLogin, async (req, res) => {
    try {
        const [professors] = await pool.query('SELECT id, full_name, username, email FROM professors WHERE id != ? ORDER BY full_name', [req.session.professorId]);
        res.json(professors);
    } catch (error) {
        console.error("Erro ao listar professores:", error);
        res.status(500).json({ error: 'Erro interno ao buscar professores.' });
    }
});

// --- API: Dados para Dashboard e Alertas (CORRIGIDA) ---
app.get('/api/data', requireLogin, async (req, res) => {
    console.log("--- Iniciando GET /api/data ---");
    try {
        const [rawLogsData] = await pool.query(`
            SELECT l.id as log_id, l.aluno_id, l.url, l.duration, l.categoria as original_category, l.timestamp, s.full_name as student_name
            FROM logs l LEFT JOIN students s ON l.aluno_id = s.pc_id OR l.aluno_id = s.cpf
            WHERE DATE(l.timestamp) = CURDATE() ORDER BY l.timestamp DESC`);
        console.log(`--- Encontrados ${rawLogsData.length} logs brutos.`);
        const uniqueHostnames = [...new Set(rawLogsData.map(log => extractHostname(log.url)).filter(Boolean))];
        let overrideMap = {};
        if (uniqueHostnames.length > 0) {
            const [overrideRows] = await pool.query('SELECT hostname, category FROM category_overrides WHERE hostname IN (?)', [uniqueHostnames]);
            overrideMap = overrideRows.reduce((map, row) => { map[row.hostname] = row.category; return map; }, {});
        }
        console.log("--- Overrides encontrados:", overrideMap);
        const finalLogs = rawLogsData.map(log => {
            const hostname = extractHostname(log.url);
            const overriddenCategory = overrideMap[hostname];
            const finalCategory = overriddenCategory !== undefined ? overriddenCategory : (log.original_category || 'Não Categorizado');
            return { ...log, categoria: finalCategory };
        });
        console.log(`--- ${finalLogs.length} logs finais processados.`);
        const [summary] = await pool.query(`
            SELECT s.id as student_db_id, s.full_name as student_name, s.cpf, s.pc_id, COALESCE(s.pc_id, s.cpf, 'ID_DESCONHECIDO') as aluno_id,
                   COALESCE(SUM(CASE WHEN DATE(l.timestamp) = CURDATE() THEN l.duration ELSE 0 END), 0) as total_duration,
                   COALESCE(SUM(CASE WHEN DATE(l.timestamp) = CURDATE() THEN 1 ELSE 0 END), 0) as log_count,
                   MAX(CASE WHEN DATE(l.timestamp) = CURDATE() THEN l.timestamp ELSE NULL END) as last_activity
             FROM students s
             LEFT JOIN logs l ON s.pc_id = l.aluno_id OR s.cpf = l.aluno_id
             GROUP BY s.id, s.full_name, s.pc_id, s.cpf
             ORDER BY MAX(CASE WHEN DATE(l.timestamp) = CURDATE() THEN l.timestamp ELSE NULL END) IS NULL ASC,
                      MAX(CASE WHEN DATE(l.timestamp) = CURDATE() THEN l.timestamp ELSE NULL END) DESC,
                      s.full_name ASC
        `);
        console.log(`--- ${summary.length} linhas de resumo encontradas.`);
        const finalRedAlertStudents = new Set();
        const finalBlueAlertStudents = new Set();
        finalLogs.forEach(log => {
            if (['Rede Social', 'Streaming & Jogos'].includes(log.categoria)) { if (log.aluno_id) finalRedAlertStudents.add(log.aluno_id.toLowerCase()); }
            if (log.categoria === 'IA') { if (log.aluno_id) finalBlueAlertStudents.add(log.aluno_id.toLowerCase()); }
        });
        console.log("--- Alertas recalculados com overrides:", { redSize: finalRedAlertStudents.size, blueSize: finalBlueAlertStudents.size });
        const finalSummaryWithCorrectAlerts = summary.map((s, index) => {
            const studentIdentifiers = [s.cpf, s.pc_id].filter(Boolean).map(id => id.toLowerCase());
            const hasRed = studentIdentifiers.some(id => finalRedAlertStudents.has(id));
            const hasBlue = studentIdentifiers.some(id => finalBlueAlertStudents.has(id));
            if (index < 3) { console.log(`--- [Alert Check] Aluno: ${s.student_name}, IDs: [${studentIdentifiers.join(', ')}], Red?: ${hasRed}, Blue?: ${hasBlue}`); }
            return { ...s, has_red_alert: hasRed, has_blue_alert: hasBlue };
        });
        console.log("--- Enviando resposta final.");
        res.json({ logs: finalLogs, summary: finalSummaryWithCorrectAlerts });
    } catch (err) {
        console.error('ERRO na rota /api/data:', err);
        res.status(500).json({ error: 'Erro interno ao buscar dados.' });
    }
});

// --- API: Logs de Alerta (CORRIGIDA) ---
app.get('/api/alerts/:clickedAlunoId/:type', requireLogin, async (req, res) => {
    const clickedAlunoId = decodeURIComponent(req.params.clickedAlunoId);
    const { type } = req.params;
    let alertCategories;
    if (type === 'red') alertCategories = ['Rede Social', 'Streaming & Jogos'];
    else if (type === 'blue') alertCategories = ['IA'];
    else return res.status(400).json({ error: 'Tipo de alerta inválido (use "red" ou "blue").' });
    console.log(`--- [Alerts API - Dia Atual] Buscando alertas tipo '${type}' para ID clicado: ${clickedAlunoId}`);
    try {
        const [studentRows] = await pool.query('SELECT cpf, pc_id FROM students WHERE cpf = ? OR pc_id = ?', [clickedAlunoId, clickedAlunoId]);
        let studentIdentifiers;
        if (studentRows.length > 0) studentIdentifiers = [studentRows[0].cpf, studentRows[0].pc_id].filter(Boolean).map(id => id.toLowerCase());
        else studentIdentifiers = [clickedAlunoId.toLowerCase()];
        if (studentIdentifiers.length === 0) { console.log(`--- [Alerts API - Dia Atual] Nenhum identificador válido.`); return res.json([]); }
        console.log(`--- [Alerts API - Dia Atual] Identificadores encontrados:`, studentIdentifiers);
        const [logs] = await pool.query(`SELECT * FROM logs WHERE aluno_id IN (?) AND categoria IN (?) AND DATE(timestamp) = CURDATE() ORDER BY timestamp DESC`, [studentIdentifiers, alertCategories]);
        console.log(`--- [Alerts API - Dia Atual] Encontrados ${logs.length} logs de alerta HOJE.`);
        res.json(logs);
    } catch (err) {
        console.error(`ERRO na rota /api/alerts/${clickedAlunoId}/${type} (Dia Atual):`, err);
        res.status(500).json({ error: 'Erro interno ao buscar logs de alerta do dia.' });
    }
});

// --- API: Relatório em PDF (CORRIGIDA) ---
app.get('/api/download-report/:date', requireLogin, async (req, res) => {
    console.log("--- [PDF] Iniciando download para data:", req.params.date);
    try {
        const [students] = await pool.query('SELECT id, full_name, cpf, pc_id FROM students');
        const studentNameMap = new Map();
        students.forEach(s => {
            if (s.pc_id) studentNameMap.set(s.pc_id, s.full_name);
            if (s.cpf) studentNameMap.set(s.cpf, s.full_name);
        });
        console.log("--- [PDF] Mapa de nomes de alunos criado.");
        const dateStr = req.params.date;
        const requestedDate = new Date(dateStr + 'T00:00:00');
        if (isNaN(requestedDate.getTime())) return res.status(400).send('Formato de data inválido. Use AAAA-MM-DD.');
        let aggregatedData = {};
        let dataSource = '';
        let foundData = false;
        
        console.log(`--- [PDF] Tentando buscar na tabela 'logs' para ${dateStr}...`);
        const [logsResult] = await pool.query(`SELECT aluno_id, url, duration, categoria, timestamp FROM logs WHERE DATE(timestamp) = ?`, [dateStr]);
        
        if (logsResult.length > 0) {
            console.log(`--- [PDF] Encontrados ${logsResult.length} registros em 'logs'. Agregando...`);
            foundData = true;
            dataSource = 'Logs Atuais (Tempo Real)';
            logsResult.forEach(log => {
                if (log && log.aluno_id && log.url && typeof log.duration === 'number') {
                     if (!aggregatedData[log.aluno_id]) aggregatedData[log.aluno_id] = {};
                     if (!aggregatedData[log.aluno_id][log.url]) aggregatedData[log.aluno_id][log.url] = { total_duration: 0, count: 0, categories: new Set(), firstTimestamp: log.timestamp };
                     aggregatedData[log.aluno_id][log.url].total_duration += log.duration;
                     aggregatedData[log.aluno_id][log.url].count += 1;
                     if(log.categoria) aggregatedData[log.aluno_id][log.url].categories.add(log.categoria);
                     if(log.timestamp < aggregatedData[log.aluno_id][log.url].firstTimestamp) aggregatedData[log.aluno_id][log.url].firstTimestamp = log.timestamp;
                }
            });
        } else {
            console.log(`--- [PDF] Nenhum registro em 'logs'. Tentando buscar em 'old_logs' para ${dateStr}...`);
            dataSource = 'Logs Arquivados';
            const [oldLogsRows] = await pool.query('SELECT aluno_id, daily_logs FROM old_logs WHERE archive_date = ?', [dateStr]);
            if (oldLogsRows.length > 0) {
                foundData = true;
                oldLogsRows.forEach(row => {
                     try { aggregatedData[row.aluno_id] = row.daily_logs; }
                     catch (parseError) { console.error(`--- [PDF] Erro parse JSON old_logs ${row.aluno_id} ${dateStr}:`, parseError); }
                });
            }
        }
        if (!foundData) {
            console.log(`--- [PDF] Nenhum dado encontrado para ${dateStr}.`);
            return res.status(404).send('Nenhum log encontrado para esta data.');
        }
        console.log("--- [PDF] Identificando logs de alerta para o PDF...");
        const alertLogsByStudent = {};
        const alertCategories = ['Rede Social', 'Streaming & Jogos', 'IA'];
        const allHostnamesInData = Object.values(aggregatedData).flatMap(daily => Object.keys(daily || {}));
        const uniqueHostnames = [...new Set(allHostnamesInData.map(url => extractHostname(url)).filter(Boolean))];
        let overrideMap = {};
         if (uniqueHostnames.length > 0) {
            const [overrideRows] = await pool.query('SELECT hostname, category FROM category_overrides WHERE hostname IN (?)', [uniqueHostnames]);
            overrideMap = overrideRows.reduce((map, row) => { map[row.hostname] = row.category; return map; }, {});
         }
         console.log("--- [PDF] Overrides para análise de alerta:", overrideMap);
        for (const alunoId in aggregatedData) {
            const dailyLogs = aggregatedData[alunoId];
            if (dailyLogs) {
                for (const url in dailyLogs) {
                    const details = dailyLogs[url];
                    const hostname = extractHostname(url);
                    const originalCategory = (details.categories ? [...details.categories][0] : null) || 'Não Categorizado';
                    const finalCategory = overrideMap[hostname] !== undefined ? overrideMap[hostname] : originalCategory;
                    if (alertCategories.includes(finalCategory)) {
                        if (!alertLogsByStudent[alunoId]) alertLogsByStudent[alunoId] = [];
                        alertLogsByStudent[alunoId].push({ url: url, category: finalCategory, duration: details.total_duration || 0, count: details.count || 0, timestamp: details.firstTimestamp || null });
                    }
                }
            }
        }
        console.log(`--- [PDF] ${Object.keys(alertLogsByStudent).length} alunos com logs de alerta identificados.`);
        const doc = new PDFDocument({ margin: 50 });
        const filename = `relatorio-logs-${dateStr}.pdf`;
        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);
        doc.fontSize(18).text('Relatório de Atividade de Alunos', { align: 'center' });
        doc.fontSize(12).text(`Data: ${requestedDate.toLocaleDateString('pt-BR')} | Fonte: ${dataSource}`, { align: 'center' });
        doc.moveDown(2);
        if (Object.keys(alertLogsByStudent).length > 0) {
            doc.fontSize(16).fillColor('red').text('ALERTA: Atividades Indevidas Detectadas', { underline: true });
            doc.fillColor('black').moveDown(1);
            for (const alunoId in alertLogsByStudent) {
                const displayName = studentNameMap.get(alunoId) || alunoId;
                const alertLogs = alertLogsByStudent[alunoId];
                doc.fontSize(12).font('Helvetica-Bold').text(`Aluno: ${displayName}`);
                alertLogs.sort((a,b) => (b.duration || 0) - (a.duration || 0));
                alertLogs.forEach(log => {
                    const durationMinutes = (log.duration / 60).toFixed(1);
                    let alertType = '';
                    if (['Rede Social', 'Streaming & Jogos'].includes(log.category)) alertType = '(Acesso Indevido)';
                    if (log.category === 'IA') alertType = '(Uso de IA)';
                    doc.fontSize(9).font('Helvetica').text(`  - ${log.url} - ${log.category} ${alertType} (${durationMinutes} min, ${log.count}x)`, { indent: 10 });
                });
                doc.moveDown(0.75);
            }
            doc.addPage();
            doc.fontSize(16).fillColor('black').text('Resumo Completo da Atividade', { align: 'center', underline: true });
            doc.moveDown(1.5);
        } else {
             doc.fontSize(14).fillColor('green').text('Nenhuma Atividade Indevida Detectada para esta Data.', { align: 'center' });
             doc.moveDown(2);
             doc.fillColor('black');
        }
        for (const alunoId in aggregatedData) {
            const displayName = studentNameMap.get(alunoId) || alunoId;
            const dailyLogs = aggregatedData[alunoId];
            doc.fontSize(14).font('Helvetica-Bold').text(`Aluno: ${displayName}`);
            doc.moveDown(0.5);
            const sortedUrls = Object.keys(dailyLogs || {}).sort((urlA, urlB) => (dailyLogs[urlB]?.total_duration || 0) - (dailyLogs[urlA]?.total_duration || 0));
            if (sortedUrls.length > 0) {
                 sortedUrls.forEach(url => {
                    const details = dailyLogs[url];
                    const duration = details.total_duration || 0;
                    const count = details.count || 0;
                    const durationMinutes = (duration / 60).toFixed(1);
                    const hostname = extractHostname(url);
                    const originalCategory = (details.categories ? [...details.categories][0] : null) || 'Não Categorizado';
                    const finalCategory = overrideMap[hostname] !== undefined ? overrideMap[hostname] : originalCategory;
                    doc.fontSize(10).font('Helvetica').text(`  - URL: ${url} | Categoria: ${finalCategory} | Duração: ${durationMinutes} min | Acessos: ${count}`);
                 });
            } else {
                 doc.fontSize(10).font('Helvetica').text('  Nenhuma atividade registrada ou dados inválidos.');
            }
            doc.moveDown(1.5);
        }
        console.log(`--- [PDF] Finalizando PDF para ${dateStr}.`);
        doc.end();
    } catch (error) {
        console.error('ERRO CRÍTICO ao gerar relatório em PDF:', error);
        if (!res.headersSent) { res.status(500).send('Erro interno ao gerar o relatório.'); }
    }
});


// ================================================================
//      ROTAS DE ERRO E INICIALIZAÇÃO
// ================================================================

// Rota de fallback para erro 404
app.use((req, res, next) => {
    res.status(404).render('404', { pageTitle: 'Página Não Encontrada', isLoggedIn: !!req.session.professorId });
});

// Middleware de tratamento de erros genérico
app.use((err, req, res, next) => {
  console.error("ERRO NÃO TRATADO:", err.stack);
  // Garante que variáveis de layout estejam disponíveis
  const renderData = {
       pageTitle: 'Erro Inesperado',
       message: 'Ocorreu um erro inesperado no servidor.',
       isLoggedIn: !!(req.session && req.session.professorId),
       professorName: (req.session && req.session.professorName) || ''
  };
  // Tenta renderizar uma página de erro EJS, se falhar, envia texto
  try {
     res.status(500).render('error', renderData);
  } catch (renderError) {
     console.error("ERRO AO RENDERIZAR PÁGINA DE ERRO:", renderError);
     res.status(500).send("Ocorreu um erro inesperado no servidor.");
  }
});

// ================================================================
//                      INICIALIZAÇÃO DO SERVIDOR
// ================================================================
app.listen(port, () => {
    console.log(`🚀 Servidor oficial V.O.C.E rodando em http://localhost:${port}`);
});