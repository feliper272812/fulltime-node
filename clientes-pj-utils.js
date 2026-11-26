const ESTADOS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

function textoCampo(dados, nomes, maximo, rotulo) {
  const nome = nomes.find(chave => dados[chave] !== undefined);
  const valor = nome ? dados[nome] : '';
  if (valor !== null && typeof valor !== 'string' && typeof valor !== 'number') {
    throw new Error(`O campo ${rotulo} é inválido.`);
  }

  const texto = valor == null ? '' : String(valor).trim();
  if (texto.length > maximo) throw new Error(`O campo ${rotulo} excede o limite permitido.`);
  return texto;
}

function dataISO(valor, rotulo, apenasData = false) {
  if (valor == null || valor === '') return null;
  if (typeof valor !== 'string') throw new Error(`O campo ${rotulo} é inválido.`);

  if (apenasData) {
    const data = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
    if (!data) throw new Error(`O campo ${rotulo} contém uma data inválida.`);
    const dataUTC = new Date(`${data[1]}T00:00:00.000Z`);
    if (Number.isNaN(dataUTC.getTime()) || dataUTC.toISOString().slice(0, 10) !== data[1]) {
      throw new Error(`O campo ${rotulo} contém uma data inválida.`);
    }
    return data[1];
  }

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) throw new Error(`O campo ${rotulo} contém uma data inválida.`);
  return data.toISOString();
}

function normalizarCNPJ(valor) {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function calcularDigitoCNPJ(base, pesos) {
  const soma = [...base].reduce((total, caractere, indice) => (
    total + (caractere.charCodeAt(0) - 48) * pesos[indice]
  ), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function validarCNPJ(valor) {
  const cnpj = normalizarCNPJ(valor);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([A-Z0-9])\1+$/.test(cnpj)) return false;

  const primeiroDigito = calcularDigitoCNPJ(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundoDigito = calcularDigitoCNPJ(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiroDigito === Number(cnpj[12]) && segundoDigito === Number(cnpj[13]);
}

function normalizarClientePJ(dados, opcoes = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('Registro de cliente inválido.');
  }

  const razaoSocial = textoCampo(dados, ['razaoSocial', 'razao', 'nomeCompleto', 'nome'], 200, 'razão social');
  if (!razaoSocial) throw new Error('Informe a razão social.');

  const cnpj = normalizarCNPJ(textoCampo(dados, ['cnpj'], 20, 'CNPJ'));
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) throw new Error('Informe um CNPJ com 14 caracteres válidos.');
  const cnpjValido = validarCNPJ(cnpj);
  const cnpjLegadoPermitido = opcoes.cnpjLegadoPermitido
    ? normalizarCNPJ(opcoes.cnpjLegadoPermitido) === cnpj
    : false;
  if (!cnpjValido && !opcoes.permitirCnpjInvalido && !cnpjLegadoPermitido) {
    throw new Error('Informe um CNPJ válido.');
  }

  let id = null;
  if (dados.id !== undefined && dados.id !== null && dados.id !== '') {
    id = Number(dados.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('O ID do cliente é inválido.');
  }

  const estado = textoCampo(dados, ['estado'], 2, 'estado').toUpperCase();
  if (estado && !ESTADOS.includes(estado)) throw new Error('Informe uma UF válida.');
  const agora = new Date().toISOString();

  return {
    id,
    razaoSocial,
    cnpj,
    cnpjValido,
    nomeFantasia: textoCampo(dados, ['nomeFantasia', 'fantasia'], 200, 'nome fantasia'),
    ie: textoCampo(dados, ['ie', 'inscricaoEstadual'], 30, 'inscrição estadual'),
    dataAbertura: dataISO(textoCampo(dados, ['dataAbertura'], 40, 'data de abertura'), 'data de abertura', true),
    porte: textoCampo(dados, ['porte'], 60, 'porte'),
    regimeTributario: textoCampo(dados, ['regimeTributario'], 80, 'regime tributário'),
    nomeResponsavel: textoCampo(dados, ['nomeResponsavel', 'responsavel'], 200, 'responsável'),
    cargo: textoCampo(dados, ['cargo'], 100, 'cargo'),
    telefone: textoCampo(dados, ['telefone'], 30, 'telefone'),
    celular: textoCampo(dados, ['celular'], 30, 'celular'),
    email: textoCampo(dados, ['email'], 254, 'e-mail'),
    cep: textoCampo(dados, ['cep'], 9, 'CEP'),
    rua: textoCampo(dados, ['rua', 'endereco'], 255, 'rua'),
    numero: textoCampo(dados, ['numero'], 40, 'número'),
    bairro: textoCampo(dados, ['bairro'], 150, 'bairro'),
    cidade: textoCampo(dados, ['cidade'], 150, 'cidade'),
    estado,
    observacoes: textoCampo(dados, ['observacoes', 'obs'], 10000, 'observações'),
    dataCadastro: dataISO(dados.dataCadastro, 'data de cadastro') || agora,
    dataAlteracao: dataISO(dados.dataAlteracao, 'data de alteração') || agora
  };
}

function formatarCNPJ(valor) {
  const cnpj = normalizarCNPJ(valor);
  return cnpj.length === 14
    ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
    : String(valor || '');
}

function dataHoraParaMySQL(valor) {
  return new Date(valor).toISOString().slice(0, 23).replace('T', ' ');
}

function dataHoraDoMySQL(valor) {
  if (!valor) return '';
  const texto = String(valor);
  return texto.endsWith('Z') ? texto : `${texto.replace(' ', 'T')}Z`;
}

function formatarDataBR(valor) {
  if (!valor) return '—';
  const data = String(valor).slice(0, 10);
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : String(valor);
}

module.exports = {
  validarCNPJ,
  normalizarCNPJ,
  normalizarClientePJ,
  formatarCNPJ,
  dataHoraParaMySQL,
  dataHoraDoMySQL,
  formatarDataBR
};
