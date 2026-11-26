const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { normalizarOrdemServico, dataHoraParaMySQL } = require('../ordens-servico-utils');
const { CREATE_TABLE_ORDENS_SERVICO_SQL } = require('../ordens-servico-schema');

const DB_NAME = 'fulltime_db';
const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  port: 3306
};

function ordensFicticias() {
  const data = new Date().toISOString().slice(0, 10);
  return [
    {
      id: 1,
      dataAbertura: data,
      status: 'Aberta',
      prioridade: 'Alta',
      cliente: 'Cliente Fictício A',
      telefone: '(51) 90000-0101',
      equipamento: 'Notebook',
      marca: 'Dell',
      modelo: 'Inspiron',
      numeroSerie: 'SERIE-FICTICIA-001',
      acessorios: 'Fonte de alimentação',
      relatoProblema: 'Equipamento não liga.',
      servicoExecutado: '',
      maoDeObra: 120,
      pecas: 35,
      desconto: 0,
      observacoes: 'Registro de demonstração fictício.'
    },
    {
      id: 2,
      dataAbertura: data,
      status: 'Em Andamento',
      prioridade: 'Média',
      cliente: 'Cliente Fictício B',
      telefone: '(51) 90000-0102',
      equipamento: 'Smartphone',
      marca: 'Samsung',
      modelo: 'Galaxy Série A',
      numeroSerie: 'SERIE-FICTICIA-002',
      acessorios: 'Aparelho e cabo USB',
      relatoProblema: 'Tela apresenta falhas de imagem.',
      servicoExecutado: 'Diagnóstico em andamento.',
      maoDeObra: 90,
      pecas: 150,
      desconto: 20,
      observacoes: 'Registro de demonstração fictício.'
    },
    {
      id: 3,
      dataAbertura: data,
      status: 'Finalizada',
      prioridade: 'Baixa',
      cliente: 'Cliente Fictício C',
      telefone: '(51) 90000-0103',
      equipamento: 'Impressora',
      marca: 'HP',
      modelo: 'DeskJet',
      numeroSerie: 'SERIE-FICTICIA-003',
      acessorios: 'Cabo de energia',
      relatoProblema: 'Impressora apresentava falha de alimentação de papel.',
      servicoExecutado: 'Limpeza e ajuste dos roletes de alimentação.',
      maoDeObra: 80,
      pecas: 0,
      desconto: 0,
      observacoes: 'Registro de demonstração fictício.'
    }
  ];
}

async function importarOrdensServico() {
  const caminho = path.join(__dirname, '..', 'data', 'ordensServico.json');
  const dados = fs.existsSync(caminho)
    ? JSON.parse(fs.readFileSync(caminho, 'utf8'))
    : ordensFicticias();
  const lista = Array.isArray(dados)
    ? dados
    : dados && (dados.ordensServico || dados.ordens);
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error('O JSON deve conter uma lista não vazia de ordens de serviço.');
  }

  const ordens = lista.map(normalizarOrdemServico);
  const ids = new Set();
  for (const ordem of ordens) {
    if (ordem.id !== null) {
      if (ids.has(ordem.id)) throw new Error('O JSON contém números de OS duplicados.');
      ids.add(ordem.id);
    }
  }

  const conn = await mysql.createConnection(dbConfig);
  let transacaoIniciada = false;
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);
    await conn.query(CREATE_TABLE_ORDENS_SERVICO_SQL);

    const [[existentes]] = await conn.query('SELECT COUNT(*) AS total FROM ordens_servico');
    if (Number(existentes.total) > 0) {
      throw new Error('A tabela ordens_servico já contém registros; importação cancelada para evitar duplicação ou sobrescrita.');
    }

    await conn.beginTransaction();
    transacaoIniciada = true;
    for (const ordem of ordens) {
      const colunas = [
        'data_abertura', 'status', 'prioridade', 'cliente_nome', 'cliente_telefone',
        'equipamento', 'marca', 'modelo', 'numero_serie', 'acessorios',
        'relato_problema', 'servico_executado', 'mao_de_obra', 'pecas',
        'desconto', 'valor_total', 'observacoes', 'data_cadastro', 'data_alteracao'
      ];
      const valores = [
        ordem.dataAbertura, ordem.status, ordem.prioridade, ordem.cliente,
        ordem.telefone || null, ordem.equipamento || null, ordem.marca || null,
        ordem.modelo || null, ordem.numeroSerie || null, ordem.acessorios || null,
        ordem.relatoProblema, ordem.servicoExecutado || null, ordem.maoDeObra,
        ordem.pecas, ordem.desconto, ordem.valorTotal, ordem.observacoes || null,
        dataHoraParaMySQL(ordem.dataCadastro), dataHoraParaMySQL(ordem.dataAlteracao)
      ];
      if (ordem.id !== null) {
        colunas.unshift('id');
        valores.unshift(ordem.id);
      }

      await conn.execute(
        `INSERT INTO ordens_servico (${colunas.join(', ')})
         VALUES (${colunas.map(() => '?').join(', ')})`,
        valores
      );
    }

    await conn.commit();
    transacaoIniciada = false;
    console.log(`Importação concluída: ${ordens.length} ordem(ns) de serviço${fs.existsSync(caminho) ? ' do JSON' : ' fictícia(s)'}.`);
  } catch (erro) {
    if (transacaoIniciada) await conn.rollback();
    throw erro;
  } finally {
    await conn.end();
  }
}

importarOrdensServico().catch(erro => {
  console.error('Não foi possível importar ordens de serviço:', erro.message);
  process.exitCode = 1;
});
