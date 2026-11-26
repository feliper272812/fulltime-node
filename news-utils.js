const { randomBytes } = require('crypto');

const STATUS_EDICOES = ['Editando', 'Fechada'];
const TIPOS_MATERIA = ['foto-esquerda', 'imagem-grande', 'texto', 'manchete', 'opiniao'];
const STATUS_MATERIA = ['Ativo', 'Inativo'];

function lerTexto(dados, campo, maximo, rotulo, obrigatorio = false) {
  const valor = dados[campo];
  if (valor !== undefined && valor !== null && typeof valor !== 'string' && typeof valor !== 'number') {
    throw new Error(`O campo ${rotulo} é inválido.`);
  }
  const texto = valor == null ? '' : String(valor).trim();
  if (texto.length > maximo) throw new Error(`O campo ${rotulo} excede o limite permitido.`);
  if (obrigatorio && !texto) throw new Error(`Informe ${rotulo}.`);
  return texto;
}

function dataValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function dataHoraParaMySQL(valor) {
  const data = valor == null || valor === '' ? new Date() : new Date(valor);
  if (Number.isNaN(data.getTime())) throw new Error('Uma data de atualização é inválida.');
  return data.toISOString().slice(0, 23).replace('T', ' ');
}

function normalizarId(valor, rotulo) {
  const id = lerTexto({ id: valor }, 'id', 80, rotulo, true);
  if (!/^[\w-]+$/.test(id)) throw new Error(`O ${rotulo} contém caracteres inválidos.`);
  return id;
}

function normalizarStatusEdicao(valor) {
  const status = String(valor || '').trim().toLocaleLowerCase('pt-BR');
  if (status === 'fechada' || status === 'publicada') return 'Fechada';
  return 'Editando';
}

function dataHoraParaNomeArquivo(data) {
  return `edicao-${data.slice(8, 10)}${data.slice(5, 7)}${data.slice(0, 4)}.html`;
}

