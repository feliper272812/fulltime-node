const {
  dataHoraParaMySQL,
  dataHoraDoMySQL,
  formatarDataBR
} = require('./clientes-pj-utils');

function textoCampo(dados, nomes, maximo, rotulo, obrigatorio = false) {
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

function numeroCampo(valor, rotulo, casasDecimais) {
  if (valor === undefined || valor === null || valor === '') return 0;
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    throw new Error(`O campo ${rotulo} é inválido.`);
  }

  const numero = Number(typeof valor === 'string' ? valor.replace(',', '.').trim() : valor);
  const limite = casasDecimais === 2 ? 9999999999.99 : 999999999.999;
  if (!Number.isFinite(numero) || numero < 0 || numero > limite) {
    throw new Error(`Informe um valor válido para ${rotulo}.`);
  }

  return Number(numero.toFixed(casasDecimais));
}

function dataISO(valor, rotulo) {
  if (valor == null || valor === '') return null;
  if (typeof valor !== 'string') throw new Error(`O campo ${rotulo} é inválido.`);

  const texto = valor.trim();
  const dataComHoraMySQL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(texto);
  const data = new Date(dataComHoraMySQL ? `${texto.replace(' ', 'T')}Z` : texto);
  if (Number.isNaN(data.getTime())) throw new Error(`O campo ${rotulo} contém uma data inválida.`);
  return data.toISOString();
}

function normalizarProduto(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('Registro de produto inválido.');
  }

  let id = null;
  if (dados.id !== undefined && dados.id !== null && dados.id !== '') {
    id = Number(dados.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('O ID do produto é inválido.');
  }

  const imagemBase64 = textoCampo(dados, ['imagemBase64', 'imagem_base64'], 15 * 1024 * 1024, 'imagem');
  if (imagemBase64 && !/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(imagemBase64)) {
    throw new Error('A imagem do produto deve estar em um formato válido.');
  }

  const agora = new Date().toISOString();
  return {
    id,
    codigo: textoCampo(dados, ['codigo', 'Codigo'], 60, 'código', true),
    codigoBarras: textoCampo(dados, ['codigoBarras', 'codBarras', 'codigo_barras'], 100, 'código de barras'),
    sku: textoCampo(dados, ['sku', 'SKU'], 100, 'SKU'),
    nome: textoCampo(dados, ['nome', 'nomeProduto', 'nome_produto'], 255, 'nome do produto', true),
    marca: textoCampo(dados, ['marca'], 150, 'marca'),
    categoria: textoCampo(dados, ['categoria'], 150, 'categoria'),
    unidade: textoCampo(dados, ['unidade', 'unid'], 20, 'unidade') || 'UN',
    ncm: textoCampo(dados, ['ncm'], 20, 'NCM'),
    cest: textoCampo(dados, ['cest'], 20, 'CEST'),
    precoCusto: numeroCampo(dados.precoCusto ?? dados.preco_custo, 'preço de custo', 2),
    precoVenda: numeroCampo(dados.precoVenda ?? dados.preco_venda, 'preço de venda', 2),
    estoque: numeroCampo(dados.estoque, 'estoque', 3),
    estoqueMinimo: numeroCampo(dados.estoqueMinimo ?? dados.estoque_minimo, 'estoque mínimo', 3),
    status: textoCampo(dados, ['status'], 20, 'status') || 'Ativo',
    descricao: textoCampo(dados, ['descricao', 'descrição'], 10000, 'descrição'),
    imagemBase64,
    imagemNome: textoCampo(dados, ['imagemNome', 'imagem_nome'], 255, 'nome da imagem'),
    local: textoCampo(dados, ['local', 'localImagem', 'local_imagem'], 255, 'local da imagem'),
    nomeArquivoImagem: textoCampo(dados, ['nomeArquivoImagem', 'nome_arquivo_imagem'], 255, 'arquivo da imagem'),
    dataCadastro: dataISO(dados.dataCadastro ?? dados.data_cadastro, 'data de cadastro') || agora,
    dataAlteracao: dataISO(dados.dataAlteracao ?? dados.data_alteracao, 'data de alteração') || agora
  };
}

function formatarMoeda(valor) {
  if (valor == null || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = {
  normalizarProduto,
  dataHoraParaMySQL,
  dataHoraDoMySQL,
  formatarDataBR,
  formatarMoeda
};
