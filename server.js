/* =========================================================

ARQUIVO: server.js

  Servidor Web em Javascript

  Tecnologias:
  - JavaScript - ES6
  - Nodemon

  Autor: Felipe Rodrigues - FullTime Technology
  
========================================================= */

const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const path = require('path');
const { randomBytes } = require('crypto');
const { hashPassword, verifyPassword, isPasswordHash } = require('./password-utils');

const app = express();
const PORT = 3000;
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

// Configuração da conexão com o MySQL Portátil (usuário root, sem senha)
const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  port: 3306
};

const DB_NAME = 'fulltime_db';

// Configuração do motor de templates EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares para leitura de formulários, JSON (com suporte a Base64 grande) e arquivos estáticos
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Alias de compatibilidade: caso algum HTML/EJS antigo aponte para /imagens, serve de public/images
app.use('/imagens', express.static(path.join(__dirname, 'public', 'images')));

// Configuração de Sessão (substitui a trava insegura do localStorage do autenticacao.js)
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 horas de sessão
}));

// Disponibiliza o usuário logado para todas as views e partials automaticamente
app.use((req, res, next) => {
  res.locals.usuarioLogado = req.session.usuario || null;
  next();
});

// Middleware de proteção para futuras rotas internas (equivalente ao autenticacao.js)
function exigirAutenticacao(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }
  return res.redirect('/');
}

// Função auxiliar para importar um array de usuários para o MySQL
async function importarListaUsuariosParaMySQL(conn, lista) {
  let importados = 0;
  for (const item of lista) {
    if (!item || !item.usuario) continue;
    const usuario = String(item.usuario).trim();
    let senhaHash;
    if (typeof item.senhaHash === 'string') {
      if (!isPasswordHash(item.senhaHash)) {
        throw new Error(`Hash de senha inválido para o usuário "${usuario}".`);
      }
      senhaHash = item.senhaHash;
    } else if (typeof item.senha === 'string' && item.senha.trim()) {
      senhaHash = await hashPassword(item.senha.trim());
    } else {
      continue;
    }
    const departamento = item.departamento ? String(item.departamento).trim() : 'Geral';
    const imagem = item.imagem ? String(item.imagem) : null;

    await conn.query(
      `INSERT INTO usuarios (usuario, senha_hash, departamento, imagem)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         senha_hash = VALUES(senha_hash),
         departamento = VALUES(departamento),
         imagem = COALESCE(VALUES(imagem), imagem)`,
      [usuario, senhaHash, departamento, imagem]
    );
    importados++;
  }
  return importados;
}

async function migrarSenhasUsuarios(conn) {
  let [colunas] = await conn.query('SHOW COLUMNS FROM usuarios');
  let nomesColunas = colunas.map(coluna => coluna.Field);
  const possuiSenhaLegada = nomesColunas.includes('senha');

  if (!nomesColunas.includes('senha_hash')) {
    await conn.query('ALTER TABLE usuarios ADD COLUMN senha_hash VARCHAR(255) NULL');
  }

  if (possuiSenhaLegada) {
    const [usuarios] = await conn.query('SELECT id, senha, senha_hash FROM usuarios');
    for (const usuario of usuarios) {
      if (isPasswordHash(usuario.senha_hash)) continue;
      if (usuario.senha === null || usuario.senha === undefined) {
        throw new Error(`Não foi possível migrar a senha do usuário ${usuario.id}.`);
      }
      const senhaHash = await hashPassword(String(usuario.senha));
      await conn.execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [senhaHash, usuario.id]);
    }
  }

  const [usuariosMigrados] = await conn.query('SELECT id, senha_hash FROM usuarios');
  const senhaInvalida = usuariosMigrados.find(usuario => !isPasswordHash(usuario.senha_hash));
  if (senhaInvalida) {
    throw new Error(`A senha do usuário ${senhaInvalida.id} não foi migrada corretamente.`);
  }

  if (possuiSenhaLegada) {
    await conn.query('ALTER TABLE usuarios DROP COLUMN senha');
  }
  await conn.query('ALTER TABLE usuarios MODIFY COLUMN senha_hash VARCHAR(255) NOT NULL');
}

// Inicializa o banco de dados e cria a tabela usuarios sem importar arquivos
async function inicializarBanco() {
  const conn = await mysql.createConnection(dbConfig);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await conn.query(`USE \`${DB_NAME}\`;`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario VARCHAR(100) NOT NULL UNIQUE,
        senha_hash VARCHAR(255) NOT NULL,
        departamento VARCHAR(100) DEFAULT 'Geral',
        imagem LONGTEXT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await migrarSenhasUsuarios(conn);
  } finally {
    await conn.end();
  }
}
// =========================================================================
// ROTAS PRINCIPAIS
// =========================================================================

