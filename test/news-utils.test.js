const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarEdicao,
  normalizarMateria,
  selecionarEdicoesMaisRecentes,
  sugerirPosicaoMateria
} = require('../news-utils');

test('normalizes edition status and preserves valid dates and identifiers', () => {
  const edicao = normalizarEdicao({
    id: 'edicao_123',
    numero: '2',
    data: '2026-11-17',
    nome: ' Edição teste ',
    status: 'Rascunho',
    criadoEm: '2026-11-16T10:00:00.000Z'
  });

  assert.equal(edicao.id, 'edicao_123');
  assert.equal(edicao.numero, 2);
  assert.equal(edicao.titulo, 'Edição teste');
  assert.equal(edicao.status, 'Editando');
  assert.equal(edicao.criadoEm, '2026-11-16 10:00:00.000');
  assert.equal(edicao.fechadaEm, null);
});

test('normalizes matter fields while preserving image paths and timestamps', () => {
  const materia = normalizarMateria({
    id: 'materia_123',
    coluna: '2',
    ordem: '3',
    tipo: 'imagem-grande',
    titulo: '  Notícia  ',
    imagem: './imagens/materias/foto.jpg',
    criadoEm: '2026-11-17T10:00:00.000Z',
    atualizadoEm: '2026-11-17T11:00:00.000Z'
  });

  assert.equal(materia.id, 'materia_123');
  assert.equal(materia.coluna, 2);
  assert.equal(materia.ordem, 3);
  assert.equal(materia.titulo, 'Notícia');
  assert.equal(materia.status, 'Ativo');
  assert.equal(materia.imagem, '/imagens/materias/foto.jpg');
  assert.equal(materia.criadoEm, '2026-11-17 10:00:00.000');
});

test('rejects invalid edition dates and incomplete matters', () => {
  assert.throws(() => normalizarEdicao({ numero: 1, data: '2026-02-30' }), /data válida/);
  assert.throws(() => normalizarMateria({
    coluna: 4, ordem: 1, tipo: 'texto', titulo: 'Notícia'
  }), /coluna válida/);
  assert.throws(() => normalizarMateria({
    coluna: 1, ordem: 1, tipo: 'tipo-inválido', titulo: 'Notícia'
  }), /formato válido/);
});

test('uses the latest complete snapshot for each edition ID', () => {
  const snapshots = [
    { id: 'edicao_1', atualizadoEm: '2026-11-16T12:00:00.000Z', materias: [{ id: 'antiga' }] },
    { id: 'edicao_2', atualizadoEm: '2026-11-18T12:00:00.000Z', materias: [] },
    { id: 'edicao_1', atualizadoEm: '2026-11-19T12:00:00.000Z', materias: [{ id: 'atual' }] }
  ];

  const selecionadas = selecionarEdicoesMaisRecentes(snapshots);
  assert.deepEqual(selecionadas.map(edicao => edicao.id), ['edicao_1', 'edicao_2']);
  assert.equal(selecionadas[0].materias[0].id, 'atual');
});

test('suggests the first empty column, least-filled column, and next forced order', () => {
  assert.deepEqual(sugerirPosicaoMateria([]), { coluna: 1, ordem: 1 });
  assert.deepEqual(sugerirPosicaoMateria([
    { coluna: 1, ordem: 1 },
    { coluna: 2, ordem: 1 }
  ]), { coluna: 3, ordem: 1 });
  assert.deepEqual(sugerirPosicaoMateria([
    { coluna: 1, ordem: 1 },
    { coluna: 1, ordem: 3 },
    { coluna: 2, ordem: 1 },
    { coluna: 3, ordem: 1 }
  ]), { coluna: 2, ordem: 2 });
  assert.deepEqual(sugerirPosicaoMateria([
    { coluna: 1, ordem: 1 },
    { coluna: 1, ordem: 3 }
  ], 1), { coluna: 1, ordem: 4 });
});
