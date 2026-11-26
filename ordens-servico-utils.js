const { dataHoraParaMySQL, dataHoraDoMySQL } = require('./clientes-pj-utils');

const STATUS_ORDENS_SERVICO = ['Aberta', 'Em Andamento', 'Finalizada', 'Cancelada'];
const PRIORIDADES_ORDENS_SERVICO = ['Baixa', 'Média', 'Alta', 'Urgente'];

function lerTexto(dados, nomes, maximo, rotulo, obrigatorio = false) {
  const nome = nomes.find(chave => dados[chave] !== undefined);
  const valor = nome ? dados[nome] : '';
  if (valor !== null && typeof valor !== 'string' && typeof valor !== 'number') {
    throw new Error(`O campo ${rotulo} é inválido.`);
  }

  const texto = valor == null ? '' : String(valor).trim();
  if (texto.length > maximo) throw new Error(`O campo ${rotulo} excede o limite permitido.`);
  if (obrigatorio && !texto) throw new Error(`Informe ${rotulo}.`);
  return texto;
}

function normalizarDataAbertura(valor) {
  if (valor == null || valor === '') return new Date().toISOString().slice(0, 10);
  if (typeof valor !== 'string') throw new Error('A data de abertura é inválida.');

  const texto = valor.trim();
  const dataBR = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  const dataISO = dataBR ? `${dataBR[3]}-${dataBR[2]}-${dataBR[1]}` : texto.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) throw new Error('A data de abertura é inválida.');
    return data.toISOString().slice(0, 10);
  }

  const data = new Date(`${dataISO}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dataISO) {
    throw new Error('A data de abertura é inválida.');
  }
  return dataISO;
}

function normalizarValor(valor, rotulo) {
  if (valor == null || valor === '') return 0;
  const numero = Number(typeof valor === 'string' ? valor.replace(',', '.').trim() : valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > 9999999999.99) {
    throw new Error(`Informe um valor válido para ${rotulo}.`);
  }
  const centavos = Math.round(numero * 100);
  if (!Number.isSafeInteger(centavos)) throw new Error(`O valor de ${rotulo} excede o limite permitido.`);
  return centavos;
}

function normalizarOpcao(valor, opcoes, rotulo, padrao) {
  const texto = valor == null || valor === '' ? padrao : String(valor).trim();
  const opcao = opcoes.find(item => item.toLocaleLowerCase('pt-BR') === texto.toLocaleLowerCase('pt-BR'));
  if (!opcao) throw new Error(`Selecione uma opção válida para ${rotulo}.`);
  return opcao;
}

function normalizarOrdemServico(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('Registro de ordem de serviço inválido.');
  }

  let id = null;
  const idValor = [dados.id, dados.numeroOS, dados.numeroOs, dados.numero]
    .find(valor => valor !== undefined && valor !== null && valor !== '');
  if (idValor !== undefined && idValor !== null && idValor !== '') {
    id = Number(String(idValor).replace(/^OS[-\s]*/i, ''));
    if (!Number.isSafeInteger(id) || id < 1 || id > 4294967295) {
      throw new Error('O número da ordem de serviço é inválido.');
    }
  }

  const maoDeObraCentavos = normalizarValor(
    dados.maoDeObra ?? dados.mao_obra ?? dados.valorMaoObra,
    'mão de obra'
  );
  const pecasCentavos = normalizarValor(dados.pecas ?? dados.valorPecas, 'peças');
  const descontoCentavos = normalizarValor(dados.desconto ?? dados.valorDesconto, 'desconto');
  const subtotalCentavos = maoDeObraCentavos + pecasCentavos;
  if (descontoCentavos > subtotalCentavos) {
    throw new Error('O desconto não pode ser maior que a soma dos serviços e peças.');
  }
  const totalCentavos = subtotalCentavos - descontoCentavos;

  const cliente = lerTexto(dados, ['cliente', 'clienteNome', 'nomeCliente'], 255, 'o nome do cliente', true);
  const relatoProblema = lerTexto(
    dados,
    ['relatoProblema', 'problema', 'defeito', 'descricaoProblema'],
    10000,
    'o relato do problema',
    true
  );

  return {
    id,
    dataAbertura: normalizarDataAbertura(dados.dataAbertura ?? dados.data_abertura ?? dados.data),
    status: normalizarOpcao(dados.status, STATUS_ORDENS_SERVICO, 'status', 'Aberta'),
    prioridade: normalizarOpcao(dados.prioridade, PRIORIDADES_ORDENS_SERVICO, 'prioridade', 'Média'),
    cliente,
    telefone: lerTexto(dados, ['telefone', 'clienteTelefone', 'telefoneCliente'], 30, 'o telefone'),
    equipamento: lerTexto(dados, ['equipamento', 'produto'], 150, 'o equipamento'),
    marca: lerTexto(dados, ['marca'], 100, 'a marca'),
    modelo: lerTexto(dados, ['modelo'], 100, 'o modelo'),
    numeroSerie: lerTexto(dados, ['numeroSerie', 'numero_serie', 'serie'], 150, 'o número de série'),
    acessorios: lerTexto(dados, ['acessorios', 'acessórios'], 5000, 'os acessórios'),
    relatoProblema,
    servicoExecutado: lerTexto(dados, ['servicoExecutado', 'servico', 'serviço'], 10000, 'o serviço executado'),
    maoDeObra: maoDeObraCentavos / 100,
    pecas: pecasCentavos / 100,
    desconto: descontoCentavos / 100,
    valorTotal: totalCentavos / 100,
    observacoes: lerTexto(dados, ['observacoes', 'observações'], 10000, 'as observações'),
    dataCadastro: dados.dataCadastro || dados.data_cadastro || new Date().toISOString(),
    dataAlteracao: dados.dataAlteracao || dados.data_alteracao || new Date().toISOString()
  };
}

module.exports = {
  STATUS_ORDENS_SERVICO,
  PRIORIDADES_ORDENS_SERVICO,
  normalizarOrdemServico,
  normalizarDataAbertura,
  dataHoraParaMySQL,
  dataHoraDoMySQL
};
