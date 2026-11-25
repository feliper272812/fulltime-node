/* =========================================================
  ARQUIVO: js/news-dados.js (PARTE 1/2)

  CAMADA DE DADOS DO CONSTANTINO NEWS (localStorage)
  Usada por: tabEdicoes.html, tabMaterias.html, cadMaterias.html

  Chaves:
  - NEWS_EDICOES       : lista de edições; cada edição guarda as próprias matérias
  - NEWS_EDICAO_ATIVA  : id da edição em que se está trabalhando
  - NEWS_EDITAR        : id da matéria a editar (lido por cadMaterias.html)
  - NEWS_MATERIAS      : formato antigo (lista solta); migrado sozinho

  Formato de uma edição:
  { id, data: "AAAA-MM-DD", nome, status: "Rascunho" | "Publicada",
    criadoEm, atualizadoEm, materias: [ { id, coluna, ordem, tipo, ... } ] }

  Autor: Felipe Rodrigues - FullTime Technology
========================================================= */
(function (global) {
  'use strict';

  const CHAVES = {
    EDICOES: 'NEWS_EDICOES',
    ATIVA: 'NEWS_EDICAO_ATIVA',
    EDITAR: 'NEWS_EDITAR',
    LEGADO: 'NEWS_MATERIAS'
  };

  const TIPOS = {
    'foto-esquerda': { nome: 'Foto pequena à esquerda', ajuda: 'Miniatura de 130 px ao lado do título. Usa categoria, título e autor.' },
    'imagem-grande': { nome: 'Imagem grande com legenda', ajuda: 'Imagem na largura da coluna, com legenda, título e resumo.' },
    'texto':         { nome: 'Somente texto', ajuda: 'Sem imagem. Usa categoria, título, resumo e autor.' },
    'manchete':      { nome: 'Manchete principal', ajuda: 'Destaque da coluna central, com imagem grande e resumo longo.' },
    'opiniao':       { nome: 'Opinião (caixa)', ajuda: 'Caixa com borda vermelha. Usa título e autor (colunista).' }
  };

  const STATUS_EDICAO = new Array('Rascunho', 'Publicada');

  const pad = (n) => String(n).padStart(2, '0');
  const temTipo = (t) => Object.prototype.hasOwnProperty.call(TIPOS, t);

  // ── Utilidades ──────────────────────────────────────────
  function gerarId(prefixo) {
    return (prefixo || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function dataValida(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
    const partes = iso.split('-').map(Number);
    const a = partes.at(0);
    const m = partes.at(1);
    const d = partes.at(2);
    const dt = new Date(a, m - 1, d);
    return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function hojeISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dataBR(iso) {
    if (!dataValida(iso)) return iso || '';
    const partes = iso.split('-');
    return partes.at(2) + '/' + partes.at(1) + '/' + partes.at(0);
  }

  // 2026-11-13 -> 13112026 (usado nos nomes de arquivo)
  function ddmmaaaa(iso) {
    if (!dataValida(iso)) return '';
    const partes = iso.split('-');
    return partes.at(2) + partes.at(1) + partes.at(0);
  }

  function dataHoraBR(timestamp) {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function tituloEdicao(ed) {
    return (ed && String(ed.nome || '').trim()) || ('Edição de ' + dataBR(ed && ed.data));
  }

  function contarPorColuna(ed) {
    const materias = (ed && ed.materias) || [];
    const colunasValidas = new Array(1, 2, 3);
    return colunasValidas.map(c => materias.filter(m => Number(m.coluna) === c).length);
  }

  // ── Leitura e gravação ──────────────────────────────────
  function lerJSON(chave, padrao) {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto == null ? padrao : JSON.parse(bruto);
    } catch (e) {
      console.error('Erro ao ler ' + chave, e);
      return padrao;
    }
  }

  function lerEdicoes() {
    const lista = lerJSON(CHAVES.EDICOES, []);
    if (!Array.isArray(lista)) return [];
    return lista
      .filter(e => e && typeof e === 'object' && e.id)
      .map(e => ({ ...e, materias: Array.isArray(e.materias) ? e.materias : [] }));
  }

  function gravarEdicoes(lista) {
    try {
      localStorage.setItem(CHAVES.EDICOES, JSON.stringify(lista));
      return true;
    } catch (e) {
      console.error('Erro ao gravar ' + CHAVES.EDICOES, e);
      return false;
    }
  }

  function obterEdicao(id) {
    return lerEdicoes().find(e => String(e.id) === String(id)) || null;
  }

  // Grava (ou cria) uma edição inteira, com as matérias dentro
  function salvarEdicao(edicao) {
    const lista = lerEdicoes();
    const idx = lista.findIndex(e => String(e.id) === String(edicao.id));
    edicao.atualizadoEm = new Date().toISOString();
    if (idx >= 0) {
      lista.splice(idx, 1, edicao);
    } else {
      lista.push(edicao);
    }
    return gravarEdicoes(lista);
  }

  // ── Edição ativa ────────────────────────────────────────
  function edicaoAtivaId() {
    try { return localStorage.getItem(CHAVES.ATIVA) || ''; } catch (e) { return ''; }
  }

  function definirAtiva(id) {
    try { localStorage.setItem(CHAVES.ATIVA, String(id)); } catch (e) { console.error(e); }
  }

  function limparAtiva() {
    try { localStorage.removeItem(CHAVES.ATIVA); } catch (e) { /* nada a fazer */ }
  }

  function edicaoAtiva() {
    const id = edicaoAtivaId();
    return id ? obterEdicao(id) : null;
  }

  // ── Criar, atualizar e excluir edições ──────────────────
  function validarDadosEdicao(dados, idIgnorar) {
    if (!dataValida(dados.data)) return 'Informe a data da edição.';
    const repetida = lerEdicoes().some(e => e.data === dados.data && String(e.id) !== String(idIgnorar || ''));
    if (repetida) return 'Já existe uma edição em ' + dataBR(dados.data) + '. Abra essa edição ou escolha outra data.';
    return '';
  }

  // dados: { data, nome, status, copiarDeId }  ->  { edicao } ou { erro }
  function criarEdicao(dados) {
    const erro = validarDadosEdicao(dados);
    if (erro) return { erro };

    const lista = lerEdicoes();
    const agora = new Date().toISOString();
    let materias = [];

    if (dados.copiarDeId) {
      const origem = lista.find(e => String(e.id) === String(dados.copiarDeId));
      if (origem) {
        materias = origem.materias.map(m => ({ ...m, id: gerarId('mat'), criadoEm: agora, atualizadoEm: agora }));
      }
    }

    const edicao = {
      id: gerarId('ed'),
      data: dados.data,
      nome: String(dados.nome || '').trim(),
      status: STATUS_EDICAO.includes(dados.status) ? dados.status : 'Rascunho',
      criadoEm: agora,
      atualizadoEm: agora,
      materias
    };
    lista.push(edicao);

    if (!gravarEdicoes(lista)) {
      return { erro: 'Não foi possível gravar a edição. O armazenamento do navegador pode estar cheio; exporte e exclua edições antigas.' };
    }
    return { edicao };
  }

  function atualizarDadosEdicao(id, dados) {
    const erro = validarDadosEdicao(dados, id);
    if (erro) return { erro };

    const edicao = obterEdicao(id);
    if (!edicao) return { erro: 'Edição não encontrada.' };

    edicao.data = dados.data;
    edicao.nome = String(dados.nome || '').trim();
    edicao.status = STATUS_EDICAO.includes(dados.status) ? dados.status : edicao.status;

    if (!salvarEdicao(edicao)) return { erro: 'Não foi possível gravar os dados da edição.' };
    return { edicao };
  }
  function excluirEdicao(id) {
    const restantes = lerEdicoes().filter(e => String(e.id) !== String(id));
    if (!gravarEdicoes(restantes)) return false;
    if (String(edicaoAtivaId()) === String(id)) limparAtiva();
    return true;
  }

  // ── Matérias: mesclar dados importados numa edição ──────
  // dados pode ser: lista de matérias, uma matéria, ou uma edição ({ materias: [...] })
  // Altera edicao.materias; quem chama grava com salvarEdicao().
  function mesclarMaterias(edicao, dados) {
    let itens;
    if (Array.isArray(dados)) {
      itens = dados;
    } else if (dados && Array.isArray(dados.materias)) {
      itens = dados.materias;
    } else {
      itens = new Array(dados);
    }

    const agora = new Date().toISOString();
    const r = { novas: 0, atualizadas: 0, ignoradas: 0 };
    const colunasValidas = new Array(1, 2, 3);

    itens.forEach(item => {
      if (!item || typeof item !== 'object' || !String(item.titulo || '').trim()) { r.ignoradas++; return; }

      const coluna = colunasValidas.includes(Number(item.coluna)) ? Number(item.coluna) : 1;
      const materia = {
        ...item,
        id: item.id || gerarId('mat'),
        coluna: coluna,
        ordem: Math.max(1, Number(item.ordem) || 1),
        tipo: temTipo(item.tipo) ? item.tipo : 'texto',
        status: item.status === 'Inativo' ? 'Inativo' : 'Ativo',
        atualizadoEm: agora
      };

      const idx = edicao.materias.findIndex(m => String(m.id) === String(materia.id));
      if (idx >= 0) {
        const atualizada = { ...edicao.materias.at(idx), ...materia };
        edicao.materias.splice(idx, 1, atualizada);
        r.atualizadas++;
      } else {
        materia.criadoEm = materia.criadoEm || agora;
        edicao.materias.push(materia);
        r.novas++;
      }
    });

    return r;
  }

  // ── Importar edições (JSON de uma ou várias edições) ────
  function importarEdicoes(dados) {
    const itens = Array.isArray(dados) ? dados : new Array(dados);
    const lista = lerEdicoes();
    const agora = new Date().toISOString();
    const r = { novas: 0, atualizadas: 0, ignoradas: 0, soMaterias: 0, conflitos: [], ok: true };

    itens.forEach(item => {
      if (!item || typeof item !== 'object') { r.ignoradas++; return; }

      if (!Array.isArray(item.materias)) {
        if (String(item.titulo || '').trim()) r.soMaterias++; else r.ignoradas++;
        return;
      }
      if (!dataValida(item.data)) { r.ignoradas++; return; }

      const id = item.id || gerarId('ed');
      const idx = lista.findIndex(e => String(e.id) === String(id));
      const outraNaData = lista.find(e => e.data === item.data && String(e.id) !== String(id));
      if (outraNaData) { r.conflitos.push(dataBR(item.data)); return; }

      const edicao = {
        id: id,
        data: item.data,
        nome: String(item.nome || '').trim(),
        status: STATUS_EDICAO.includes(item.status) ? item.status : 'Rascunho',
        criadoEm: item.criadoEm || agora,
        atualizadoEm: agora,
        materias: []
      };
      mesclarMaterias(edicao, item.materias);

      if (idx >= 0) {
        lista.splice(idx, 1, edicao);
        r.atualizadas++;
      } else {
        lista.push(edicao);
        r.novas++;
      }
    });

    if (r.novas || r.atualizadas) r.ok = gravarEdicoes(lista);
    return r;
  }

  // ── Exportar JSON ───────────────────────────────────────
  function baixarJSON(nomeArquivo, objeto) {
    const blob = new Blob([JSON.stringify(objeto, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // edicao-ddmmaaaa.json
  function exportarEdicao(edicao) {
    baixarJSON('edicao-' + ddmmaaaa(edicao.data) + '.json', edicao);
  }

  // edicoes-ddmmaaaa.json (backup de todas, com a data de hoje)
  function exportarTodas() {
    baixarJSON('edicoes-' + ddmmaaaa(hojeISO()) + '.json', lerEdicoes());
  }

  // ── Migração do formato antigo (NEWS_MATERIAS) ──────────
  function migrarLegado() {
    try {
      if (localStorage.getItem(CHAVES.EDICOES) !== null) return null;
    } catch (e) { return null; }

    const legado = lerJSON(CHAVES.LEGADO, []);
    if (!Array.isArray(legado) || !legado.length) return null;

    const agora = new Date().toISOString();
    const edicao = {
      id: gerarId('ed'),
      data: hojeISO(),
      nome: 'Edição migrada',
      status: 'Rascunho',
      criadoEm: agora,
      atualizadoEm: agora,
      materias: []
    };
    mesclarMaterias(edicao, legado);

    if (!gravarEdicoes(new Array(edicao))) return null;

    try { localStorage.removeItem(CHAVES.LEGADO); } catch (e) { /* nada a fazer */ }
    definirAtiva(edicao.id);
    return { quantidade: edicao.materias.length, edicao: edicao };
  }

  global.NewsDados = {
    CHAVES, TIPOS, STATUS_EDICAO,
    gerarId, dataValida, hojeISO, dataBR, ddmmaaaa, dataHoraBR, tituloEdicao, contarPorColuna,
    lerEdicoes, gravarEdicoes, obterEdicao, salvarEdicao,
    edicaoAtivaId, definirAtiva, limparAtiva, edicaoAtiva,
    criarEdicao, atualizarDadosEdicao, excluirEdicao,
    mesclarMaterias, importarEdicoes,
    baixarJSON, exportarEdicao, exportarTodas,
    migrarLegado
  };
})(window);
