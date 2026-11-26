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
const {
  normalizarClientePF,
  formatarCPF,
  dataHoraParaMySQL,
  dataHoraDoMySQL,
  formatarDataBR
} = require('./clientes-pf-utils');
const {
  normalizarClientePJ,
  normalizarCNPJ,
  validarCNPJ,
  formatarCNPJ,
  dataHoraParaMySQL: dataHoraPJParaMySQL,
  dataHoraDoMySQL: dataHoraPJDoMySQL,
  formatarDataBR: formatarDataBRPJ
} = require('./clientes-pj-utils');
const { CREATE_TABLE_CLIENTES_PJ_SQL } = require('./clientes-pj-schema');
const {
  normalizarFornecedor,
  normalizarCNPJ: normalizarCNPJFornecedor,
  validarCNPJ: validarCNPJFornecedor,
  formatarCNPJ: formatarCNPJFornecedor,
  dataHoraParaMySQL: dataHoraFornecedorParaMySQL,
  dataHoraDoMySQL: dataHoraFornecedorDoMySQL,
  formatarDataBR: formatarDataBRFornecedor
} = require('./fornecedores-utils');
const { CREATE_TABLE_FORNECEDORES_SQL } = require('./fornecedores-schema');
const {
  normalizarProduto,
  dataHoraParaMySQL: dataHoraProdutoParaMySQL,
  dataHoraDoMySQL: dataHoraProdutoDoMySQL,
  formatarDataBR: formatarDataBRProduto,
  formatarMoeda: formatarMoedaProduto
} = require('./produtos-utils');
const { CREATE_TABLE_PRODUTOS_SQL } = require('./produtos-schema');
const {
  normalizarOrcamento,
  dataHoraParaMySQL: dataHoraOrcamentoParaMySQL,
  dataHoraDoMySQL: dataHoraOrcamentoDoMySQL
} = require('./orcamentos-utils');
const {
  CREATE_TABLE_ORCAMENTOS_SQL,
  CREATE_TABLE_ORCAMENTO_ITENS_SQL
} = require('./orcamentos-schema');
const {
  STATUS_ORDENS_SERVICO,
  PRIORIDADES_ORDENS_SERVICO,
  normalizarOrdemServico,
  dataHoraParaMySQL: dataHoraOrdemServicoParaMySQL
} = require('./ordens-servico-utils');
const { CREATE_TABLE_ORDENS_SERVICO_SQL } = require('./ordens-servico-schema');
const {
  CREATE_TABLE_EDICOES_SQL,
  CREATE_TABLE_MATERIAS_SQL
} = require('./news-schema');
const { registerNewsRoutes } = require('./news-routes');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`PORT inválida: ${process.env.PORT}`);
}

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
app.set('trust proxy', 'loopback');

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

registerNewsRoutes(app, { mysql, dbConfig, DB_NAME, exigirAutenticacao });

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

async function inserirClientePF(conn, cliente) {
  const colunas = [
    'nome_completo', 'cpf', 'data_nascimento', 'rg', 'sexo', 'telefone', 'celular',
    'email', 'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado', 'observacoes',
    'data_cadastro', 'data_alteracao'
  ];
  const valores = [
    cliente.nomeCompleto, cliente.cpf, cliente.dataNascimento, cliente.rg || null,
    cliente.sexo || null, cliente.telefone || null, cliente.celular || null,
    cliente.email || null, cliente.cep || null, cliente.rua || null,
    cliente.numero || null, cliente.bairro || null, cliente.cidade || null,
    cliente.estado || null, cliente.observacoes || null,
    dataHoraParaMySQL(cliente.dataCadastro), dataHoraParaMySQL(cliente.dataAlteracao)
  ];

  const placeholders = colunas.map(() => '?').join(', ');
  await conn.execute(
    `INSERT INTO clientes_pf (${colunas.join(', ')}) VALUES (${placeholders})`,
    valores
  );
}

async function inserirClientePJ(conn, cliente) {
  const colunas = [
    'razao_social', 'cnpj', 'nome_fantasia', 'ie', 'data_abertura', 'porte',
    'regime_tributario', 'nome_responsavel', 'cargo', 'telefone', 'celular',
    'email', 'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado', 'observacoes',
    'data_cadastro', 'data_alteracao'
  ];
  const valores = [
    cliente.razaoSocial, cliente.cnpj, cliente.nomeFantasia || null,
    cliente.ie || null, cliente.dataAbertura, cliente.porte || null,
    cliente.regimeTributario || null, cliente.nomeResponsavel || null,
    cliente.cargo || null, cliente.telefone || null, cliente.celular || null,
    cliente.email || null, cliente.cep || null, cliente.rua || null,
    cliente.numero || null, cliente.bairro || null, cliente.cidade || null,
    cliente.estado || null, cliente.observacoes || null,
    dataHoraPJParaMySQL(cliente.dataCadastro), dataHoraPJParaMySQL(cliente.dataAlteracao)
  ];

  const placeholders = colunas.map(() => '?').join(', ');
  await conn.execute(
    `INSERT INTO clientes_pj (${colunas.join(', ')}) VALUES (${placeholders})`,
    valores
  );
}

