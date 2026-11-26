const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { normalizarOrcamento, dataHoraParaMySQL } = require('../orcamentos-utils');
const {
  CREATE_TABLE_ORCAMENTOS_SQL,
  CREATE_TABLE_ORCAMENTO_ITENS_SQL
} = require('../orcamentos-schema');

const DB_NAME = 'fulltime_db';
const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  port: 3306
};

async function importarOrcamentos() {
  const caminho = path.join(__dirname, '..', 'data', 'cadOrcamentos.json');
  const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  if (!Array.isArray(dados) || dados.length === 0) {
    throw new Error('cadOrcamentos.json deve conter uma lista não vazia de orçamentos.');
  }

  const orcamentos = dados.map(normalizarOrcamento);
  const ids = new Set();
  for (const orcamento of orcamentos) {
    if (orcamento.id === null) {
      throw new Error('Há orçamento sem ID válido no JSON; importação cancelada.');
    }
    if (ids.has(orcamento.id)) {
      throw new Error('O JSON contém IDs de orçamento duplicados; importação cancelada.');
    }
    ids.add(orcamento.id);
  }

  const conn = await mysql.createConnection(dbConfig);
  let transacaoIniciada = false;
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);
    await conn.query(CREATE_TABLE_ORCAMENTOS_SQL);
    await conn.query(CREATE_TABLE_ORCAMENTO_ITENS_SQL);

    const [[orcamentosExistentes]] = await conn.query('SELECT COUNT(*) AS total FROM orcamentos');
    const [[itensExistentes]] = await conn.query('SELECT COUNT(*) AS total FROM orcamento_itens');
    if (Number(orcamentosExistentes.total) > 0 || Number(itensExistentes.total) > 0) {
      throw new Error('As tabelas de orçamentos já contêm registros; importação cancelada para evitar duplicação ou sobrescrita.');
    }

    await conn.beginTransaction();
    transacaoIniciada = true;
    for (const orcamento of orcamentos) {
      await conn.execute(
        `INSERT INTO orcamentos (id, cliente, valor_total, data_cadastro, data_alteracao)
         VALUES (?, ?, ?, ?, ?)`,
        [
          orcamento.id,
          orcamento.cliente,
          orcamento.valorTotal,
          dataHoraParaMySQL(orcamento.dataCadastro),
          dataHoraParaMySQL(orcamento.dataAlteracao)
        ]
      );

      for (let indice = 0; indice < orcamento.itens.length; indice++) {
        const item = orcamento.itens[indice];
        await conn.execute(
          `INSERT INTO orcamento_itens (
            orcamento_id, sequencia, descricao, quantidade, valor_unitario, subtotal
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            orcamento.id,
            indice + 1,
            item.descricao,
            item.quantidade,
            item.valorUnitario,
            item.subtotal
          ]
        );
      }
    }

    await conn.commit();
    transacaoIniciada = false;
    console.log(`Importação concluída: ${orcamentos.length} orçamento(s) e ${orcamentos.reduce((total, item) => total + item.itens.length, 0)} item(ns).`);
  } catch (erro) {
    if (transacaoIniciada) await conn.rollback();
    throw erro;
  } finally {
    await conn.end();
  }
}

importarOrcamentos().catch(erro => {
  console.error('Não foi possível importar cadOrcamentos.json:', erro.message);
  process.exitCode = 1;
});
