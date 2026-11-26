const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarFornecedor,
  gerarCNPJFicticio,
  validarCNPJ,
  formatarCNPJ
} = require('../fornecedores-utils');

test('normalizes supplier data and accepts a valid CNPJ', () => {
  const fornecedor = normalizarFornecedor({
    razaoSocial: '  Fornecedor Fictício  ',
    cnpj: '11.222.333/0001-81',
    dataAbertura: '2020-05-04',
    estado: 'rs'
  });

  assert.equal(fornecedor.razaoSocial, 'Fornecedor Fictício');
  assert.equal(fornecedor.cnpj, '11222333000181');
  assert.equal(fornecedor.estado, 'RS');
  assert.equal(fornecedor.cnpjValido, true);
});

test('rejects invalid supplier CNPJs and formats valid values', () => {
  assert.equal(validarCNPJ('12.345.678/0001-99'), false);
  assert.throws(() => normalizarFornecedor({
    razaoSocial: 'Fornecedor Fictício',
    cnpj: '12.345.678/0001-99'
  }), /CNPJ válido/);
  assert.equal(formatarCNPJ('11222333000181'), '11.222.333/0001-81');
});

test('generates unique valid fictitious CNPJs for invalid legacy records', () => {
  const primeiro = gerarCNPJFicticio();
  const segundo = gerarCNPJFicticio(new Set([primeiro]));

  assert.match(primeiro, /^FTFORN\d{6}\d{2}$/);
  assert.equal(validarCNPJ(primeiro), true);
  assert.notEqual(segundo, primeiro);
  assert.equal(validarCNPJ(segundo), true);
});
