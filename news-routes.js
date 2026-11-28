const {
  dataHoraParaMySQL,
  formatarDataBR,
  formatarDataHoraBR,
  gerarId,
  normalizarEdicao,
  normalizarMateria,
  STATUS_EDICOES,
  TIPOS_MATERIA,
  STATUS_MATERIA,
  sugerirPosicaoMateria,
} = require('./news-utils');

function idValido(valor) {
  return typeof valor === 'string' && /^[\w-]{1,80}$/.test(valor) ? valor : '';
}

function edicaoParaView(registro) {
  return {
    id: registro.id,
    numero: Number(registro.numero),
    data: String(registro.data).slice(0, 10),
    titulo: registro.titulo,
    status: registro.status,
    responsavel: registro.responsavel || '',
    observacao: registro.observacao || '',
    arquivo: registro.arquivo || '',
    criadoEm: registro.criado_em || '',
    atualizadoEm: registro.atualizado_em || '',
    fechadaEm: registro.fechada_em || '',
    totalMaterias: Number(registro.total_materias || 0),
    materiasAtivas: Number(registro.materias_ativas || 0),
    materiasInativas: Number(registro.materias_inativas || 0),
    porColuna: [
      Number(registro.coluna_1 || 0),
      Number(registro.coluna_2 || 0),
      Number(registro.coluna_3 || 0),
    ],
    temManchete: Number(registro.tem_manchete || 0) > 0,
  };
}

function materiaParaView(registro) {
  return {
    id: registro.id,
    edicaoId: registro.edicao_id,
    coluna: Number(registro.coluna),
    ordem: Number(registro.ordem),
    tipo: registro.tipo,
    status: registro.status,
    categoria: registro.categoria || '',
    titulo: registro.titulo,
    link: registro.link || '#',
    resumo: registro.resumo || '',
    autor: registro.autor || '',
    tempo: registro.tempo || '',
    imagem: registro.imagem || '',
    legenda: registro.legenda || '',
    criadoEm: registro.criado_em || '',
    atualizadoEm: registro.atualizado_em || '',
  };
}

async function consultarEdicoes(conn, busca = '', status = '') {
  const where = [];
  const parametros = [];
  if (busca) {
    const filtro = `%${busca}%`;
    where.push(`(
      CAST(e.numero AS CHAR) LIKE ? OR DATE_FORMAT(e.data, '%d/%m/%Y') LIKE ?
      OR e.titulo LIKE ? OR e.responsavel LIKE ? OR e.observacao LIKE ?
    )`);
    parametros.push(filtro, filtro, filtro, filtro, filtro);
  }
  if (status) {
    where.push('e.status = ?');
    parametros.push(status);
  }

  const [registros] = await conn.execute(
    `SELECT e.id, e.numero, e.data, e.titulo, e.status, e.responsavel,
            e.observacao, e.arquivo, e.criado_em, e.atualizado_em, e.fechada_em,
            COUNT(m.id) AS total_materias,
            SUM(CASE WHEN m.status = 'Ativo' THEN 1 ELSE 0 END) AS materias_ativas,
            SUM(CASE WHEN m.status = 'Inativo' THEN 1 ELSE 0 END) AS materias_inativas,
            SUM(CASE WHEN m.status = 'Ativo' AND m.coluna = 1 THEN 1 ELSE 0 END) AS coluna_1,
            SUM(CASE WHEN m.status = 'Ativo' AND m.coluna = 2 THEN 1 ELSE 0 END) AS coluna_2,
            SUM(CASE WHEN m.status = 'Ativo' AND m.coluna = 3 THEN 1 ELSE 0 END) AS coluna_3,
            SUM(CASE WHEN m.status = 'Ativo' AND m.tipo = 'manchete' THEN 1 ELSE 0 END) AS tem_manchete
     FROM edicoes e
     LEFT JOIN materias m ON m.edicao_id = e.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY e.id, e.numero, e.data, e.titulo, e.status, e.responsavel,
              e.observacao, e.arquivo, e.criado_em, e.atualizado_em, e.fechada_em
     ORDER BY e.data DESC, e.numero DESC`,
    parametros,
  );
  return registros.map(edicaoParaView);
}

