const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { registerNewsRoutes } = require('../news-routes');

test('renders the MySQL edition in the newspaper preview and redirects legacy preview links', async t => {
  const edicao = {
    id: 'ed_test',
    numero: 7,
    data: '2026-11-25',
    titulo: 'Edição teste',
    status: 'Editando',
    responsavel: '',
    observacao: '',
    arquivo: 'edicao-25112026.html',
    criado_em: '',
    atualizado_em: '',
    fechada_em: null
  };
  const materias = [
    {
      edicao_id: 'ed_test',
      id: 'mat_1',
      coluna: 2,
      ordem: 1,
      tipo: 'manchete',
      status: 'Ativo',
      categoria: 'Brasil',
      titulo: '<script>alert(1)</script>',
      link: 'javascript:alert(1)',
      resumo: 'Resumo',
      autor: 'Equipe',
      tempo: '',
      imagem: '',
      legenda: '',
      criado_em: '',
      atualizado_em: ''
    },
    {
      edicao_id: 'ed_test',
      id: 'mat_2',
      coluna: 1,
      ordem: 1,
      tipo: 'texto',
      status: 'Inativo',
      categoria: '',
      titulo: 'Matéria inativa',
      link: '#',
      resumo: '',
      autor: '',
      tempo: '',
      imagem: '',
      legenda: '',
      criado_em: '',
      atualizado_em: ''
    }
  ];
  const mysql = {
    createConnection: async () => ({
      execute: async sql => {
        if (sql.includes('FROM edicoes WHERE id = ?')) return [[edicao], []];
        if (sql.includes('FROM materias WHERE edicao_id = ? ORDER BY')) return [materias, []];
        throw new Error(`Unexpected SQL in preview test: ${sql}`);
      },
      end: async () => {}
    })
  };
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use((req, res, next) => {
    res.locals.usuarioLogado = null;
    next();
  });
  registerNewsRoutes(app, {
    mysql,
    dbConfig: {},
    DB_NAME: 'test',
    exigirAutenticacao: (req, res, next) => next()
  });

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const previewResponse = await fetch(`${baseUrl}/edicoes/ed_test/preview?preview=1`);
  assert.equal(previewResponse.status, 200);
  const html = await previewResponse.text();
  assert.match(html, /edicao-25112026/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<a href="javascript:alert\(1\)">/);
  assert.doesNotMatch(html, />Matéria inativa</);
  assert.doesNotMatch(html, /news-dados\.js|include\.js/);

  const legacyResponse = await fetch(
    `${baseUrl}/constantino-news.html?edicao=ed_test&preview=1&imprimir=1`,
    { redirect: 'manual' }
  );
  assert.equal(legacyResponse.status, 302);
  assert.equal(
    legacyResponse.headers.get('location'),
    '/edicoes/ed_test/preview?preview=1&imprimir=1'
  );
});
