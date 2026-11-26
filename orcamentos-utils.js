const { dataHoraParaMySQL, dataHoraDoMySQL } = require('./clientes-pj-utils');

const MAX_ITENS = 1000;
const MAX_TOTAL_CENTAVOS = 99999999999999;

function dataISO(valor, rotulo) {
  if (valor == null || valor === '') return new Date().toISOString();
  if (typeof valor !== 'string') throw new Error(`O campo ${rotulo} contém uma data inválida.`);

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) throw new Error(`O campo ${rotulo} contém uma data inválida.`);
  return data.toISOString();
}

function normalizarOrcamento(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('Registro de orçamento inválido.');
  }

  let id = null;
  if (dados.id !== undefined && dados.id !== null && dados.id !== '') {
    id = Number(dados.id);
    if (!Number.isSafeInteger(id) || id < 1 || id > 4294967295) {
      throw new Error('O ID do orçamento é inválido.');
    }
  }

  if (typeof dados.cliente !== 'string' || dados.cliente.trim().length === 0) {
    throw new Error('Informe o cliente do orçamento.');
  }
  const cliente = dados.cliente.trim();
  if (cliente.length > 255) throw new Error('O nome do cliente excede o limite permitido.');

  let itens = dados.itens;
  if (typeof itens === 'string') {
    try {
      itens = JSON.parse(itens);
    } catch {
      throw new Error('A lista de itens do orçamento é inválida.');
    }
  }
  if (!Array.isArray(itens) || itens.length === 0 || itens.length > MAX_ITENS) {
    throw new Error(`O orçamento deve conter entre 1 e ${MAX_ITENS} itens.`);
  }

  let totalCentavos = 0;
  const itensNormalizados = itens.map((item, indice) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`O item ${indice + 1} é inválido.`);
    }

    if (typeof item.descricao !== 'string' || item.descricao.trim().length === 0) {
      throw new Error(`Informe a descrição do item ${indice + 1}.`);
    }
    const descricao = item.descricao.trim();
    if (descricao.length > 1000) {
      throw new Error(`A descrição do item ${indice + 1} excede o limite permitido.`);
    }

    const quantidade = Number(item.quantidade);
    if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 1000000) {
      throw new Error(`Informe uma quantidade válida para o item ${indice + 1}.`);
    }

    const valorBruto = item.valorUnitario;
    const valorUnitario = Number(
      typeof valorBruto === 'string' ? valorBruto.replace(',', '.').trim() : valorBruto
    );
    if (!Number.isFinite(valorUnitario) || valorUnitario <= 0 || valorUnitario > 9999999999.99) {
      throw new Error(`Informe um preço unitário válido para o item ${indice + 1}.`);
    }

    const valorUnitarioCentavos = Math.round(valorUnitario * 100);
    const subtotalCentavos = valorUnitarioCentavos * quantidade;
    if (!Number.isSafeInteger(subtotalCentavos) || subtotalCentavos <= 0) {
      throw new Error(`O subtotal do item ${indice + 1} excede o limite permitido.`);
    }
    totalCentavos += subtotalCentavos;
    if (!Number.isSafeInteger(totalCentavos) || totalCentavos > MAX_TOTAL_CENTAVOS) {
      throw new Error('O valor total do orçamento excede o limite permitido.');
    }

    return {
      descricao,
      quantidade,
      valorUnitario: Number((valorUnitarioCentavos / 100).toFixed(2)),
      subtotal: Number((subtotalCentavos / 100).toFixed(2))
    };
  });

  return {
    id,
    cliente,
    itens: itensNormalizados,
    valorTotal: Number((totalCentavos / 100).toFixed(2)),
    dataCadastro: dataISO(dados.dataCadastro, 'data de cadastro'),
    dataAlteracao: dataISO(dados.dataAlteracao, 'data de alteração')
  };
}

module.exports = {
  normalizarOrcamento,
  dataHoraParaMySQL,
  dataHoraDoMySQL
};
