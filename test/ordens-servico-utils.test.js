const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarOrdemServico } = require('../ordens-servico-utils');

test('normalizes service order fields and calculates total on the server', () => {
  const ordem = normalizarOrdemServico({
    id: '000012',
    dataAbertura: '2026-11-20',
    status: 'em andamento',
    prioridade: 'alta',
    cliente: ' Cliente Fictício ',
    relatoProblema: ' Não liga ',
    maoDeObra: '120,50',
    pecas: 30,
    desconto: 10
  });

  assert.equal(ordem.id, 12);
  assert.equal(ordem.cliente, 'Cliente Fictício');
  assert.equal(ordem.status, 'Em Andamento');
  assert.equal(ordem.prioridade, 'Alta');
  assert.equal(ordem.valorTotal, 140.5);
  assert.equal(ordem.dataAbertura, '2026-11-20');
});

test('rejects invalid service orders, dates, and discounts', () => {
  assert.throws(() => normalizarOrdemServico({ cliente: '', relatoProblema: 'Falha' }), /cliente/);
  assert.throws(() => normalizarOrdemServico({ cliente: 'Cliente', relatoProblema: '' }), /relato/);
  assert.throws(() => normalizarOrdemServico({
    cliente: 'Cliente',
    relatoProblema: 'Falha',
    dataAbertura: '2026-02-30'
  }), /data de abertura/);
  assert.throws(() => normalizarOrdemServico({
    cliente: 'Cliente',
    relatoProblema: 'Falha',
    maoDeObra: 10,
    desconto: 11
  }), /desconto/);
  assert.throws(() => normalizarOrdemServico({
    cliente: 'Cliente',
    relatoProblema: 'Falha',
    status: 'Pendente'
  }), /status/);
});
