const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { normalizarProduto, dataHoraParaMySQL } = require('../produtos-utils');
const { CREATE_TABLE_PRODUTOS_SQL } = require('../produtos-schema');

const DB_NAME = 'fulltime_db';
const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  port: 3306
};

function validarUnicos(produtos, campo, rotulo, permitirVazio = false) {
  const vistos = new Set();
  for (const produto of produtos) {
    const valor = String(produto[campo] || '').trim().toLocaleUpperCase('pt-BR');
    if (!valor && permitirVazio) continue;
    if (!valor) throw new Error(`Há produto sem ${rotulo}; importação cancelada.`);
    if (vistos.has(valor)) throw new Error(`O JSON contém ${rotulo}s duplicados; importação cancelada.`);
    vistos.add(valor);
  }
}

async function importarProdutos() {
  const caminho = path.join(__dirname, '..', 'data', 'cadProdutos.json');
  const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  if (!Array.isArray(dados) || dados.length === 0) {
    throw new Error('cadProdutos.json deve conter uma lista não vazia de produtos.');
  }

  const produtos = dados.map(normalizarProduto);
  if (produtos.some(produto => produto.id === null)) {
    throw new Error('Há registro sem ID válido no JSON; importação cancelada.');
  }
  validarUnicos(produtos, 'id', 'ID');
  validarUnicos(produtos, 'codigo', 'código');
  validarUnicos(produtos, 'codigoBarras', 'código de barras', true);
  validarUnicos(produtos, 'sku', 'SKU', true);

  const conn = await mysql.createConnection(dbConfig);
  let transacaoIniciada = false;
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);
    await conn.query(CREATE_TABLE_PRODUTOS_SQL);

    const [existentes] = await conn.query('SELECT COUNT(*) AS total FROM produtos');
    if (Number(existentes[0].total) > 0) {
      throw new Error('A tabela produtos já contém registros; importação cancelada para evitar duplicação ou sobrescrita.');
    }

    await conn.beginTransaction();
    transacaoIniciada = true;
    for (const produto of produtos) {
      await conn.execute(
        `INSERT INTO produtos (
          id, codigo, codigo_barras, sku, nome, marca, categoria, unidade, ncm, cest,
          preco_custo, preco_venda, estoque, estoque_minimo, status, descricao,
          imagem_base64, imagem_nome, local_imagem, nome_arquivo_imagem,
          data_cadastro, data_alteracao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          produto.id, produto.codigo, produto.codigoBarras || null, produto.sku || null,
          produto.nome, produto.marca || null, produto.categoria || null,
          produto.unidade, produto.ncm || null, produto.cest || null,
          produto.precoCusto, produto.precoVenda, produto.estoque,
          produto.estoqueMinimo, produto.status, produto.descricao || null,
          produto.imagemBase64 || null, produto.imagemNome || null,
          produto.local || null, produto.nomeArquivoImagem || null,
          dataHoraParaMySQL(produto.dataCadastro),
          dataHoraParaMySQL(produto.dataAlteracao)
        ]
      );
    }
    await conn.commit();
    transacaoIniciada = false;
    console.log(`Importação concluída: ${produtos.length} produto(s) sincronizado(s) com o MySQL.`);
  } catch (erro) {
    if (transacaoIniciada) await conn.rollback();
    throw erro;
  } finally {
    await conn.end();
  }
}

importarProdutos().catch(erro => {
  console.error('Não foi possível importar cadProdutos.json:', erro.message);
  process.exitCode = 1;
});
