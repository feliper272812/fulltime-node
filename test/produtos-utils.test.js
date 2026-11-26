const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarProduto, formatarMoeda } = require('../produtos-utils');

test('normalizes product fields, dates, and decimal quantities', () => {
  const produto = normalizarProduto({
    id: '7',
    codigo: '  P000007 ',
    nome: 'Produto de teste',
    codigoBarras: '7890000000007',
    precoVenda: '9,99',
    estoque: '1,250',
    unidade: 'KG',
    dataAlteracao: '2026-07-01 08:30:00'
  });

  assert.equal(produto.id, 7);
  assert.equal(produto.codigo, 'P000007');
  assert.equal(produto.precoVenda, 9.99);
  assert.equal(produto.estoque, 1.25);
  assert.equal(produto.unidade, 'KG');
  assert.equal(produto.dataAlteracao, '2026-07-01T08:30:00.000Z');
});

test('requires a code and product name and rejects invalid monetary and image values', () => {
  assert.throws(() => normalizarProduto({ nome: 'Sem código' }), /código/);
  assert.throws(() => normalizarProduto({ codigo: 'P1' }), /nome do produto/);
  assert.throws(() => normalizarProduto({
    codigo: 'P1', nome: 'Produto', precoVenda: -1
  }), /preço de venda/);
  assert.throws(() => normalizarProduto({
    codigo: 'P1', nome: 'Produto', imagemBase64: 'javascript:alert(1)'
  }), /formato válido/);
});

test('formats currency for the product table', () => {
  assert.equal(formatarMoeda(9.9), 'R$ 9,90');
});
