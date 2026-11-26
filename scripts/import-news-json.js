const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const {
  normalizarEdicao,
  normalizarMateria,
  selecionarEdicoesMaisRecentes
} = require('../news-utils');
const {
  CREATE_TABLE_EDICOES_SQL,
  CREATE_TABLE_MATERIAS_SQL
} = require('../news-schema');

const DB_NAME = 'fulltime_db';
const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  port: 3306
};

function lerSnapshots(caminhoDiretorio) {
  if (!fs.existsSync(caminhoDiretorio)) {
    throw new Error(`A pasta de origem não existe: ${caminhoDiretorio}`);
  }

  const arquivos = fs.readdirSync(caminhoDiretorio)
    .filter(nome => /^(edicao|materia)-.+\.json$/i.test(nome))
    .sort();
  if (!arquivos.length) {
    throw new Error('Nenhum arquivo edicao-*.json ou materia-*.json foi encontrado na pasta de origem.');
  }

  const edicoes = [];
  const materiasAvulsas = [];
  for (const nome of arquivos) {
    const dados = JSON.parse(fs.readFileSync(path.join(caminhoDiretorio, nome), 'utf8'));
    if (Array.isArray(dados)) {
      materiasAvulsas.push(...dados.filter(item => item && typeof item === 'object'));
    } else if (dados && typeof dados === 'object' && Array.isArray(dados.materias)) {
      edicoes.push({ ...dados, arquivoFonte: nome });
    } else {
      throw new Error(`O arquivo ${nome} não contém uma edição nem uma lista de matérias.`);
    }
  }

  const maisRecentes = selecionarEdicoesMaisRecentes(edicoes);
  if (!maisRecentes.length) throw new Error('Nenhuma edição válida foi encontrada nos JSONs.');

  const idsImportados = new Set(maisRecentes.flatMap(edicao =>
    edicao.materias.map(materia => String(materia.id || ''))
  ));
  const avulsasSemEdicao = materiasAvulsas.filter(materia => !idsImportados.has(String(materia.id || '')));
  if (avulsasSemEdicao.length) {
    throw new Error(
      `${avulsasSemEdicao.length} matéria(s) avulsa(s) não estão vinculadas a nenhuma edição. ` +
      'Associe-as a uma edição antes de importar para evitar perda de dados.'
    );
  }

  const edicoesNormalizadas = maisRecentes.map(edicao => ({
    fonte: edicao.arquivoFonte,
    dados: normalizarEdicao(edicao),
    materias: edicao.materias.map(normalizarMateria)
  }));
  const idsEdicao = new Set();
  const numeros = new Set();
  const datas = new Set();
  for (const item of edicoesNormalizadas) {
    const edicao = item.dados;
    if (!edicao.id) throw new Error(`A edição do arquivo ${item.fonte} não possui ID.`);
    if (idsEdicao.has(edicao.id)) throw new Error(`ID de edição duplicado: ${edicao.id}.`);
    if (numeros.has(edicao.numero)) throw new Error(`Número de edição duplicado: ${edicao.numero}.`);
    if (datas.has(edicao.data)) throw new Error(`Data de edição duplicada: ${edicao.data}.`);
    idsEdicao.add(edicao.id);
    numeros.add(edicao.numero);
    datas.add(edicao.data);

    const idsMateria = new Set();
    for (const materia of item.materias) {
      if (!materia.id) throw new Error(`Uma matéria da edição ${edicao.id} não possui ID.`);
      if (idsMateria.has(materia.id)) throw new Error(`ID de matéria duplicado na edição ${edicao.id}: ${materia.id}.`);
      idsMateria.add(materia.id);
    }
  }

  return {
    edicoes: edicoesNormalizadas,
    arquivosLidos: arquivos.length,
    snapshotsIgnorados: edicoes.length - maisRecentes.length,
    materiasAvulsasDuplicadas: materiasAvulsas.length
  };
}

async function importarNews() {
  const caminhoDiretorio = process.argv[2] || process.env.NEWS_JSON_DIR ||
    path.join(__dirname, '..', 'data', 'news');
  const dados = lerSnapshots(caminhoDiretorio);
  const conn = await mysql.createConnection(dbConfig);
  let transacaoIniciada = false;

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);
    await conn.query(CREATE_TABLE_EDICOES_SQL);
    await conn.query(CREATE_TABLE_MATERIAS_SQL);

    const [[edicoesExistentes]] = await conn.query('SELECT COUNT(*) AS total FROM edicoes');
    const [[materiasExistentes]] = await conn.query('SELECT COUNT(*) AS total FROM materias');
    if (Number(edicoesExistentes.total) > 0 || Number(materiasExistentes.total) > 0) {
      throw new Error('As tabelas de edições ou matérias já contêm registros; importação cancelada para evitar duplicação ou sobrescrita.');
    }

    await conn.beginTransaction();
    transacaoIniciada = true;
    for (const item of dados.edicoes) {
      const edicao = item.dados;
      await conn.execute(
        `INSERT INTO edicoes (
          id, numero, data, titulo, status, responsavel, observacao, arquivo,
          criado_em, atualizado_em, fechada_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          edicao.id, edicao.numero, edicao.data, edicao.titulo, edicao.status,
          edicao.responsavel, edicao.observacao, edicao.arquivo,
          edicao.criadoEm, edicao.atualizadoEm, edicao.fechadaEm
        ]
      );

      for (const materia of item.materias) {
        await conn.execute(
          `INSERT INTO materias (
            edicao_id, id, coluna, ordem, tipo, status, categoria, titulo, link,
            resumo, autor, tempo, imagem, legenda, criado_em, atualizado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            edicao.id, materia.id, materia.coluna, materia.ordem, materia.tipo,
            materia.status, materia.categoria, materia.titulo, materia.link,
            materia.resumo, materia.autor, materia.tempo, materia.imagem,
            materia.legenda, materia.criadoEm, materia.atualizadoEm
          ]
        );
      }
    }

    await conn.commit();
    transacaoIniciada = false;
    const totalMaterias = dados.edicoes.reduce((total, item) => total + item.materias.length, 0);
    console.log(
      `Importação concluída: ${dados.edicoes.length} edição(ões) e ${totalMaterias} matéria(s). ` +
      `${dados.arquivosLidos} arquivo(s) lido(s), ${dados.snapshotsIgnorados} snapshot(s) antigo(s) ` +
      `e ${dados.materiasAvulsasDuplicadas} matéria(s) avulsa(s) duplicada(s) ignorada(s).`
    );
    for (const item of dados.edicoes) {
      console.log(`Edição ${item.dados.id} importada do snapshot mais recente: ${item.fonte}.`);
    }
  } catch (erro) {
    if (transacaoIniciada) await conn.rollback();
    throw erro;
  } finally {
    await conn.end();
  }
}

importarNews().catch(erro => {
  console.error('Não foi possível importar os JSONs de edições e matérias:', erro.message);
  process.exitCode = 1;
});