async function consultarEdicao(conn, id) {
  const [registros] = await conn.execute(
    `SELECT id, numero, data, titulo, status, responsavel, observacao, arquivo,
            criado_em, atualizado_em, fechada_em
     FROM edicoes WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!registros.length) return null;

  const [materias] = await conn.execute(
    `SELECT edicao_id, id, coluna, ordem, tipo, status, categoria, titulo, link,
            resumo, autor, tempo, imagem, legenda, criado_em, atualizado_em
     FROM materias WHERE edicao_id = ? ORDER BY coluna, ordem, criado_em, id`,
    [id],
  );
  const edicao = edicaoParaView(registros[0]);
  edicao.nome = edicao.titulo;
  edicao.materias = materias.map(materiaParaView);
  return edicao;
}

async function renderizarTabelaEdicoes(conn, res, opcoes = {}) {
  const busca = opcoes.busca || '';
  const status = STATUS_EDICOES.includes(opcoes.status) ? opcoes.status : '';
  const [maximos] = await conn.query('SELECT COALESCE(MAX(numero), 0) AS maior FROM edicoes');
  const edicoes = await consultarEdicoes(conn, busca, status);
  res.status(opcoes.httpStatus || 200).render('tabEdicoes', {
    edicoes,
    busca,
    filtroStatus: status,
    mensagem: opcoes.mensagem || '',
    edicaoForm: {
      id: '',
      numero: Number(maximos[0].maior || 0) + 1,
      data: new Date().toISOString().slice(0, 10),
      titulo: '',
      responsavel: '',
      observacao: '',
      ...(opcoes.edicaoForm || {}),
    },
    erroFormulario: opcoes.erroFormulario || '',
    abrirModal: Boolean(opcoes.abrirModal),
    STATUS_EDICOES,
    formatarDataBR,
    formatarDataHoraBR,
  });
}

async function renderizarPaginaMaterias(conn, res, id, opcoes = {}) {
  const edicao = await consultarEdicao(conn, id);
  if (!edicao) return res.status(404).send('Edição não encontrada.');

  const busca = opcoes.busca || '';
  let materias = edicao.materias;
  if (busca) {
    const termo = busca.toLocaleLowerCase('pt-BR');
    materias = materias.filter((materia) =>
      [materia.titulo, materia.categoria, materia.autor, materia.resumo]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(termo),
    );
  }

  return res.status(opcoes.httpStatus || 200).render('tabMaterias', {
    edicao,
    materias,
    totalMaterias: edicao.materias.length,
    busca,
    mensagem: opcoes.mensagem || '',
    formatarDataBR,
  });
}

async function renderizarCadastroMateria(conn, res, id, materiaForm = {}, opcoes = {}) {
  const edicao = opcoes.edicao || (await consultarEdicao(conn, id));
  if (!edicao) return res.status(404).send('Edição não encontrada.');

  const materia = {
    id: '',
    coluna: 1,
    ordem: 1,
    tipo: 'texto',
    status: 'Ativo',
    categoria: '',
    titulo: '',
    link: '#',
    resumo: '',
    autor: '',
    tempo: '',
    imagem: '',
    legenda: '',
    ...materiaForm,
  };

  return res.status(opcoes.httpStatus || 200).render('cadMaterias', {
    edicao,
    materia,
    erroFormulario: opcoes.erroFormulario || '',
    tiposMateria: TIPOS_MATERIA,
    statusMateria: STATUS_MATERIA,
    formatarDataBR,
    somenteLeitura: edicao.status === 'Fechada',
  });
}

function exportacaoEdicao(edicao) {
  return {
    id: edicao.id,
    data: edicao.data,
    nome: edicao.titulo,
    titulo: edicao.titulo,
    status: edicao.status,
    numero: edicao.numero,
    responsavel: edicao.responsavel,
    observacao: edicao.observacao,
    arquivo: edicao.arquivo,
    criadoEm: edicao.criadoEm,
    atualizadoEm: edicao.atualizadoEm,
    fechadaEm: edicao.fechadaEm,
    materias: edicao.materias.map((materia) => ({
      id: materia.id,
      coluna: materia.coluna,
      ordem: materia.ordem,
      tipo: materia.tipo,
      status: materia.status,
      categoria: materia.categoria,
      titulo: materia.titulo,
      link: materia.link,
      resumo: materia.resumo,
      autor: materia.autor,
      tempo: materia.tempo,
      imagem: materia.imagem,
      legenda: materia.legenda,
      criadoEm: materia.criadoEm,
      atualizadoEm: materia.atualizadoEm,
    })),
  };
}

function registerNewsRoutes(app, { mysql, dbConfig, DB_NAME, exigirAutenticacao }) {
  app.get('/edicoes', exigirAutenticacao, async (req, res) => {
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      return await renderizarTabelaEdicoes(conn, res, {
        busca: typeof req.query.q === 'string' ? req.query.q.trim() : '',
        status: typeof req.query.status === 'string' ? req.query.status : '',
        mensagem: typeof req.query.mensagem === 'string' ? req.query.mensagem : '',
      });
    } catch (err) {
      console.error('[ERRO MySQL na rota /edicoes]:', err.message);
      return res.status(500).send('Não foi possível carregar as edições.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.get('/edicoes/exportar.json', exigirAutenticacao, async (req, res) => {
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      const lista = await consultarEdicoes(conn);
      const edicoes = [];
      for (const item of lista) {
        const completa = await consultarEdicao(conn, item.id);
        if (completa) edicoes.push(exportacaoEdicao(completa));
      }
      return res.attachment(`edicoes-${new Date().toISOString().slice(0, 10)}.json`).json(edicoes);
    } catch (err) {
      console.error('[ERRO MySQL ao exportar edições]:', err.message);
      return res.status(500).send('Não foi possível exportar as edições.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.get('/edicoes/:id/exportar.json', exigirAutenticacao, async (req, res) => {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).send('ID de edição inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      const edicao = await consultarEdicao(conn, id);
      if (!edicao) return res.status(404).send('Edição não encontrada.');
      const arquivo = `edicao-${edicao.data.slice(8, 10)}${edicao.data.slice(5, 7)}${edicao.data.slice(0, 4)}.json`;
      return res.attachment(arquivo).json(exportacaoEdicao(edicao));
    } catch (err) {
      console.error('[ERRO MySQL ao exportar edição]:', err.message);
      return res.status(500).send('Não foi possível exportar a edição.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.get('/edicoes/:id/preview', exigirAutenticacao, async (req, res) => {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).send('ID de edição inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      const edicao = await consultarEdicao(conn, id);
      if (!edicao) return res.status(404).send('Edição não encontrada.');
      return res.render('constantinoNews', { edicao });
    } catch (err) {
      console.error('[ERRO MySQL ao abrir preview da edição]:', err.message);
      return res.status(500).send('Não foi possível gerar o preview da edição.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.get('/constantino-news.html', exigirAutenticacao, (req, res) => {
    if (typeof req.query.edicao !== 'string' || !req.query.edicao) {
      return res.redirect('/edicoes');
    }
    const id = idValido(req.query.edicao);
    if (!id) return res.status(400).send('ID de edição inválido.');
    const parametros = new URLSearchParams();
    if (req.query.preview === '1') parametros.set('preview', '1');
    if (req.query.imprimir === '1') parametros.set('imprimir', '1');
    const consulta = parametros.toString();
    return res.redirect(
      `/edicoes/${encodeURIComponent(id)}/preview${consulta ? `?${consulta}` : ''}`,
    );
  });

  app.post('/edicoes', exigirAutenticacao, async (req, res) => {
    let dados;
    try {
      dados = normalizarEdicao({ ...req.body, status: 'Editando' });
      dados.id = gerarId('ed');
    } catch (err) {
      let conn;
      try {
        conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
        return await renderizarTabelaEdicoes(conn, res, {
          edicaoForm: req.body,
          erroFormulario: err.message,
          abrirModal: true,
          httpStatus: 400,
        });
      } catch (renderError) {
        console.error('[ERRO ao reapresentar cadastro de edição]:', renderError.message);
        return res.status(500).send('Não foi possível salvar a edição.');
      } finally {
        if (conn) await conn.end();
      }
    }

    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      const [abertas] = await conn.execute(
        "SELECT id FROM edicoes WHERE status = 'Editando' LIMIT 1",
      );
      if (abertas.length) {
        return await renderizarTabelaEdicoes(conn, res, {
          edicaoForm: req.body,
          erroFormulario: 'Já existe uma edição em andamento. Feche-a antes de criar outra.',
          abrirModal: true,
          httpStatus: 409,
        });
      }
      await conn.execute(
        `INSERT INTO edicoes (
          id, numero, data, titulo, status, responsavel, observacao, arquivo,
          criado_em, atualizado_em, fechada_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dados.id,
          dados.numero,
          dados.data,
          dados.titulo,
          dados.status,
          dados.responsavel,
          dados.observacao,
          dados.arquivo,
          dados.criadoEm,
          dados.atualizadoEm,
          null,
        ],
      );
      return res.redirect(`/edicoes?mensagem=${encodeURIComponent('Edição criada com sucesso.')}`);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return await renderizarTabelaEdicoes(conn, res, {
          edicaoForm: req.body,
          erroFormulario: 'Já existe uma edição com esse número ou data.',
          abrirModal: true,
          httpStatus: 409,
        });
      }
      console.error('[ERRO MySQL ao criar edição]:', err.message);
      return res.status(500).send('Não foi possível criar a edição.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.post('/edicoes/:id', exigirAutenticacao, async (req, res) => {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).send('ID de edição inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      const atual = await consultarEdicao(conn, id);
      if (!atual) return res.status(404).send('Edição não encontrada.');
      if (atual.status === 'Fechada')
        return res.status(409).send('Reabra a edição antes de alterar seus dados.');

      let dados;
      try {
        dados = normalizarEdicao({ ...req.body, id, status: atual.status });
      } catch (err) {
        return await renderizarTabelaEdicoes(conn, res, {
          edicaoForm: { ...req.body, id },
          erroFormulario: err.message,
          abrirModal: true,
          httpStatus: 400,
        });
      }

      await conn.execute(
        `UPDATE edicoes SET numero = ?, data = ?, titulo = ?, responsavel = ?,
          observacao = ?, arquivo = ?, atualizado_em = ? WHERE id = ?`,
        [
          dados.numero,
          dados.data,
          dados.titulo,
          dados.responsavel,
          dados.observacao,
          dados.arquivo,
          dataHoraParaMySQL(new Date().toISOString()),
          id,
        ],
      );
      return res.redirect(
        `/edicoes?mensagem=${encodeURIComponent('Edição atualizada com sucesso.')}`,
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return await renderizarTabelaEdicoes(conn, res, {
          edicaoForm: { ...req.body, id },
          erroFormulario: 'Já existe outra edição com esse número ou data.',
          abrirModal: true,
          httpStatus: 409,
        });
      }
      console.error('[ERRO MySQL ao atualizar edição]:', err.message);
      return res.status(500).send('Não foi possível atualizar a edição.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.post('/edicoes/:id/status', exigirAutenticacao, async (req, res) => {
    const id = idValido(req.params.id);
    const status = req.body.status;
    if (!id || !STATUS_EDICOES.includes(status))
      return res.status(400).send('Edição ou status inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
      const [edicoes] = await conn.execute('SELECT id, status FROM edicoes WHERE id = ? LIMIT 1', [
        id,
      ]);
      if (!edicoes.length) return res.status(404).send('Edição não encontrada.');
      if (status === 'Editando') {
        const [outrasAbertas] = await conn.execute(
          "SELECT id FROM edicoes WHERE status = 'Editando' AND id <> ? LIMIT 1",
          [id],
        );
        if (outrasAbertas.length) {
          return res.redirect(
            `/edicoes?mensagem=${encodeURIComponent('Feche a edição em andamento antes de reabrir esta.')}`,
          );
        }
      } else {
        const [[contagem]] = await conn.execute(
          "SELECT COUNT(*) AS total FROM materias WHERE edicao_id = ? AND status = 'Ativo'",
          [id],
        );
        if (Number(contagem.total) === 0) {
          return res.redirect(
            `/edicoes?mensagem=${encodeURIComponent('Não é possível fechar uma edição sem matérias ativas.')}`,
          );
        }
      }
      const agora = dataHoraParaMySQL(new Date().toISOString());
      await conn.execute(
        'UPDATE edicoes SET status = ?, fechada_em = ?, atualizado_em = ? WHERE id = ?',
        [status, status === 'Fechada' ? agora : null, agora, id],
      );
      return res.redirect(
        `/edicoes?mensagem=${encodeURIComponent(status === 'Fechada' ? 'Edição fechada.' : 'Edição reaberta para edição.')}`,
      );
    } catch (err) {
      console.error('[ERRO MySQL ao alterar status de edição]:', err.message);
      return res.status(500).send('Não foi possível alterar o status da edição.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.post('/edicoes/:id/excluir', exigirAutenticacao, async (req, res) => {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).send('ID de edição inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
      const [registros] = await conn.execute('SELECT status FROM edicoes WHERE id = ? LIMIT 1', [
        id,
      ]);
      if (!registros.length) return res.status(404).send('Edição não encontrada.');
      if (registros[0].status === 'Fechada') {
        return res.status(409).send('Reabra a edição antes de excluí-la.');
      }
      await conn.execute('DELETE FROM edicoes WHERE id = ?', [id]);
      return res.redirect(
        `/edicoes?mensagem=${encodeURIComponent('Edição e suas matérias excluídas.')}`,
      );
    } catch (err) {
      console.error('[ERRO MySQL ao excluir edição]:', err.message);
      return res.status(500).send('Não foi possível excluir a edição.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.get('/edicoes/:id/materias', exigirAutenticacao, async (req, res) => {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).send('ID de edição inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      if (typeof req.query.editar === 'string' && req.query.editar) {
        const materiaId = idValido(req.query.editar);
        if (!materiaId) return res.status(400).send('ID de matéria inválido.');
        return res.redirect(
          `/edicoes/${encodeURIComponent(id)}/materias/${encodeURIComponent(materiaId)}`,
        );
      }
      const busca = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      return await renderizarPaginaMaterias(conn, res, id, {
        busca,
        mensagem: typeof req.query.mensagem === 'string' ? req.query.mensagem : '',
      });
    } catch (err) {
      console.error('[ERRO MySQL ao carregar matérias]:', err.message);
      return res.status(500).send('Não foi possível carregar as matérias.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.get('/edicoes/:id/materias/nova', exigirAutenticacao, async (req, res) => {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).send('ID de edição inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      const edicao = await consultarEdicao(conn, id);
      if (!edicao) return res.status(404).send('Edição não encontrada.');
      if (edicao.status === 'Fechada') {
        return res.redirect(
          `/edicoes/${encodeURIComponent(id)}/materias?mensagem=${encodeURIComponent('Reabra a edição antes de cadastrar matérias.')}`,
        );
      }

      let colunaForcada;
      if (req.query.coluna !== undefined) {
        colunaForcada = Number(req.query.coluna);
        if (![1, 2, 3].includes(colunaForcada)) return res.status(400).send('Coluna inválida.');
      }
      const posicao = sugerirPosicaoMateria(edicao.materias, colunaForcada);
      return await renderizarCadastroMateria(conn, res, id, posicao, { edicao });
    } catch (err) {
      console.error('[ERRO MySQL ao abrir cadastro de matéria]:', err.message);
      return res.status(500).send('Não foi possível abrir o cadastro da matéria.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.get('/edicoes/:id/materias/:materiaId', exigirAutenticacao, async (req, res) => {
    const id = idValido(req.params.id);
    const materiaId = idValido(req.params.materiaId);
    if (!id || !materiaId) return res.status(400).send('ID de edição ou matéria inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      const edicao = await consultarEdicao(conn, id);
      if (!edicao) return res.status(404).send('Edição não encontrada.');
      const materia = edicao.materias.find((item) => item.id === materiaId);
      if (!materia) return res.status(404).send('Matéria não encontrada nesta edição.');
      return await renderizarCadastroMateria(conn, res, id, materia, { edicao });
    } catch (err) {
      console.error('[ERRO MySQL ao abrir matéria]:', err.message);
      return res.status(500).send('Não foi possível carregar a matéria.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.post('/edicoes/:id/materias', exigirAutenticacao, async (req, res) => {
    const edicaoId = idValido(req.params.id);
    if (!edicaoId) return res.status(400).send('ID de edição inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME, dateStrings: true });
      const edicao = await consultarEdicao(conn, edicaoId);
      if (!edicao) return res.status(404).send('Edição não encontrada.');
      if (edicao.status === 'Fechada')
        return res.status(409).send('Reabra a edição antes de alterar as matérias.');

      let materia;
      try {
        materia = normalizarMateria(req.body);
      } catch (err) {
        return await renderizarCadastroMateria(
          conn,
          res,
          edicaoId,
          {
            ...req.body,
            id: req.body.id || '',
          },
          {
            edicao,
            erroFormulario: err.message,
            httpStatus: 400,
          },
        );
      }

      const id = materia.id || gerarId('mat');
      const existe = materia.id && edicao.materias.some((item) => item.id === materia.id);
      const valores = [
        materia.coluna,
        materia.ordem,
        materia.tipo,
        materia.status,
        materia.categoria,
        materia.titulo,
        materia.link,
        materia.resumo,
        materia.autor,
        materia.tempo,
        materia.imagem,
        materia.legenda,
        dataHoraParaMySQL(new Date().toISOString()),
      ];
      if (existe) {
        await conn.execute(
          `UPDATE materias SET coluna = ?, ordem = ?, tipo = ?, status = ?, categoria = ?,
            titulo = ?, link = ?, resumo = ?, autor = ?, tempo = ?, imagem = ?, legenda = ?,
            atualizado_em = ? WHERE edicao_id = ? AND id = ?`,
          [...valores, edicaoId, id],
        );
      } else {
        if (materia.id) return res.status(404).send('Matéria não encontrada nesta edição.');
        const agora = dataHoraParaMySQL(new Date().toISOString());
        await conn.execute(
          `INSERT INTO materias (
            edicao_id, id, coluna, ordem, tipo, status, categoria, titulo, link,
            resumo, autor, tempo, imagem, legenda, criado_em, atualizado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            edicaoId,
            id,
            materia.coluna,
            materia.ordem,
            materia.tipo,
            materia.status,
            materia.categoria,
            materia.titulo,
            materia.link,
            materia.resumo,
            materia.autor,
            materia.tempo,
            materia.imagem,
            materia.legenda,
            agora,
            agora,
          ],
        );
      }
      const mensagem = existe
        ? 'Matéria atualizada com sucesso.'
        : 'Matéria cadastrada com sucesso.';
      return res.redirect(
        `/edicoes/${encodeURIComponent(edicaoId)}/materias?mensagem=${encodeURIComponent(mensagem)}`,
      );
    } catch (err) {
      console.error('[ERRO MySQL ao salvar matéria]:', err.message);
      return res.status(500).send('Não foi possível salvar a matéria.');
    } finally {
      if (conn) await conn.end();
    }
  });

  app.post('/edicoes/:id/materias/:materiaId/excluir', exigirAutenticacao, async (req, res) => {
    const edicaoId = idValido(req.params.id);
    const materiaId = idValido(req.params.materiaId);
    if (!edicaoId || !materiaId) return res.status(400).send('ID de edição ou matéria inválido.');
    let conn;
    try {
      conn = await mysql.createConnection({ ...dbConfig, database: DB_NAME });
      const [edicoes] = await conn.execute('SELECT status FROM edicoes WHERE id = ? LIMIT 1', [
        edicaoId,
      ]);
      if (!edicoes.length) return res.status(404).send('Edição não encontrada.');
      if (edicoes[0].status === 'Fechada')
        return res.status(409).send('Reabra a edição antes de excluir matérias.');
      const [resultado] = await conn.execute(
        'DELETE FROM materias WHERE edicao_id = ? AND id = ?',
        [edicaoId, materiaId],
      );
      if (resultado.affectedRows === 0)
        return res.status(404).send('Matéria não encontrada nesta edição.');
      return res.redirect(
        `/edicoes/${encodeURIComponent(edicaoId)}/materias?mensagem=${encodeURIComponent('Matéria excluída.')}`,
      );
    } catch (err) {
      console.error('[ERRO MySQL ao excluir matéria]:', err.message);
      return res.status(500).send('Não foi possível excluir a matéria.');
    } finally {
      if (conn) await conn.end();
    }
  });
}

module.exports = { registerNewsRoutes };