// Rota inicial (Tela Terra + Modal de Login conectado ao MySQL)
app.get('/', async (req, res) => {
  let totalUsuarios = 0;
  let dbConectado = false;

  try {
    const conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [rows] = await conn.query('SELECT COUNT(*) AS total FROM usuarios');
    totalUsuarios = rows[0].total || 0;
    dbConectado = true;
    await conn.end();
  } catch (err) {
    console.error('[ERRO MySQL na rota /]:', err.message);
  }

  res.render('index', {
    dbConectado,
    totalUsuarios
  });
});

// Rota de Autenticação (Login via MySQL)
app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ sucesso: false, mensagem: 'Informe usuário e senha.' });
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [rows] = await conn.execute(
      'SELECT id, usuario, departamento, imagem, senha_hash FROM usuarios WHERE usuario = ? LIMIT 1',
      [usuario.trim()]
    );

    const user = rows[0];
    if (!user || !(await verifyPassword(senha.toString().trim(), user.senha_hash))) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Falha na autenticação! Usuário ou senha incorretos.'
      });
    }

    req.session.usuario = {
      id: user.id,
      usuario: user.usuario,
      departamento: user.departamento,
      imagem: user.imagem
    };

    return res.json({
      sucesso: true,
      mensagem: `Bem-vindo, ${user.usuario}! Sistema liberado.`,
      usuario: req.session.usuario
    });
  } catch (err) {
    console.error('[ERRO MySQL na autenticação]:', err.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Não foi possível autenticar neste momento.'
    });
  } finally {
    if (conn) await conn.end();
  }
});

// Rota para importar usuários de um arquivo JSON selecionado pelo usuário
app.post('/importar-usuarios', async (req, res) => {
  let conn;
  try {
    let { usuarios } = req.body;
    if (!usuarios) {
      return res.status(400).json({ sucesso: false, mensagem: 'Nenhum dado JSON enviado.' });
    }
    if (!Array.isArray(usuarios)) {
      usuarios = [usuarios];
    }

    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [existentes] = await conn.query('SELECT COUNT(*) AS total FROM usuarios');
    if (Number(existentes[0].total) > 0) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'A importação só é permitida quando não há usuários cadastrados.'
      });
    }

    const importados = await importarListaUsuariosParaMySQL(conn, usuarios);
    const [contagem] = await conn.query('SELECT COUNT(*) AS total FROM usuarios');

    return res.json({
      sucesso: true,
      mensagem: `${importados} usuário(s) importado(s) e sincronizado(s) com o MySQL!`,
      totalUsuarios: contagem[0].total
    });
  } catch (err) {
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao importar JSON para o MySQL: ' + err.message
    });
  } finally {
    if (conn) await conn.end();
  }
});

// Rota de Logout (substitui a limpeza manual de PDV_HABILITADO)
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ sucesso: true });
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Exemplo de rota protegida pronta para as próximas telas
app.get('/sistema', exigirAutenticacao, (req, res) => {
  res.redirect('/');
});

