const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const {
  normalizarClientePJ,
  normalizarCNPJ,
  dataHoraParaMySQL
} = require('../clientes-pj-utils');
const { CREATE_TABLE_CLIENTES_PJ_SQL } = require('../clientes-pj-schema');

const DB_NAME = 'fulltime_db';
const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  port: 3306
};

async function importarClientesPJ() {
  const caminho = path.join(__dirname, '..', 'data', 'cadclientesPJ.json');
  const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  if (!Array.isArray(dados) || dados.length === 0) {
    throw new Error('cadclientesPJ.json deve conter uma lista não vazia de clientes.');
  }

  const clientes = dados.map(item => normalizarClientePJ(item, { permitirCnpjInvalido: true }));
  const ids = new Set();
  const cnpjs = new Set();
  for (const cliente of clientes) {
    if (cliente.id === null) throw new Error('Há registro sem ID válido no JSON; importação cancelada.');
    if (ids.has(cliente.id)) throw new Error('O JSON contém IDs duplicados; importação cancelada.');
    if (cnpjs.has(cliente.cnpj)) throw new Error('O JSON contém CNPJs duplicados; importação cancelada.');
    ids.add(cliente.id);
    cnpjs.add(cliente.cnpj);
  }

  const conn = await mysql.createConnection(dbConfig);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);
    await conn.query(CREATE_TABLE_CLIENTES_PJ_SQL);

    const [existentes] = await conn.query('SELECT COUNT(*) AS total FROM clientes_pj');
    if (Number(existentes[0].total) > 0) {
      throw new Error('A tabela clientes_pj já contém registros; importação cancelada para evitar duplicação ou sobrescrita.');
    }

    await conn.beginTransaction();
    for (const cliente of clientes) {
      await conn.execute(
        `INSERT INTO clientes_pj (
          id, razao_social, cnpj, nome_fantasia, ie, data_abertura, porte,
          regime_tributario, nome_responsavel, cargo, telefone, celular, email,
          cep, rua, numero, bairro, cidade, estado, observacoes, data_cadastro, data_alteracao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cliente.id, cliente.razaoSocial, cliente.cnpj, cliente.nomeFantasia || null,
          cliente.ie || null, cliente.dataAbertura, cliente.porte || null,
          cliente.regimeTributario || null, cliente.nomeResponsavel || null,
          cliente.cargo || null, cliente.telefone || null, cliente.celular || null,
          cliente.email || null, cliente.cep || null, cliente.rua || null,
          cliente.numero || null, cliente.bairro || null, cliente.cidade || null,
          cliente.estado || null, cliente.observacoes || null,
          dataHoraParaMySQL(cliente.dataCadastro), dataHoraParaMySQL(cliente.dataAlteracao)
        ]
      );
    }
    await conn.commit();

    const cnpjsInvalidos = clientes.filter(cliente => !cliente.cnpjValido).length;
    console.log(`Importação concluída: ${clientes.length} registro(s), ${cnpjsInvalidos} CNPJ(s) legado(s) sinalizado(s). Nenhum dado pessoal foi exibido.`);
  } catch (erro) {
    await conn.rollback();
    throw erro;
  } finally {
    await conn.end();
  }
}

importarClientesPJ().catch(erro => {
  console.error('Não foi possível importar cadclientesPJ.json:', erro.message);
  process.exitCode = 1;
});
