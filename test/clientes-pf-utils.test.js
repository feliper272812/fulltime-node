const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validarCPF,
  normalizarClientePF,
  formatarCPF,
  formatarDataBR
} = require('../clientes-pf-utils');

test('validates CPF and normalizes client input for MySQL', () => {
  assert.equal(validarCPF('529.982.247-25'), true);
  assert.equal(validarCPF('111.111.111-11'), false);

  const cliente = normalizarClientePF({
    nome: '  Cliente de Teste  ',
    cpf: '529.982.247-25',
    dataNasc: '1990-05-04',
    estado: 'rs'
  });

  assert.equal(cliente.nomeCompleto, 'Cliente de Teste');
  assert.equal(cliente.cpf, '52998224725');
  assert.equal(cliente.dataNascimento, '1990-05-04');
  assert.equal(cliente.estado, 'RS');
  assert.equal(cliente.id, null);
});

test('rejects invalid CPF and formats stored values for display', () => {
  assert.throws(() => normalizarClientePF({ nomeCompleto: 'Teste', cpf: '00000000000' }), /CPF válido/);
  assert.equal(formatarCPF('52998224725'), '529.982.247-25');
  assert.equal(formatarDataBR('1990-05-04'), '04/05/1990');
});