function textoFormulario(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function imagemFormulario(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const imagem = valor.trim();
  return /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(imagem) ? imagem : false;
}

function idUsuarioValido(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function escaparCampoCSV(valor) {
  let texto = valor == null ? '' : String(valor);
  if (/^[\t\r\n ]*[=+\-@]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

async function consultarUsuarios(conn, busca) {
  const filtro = `%${busca}%`;
  const [usuarios] = await conn.execute(
    `SELECT id, usuario, departamento
     FROM usuarios
     WHERE usuario LIKE ? OR departamento LIKE ?
     ORDER BY id DESC`,
    [filtro, filtro]
  );
  return usuarios;
}

app.get('/usuarios', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const usuarios = await consultarUsuarios(conn, busca);
    const mensagem = typeof req.query.mensagem === 'string' ? req.query.mensagem : '';
    res.render('usuarios-index', { usuarios, busca, mensagem });
  } catch (err) {
    console.error('[ERRO MySQL na rota /usuarios]:', err.message);
    res.status(500).send('Não foi possível carregar os usuários.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/usuarios/exportar.csv', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const usuarios = await consultarUsuarios(conn, busca);
    const linhas = [
      ['ID', 'Usuário', 'Departamento'].map(escaparCampoCSV).join(';'),
      ...usuarios.map(item => [item.id, item.usuario, item.departamento].map(escaparCampoCSV).join(';'))
    ];
    const data = new Date().toISOString().slice(0, 10);
    res.attachment(`usuarios_${data}.csv`);
    res.type('text/csv; charset=utf-8').send(`\uFEFF${linhas.join('\r\n')}`);
  } catch (err) {
    console.error('[ERRO MySQL ao exportar usuários para CSV]:', err.message);
    res.status(500).send('Não foi possível exportar os usuários.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/usuarios/novo', exigirAutenticacao, (req, res) => {
  res.render('usuarios-form', {
    usuario: { id: null, usuario: '', departamento: '', imagem: null },
    busca: '',
    mensagem: ''
  });
});

app.get('/usuarios/:id/editar', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de usuário inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [usuarios] = await conn.execute(
      'SELECT id, usuario, departamento, imagem FROM usuarios WHERE id = ? LIMIT 1',
      [id]
    );
    if (usuarios.length === 0) return res.status(404).send('Usuário não encontrado.');
    res.render('usuarios-form', { usuario: usuarios[0], busca: '', mensagem: '' });
  } catch (err) {
    console.error('[ERRO MySQL ao carregar edição de usuário]:', err.message);
    res.status(500).send('Não foi possível carregar o usuário.');
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/usuarios', exigirAutenticacao, async (req, res) => {
  const dados = {
    id: null,
    usuario: textoFormulario(req.body.usuario),
    senha: textoFormulario(req.body.senha),
    departamento: textoFormulario(req.body.departamento),
    imagem: imagemFormulario(req.body.imagem)
  };
  const mensagem = !dados.usuario ? 'Informe o usuário.'
    : !dados.senha ? 'Informe a senha.'
      : !dados.departamento ? 'Informe o departamento.'
        : dados.imagem === false ? 'A imagem enviada não é válida.' : '';

  if (mensagem) {
    if (dados.imagem === false) dados.imagem = null;
    return res.status(400).render('usuarios-form', { usuario: { ...dados, senha: '' }, busca: '', mensagem });
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    await conn.execute(
      'INSERT INTO usuarios (usuario, senha_hash, departamento, imagem) VALUES (?, ?, ?, ?)',
      [dados.usuario, await hashPassword(dados.senha), dados.departamento, dados.imagem]
    );
    res.redirect('/usuarios?mensagem=Usu%C3%A1rio%20cadastrado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).render('usuarios-form', {
        usuario: { ...dados, senha: '' },
        busca: '',
        mensagem: 'Já existe um usuário com esse nome.'
      });
    }
    console.error('[ERRO MySQL ao criar usuário]:', err.message);
    res.status(500).render('usuarios-form', {
      usuario: { ...dados, senha: '' },
      busca: '',
      mensagem: 'Não foi possível salvar o usuário.'
    });
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/usuarios/:id', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de usuário inválido.');

  const dados = {
    id,
    usuario: textoFormulario(req.body.usuario),
    senha: textoFormulario(req.body.senha),
    departamento: textoFormulario(req.body.departamento),
    imagem: imagemFormulario(req.body.imagem)
  };
  const mensagem = !dados.usuario ? 'Informe o usuário.'
    : !dados.departamento ? 'Informe o departamento.'
      : dados.imagem === false ? 'A imagem enviada não é válida.' : '';

  if (mensagem) {
    if (dados.imagem === false) dados.imagem = null;
    return res.status(400).render('usuarios-form', { usuario: { ...dados, senha: '' }, busca: '', mensagem });
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [existentes] = await conn.execute('SELECT id FROM usuarios WHERE id = ? LIMIT 1', [id]);
    if (existentes.length === 0) return res.status(404).send('Usuário não encontrado.');

    if (dados.senha) {
      await conn.execute(
        'UPDATE usuarios SET usuario = ?, senha_hash = ?, departamento = ?, imagem = ? WHERE id = ?',
        [dados.usuario, await hashPassword(dados.senha), dados.departamento, dados.imagem, id]
      );
    } else {
      await conn.execute(
        'UPDATE usuarios SET usuario = ?, departamento = ?, imagem = ? WHERE id = ?',
        [dados.usuario, dados.departamento, dados.imagem, id]
      );
    }
    res.redirect('/usuarios?mensagem=Usu%C3%A1rio%20atualizado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).render('usuarios-form', {
        usuario: { ...dados, senha: '' },
        busca: '',
        mensagem: 'Já existe um usuário com esse nome.'
      });
    }
    console.error('[ERRO MySQL ao atualizar usuário]:', err.message);
    res.status(500).render('usuarios-form', {
      usuario: { ...dados, senha: '' },
      busca: '',
      mensagem: 'Não foi possível atualizar o usuário.'
    });
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/usuarios/:id/excluir', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de usuário inválido.');
  if (Number(req.session.usuario.id) === id) {
    return res.status(400).send('Não é possível excluir o usuário da sessão atual.');
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [resultado] = await conn.execute('DELETE FROM usuarios WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).send('Usuário não encontrado.');
    res.redirect('/usuarios?mensagem=Usu%C3%A1rio%20exclu%C3%ADdo%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao excluir usuário]:', err.message);
    res.status(500).send('Não foi possível excluir o usuário.');
  } finally {
    if (conn) await conn.end();
  }
});

// Inicializa o banco e sobe o servidor Express
inicializarBanco()
  .then(() => {
    app.listen(PORT, () => {
      console.log('========================================================');
      console.log(`  FullTime Technology rodando em: http://localhost:${PORT}`);
      console.log(`  Banco MySQL "${DB_NAME}" conectado e pronto!`);
      console.log('========================================================');
    });
  })
  .catch((err) => {
    console.error('[ERRO CRÍTICO] Falha ao iniciar o banco MySQL:', err.message);
    console.error('Verifique se a janela "MySQL Server Portatil" está aberta.');
  });
