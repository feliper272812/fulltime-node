const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validarCNPJ,
  normalizarClientePJ,
  formatarCNPJ,
  formatarDataBR
} = require('../clientes-pj-utils');

test('validates numeric and alphanumeric CNPJs', () => {
  assert.equal(validarCNPJ('11.222.333/0001-81'), true);
  assert.equal(validarCNPJ('12.ABC.345/01DE-35'), true);
  assert.equal(validarCNPJ('00.000.000/0000-00'), false);
});

test('normalizes company input and rejects invalid CNPJ except unchanged legacy values', () => {
  const cliente = normalizarClientePJ({
    razaoSocial: '  Empresa de Teste  ',
    cnpj: '11.222.333/0001-81',
    dataAbertura: '2020-05-04',
    estado: 'rs'
  });

  assert.equal(cliente.razaoSocial, 'Empresa de Teste');
  assert.equal(cliente.cnpj, '11222333000181');
  assert.equal(cliente.dataAbertura, '2020-05-04');
  assert.equal(cliente.estado, 'RS');
  assert.equal(cliente.id, null);
  assert.equal(cliente.cnpjValido, true);

  assert.throws(() => normalizarClientePJ({
    razaoSocial: 'Empresa legada',
    cnpj: '12.345.678/0001-99'
  }), /CNPJ válido/);

  const legado = normalizarClientePJ({
    razaoSocial: 'Empresa legada',
    cnpj: '12.345.678/0001-99'
  }, { cnpjLegadoPermitido: '12345678000199' });
  assert.equal(legado.cnpjValido, false);
});

test('rejects invalid company fields and formats display values', () => {
  assert.throws(() => normalizarClientePJ({ razaoSocial: 'Teste', cnpj: '00000000000000' }), /CNPJ válido/);
  assert.throws(() => normalizarClientePJ({
    razaoSocial: 'Teste',
    cnpj: '11.222.333/0001-81',
    dataAbertura: '2024-02-30'
  }), /data de abertura contém uma data inválida/);
  assert.equal(formatarCNPJ('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatarDataBR('2020-05-04'), '04/05/2020');
});