function normalizarEdicao(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('Registro de edição inválido.');
  }

  const data = dados.data;
  if (!dataValida(data)) throw new Error('Informe uma data válida para a edição.');
  const numero = Number(dados.numero);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 4294967295) {
    throw new Error('Informe um número de edição válido (1 ou mais).');
  }
  const titulo = lerTexto(dados, 'titulo', 120, 'o título') ||
    lerTexto(dados, 'nome', 120, 'o título') ||
    `Edição de ${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
  const status = normalizarStatusEdicao(dados.status);
  const agora = new Date().toISOString();
  const fechadaEm = status === 'Fechada'
    ? dataHoraParaMySQL(dados.fechadaEm || dados.atualizadoEm || agora)
    : null;

  return {
    id: dados.id ? normalizarId(dados.id, 'ID da edição') : null,
    numero,
    data,
    titulo,
    status,
    responsavel: lerTexto(dados, 'responsavel', 120, 'o responsável') || null,
    observacao: lerTexto(dados, 'observacao', 400, 'a observação') || null,
    arquivo: lerTexto(dados, 'arquivo', 255, 'o nome do arquivo') || dataHoraParaNomeArquivo(data),
    criadoEm: dataHoraParaMySQL(dados.criadoEm || agora),
    atualizadoEm: dataHoraParaMySQL(dados.atualizadoEm || agora),
    fechadaEm
  };
}

function normalizarMateria(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('Registro de matéria inválido.');
  }

  const coluna = Number(dados.coluna);
  if (![1, 2, 3].includes(coluna)) throw new Error('Selecione uma coluna válida.');
  const ordem = Number(dados.ordem == null || dados.ordem === '' ? 1 : dados.ordem);
  if (!Number.isSafeInteger(ordem) || ordem < 1 || ordem > 4294967295) {
    throw new Error('Informe uma ordem válida (1 ou mais).');
  }

  const tipo = lerTexto(dados, 'tipo', 30, 'o formato', true);
  if (!TIPOS_MATERIA.includes(tipo)) throw new Error('Selecione um formato válido para a matéria.');
  const status = lerTexto(dados, 'status', 16, 'o status') || 'Ativo';
  if (!STATUS_MATERIA.includes(status)) throw new Error('Selecione um status válido para a matéria.');
  const agora = new Date().toISOString();
  const imagem = normalizarImagem(lerTexto(dados, 'imagem', 16000000, 'a imagem'));

  return {
    id: dados.id ? normalizarId(dados.id, 'ID da matéria') : null,
    coluna,
    ordem,
    tipo,
    status,
    categoria: lerTexto(dados, 'categoria', 40, 'a categoria') || null,
    titulo: lerTexto(dados, 'titulo', 200, 'o título', true),
    link: lerTexto(dados, 'link', 2000, 'o link') || '#',
    resumo: lerTexto(dados, 'resumo', 5000, 'o texto') || null,
    autor: lerTexto(dados, 'autor', 120, 'o autor') || null,
    tempo: lerTexto(dados, 'tempo', 40, 'o tempo de publicação') || null,
    imagem: imagem || null,
    legenda: lerTexto(dados, 'legenda', 200, 'a legenda') || null,
    criadoEm: dataHoraParaMySQL(dados.criadoEm || agora),
    atualizadoEm: dataHoraParaMySQL(dados.atualizadoEm || agora)
  };
}

function normalizarImagem(valor) {
  const imagem = String(valor || '').trim().replace(/\\/g, '/');
  if (!imagem) return '';
  if (/^https?:\/\//i.test(imagem) || /^data:image\//i.test(imagem)) return imagem;

  const pastaLegada = /^(?:\.\/)?imagens\/materias\/(.+)$/i.exec(imagem);
  if (pastaLegada) return `/imagens/materias/${pastaLegada[1].split('/').pop()}`;

  const pastaPublica = /^(?:\.\/)?images\/Materias\/(.+)$/i.exec(imagem);
  if (pastaPublica) return `/images/Materias/${pastaPublica[1].split('/').pop()}`;

  if (!imagem.includes('/')) return `/imagens/materias/${imagem}`;
  if (imagem.startsWith('/')) return imagem;
  throw new Error('O caminho da imagem deve ser local, HTTP(S) ou uma imagem Base64.');
}

function selecionarEdicoesMaisRecentes(edicoes) {
  const maisRecentes = new Map();
  for (const edicao of edicoes) {
    if (!edicao || typeof edicao !== 'object' || !edicao.id || !Array.isArray(edicao.materias)) continue;
    const atual = maisRecentes.get(String(edicao.id));
    const dataEdicao = Date.parse(edicao.atualizadoEm || edicao.criadoEm || '') || 0;
    const dataAtual = atual ? Date.parse(atual.atualizadoEm || atual.criadoEm || '') || 0 : -1;
    if (!atual || dataEdicao >= dataAtual) maisRecentes.set(String(edicao.id), edicao);
  }
  return Array.from(maisRecentes.values());
}

function sugerirPosicaoMateria(materias, colunaForcada) {
  const itens = Array.isArray(materias) ? materias : [];
  const coluna = Number(colunaForcada);
  if ([1, 2, 3].includes(coluna)) {
    const ordens = itens
      .filter(materia => Number(materia.coluna) === coluna)
      .map(materia => Number(materia.ordem) || 0);
    return { coluna, ordem: Math.max(0, ...ordens) + 1 };
  }

  const porColuna = new Map([1, 2, 3].map(numero => [
    numero,
    itens.filter(materia => Number(materia.coluna) === numero)
  ]));
  for (const numero of [1, 2, 3]) {
    if (porColuna.get(numero).length === 0) return { coluna: numero, ordem: 1 };
  }

  let sugestao = { coluna: 1, ordem: 1 };
  let menorQuantidade = Infinity;
  for (const numero of [1, 2, 3]) {
    const ordens = porColuna.get(numero)
      .map(materia => Number(materia.ordem) || 0)
      .sort((a, b) => a - b);
    let proximaOrdem = 1;
    for (const ordem of ordens) {
      if (ordem === proximaOrdem) proximaOrdem++;
      else if (ordem > proximaOrdem) break;
    }
    if (ordens.length < menorQuantidade) {
      menorQuantidade = ordens.length;
      sugestao = { coluna: numero, ordem: proximaOrdem };
    }
  }
  return sugestao;
}

function gerarId(prefixo) {
  return `${prefixo}_${randomBytes(12).toString('hex')}`;
}

function formatarDataBR(data) {
  if (!dataValida(data)) return String(data || '');
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

function formatarDataHoraBR(valor) {
  if (!valor) return '';
  const data = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(data.getTime())) return '';
  const pad = numero => String(numero).padStart(2, '0');
  return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()} ${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

module.exports = {
  STATUS_EDICOES,
  TIPOS_MATERIA,
  STATUS_MATERIA,
  dataHoraParaMySQL,
  dataValida,
  formatarDataBR,
  formatarDataHoraBR,
  gerarId,
  normalizarEdicao,
  normalizarImagem,
  normalizarMateria,
  normalizarStatusEdicao,
  selecionarEdicoesMaisRecentes,
  sugerirPosicaoMateria
};
