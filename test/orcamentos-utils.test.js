const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarOrcamento } = require('../orcamentos-utils');

test('normalizes quotation items and calculates total on the server', () => {
  const orcamento = normalizarOrcamento({
    id: '12',
    cliente: ' Cliente Exemplo ',
    valorTotal: 0,
    itens: [
      { descricao: ' Serviço ', quantidade: 2, valorUnitario: '10,25' },
      { descricao: 'Peça', quantidade: 1, valorUnitario: 5 }
    ],
    dataCadastro: '2026-10-06T12:47:25.656Z'
  });

  assert.equal(orcamento.id, 12);
  assert.equal(orcamento.cliente, 'Cliente Exemplo');
  assert.equal(orcamento.valorTotal, 25.5);
  assert.equal(orcamento.itens[0].subtotal, 20.5);
  assert.equal(orcamento.dataCadastro, '2026-10-06T12:47:25.656Z');
});

test('accepts JSON-encoded items and rejects incomplete or invalid quotations', () => {
  const orcamento = normalizarOrcamento({
    cliente: 'Cliente',
    itens: '[{"descricao":"Serviço","quantidade":1,"valorUnitario":25}]'
  });
  assert.equal(orcamento.valorTotal, 25);

  assert.throws(() => normalizarOrcamento({ cliente: '', itens: [] }), /cliente/);
  assert.throws(() => normalizarOrcamento({
    cliente: 'Cliente',
    itens: [{ descricao: 'Serviço', quantidade: 0, valorUnitario: 10 }]
  }), /quantidade/);
  assert.throws(() => normalizarOrcamento({
    cliente: 'Cliente',
    itens: [{ descricao: 'Serviço', quantidade: 1, valorUnitario: -1 }]
  }), /preço unitário/);
});
