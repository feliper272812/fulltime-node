const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const {
  normalizarFornecedor,
  gerarCNPJFicticio,
  normalizarCNPJ,
  validarCNPJ,
  dataHoraParaMySQL
} = require('../fornecedores-utils');
const { CREATE_TABLE_FORNECEDORES_SQL } = require('../fornecedores-schema');

const DB_NAME = 'fulltime_db';
const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  port: 3306
};

async function importarFornecedores() {
  const caminho = path.join(__dirname, '..', 'data', 'cadFornecedores.json');
  const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  if (!Array.isArray(dados) || dados.length === 0) {
    throw new Error('cadFornecedores.json deve conter uma lista não vazia de fornecedores.');
  }

  const ocupados = new Set(
    dados.map(item => normalizarCNPJ(item && item.cnpj)).filter(cnpj => validarCNPJ(cnpj))
  );
  let cnpjsCorrigidos = 0;
  const fornecedores = dados.map(item => {
    const registro = { ...item };
    if (!validarCNPJ(registro.cnpj)) {
      registro.cnpj = gerarCNPJFicticio(ocupados);
      ocupados.add(registro.cnpj);
      cnpjsCorrigidos++;
    }
    return normalizarFornecedor(registro);
  });

  const ids = new Set();
  const cnpjs = new Set();
  for (const fornecedor of fornecedores) {
    if (fornecedor.id === null) throw new Error('Há registro sem ID válido no JSON; importação cancelada.');
    if (ids.has(fornecedor.id)) throw new Error('O JSON contém IDs duplicados; importação cancelada.');
    if (cnpjs.has(fornecedor.cnpj)) throw new Error('O JSON contém CNPJs duplicados; importação cancelada.');
    ids.add(fornecedor.id);
    cnpjs.add(fornecedor.cnpj);
  }

  const conn = await mysql.createConnection(dbConfig);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);
    await conn.query(CREATE_TABLE_FORNECEDORES_SQL);

    const [existentes] = await conn.query('SELECT COUNT(*) AS total FROM fornecedores');
    if (Number(existentes[0].total) > 0) {
      throw new Error('A tabela fornecedores já contém registros; importação cancelada para evitar duplicação ou sobrescrita.');
    }

    await conn.beginTransaction();
    for (const fornecedor of fornecedores) {
      await conn.execute(
        `INSERT INTO fornecedores (
          id, razao_social, cnpj, nome_fantasia, ie, data_abertura, porte,
          regime_tributario, nome_responsavel, cargo, telefone, celular, email,
          cep, rua, numero, bairro, cidade, estado, observacoes, data_cadastro, data_alteracao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fornecedor.id, fornecedor.razaoSocial, fornecedor.cnpj,
          fornecedor.nomeFantasia || null, fornecedor.ie || null,
          fornecedor.dataAbertura, fornecedor.porte || null,
          fornecedor.regimeTributario || null, fornecedor.nomeResponsavel || null,
          fornecedor.cargo || null, fornecedor.telefone || null,
          fornecedor.celular || null, fornecedor.email || null,
          fornecedor.cep || null, fornecedor.rua || null,
          fornecedor.numero || null, fornecedor.bairro || null,
          fornecedor.cidade || null, fornecedor.estado || null,
          fornecedor.observacoes || null,
          dataHoraParaMySQL(fornecedor.dataCadastro),
          dataHoraParaMySQL(fornecedor.dataAlteracao)
        ]
      );
    }
    await conn.commit();

    console.log(`Importação concluída: ${fornecedores.length} fornecedor(es); ${cnpjsCorrigidos} CNPJ(s) inválido(s) substituído(s) por valores fictícios válidos.`);
  } catch (erro) {
    await conn.rollback();
    throw erro;
  } finally {
    await conn.end();
  }
}

importarFornecedores().catch(erro => {
  console.error('Não foi possível importar cadFornecedores.json:', erro.message);
  process.exitCode = 1;
});