async function inserirFornecedor(conn, fornecedor) {
  const colunas = [
    'razao_social', 'cnpj', 'nome_fantasia', 'ie', 'data_abertura', 'porte',
    'regime_tributario', 'nome_responsavel', 'cargo', 'telefone', 'celular',
    'email', 'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado', 'observacoes',
    'data_cadastro', 'data_alteracao'
  ];
  const valores = [
    fornecedor.razaoSocial, fornecedor.cnpj, fornecedor.nomeFantasia || null,
    fornecedor.ie || null, fornecedor.dataAbertura, fornecedor.porte || null,
    fornecedor.regimeTributario || null, fornecedor.nomeResponsavel || null,
    fornecedor.cargo || null, fornecedor.telefone || null, fornecedor.celular || null,
    fornecedor.email || null, fornecedor.cep || null, fornecedor.rua || null,
    fornecedor.numero || null, fornecedor.bairro || null, fornecedor.cidade || null,
    fornecedor.estado || null, fornecedor.observacoes || null,
    dataHoraFornecedorParaMySQL(fornecedor.dataCadastro),
    dataHoraFornecedorParaMySQL(fornecedor.dataAlteracao)
  ];

  const placeholders = colunas.map(() => '?').join(', ');
  await conn.execute(
    `INSERT INTO fornecedores (${colunas.join(', ')}) VALUES (${placeholders})`,
    valores
  );
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
    await conn.query(`
      CREATE TABLE IF NOT EXISTS clientes_pf (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nome_completo VARCHAR(200) NOT NULL,
        cpf CHAR(11) NOT NULL UNIQUE,
        data_nascimento DATE NULL,
        rg VARCHAR(30) NULL,
        sexo VARCHAR(20) NULL,
        telefone VARCHAR(30) NULL,
        celular VARCHAR(30) NULL,
        email VARCHAR(254) NULL,
        cep VARCHAR(9) NULL,
        rua VARCHAR(255) NULL,
        numero VARCHAR(40) NULL,
        bairro VARCHAR(150) NULL,
        cidade VARCHAR(150) NULL,
        estado CHAR(2) NULL,
        observacoes TEXT NULL,
        data_cadastro DATETIME(3) NOT NULL,
        data_alteracao DATETIME(3) NOT NULL,
        INDEX idx_clientes_pf_nome (nome_completo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await conn.query(CREATE_TABLE_CLIENTES_PJ_SQL);
    await conn.query(CREATE_TABLE_FORNECEDORES_SQL);
    await conn.query(CREATE_TABLE_PRODUTOS_SQL);
    await conn.query(CREATE_TABLE_ORCAMENTOS_SQL);
    await conn.query(CREATE_TABLE_ORCAMENTO_ITENS_SQL);
    await conn.query(CREATE_TABLE_ORDENS_SERVICO_SQL);
    await conn.query(CREATE_TABLE_EDICOES_SQL);
    await conn.query(CREATE_TABLE_MATERIAS_SQL);
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

app.get('/index-sistema', exigirAutenticacao, (req, res) => {
  res.render('index-sistema');
});

app.get('/jsonreader5', exigirAutenticacao, (req, res) => {
  res.render('jsonreader5');
});

app.get('/remover-fundo', exigirAutenticacao, (req, res) => {
  res.render('remover-fundo');
});

app.get('/video-chat', exigirAutenticacao, (req, res) => {
  res.render('webRTCvideoChat');
});

app.get('/apresentador', exigirAutenticacao, (req, res) => {
  res.render('apresentador');
});

app.get('/conversor-webm-mp4', exigirAutenticacao, (req, res) => {
  res.render('conversorWebm-MP4');
});

app.get('/sistema', exigirAutenticacao, (req, res) => {
  res.redirect('/index-sistema');
});

app.get('/pdv', exigirAutenticacao, (req, res) => {
  res.render('frenteDeCaixa');
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

function clientePFParaView(registro) {
  return {
    id: registro.id,
    nomeCompleto: registro.nome_completo,
    cpf: formatarCPF(registro.cpf),
    dataNascimento: registro.data_nascimento ? String(registro.data_nascimento).slice(0, 10) : '',
    rg: registro.rg || '',
    sexo: registro.sexo || '',
    telefone: registro.telefone || '',
    celular: registro.celular || '',
    email: registro.email || '',
    cep: registro.cep || '',
    rua: registro.rua || '',
    numero: registro.numero || '',
    bairro: registro.bairro || '',
    cidade: registro.cidade || '',
    estado: registro.estado || '',
    observacoes: registro.observacoes || '',
    dataCadastro: dataHoraDoMySQL(registro.data_cadastro),
    dataAlteracao: dataHoraDoMySQL(registro.data_alteracao)
  };
}

async function consultarClientesPF(conn, busca) {
  const filtro = `%${busca}%`;
  const cpfBusca = busca.replace(/\D/g, '') || busca;
  const [registros] = await conn.execute(
    `SELECT id, nome_completo, cpf, data_nascimento, rg, sexo, telefone, celular,
            email, cep, rua, numero, bairro, cidade, estado, observacoes,
            data_cadastro, data_alteracao
     FROM clientes_pf
     WHERE nome_completo LIKE ?
        OR cpf LIKE ?
        OR DATE_FORMAT(data_nascimento, '%d/%m/%Y') LIKE ?
        OR rua LIKE ?
     ORDER BY id DESC`,
    [filtro, `%${cpfBusca}%`, filtro, filtro]
  );
  return registros.map(clientePFParaView);
}

function renderizarFormularioClientePF(res, cliente, mensagem, status = 200) {
  return res.status(status).render('cadClientesPF', {
    cliente: { ...cliente, cpf: formatarCPF(cliente.cpf) },
    busca: '',
    mensagem,
    estados: ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
  });
}

app.get('/clientes-pf', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const clientes = await consultarClientesPF(conn, busca);
    const mensagem = typeof req.query.mensagem === 'string' ? req.query.mensagem : '';
    res.render('tabClientesPF', { clientes, busca, mensagem, formatarDataBR });
  } catch (err) {
    console.error('[ERRO MySQL na rota /clientes-pf]:', err.message);
    res.status(500).send('Não foi possível carregar os clientes pessoa física.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/clientes-pf/exportar.csv', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const clientes = await consultarClientesPF(conn, '');
    const cabecalho = [
      'ID', 'Nome', 'CPF', 'Data Nasc.', 'RG', 'Sexo', 'Telefone', 'Celular',
      'Email', 'CEP', 'Rua', 'Número', 'Bairro', 'Cidade', 'Estado',
      'Observações', 'Cadastro', 'Alteração'
    ];
    const linhas = [
      cabecalho.map(escaparCampoCSV).join(';'),
      ...clientes.map(cliente => [
        cliente.id, cliente.nomeCompleto, cliente.cpf, cliente.dataNascimento,
        cliente.rg, cliente.sexo, cliente.telefone, cliente.celular, cliente.email,
        cliente.cep, cliente.rua, cliente.numero, cliente.bairro, cliente.cidade,
        cliente.estado, cliente.observacoes, cliente.dataCadastro, cliente.dataAlteracao
      ].map(escaparCampoCSV).join(';'))
    ];
    const data = new Date().toISOString().slice(0, 10);
    res.attachment(`clientes_pf_${data}.csv`);
    res.type('text/csv; charset=utf-8').send(`\uFEFF${linhas.join('\r\n')}`);
  } catch (err) {
    console.error('[ERRO MySQL ao exportar Clientes PF]:', err.message);
    res.status(500).send('Não foi possível exportar os clientes pessoa física.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/clientes-pf/novo', exigirAutenticacao, (req, res) => {
  renderizarFormularioClientePF(res, {
    id: null, nomeCompleto: '', cpf: '', dataNascimento: '', rg: '', sexo: '',
    telefone: '', celular: '', email: '', cep: '', rua: '', numero: '', bairro: '',
    cidade: '', estado: '', observacoes: ''
  }, '');
});

app.get('/clientes-pf/:id/editar', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de cliente inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const [registros] = await conn.execute(
      'SELECT * FROM clientes_pf WHERE id = ? LIMIT 1',
      [id]
    );
    if (registros.length === 0) return res.status(404).send('Cliente não encontrado.');
    renderizarFormularioClientePF(res, clientePFParaView(registros[0]), '');
  } catch (err) {
    console.error('[ERRO MySQL ao carregar edição de Cliente PF]:', err.message);
    res.status(500).send('Não foi possível carregar o cliente.');
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/clientes-pf', exigirAutenticacao, async (req, res) => {
  let cliente;
  try {
    cliente = normalizarClientePF(req.body);
  } catch (err) {
    return renderizarFormularioClientePF(res, req.body || {}, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    await inserirClientePF(conn, cliente);
    return res.redirect('/clientes-pf?mensagem=Cliente%20cadastrado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderizarFormularioClientePF(res, cliente, 'Já existe um cliente cadastrado com esse CPF.', 409);
    }
    console.error('[ERRO MySQL ao criar Cliente PF]:', err.message);
    return renderizarFormularioClientePF(res, cliente, 'Não foi possível salvar o cliente.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/clientes-pf/:id', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de cliente inválido.');

  let cliente;
  try {
    cliente = normalizarClientePF(req.body);
  } catch (err) {
    return renderizarFormularioClientePF(res, { ...(req.body || {}), id }, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [existentes] = await conn.execute('SELECT id FROM clientes_pf WHERE id = ? LIMIT 1', [id]);
    if (existentes.length === 0) return res.status(404).send('Cliente não encontrado.');

    await conn.execute(
      `UPDATE clientes_pf
       SET nome_completo = ?, cpf = ?, data_nascimento = ?, rg = ?, sexo = ?,
           telefone = ?, celular = ?, email = ?, cep = ?, rua = ?, numero = ?,
           bairro = ?, cidade = ?, estado = ?, observacoes = ?, data_alteracao = ?
       WHERE id = ?`,
      [
        cliente.nomeCompleto, cliente.cpf, cliente.dataNascimento, cliente.rg || null,
        cliente.sexo || null, cliente.telefone || null, cliente.celular || null,
        cliente.email || null, cliente.cep || null, cliente.rua || null,
        cliente.numero || null, cliente.bairro || null, cliente.cidade || null,
        cliente.estado || null, cliente.observacoes || null,
        dataHoraParaMySQL(cliente.dataAlteracao), id
      ]
    );
    return res.redirect('/clientes-pf?mensagem=Cliente%20atualizado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderizarFormularioClientePF(res, { ...cliente, id }, 'Já existe outro cliente cadastrado com esse CPF.', 409);
    }
    console.error('[ERRO MySQL ao atualizar Cliente PF]:', err.message);
    return renderizarFormularioClientePF(res, { ...cliente, id }, 'Não foi possível atualizar o cliente.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/clientes-pf/:id/excluir', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de cliente inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [resultado] = await conn.execute('DELETE FROM clientes_pf WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).send('Cliente não encontrado.');
    return res.redirect('/clientes-pf?mensagem=Cliente%20exclu%C3%ADdo%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao excluir Cliente PF]:', err.message);
    return res.status(500).send('Não foi possível excluir o cliente.');
  } finally {
    if (conn) await conn.end();
  }
});

function clientePJParaView(registro) {
  return {
    id: registro.id,
    razaoSocial: registro.razao_social,
    cnpj: formatarCNPJ(registro.cnpj),
    cnpjValido: validarCNPJ(registro.cnpj),
    nomeFantasia: registro.nome_fantasia || '',
    ie: registro.ie || '',
    dataAbertura: registro.data_abertura ? String(registro.data_abertura).slice(0, 10) : '',
    porte: registro.porte || '',
    regimeTributario: registro.regime_tributario || '',
    nomeResponsavel: registro.nome_responsavel || '',
    cargo: registro.cargo || '',
    telefone: registro.telefone || '',
    celular: registro.celular || '',
    email: registro.email || '',
    cep: registro.cep || '',
    rua: registro.rua || '',
    numero: registro.numero || '',
    bairro: registro.bairro || '',
    cidade: registro.cidade || '',
    estado: registro.estado || '',
    observacoes: registro.observacoes || '',
    dataCadastro: dataHoraPJDoMySQL(registro.data_cadastro),
    dataAlteracao: dataHoraPJDoMySQL(registro.data_alteracao)
  };
}

async function consultarClientesPJ(conn, busca) {
  const filtro = `%${busca}%`;
  const cnpjBusca = normalizarCNPJ(busca) || busca;
  const [registros] = await conn.execute(
    `SELECT id, razao_social, cnpj, nome_fantasia, ie, data_abertura, porte,
            regime_tributario, nome_responsavel, cargo, telefone, celular, email,
            cep, rua, numero, bairro, cidade, estado, observacoes,
            data_cadastro, data_alteracao
     FROM clientes_pj
     WHERE razao_social LIKE ?
        OR cnpj LIKE ?
        OR nome_fantasia LIKE ?
        OR email LIKE ?
        OR rua LIKE ?
        OR DATE_FORMAT(data_abertura, '%d/%m/%Y') LIKE ?
     ORDER BY id DESC`,
    [filtro, `%${cnpjBusca}%`, filtro, filtro, filtro, filtro]
  );
  return registros.map(clientePJParaView);
}

function renderizarFormularioClientePJ(res, cliente, mensagem, status = 200) {
  const cnpj = typeof cliente.cnpj === 'string' ? cliente.cnpj : '';
  return res.status(status).render('cadClientesPJ', {
    cliente: {
      ...cliente,
      cnpjValido: typeof cliente.cnpjValido === 'boolean' ? cliente.cnpjValido : validarCNPJ(cnpj),
      cnpj: formatarCNPJ(cnpj)
    },
    busca: '',
    mensagem,
    estados: ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
  });
}

app.get('/clientes-pj', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const clientes = await consultarClientesPJ(conn, busca);
    const mensagem = typeof req.query.mensagem === 'string' ? req.query.mensagem : '';
    res.render('tabClientesPJ', { clientes, busca, mensagem, formatarDataBR: formatarDataBRPJ });
  } catch (err) {
    console.error('[ERRO MySQL na rota /clientes-pj]:', err.message);
    res.status(500).send('Não foi possível carregar os clientes pessoa jurídica.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/clientes-pj/exportar.csv', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const clientes = await consultarClientesPJ(conn, '');
    const cabecalho = [
      'ID', 'Razão Social', 'CNPJ', 'Nome Fantasia', 'Inscrição Estadual',
      'Data de Abertura', 'Porte', 'Regime Tributário', 'Responsável', 'Cargo',
      'Telefone', 'Celular', 'Email', 'CEP', 'Rua', 'Número', 'Bairro', 'Cidade',
      'Estado', 'Observações', 'Cadastro', 'Alteração'
    ];
    const linhas = [
      cabecalho.map(escaparCampoCSV).join(';'),
      ...clientes.map(cliente => [
        cliente.id, cliente.razaoSocial, cliente.cnpj, cliente.nomeFantasia, cliente.ie,
        cliente.dataAbertura, cliente.porte, cliente.regimeTributario,
        cliente.nomeResponsavel, cliente.cargo, cliente.telefone, cliente.celular,
        cliente.email, cliente.cep, cliente.rua, cliente.numero, cliente.bairro,
        cliente.cidade, cliente.estado, cliente.observacoes,
        cliente.dataCadastro, cliente.dataAlteracao
      ].map(escaparCampoCSV).join(';'))
    ];
    const data = new Date().toISOString().slice(0, 10);
    res.attachment(`clientes_pj_${data}.csv`);
    res.type('text/csv; charset=utf-8').send(`\uFEFF${linhas.join('\r\n')}`);
  } catch (err) {
    console.error('[ERRO MySQL ao exportar Clientes PJ]:', err.message);
    res.status(500).send('Não foi possível exportar os clientes pessoa jurídica.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/clientes-pj/novo', exigirAutenticacao, (req, res) => {
  renderizarFormularioClientePJ(res, {
    id: null, razaoSocial: '', cnpj: '', cnpjValido: true, nomeFantasia: '',
    ie: '', dataAbertura: '', porte: '', regimeTributario: '',
    nomeResponsavel: '', cargo: '', telefone: '', celular: '', email: '',
    cep: '', rua: '', numero: '', bairro: '', cidade: '', estado: '',
    observacoes: ''
  }, '');
});

app.get('/clientes-pj/:id/editar', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de cliente inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const [registros] = await conn.execute(
      'SELECT * FROM clientes_pj WHERE id = ? LIMIT 1',
      [id]
    );
    if (registros.length === 0) return res.status(404).send('Cliente não encontrado.');
    renderizarFormularioClientePJ(res, clientePJParaView(registros[0]), '');
  } catch (err) {
    console.error('[ERRO MySQL ao carregar edição de Cliente PJ]:', err.message);
    res.status(500).send('Não foi possível carregar o cliente.');
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/clientes-pj', exigirAutenticacao, async (req, res) => {
  let cliente;
  try {
    cliente = normalizarClientePJ(req.body);
  } catch (err) {
    return renderizarFormularioClientePJ(res, req.body || {}, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    await inserirClientePJ(conn, cliente);
    return res.redirect('/clientes-pj?mensagem=Cliente%20cadastrado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderizarFormularioClientePJ(res, cliente, 'Já existe um cliente cadastrado com esse CNPJ.', 409);
    }
    console.error('[ERRO MySQL ao criar Cliente PJ]:', err.message);
    return renderizarFormularioClientePJ(res, cliente, 'Não foi possível salvar o cliente.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/clientes-pj/:id', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de cliente inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [existentes] = await conn.execute(
      'SELECT id, cnpj FROM clientes_pj WHERE id = ? LIMIT 1',
      [id]
    );
    if (existentes.length === 0) return res.status(404).send('Cliente não encontrado.');

    let cliente;
    try {
      cliente = normalizarClientePJ(req.body, { cnpjLegadoPermitido: existentes[0].cnpj });
    } catch (err) {
      return renderizarFormularioClientePJ(res, { ...(req.body || {}), id }, err.message, 400);
    }

    await conn.execute(
      `UPDATE clientes_pj
       SET razao_social = ?, cnpj = ?, nome_fantasia = ?, ie = ?, data_abertura = ?,
           porte = ?, regime_tributario = ?, nome_responsavel = ?, cargo = ?,
           telefone = ?, celular = ?, email = ?, cep = ?, rua = ?, numero = ?,
           bairro = ?, cidade = ?, estado = ?, observacoes = ?, data_alteracao = ?
       WHERE id = ?`,
      [
        cliente.razaoSocial, cliente.cnpj, cliente.nomeFantasia || null,
        cliente.ie || null, cliente.dataAbertura, cliente.porte || null,
        cliente.regimeTributario || null, cliente.nomeResponsavel || null,
        cliente.cargo || null, cliente.telefone || null, cliente.celular || null,
        cliente.email || null, cliente.cep || null, cliente.rua || null,
        cliente.numero || null, cliente.bairro || null, cliente.cidade || null,
        cliente.estado || null, cliente.observacoes || null,
        dataHoraPJParaMySQL(new Date().toISOString()), id
      ]
    );
    return res.redirect('/clientes-pj?mensagem=Cliente%20atualizado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderizarFormularioClientePJ(res, { ...(req.body || {}), id }, 'Já existe outro cliente cadastrado com esse CNPJ.', 409);
    }
    console.error('[ERRO MySQL ao atualizar Cliente PJ]:', err.message);
    return renderizarFormularioClientePJ(res, { ...(req.body || {}), id }, 'Não foi possível atualizar o cliente.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/clientes-pj/:id/excluir', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de cliente inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [resultado] = await conn.execute('DELETE FROM clientes_pj WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).send('Cliente não encontrado.');
    return res.redirect('/clientes-pj?mensagem=Cliente%20exclu%C3%ADdo%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao excluir Cliente PJ]:', err.message);
    return res.status(500).send('Não foi possível excluir o cliente.');
  } finally {
    if (conn) await conn.end();
  }
});

const COLUNAS_PRODUTO_SEM_IMAGEM = `
  id, codigo, codigo_barras, sku, nome, marca, categoria, unidade, ncm, cest,
  preco_custo, preco_venda, estoque, estoque_minimo, status, descricao,
  imagem_nome, local_imagem, nome_arquivo_imagem, data_cadastro, data_alteracao
`;

function produtoParaView(registro) {
  const nomeArquivoImagem = registro.nome_arquivo_imagem || '';
  const imagemBase64 = registro.imagem_base64 || '';
  const caminhoImagem = /^(https?:|data:|blob:|\/)/i.test(nomeArquivoImagem)
    ? nomeArquivoImagem
    : nomeArquivoImagem
      ? `/images/Produtos/${encodeURIComponent(path.basename(nomeArquivoImagem.replace(/\\/g, '/')))}`
      : '';

  return {
    id: registro.id,
    codigo: registro.codigo || '',
    codigoBarras: registro.codigo_barras || '',
    sku: registro.sku || '',
    nome: registro.nome || '',
    marca: registro.marca || '',
    categoria: registro.categoria || '',
    unidade: registro.unidade || 'UN',
    ncm: registro.ncm || '',
    cest: registro.cest || '',
    precoCusto: registro.preco_custo,
    precoVenda: registro.preco_venda,
    estoque: registro.estoque,
    estoqueMinimo: registro.estoque_minimo,
    status: registro.status || 'Ativo',
    descricao: registro.descricao || '',
    imagemBase64,
    imagemNome: registro.imagem_nome || '',
    local: registro.local_imagem || '/images/Produtos/',
    nomeArquivoImagem,
    imagemSrc: imagemBase64 || caminhoImagem,
    dataCadastro: dataHoraProdutoDoMySQL(registro.data_cadastro),
    dataAlteracao: dataHoraProdutoDoMySQL(registro.data_alteracao)
  };
}

async function consultarProdutos(conn, busca = '', incluirImagem = false) {
  const colunas = incluirImagem
    ? '*'
    : COLUNAS_PRODUTO_SEM_IMAGEM;
  const filtro = `%${busca}%`;
  const [registros] = await conn.execute(
    `SELECT ${colunas}
     FROM produtos
     WHERE ? = ''
        OR nome LIKE ?
        OR codigo LIKE ?
        OR codigo_barras LIKE ?
        OR sku LIKE ?
        OR marca LIKE ?
        OR categoria LIKE ?
        OR CAST(estoque AS CHAR) LIKE ?
     ORDER BY id DESC`,
    [busca, filtro, filtro, filtro, filtro, filtro, filtro, filtro]
  );
  return registros.map(produtoParaView);
}

async function contarProdutos(conn) {
  const [registros] = await conn.query('SELECT COUNT(*) AS total FROM produtos');
  return Number(registros[0].total) || 0;
}

function renderizarFormularioProduto(res, produto, mensagem, status = 200, totalProdutos = 0) {
  const formulario = {
    id: null, codigo: '', codigoBarras: '', sku: '', nome: '', marca: '',
    categoria: '', unidade: 'UN', ncm: '', cest: '', precoCusto: '',
    precoVenda: '', estoque: '', estoqueMinimo: '', status: 'Ativo',
    descricao: '', imagemBase64: '', imagemNome: '', local: '',
    nomeArquivoImagem: '', imagemSrc: '', ...(produto || {})
  };
  if (!formulario.imagemSrc) {
    const nomeArquivoImagem = formulario.nomeArquivoImagem || '';
    const caminhoImagem = /^(https?:|data:|blob:|\/)/i.test(nomeArquivoImagem)
      ? nomeArquivoImagem
      : nomeArquivoImagem
        ? `/images/Produtos/${encodeURIComponent(path.basename(nomeArquivoImagem.replace(/\\/g, '/')))}`
        : '';
    formulario.imagemSrc = formulario.imagemBase64 || caminhoImagem;
  }
  return res.status(status).render('cadProdutos', {
    produto: formulario,
    mensagem: mensagem || '',
    totalProdutos
  });
}

app.get('/produtos', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const produtos = await consultarProdutos(conn, busca);
    res.render('tabProdutos', {
      produtos,
      busca,
      mensagem: typeof req.query.mensagem === 'string' ? req.query.mensagem : '',
      formatarDataBR: formatarDataBRProduto,
      formatarMoeda: formatarMoedaProduto
    });
  } catch (err) {
    console.error('[ERRO MySQL na rota /produtos]:', err.message);
    res.status(500).send('Não foi possível carregar os produtos.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/produtos/exportar.csv', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const produtos = await consultarProdutos(conn);
    const cabecalho = [
      'ID', 'Nome', 'Código', 'Código de Barras', 'SKU', 'Marca', 'Categoria',
      'Unidade', 'NCM', 'CEST', 'Preço de Custo', 'Preço de Venda', 'Estoque',
      'Estoque Mínimo', 'Status', 'Descrição', 'Cadastro', 'Alteração'
    ];
    const linhas = [
      cabecalho.map(escaparCampoCSV).join(';'),
      ...produtos.map(produto => [
        produto.id, produto.nome, produto.codigo, produto.codigoBarras, produto.sku,
        produto.marca, produto.categoria, produto.unidade, produto.ncm, produto.cest,
        produto.precoCusto, produto.precoVenda, produto.estoque, produto.estoqueMinimo,
        produto.status, produto.descricao, produto.dataCadastro, produto.dataAlteracao
      ].map(escaparCampoCSV).join(';'))
    ];
    const data = new Date().toISOString().slice(0, 10);
    res.attachment(`produtos_${data}.csv`);
    res.type('text/csv; charset=utf-8').send(`\uFEFF${linhas.join('\r\n')}`);
  } catch (err) {
    console.error('[ERRO MySQL ao exportar produtos]:', err.message);
    res.status(500).send('Não foi possível exportar os produtos.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/produtos/novo', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const totalProdutos = await contarProdutos(conn);
    const produto = { codigoBarras: typeof req.query.codigoBarras === 'string' ? req.query.codigoBarras : '' };
    return renderizarFormularioProduto(res, produto, '', 200, totalProdutos);
  } catch (err) {
    console.error('[ERRO MySQL ao abrir cadastro de produto]:', err.message);
    return res.status(500).send('Não foi possível abrir o cadastro de produtos.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/produtos/:id/editar', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de produto inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const [registros] = await conn.execute('SELECT * FROM produtos WHERE id = ? LIMIT 1', [id]);
    if (registros.length === 0) return res.status(404).send('Produto não encontrado.');
    const totalProdutos = await contarProdutos(conn);
    return renderizarFormularioProduto(res, produtoParaView(registros[0]), '', 200, totalProdutos);
  } catch (err) {
    console.error('[ERRO MySQL ao carregar edição de produto]:', err.message);
    return res.status(500).send('Não foi possível carregar o produto.');
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/produtos', exigirAutenticacao, async (req, res) => {
  let produto;
  try {
    produto = normalizarProduto(req.body);
  } catch (err) {
    return renderizarFormularioProduto(res, req.body || {}, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    await conn.execute(
      `INSERT INTO produtos (
        codigo, codigo_barras, sku, nome, marca, categoria, unidade, ncm, cest,
        preco_custo, preco_venda, estoque, estoque_minimo, status, descricao,
        imagem_base64, imagem_nome, local_imagem, nome_arquivo_imagem,
        data_cadastro, data_alteracao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        produto.codigo, produto.codigoBarras || null, produto.sku || null, produto.nome,
        produto.marca || null, produto.categoria || null, produto.unidade,
        produto.ncm || null, produto.cest || null, produto.precoCusto, produto.precoVenda,
        produto.estoque, produto.estoqueMinimo, produto.status, produto.descricao || null,
        produto.imagemBase64 || null, produto.imagemNome || null, produto.local || null,
        produto.nomeArquivoImagem || null, dataHoraProdutoParaMySQL(produto.dataCadastro),
        dataHoraProdutoParaMySQL(new Date().toISOString())
      ]
    );
    return res.redirect('/produtos?mensagem=Produto%20cadastrado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderizarFormularioProduto(res, produto, 'Código, código de barras ou SKU já cadastrado.', 409);
    }
    console.error('[ERRO MySQL ao criar produto]:', err.message);
    return renderizarFormularioProduto(res, produto, 'Não foi possível salvar o produto.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/produtos/:id', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de produto inválido.');

  let produto;
  try {
    produto = normalizarProduto({ ...req.body, id });
  } catch (err) {
    return renderizarFormularioProduto(res, { ...(req.body || {}), id }, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [existentes] = await conn.execute('SELECT id FROM produtos WHERE id = ? LIMIT 1', [id]);
    if (existentes.length === 0) return res.status(404).send('Produto não encontrado.');

    await conn.execute(
      `UPDATE produtos
       SET codigo = ?, codigo_barras = ?, sku = ?, nome = ?, marca = ?, categoria = ?,
           unidade = ?, ncm = ?, cest = ?, preco_custo = ?, preco_venda = ?,
           estoque = ?, estoque_minimo = ?, status = ?, descricao = ?, imagem_base64 = ?,
           imagem_nome = ?, local_imagem = ?, nome_arquivo_imagem = ?, data_alteracao = ?
       WHERE id = ?`,
      [
        produto.codigo, produto.codigoBarras || null, produto.sku || null, produto.nome,
        produto.marca || null, produto.categoria || null, produto.unidade,
        produto.ncm || null, produto.cest || null, produto.precoCusto, produto.precoVenda,
        produto.estoque, produto.estoqueMinimo, produto.status, produto.descricao || null,
        produto.imagemBase64 || null, produto.imagemNome || null, produto.local || null,
        produto.nomeArquivoImagem || null, dataHoraProdutoParaMySQL(new Date().toISOString()), id
      ]
    );
    return res.redirect('/produtos?mensagem=Produto%20atualizado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderizarFormularioProduto(res, { ...produto, id }, 'Código, código de barras ou SKU já cadastrado em outro produto.', 409);
    }
    console.error('[ERRO MySQL ao atualizar produto]:', err.message);
    return renderizarFormularioProduto(res, { ...(req.body || {}), id }, 'Não foi possível atualizar o produto.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/produtos/:id/excluir', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de produto inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [resultado] = await conn.execute('DELETE FROM produtos WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).send('Produto não encontrado.');
    return res.redirect('/produtos?mensagem=Produto%20exclu%C3%ADdo%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao excluir produto]:', err.message);
    return res.status(500).send('Não foi possível excluir o produto.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/api/produtos', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const produtos = await consultarProdutos(conn, busca, true);
    res.json(produtos);
  } catch (err) {
    console.error('[ERRO MySQL na API /api/produtos]:', err.message);
    res.status(500).json({ erro: 'Não foi possível carregar os produtos.' });
  } finally {
    if (conn) await conn.end();
  }
});

function orcamentoParaView(registro) {
  return {
    id: registro.id,
    cliente: registro.cliente,
    valorTotal: Number(registro.valor_total),
    qtdItens: Number(registro.qtd_itens || 0),
    dataCadastro: dataHoraOrcamentoDoMySQL(registro.data_cadastro),
    dataAlteracao: dataHoraOrcamentoDoMySQL(registro.data_alteracao)
  };
}

async function consultarOrcamentos(conn, busca = '') {
  const filtro = `%${busca}%`;
  const [registros] = await conn.execute(
    `SELECT o.id, o.cliente, o.valor_total, o.data_cadastro, o.data_alteracao,
            COUNT(i.sequencia) AS qtd_itens
     FROM orcamentos o
     LEFT JOIN orcamento_itens i ON i.orcamento_id = o.id
     WHERE ? = '' OR o.cliente LIKE ? OR CAST(o.id AS CHAR) LIKE ?
     GROUP BY o.id, o.cliente, o.valor_total, o.data_cadastro, o.data_alteracao
     ORDER BY o.id DESC`,
    [busca, filtro, filtro]
  );
  return registros.map(orcamentoParaView);
}

async function consultarOrcamento(conn, id) {
  const [registros] = await conn.execute(
    `SELECT id, cliente, valor_total, data_cadastro, data_alteracao
     FROM orcamentos WHERE id = ? LIMIT 1`,
    [id]
  );
  if (registros.length === 0) return null;

  const registro = registros[0];
  const [itens] = await conn.execute(
    `SELECT descricao, quantidade, valor_unitario
     FROM orcamento_itens WHERE orcamento_id = ? ORDER BY sequencia`,
    [id]
  );
  return {
    id: registro.id,
    cliente: registro.cliente,
    valorTotal: Number(registro.valor_total),
    dataCadastro: dataHoraOrcamentoDoMySQL(registro.data_cadastro),
    dataAlteracao: dataHoraOrcamentoDoMySQL(registro.data_alteracao),
    itens: itens.map(item => ({
      descricao: item.descricao,
      quantidade: Number(item.quantidade),
      valorUnitario: Number(item.valor_unitario)
    }))
  };
}

async function contarOrcamentos(conn) {
  const [registros] = await conn.query('SELECT COUNT(*) AS total FROM orcamentos');
  return Number(registros[0].total) || 0;
}

function renderizarFormularioOrcamento(res, orcamento, mensagem, status = 200, totalOrcamentos = 0) {
  return res.status(status).render('cadOrcamentos', {
    orcamento: {
      id: null, cliente: '', itens: [], valorTotal: 0,
      dataCadastro: '', dataAlteracao: '', ...(orcamento || {})
    },
    mensagem: mensagem || '',
    totalOrcamentos
  });
}

function responderErroOrcamento(req, res, orcamento, mensagem, status, totalOrcamentos = 0) {
  if (req.accepts('json')) return res.status(status).json({ erro: mensagem });
  return renderizarFormularioOrcamento(res, orcamento, mensagem, status, totalOrcamentos);
}

async function inserirItensOrcamento(conn, id, itens) {
  for (let indice = 0; indice < itens.length; indice++) {
    const item = itens[indice];
    await conn.execute(
      `INSERT INTO orcamento_itens (
        orcamento_id, sequencia, descricao, quantidade, valor_unitario, subtotal
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, indice + 1, item.descricao, item.quantidade, item.valorUnitario, item.subtotal]
    );
  }
}

app.get('/orcamentos', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const orcamentos = await consultarOrcamentos(conn, busca);
    res.render('tabOrcamentos', {
      orcamentos,
      busca,
      mensagem: typeof req.query.mensagem === 'string' ? req.query.mensagem : '',
      formatarDataBR: formatarDataBRProduto,
      formatarMoeda: formatarMoedaProduto
    });
  } catch (err) {
    console.error('[ERRO MySQL na rota /orcamentos]:', err.message);
    res.status(500).send('Não foi possível carregar os orçamentos.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/orcamentos/exportar.json', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const [registros] = await conn.query(
      `SELECT id, cliente, valor_total, data_cadastro, data_alteracao
       FROM orcamentos ORDER BY id`
    );
    const [itens] = await conn.query(
      `SELECT orcamento_id, descricao, quantidade, valor_unitario
       FROM orcamento_itens ORDER BY orcamento_id, sequencia`
    );
    const itensPorOrcamento = new Map();
    for (const item of itens) {
      if (!itensPorOrcamento.has(item.orcamento_id)) itensPorOrcamento.set(item.orcamento_id, []);
      itensPorOrcamento.get(item.orcamento_id).push({
        descricao: item.descricao,
        quantidade: Number(item.quantidade),
        valorUnitario: Number(item.valor_unitario)
      });
    }
    const exportacao = registros.map(registro => ({
      id: registro.id,
      cliente: registro.cliente,
      itens: itensPorOrcamento.get(registro.id) || [],
      valorTotal: Number(registro.valor_total),
      dataCadastro: dataHoraOrcamentoDoMySQL(registro.data_cadastro),
      dataAlteracao: dataHoraOrcamentoDoMySQL(registro.data_alteracao)
    }));
    res.attachment(`orcamentos_${new Date().toISOString().slice(0, 10)}.json`);
    res.json(exportacao);
  } catch (err) {
    console.error('[ERRO MySQL ao exportar orçamentos JSON]:', err.message);
    res.status(500).send('Não foi possível exportar os orçamentos.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/orcamentos/exportar.csv', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const orcamentos = await consultarOrcamentos(conn);
    const cabecalho = ['ID', 'Cliente', 'Quantidade de Itens', 'Valor Total', 'Cadastro', 'Alteração'];
    const linhas = [
      cabecalho.map(escaparCampoCSV).join(';'),
      ...orcamentos.map(orcamento => [
        orcamento.id, orcamento.cliente, orcamento.qtdItens, orcamento.valorTotal,
        orcamento.dataCadastro, orcamento.dataAlteracao
      ].map(escaparCampoCSV).join(';'))
    ];
    res.attachment(`orcamentos_${new Date().toISOString().slice(0, 10)}.csv`);
    res.type('text/csv; charset=utf-8').send(`\uFEFF${linhas.join('\r\n')}`);
  } catch (err) {
    console.error('[ERRO MySQL ao exportar orçamentos CSV]:', err.message);
    res.status(500).send('Não foi possível exportar os orçamentos.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/orcamentos/novo', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    return renderizarFormularioOrcamento(res, null, '', 200, await contarOrcamentos(conn));
  } catch (err) {
    console.error('[ERRO MySQL ao abrir cadastro de orçamento]:', err.message);
    return res.status(500).send('Não foi possível abrir o cadastro de orçamentos.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/orcamentos/:id/editar', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de orçamento inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const orcamento = await consultarOrcamento(conn, id);
    if (!orcamento) return res.status(404).send('Orçamento não encontrado.');
    return renderizarFormularioOrcamento(res, orcamento, '', 200, await contarOrcamentos(conn));
  } catch (err) {
    console.error('[ERRO MySQL ao carregar edição de orçamento]:', err.message);
    return res.status(500).send('Não foi possível carregar o orçamento.');
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/orcamentos', exigirAutenticacao, async (req, res) => {
  let orcamento;
  try {
    orcamento = normalizarOrcamento(req.body);
  } catch (err) {
    return responderErroOrcamento(req, res, req.body || {}, err.message, 400);
  }

  let conn;
  let transacaoIniciada = false;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    await conn.beginTransaction();
    transacaoIniciada = true;
    const [resultado] = await conn.execute(
      `INSERT INTO orcamentos (cliente, valor_total, data_cadastro, data_alteracao)
       VALUES (?, ?, ?, ?)`,
      [
        orcamento.cliente,
        orcamento.valorTotal,
        dataHoraOrcamentoParaMySQL(orcamento.dataCadastro),
        dataHoraOrcamentoParaMySQL(new Date().toISOString())
      ]
    );
    await inserirItensOrcamento(conn, resultado.insertId, orcamento.itens);
    await conn.commit();
    transacaoIniciada = false;
    const redirect = '/orcamentos?mensagem=Or%C3%A7amento%20cadastrado%20com%20sucesso';
    if (req.accepts('json')) return res.status(201).json({ redirect });
    return res.redirect(redirect);
  } catch (err) {
    if (transacaoIniciada) await conn.rollback();
    console.error('[ERRO MySQL ao criar orçamento]:', err.message);
    return responderErroOrcamento(req, res, orcamento, 'Não foi possível salvar o orçamento.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/orcamentos/:id', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID de orçamento inválido.' });

  let conn;
  let transacaoIniciada = false;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const [existentes] = await conn.execute(
      'SELECT data_cadastro FROM orcamentos WHERE id = ? LIMIT 1',
      [id]
    );
    if (existentes.length === 0) {
      return responderErroOrcamento(req, res, req.body || {}, 'Orçamento não encontrado.', 404);
    }

    let orcamento;
    try {
      orcamento = normalizarOrcamento({
        ...(req.body || {}),
        id,
        dataCadastro: dataHoraOrcamentoDoMySQL(existentes[0].data_cadastro),
        dataAlteracao: new Date().toISOString()
      });
    } catch (err) {
      return responderErroOrcamento(req, res, { ...(req.body || {}), id }, err.message, 400);
    }

    await conn.beginTransaction();
    transacaoIniciada = true;
    await conn.execute(
      `UPDATE orcamentos SET cliente = ?, valor_total = ?, data_alteracao = ? WHERE id = ?`,
      [
        orcamento.cliente,
        orcamento.valorTotal,
        dataHoraOrcamentoParaMySQL(orcamento.dataAlteracao),
        id
      ]
    );
    await conn.execute('DELETE FROM orcamento_itens WHERE orcamento_id = ?', [id]);
    await inserirItensOrcamento(conn, id, orcamento.itens);
    await conn.commit();
    transacaoIniciada = false;
    const redirect = '/orcamentos?mensagem=Or%C3%A7amento%20atualizado%20com%20sucesso';
    if (req.accepts('json')) return res.json({ redirect });
    return res.redirect(redirect);
  } catch (err) {
    if (transacaoIniciada) await conn.rollback();
    console.error('[ERRO MySQL ao atualizar orçamento]:', err.message);
    return responderErroOrcamento(req, res, req.body || {}, 'Não foi possível atualizar o orçamento.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/orcamentos/:id/excluir', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de orçamento inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [resultado] = await conn.execute('DELETE FROM orcamentos WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).send('Orçamento não encontrado.');
    return res.redirect('/orcamentos?mensagem=Or%C3%A7amento%20exclu%C3%ADdo%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao excluir orçamento]:', err.message);
    return res.status(500).send('Não foi possível excluir o orçamento.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/api/orcamentos', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const orcamentos = await consultarOrcamentos(conn, busca);
    res.json(orcamentos);
  } catch (err) {
    console.error('[ERRO MySQL na API /api/orcamentos]:', err.message);
    res.status(500).json({ erro: 'Não foi possível carregar os orçamentos.' });
  } finally {
    if (conn) await conn.end();
  }
});

function ordemServicoParaView(registro) {
  return {
    id: registro.id,
    dataAbertura: String(registro.data_abertura).slice(0, 10),
    status: registro.status,
    prioridade: registro.prioridade,
    cliente: registro.cliente_nome,
    telefone: registro.cliente_telefone || '',
    equipamento: registro.equipamento || '',
    marca: registro.marca || '',
    modelo: registro.modelo || '',
    numeroSerie: registro.numero_serie || '',
    acessorios: registro.acessorios || '',
    relatoProblema: registro.relato_problema || '',
    servicoExecutado: registro.servico_executado || '',
    maoDeObra: Number(registro.mao_de_obra),
    pecas: Number(registro.pecas),
    desconto: Number(registro.desconto),
    valorTotal: Number(registro.valor_total),
    observacoes: registro.observacoes || ''
  };
}

async function consultarOrdensServico(conn, busca = '') {
  const filtro = `%${busca}%`;
  const [registros] = await conn.execute(
    `SELECT id, data_abertura, status, prioridade, cliente_nome, cliente_telefone,
            equipamento, marca, modelo, numero_serie, acessorios, relato_problema,
            servico_executado, mao_de_obra, pecas, desconto, valor_total, observacoes
     FROM ordens_servico
     WHERE ? = ''
        OR LPAD(CAST(id AS CHAR), 6, '0') LIKE ?
        OR cliente_nome LIKE ?
        OR equipamento LIKE ?
        OR marca LIKE ?
        OR modelo LIKE ?
        OR status LIKE ?
     ORDER BY id DESC`,
    [busca, filtro, filtro, filtro, filtro, filtro, filtro]
  );
  return registros.map(ordemServicoParaView);
}

async function consultarOrdemServico(conn, id) {
  const [registros] = await conn.execute(
    'SELECT * FROM ordens_servico WHERE id = ? LIMIT 1',
    [id]
  );
  return registros.length ? ordemServicoParaView(registros[0]) : null;
}

async function contarOrdensServico(conn) {
  const [registros] = await conn.query('SELECT COUNT(*) AS total FROM ordens_servico');
  return Number(registros[0].total) || 0;
}

function renderizarFormularioOrdemServico(res, ordem, mensagem, status = 200, totalOrdens = 0) {
  return res.status(status).render('cadOrdemServico', {
    ordem: {
      id: null, dataAbertura: new Date().toISOString().slice(0, 10),
      status: 'Aberta', prioridade: 'Média', cliente: '', telefone: '',
      equipamento: '', marca: '', modelo: '', numeroSerie: '', acessorios: '',
      relatoProblema: '', servicoExecutado: '', maoDeObra: 0, pecas: 0,
      desconto: 0, valorTotal: 0, observacoes: '', ...(ordem || {})
    },
    mensagem: mensagem || '',
    totalOrdens,
    statusOrdens: STATUS_ORDENS_SERVICO,
    prioridades: PRIORIDADES_ORDENS_SERVICO
  });
}

function valoresOrdemServico(ordem) {
  return [
    ordem.dataAbertura, ordem.status, ordem.prioridade, ordem.cliente,
    ordem.telefone || null, ordem.equipamento || null, ordem.marca || null,
    ordem.modelo || null, ordem.numeroSerie || null, ordem.acessorios || null,
    ordem.relatoProblema, ordem.servicoExecutado || null, ordem.maoDeObra,
    ordem.pecas, ordem.desconto, ordem.valorTotal, ordem.observacoes || null
  ];
}

app.get('/os', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const ordens = await consultarOrdensServico(conn, busca);
    res.render('tabOrdensServico', {
      ordens,
      busca,
      mensagem: typeof req.query.mensagem === 'string' ? req.query.mensagem : '',
      formatarDataBR,
      formatarMoeda: formatarMoedaProduto
    });
  } catch (err) {
    console.error('[ERRO MySQL na rota /os]:', err.message);
    res.status(500).send('Não foi possível carregar as ordens de serviço.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/os/exportar.csv', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const ordens = await consultarOrdensServico(conn);
    const cabecalho = [
      'Número da OS', 'Data de Abertura', 'Status', 'Prioridade', 'Cliente',
      'Telefone', 'Equipamento', 'Marca', 'Modelo', 'Número de Série',
      'Acessórios', 'Relato do Problema', 'Serviço Executado', 'Mão de Obra',
      'Peças', 'Desconto', 'Valor Total', 'Observações'
    ];
    const linhas = [
      cabecalho.map(escaparCampoCSV).join(';'),
      ...ordens.map(ordem => [
        String(ordem.id).padStart(6, '0'), ordem.dataAbertura, ordem.status,
        ordem.prioridade, ordem.cliente, ordem.telefone, ordem.equipamento,
        ordem.marca, ordem.modelo, ordem.numeroSerie, ordem.acessorios,
        ordem.relatoProblema, ordem.servicoExecutado, ordem.maoDeObra,
        ordem.pecas, ordem.desconto, ordem.valorTotal, ordem.observacoes
      ].map(escaparCampoCSV).join(';'))
    ];
    res.attachment(`ordens_servico_${new Date().toISOString().slice(0, 10)}.csv`);
    res.type('text/csv; charset=utf-8').send(`\uFEFF${linhas.join('\r\n')}`);
  } catch (err) {
    console.error('[ERRO MySQL ao exportar ordens de serviço]:', err.message);
    res.status(500).send('Não foi possível exportar as ordens de serviço.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/os/novo', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    return renderizarFormularioOrdemServico(res, null, '', 200, await contarOrdensServico(conn));
  } catch (err) {
    console.error('[ERRO MySQL ao abrir cadastro de ordem de serviço]:', err.message);
    return res.status(500).send('Não foi possível abrir o cadastro de ordens de serviço.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/os/:id/editar', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('Número de ordem de serviço inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const ordem = await consultarOrdemServico(conn, id);
    if (!ordem) return res.status(404).send('Ordem de serviço não encontrada.');
    return renderizarFormularioOrdemServico(res, ordem, '', 200, await contarOrdensServico(conn));
  } catch (err) {
    console.error('[ERRO MySQL ao carregar ordem de serviço]:', err.message);
    return res.status(500).send('Não foi possível carregar a ordem de serviço.');
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/os', exigirAutenticacao, async (req, res) => {
  let ordem;
  try {
    ordem = normalizarOrdemServico(req.body);
  } catch (err) {
    return renderizarFormularioOrdemServico(res, req.body || {}, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const agora = dataHoraOrdemServicoParaMySQL(new Date().toISOString());
    await conn.execute(
      `INSERT INTO ordens_servico (
        data_abertura, status, prioridade, cliente_nome, cliente_telefone,
        equipamento, marca, modelo, numero_serie, acessorios, relato_problema,
        servico_executado, mao_de_obra, pecas, desconto, valor_total,
        observacoes, data_cadastro, data_alteracao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...valoresOrdemServico(ordem), agora, agora]
    );
    return res.redirect('/os?mensagem=Ordem%20de%20servi%C3%A7o%20cadastrada%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao criar ordem de serviço]:', err.message);
    return renderizarFormularioOrdemServico(res, ordem, 'Não foi possível salvar a ordem de serviço.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/os/:id', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('Número de ordem de serviço inválido.');

  let ordem;
  try {
    ordem = normalizarOrdemServico(req.body);
  } catch (err) {
    return renderizarFormularioOrdemServico(res, { ...(req.body || {}), id }, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const agora = dataHoraOrdemServicoParaMySQL(new Date().toISOString());
    const [resultado] = await conn.execute(
      `UPDATE ordens_servico SET
        data_abertura = ?, status = ?, prioridade = ?, cliente_nome = ?,
        cliente_telefone = ?, equipamento = ?, marca = ?, modelo = ?,
        numero_serie = ?, acessorios = ?, relato_problema = ?,
        servico_executado = ?, mao_de_obra = ?, pecas = ?, desconto = ?,
        valor_total = ?, observacoes = ?, data_alteracao = ?
       WHERE id = ?`,
      [...valoresOrdemServico(ordem), agora, id]
    );
    if (resultado.affectedRows === 0) {
      const [existentes] = await conn.execute('SELECT id FROM ordens_servico WHERE id = ? LIMIT 1', [id]);
      if (existentes.length === 0) return res.status(404).send('Ordem de serviço não encontrada.');
    }
    return res.redirect('/os?mensagem=Ordem%20de%20servi%C3%A7o%20atualizada%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao atualizar ordem de serviço]:', err.message);
    return renderizarFormularioOrdemServico(res, { ...ordem, id }, 'Não foi possível atualizar a ordem de serviço.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/os/:id/excluir', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('Número de ordem de serviço inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [resultado] = await conn.execute('DELETE FROM ordens_servico WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).send('Ordem de serviço não encontrada.');
    return res.redirect('/os?mensagem=Ordem%20de%20servi%C3%A7o%20exclu%C3%ADda%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao excluir ordem de serviço]:', err.message);
    return res.status(500).send('Não foi possível excluir a ordem de serviço.');
  } finally {
    if (conn) await conn.end();
  }
});

function fornecedorParaView(registro) {
  return {
    id: registro.id,
    razaoSocial: registro.razao_social,
    cnpj: formatarCNPJFornecedor(registro.cnpj),
    cnpjValido: validarCNPJFornecedor(registro.cnpj),
    nomeFantasia: registro.nome_fantasia || '',
    ie: registro.ie || '',
    dataAbertura: registro.data_abertura ? String(registro.data_abertura).slice(0, 10) : '',
    porte: registro.porte || '',
    regimeTributario: registro.regime_tributario || '',
    nomeResponsavel: registro.nome_responsavel || '',
    cargo: registro.cargo || '',
    telefone: registro.telefone || '',
    celular: registro.celular || '',
    email: registro.email || '',
    cep: registro.cep || '',
    rua: registro.rua || '',
    numero: registro.numero || '',
    bairro: registro.bairro || '',
    cidade: registro.cidade || '',
    estado: registro.estado || '',
    observacoes: registro.observacoes || '',
    dataCadastro: dataHoraFornecedorDoMySQL(registro.data_cadastro),
    dataAlteracao: dataHoraFornecedorDoMySQL(registro.data_alteracao)
  };
}

async function consultarFornecedores(conn, busca) {
  const filtro = `%${busca}%`;
  const cnpjBusca = normalizarCNPJFornecedor(busca) || busca;
  const [registros] = await conn.execute(
    `SELECT id, razao_social, cnpj, nome_fantasia, ie, data_abertura, porte,
            regime_tributario, nome_responsavel, cargo, telefone, celular, email,
            cep, rua, numero, bairro, cidade, estado, observacoes,
            data_cadastro, data_alteracao
     FROM fornecedores
     WHERE razao_social LIKE ?
        OR cnpj LIKE ?
        OR nome_fantasia LIKE ?
        OR email LIKE ?
        OR rua LIKE ?
        OR DATE_FORMAT(data_abertura, '%d/%m/%Y') LIKE ?
     ORDER BY id DESC`,
    [filtro, `%${cnpjBusca}%`, filtro, filtro, filtro, filtro]
  );
  return registros.map(fornecedorParaView);
}

function renderizarFormularioFornecedor(res, fornecedor, mensagem, status = 200) {
  const cnpj = typeof fornecedor.cnpj === 'string' ? fornecedor.cnpj : '';
  return res.status(status).render('cadFornecedores', {
    fornecedor: {
      ...fornecedor,
      cnpjValido: typeof fornecedor.cnpjValido === 'boolean'
        ? fornecedor.cnpjValido
        : validarCNPJFornecedor(cnpj),
      cnpj: formatarCNPJFornecedor(cnpj)
    },
    busca: '',
    mensagem,
    estados: ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
  });
}

app.get('/fornecedores', exigirAutenticacao, async (req, res) => {
  let conn;
  const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const fornecedores = await consultarFornecedores(conn, busca);
    const mensagem = typeof req.query.mensagem === 'string' ? req.query.mensagem : '';
    res.render('tabFornecedores', {
      fornecedores,
      busca,
      mensagem,
      formatarDataBR: formatarDataBRFornecedor
    });
  } catch (err) {
    console.error('[ERRO MySQL na rota /fornecedores]:', err.message);
    res.status(500).send('Não foi possível carregar os fornecedores.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/fornecedores/exportar.csv', exigirAutenticacao, async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const fornecedores = await consultarFornecedores(conn, '');
    const cabecalho = [
      'ID', 'Razão Social', 'CNPJ', 'Nome Fantasia', 'Inscrição Estadual',
      'Data de Abertura', 'Porte', 'Regime Tributário', 'Responsável', 'Cargo',
      'Telefone', 'Celular', 'Email', 'CEP', 'Rua', 'Número', 'Bairro', 'Cidade',
      'Estado', 'Observações', 'Cadastro', 'Alteração'
    ];
    const linhas = [
      cabecalho.map(escaparCampoCSV).join(';'),
      ...fornecedores.map(fornecedor => [
        fornecedor.id, fornecedor.razaoSocial, fornecedor.cnpj, fornecedor.nomeFantasia,
        fornecedor.ie, fornecedor.dataAbertura, fornecedor.porte,
        fornecedor.regimeTributario, fornecedor.nomeResponsavel, fornecedor.cargo,
        fornecedor.telefone, fornecedor.celular, fornecedor.email, fornecedor.cep,
        fornecedor.rua, fornecedor.numero, fornecedor.bairro, fornecedor.cidade,
        fornecedor.estado, fornecedor.observacoes, fornecedor.dataCadastro,
        fornecedor.dataAlteracao
      ].map(escaparCampoCSV).join(';'))
    ];
    const data = new Date().toISOString().slice(0, 10);
    res.attachment(`fornecedores_${data}.csv`);
    res.type('text/csv; charset=utf-8').send(`\uFEFF${linhas.join('\r\n')}`);
  } catch (err) {
    console.error('[ERRO MySQL ao exportar fornecedores]:', err.message);
    res.status(500).send('Não foi possível exportar os fornecedores.');
  } finally {
    if (conn) await conn.end();
  }
});

app.get('/fornecedores/novo', exigirAutenticacao, (req, res) => {
  renderizarFormularioFornecedor(res, {
    id: null, razaoSocial: '', cnpj: '', cnpjValido: true, nomeFantasia: '',
    ie: '', dataAbertura: '', porte: '', regimeTributario: '',
    nomeResponsavel: '', cargo: '', telefone: '', celular: '', email: '',
    cep: '', rua: '', numero: '', bairro: '', cidade: '', estado: '',
    observacoes: ''
  }, '');
});

app.get('/fornecedores/:id/editar', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de fornecedor inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
    const [registros] = await conn.execute(
      'SELECT * FROM fornecedores WHERE id = ? LIMIT 1',
      [id]
    );
    if (registros.length === 0) return res.status(404).send('Fornecedor não encontrado.');
    renderizarFormularioFornecedor(res, fornecedorParaView(registros[0]), '');
  } catch (err) {
    console.error('[ERRO MySQL ao carregar edição de fornecedor]:', err.message);
    res.status(500).send('Não foi possível carregar o fornecedor.');
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/fornecedores', exigirAutenticacao, async (req, res) => {
  let fornecedor;
  try {
    fornecedor = normalizarFornecedor(req.body);
  } catch (err) {
    return renderizarFormularioFornecedor(res, req.body || {}, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    await inserirFornecedor(conn, fornecedor);
    return res.redirect('/fornecedores?mensagem=Fornecedor%20cadastrado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderizarFormularioFornecedor(res, fornecedor, 'Já existe um fornecedor cadastrado com esse CNPJ.', 409);
    }
    console.error('[ERRO MySQL ao criar fornecedor]:', err.message);
    return renderizarFormularioFornecedor(res, fornecedor, 'Não foi possível salvar o fornecedor.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/fornecedores/:id', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de fornecedor inválido.');

  let fornecedor;
  try {
    fornecedor = normalizarFornecedor(req.body);
  } catch (err) {
    return renderizarFormularioFornecedor(res, { ...(req.body || {}), id }, err.message, 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [existentes] = await conn.execute(
      'SELECT id FROM fornecedores WHERE id = ? LIMIT 1',
      [id]
    );
    if (existentes.length === 0) return res.status(404).send('Fornecedor não encontrado.');

    await conn.execute(
      `UPDATE fornecedores
       SET razao_social = ?, cnpj = ?, nome_fantasia = ?, ie = ?, data_abertura = ?,
           porte = ?, regime_tributario = ?, nome_responsavel = ?, cargo = ?,
           telefone = ?, celular = ?, email = ?, cep = ?, rua = ?, numero = ?,
           bairro = ?, cidade = ?, estado = ?, observacoes = ?, data_alteracao = ?
       WHERE id = ?`,
      [
        fornecedor.razaoSocial, fornecedor.cnpj, fornecedor.nomeFantasia || null,
        fornecedor.ie || null, fornecedor.dataAbertura, fornecedor.porte || null,
        fornecedor.regimeTributario || null, fornecedor.nomeResponsavel || null,
        fornecedor.cargo || null, fornecedor.telefone || null, fornecedor.celular || null,
        fornecedor.email || null, fornecedor.cep || null, fornecedor.rua || null,
        fornecedor.numero || null, fornecedor.bairro || null, fornecedor.cidade || null,
        fornecedor.estado || null, fornecedor.observacoes || null,
        dataHoraFornecedorParaMySQL(new Date().toISOString()), id
      ]
    );
    return res.redirect('/fornecedores?mensagem=Fornecedor%20atualizado%20com%20sucesso');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderizarFormularioFornecedor(res, { ...fornecedor, id }, 'Já existe outro fornecedor cadastrado com esse CNPJ.', 409);
    }
    console.error('[ERRO MySQL ao atualizar fornecedor]:', err.message);
    return renderizarFormularioFornecedor(res, { ...(req.body || {}), id }, 'Não foi possível atualizar o fornecedor.', 500);
  } finally {
    if (conn) await conn.end();
  }
});

app.post('/fornecedores/:id/excluir', exigirAutenticacao, async (req, res) => {
  const id = idUsuarioValido(req.params.id);
  if (!id) return res.status(400).send('ID de fornecedor inválido.');

  let conn;
  try {
    conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
    const [resultado] = await conn.execute('DELETE FROM fornecedores WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).send('Fornecedor não encontrado.');
    return res.redirect('/fornecedores?mensagem=Fornecedor%20exclu%C3%ADdo%20com%20sucesso');
  } catch (err) {
    console.error('[ERRO MySQL ao excluir fornecedor]:', err.message);
    return res.status(500).send('Não foi possível excluir o fornecedor.');
  } finally {
    if (conn) await conn.end();
  }
});

// Inicializa o banco e sobe o servidor Express
inicializarBanco()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log('========================================================');
      console.log(`  FullTime Technology rodando em: http://${HOST}:${PORT}`);
      console.log(`  Banco MySQL "${DB_NAME}" conectado e pronto!`);
      console.log('========================================================');
    });
  })
  .catch((err) => {
    console.error('[ERRO CRÍTICO] Falha ao iniciar o banco MySQL:', err.message);
    console.error('Verifique se a janela "MySQL Server Portatil" está aberta.');
  });
