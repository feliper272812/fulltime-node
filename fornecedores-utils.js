const {
  normalizarClientePJ,
  normalizarCNPJ,
  validarCNPJ,
  formatarCNPJ,
  dataHoraParaMySQL,
  dataHoraDoMySQL,
  formatarDataBR
} = require('./clientes-pj-utils');

function normalizarFornecedor(dados) {
  try {
    return normalizarClientePJ(dados);
  } catch (erro) {
    if (!(erro instanceof Error)) throw erro;
    throw new Error(erro.message.replace(/\bcliente\b/gi, 'fornecedor'));
  }
}

function gerarCNPJFicticio(ocupados = new Set()) {
  for (let sequencia = 1; sequencia <= 999999; sequencia++) {
    const base = `FTFORN${String(sequencia).padStart(6, '0')}`;
    const primeiroDigito = calcularDigitoCNPJ(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundoDigito = calcularDigitoCNPJ(`${base}${primeiroDigito}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const cnpj = `${base}${primeiroDigito}${segundoDigito}`;
    if (!ocupados.has(cnpj) && validarCNPJ(cnpj)) return cnpj;
  }
  throw new Error('Não foi possível gerar um CNPJ fictício exclusivo.');
}

function calcularDigitoCNPJ(base, pesos) {
  const soma = [...base].reduce((total, caractere, indice) => (
    total + (caractere.charCodeAt(0) - 48) * pesos[indice]
  ), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

module.exports = {
  normalizarFornecedor,
  gerarCNPJFicticio,
  normalizarCNPJ,
  validarCNPJ,
  formatarCNPJ,
  dataHoraParaMySQL,
  dataHoraDoMySQL,
  formatarDataBR
};
