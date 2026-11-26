function validarCPF(valor) {
  const cpf = String(valor || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let resto = soma % 11;
  const primeiroDigito = resto < 2 ? 0 : 11 - resto;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  resto = soma % 11;
  const segundoDigito = resto < 2 ? 0 : 11 - resto;

  return primeiroDigito === Number(cpf[9]) && segundoDigito === Number(cpf[10]);
}

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

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) throw new Error(`O campo ${rotulo} contém uma data inválida.`);
  return apenasData ? data.toISOString().slice(0, 10) : data.toISOString();
}

function normalizarClientePF(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('Registro de cliente inválido.');
  }

  const nomeCompleto = textoCampo(dados, ['nomeCompleto', 'nome'], 200, 'nome');
  if (!nomeCompleto) throw new Error('Informe o nome completo.');

  const cpf = textoCampo(dados, ['cpf'], 20, 'CPF').replace(/\D/g, '');
  if (!validarCPF(cpf)) throw new Error('Informe um CPF válido.');

  let id = null;
  if (dados.id !== undefined && dados.id !== null && dados.id !== '') {
    id = Number(dados.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('O ID do cliente é inválido.');
  }

  const estado = textoCampo(dados, ['estado'], 2, 'estado').toUpperCase();
  const agora = new Date().toISOString();

  return {
    id,
    nomeCompleto,
    cpf,
    dataNascimento: dataISO(textoCampo(dados, ['dataNascimento', 'dataNasc'], 40, 'data de nascimento'), 'data de nascimento', true),
    rg: textoCampo(dados, ['rg'], 30, 'RG'),
    sexo: textoCampo(dados, ['sexo'], 20, 'sexo'),
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

function formatarCPF(valor) {
  const cpf = String(valor || '').replace(/\D/g, '');
  return cpf.length === 11
    ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
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
  validarCPF,
  normalizarClientePF,
  formatarCPF,
  dataHoraParaMySQL,
  dataHoraDoMySQL,
  formatarDataBR
};
