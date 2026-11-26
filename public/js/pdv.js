////////////////////////////////////////////////////////////////
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
////////////////////////////////////////////////////////////////
const CART_STORAGE_KEY = 'PDV_CARRINHO';

// Imagem padrão (SVG embutido) para produtos sem foto ou com foto quebrada — funciona offline
const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
  '<rect width="80" height="80" fill="#e9ecef"/>' +
  '<text x="40" y="45" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#6c757d">Sem foto</text>' +
  '</svg>'
);

let produtos = [];
let carrinho = [];

////////////////////////////////////////////////////////////////
// INIT - INICIALIZAÇÃO DA APLICAÇÃO (SEM ATALHOS DE TECLADO)
////////////////////////////////////////////////////////////////
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!await carregarProdutos()) return;
  } catch (erro) {
    console.error('[PDV] Não foi possível carregar os produtos:', erro);
    alert('Não foi possível carregar os produtos do banco de dados.');
    return;
  }
  carregarCarrinhoSalvo();
  renderizarProdutos();
  atualizarCarrinho();

  const campoCodigo = document.getElementById('buscaInterna');
  if (campoCodigo) campoCodigo.focus();
});

////////////////////////////////////////////////////////////////
// PERSISTÊNCIA DE DADOS
////////////////////////////////////////////////////////////////
async function carregarProdutos() {
  const resposta = await fetch('/api/produtos');
  if (resposta.redirected) {
    window.location.href = '/';
    return false;
  }
  if (!resposta.ok) throw new Error(`Falha na API de produtos (${resposta.status}).`);
  const dados = await resposta.json();
  if (!Array.isArray(dados)) throw new Error('A API retornou uma lista de produtos inválida.');
  produtos = dados;
  console.log('[PDV] produtos carregados:', produtos.length);
  return true;
}

function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[caractere]);
}

function carregarCarrinhoSalvo() {
  carrinho = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
}

function salvarCarrinhoNoStorage() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(carrinho));
}


////////////////////////////////////////////////////////////////
// CATÁLOGO DE PRODUTOS (RENDERIZAÇÃO E FILTRO)
////////////////////////////////////////////////////////////////
function renderizarProdutos(lista = produtos) {
  const div = document.getElementById('listaProdutos');
  if (!div) return;
  if (lista.length === 0) {
    div.innerHTML = '<div class="col-12 text-center text-muted py-5">Nenhum produto cadastrado no banco de dados.</div>';
    return;
  }
  div.innerHTML = lista.map(p => {
    // --- CORREÇÃO CIRÚRGICA PARA PRODUTOS KG / IMAGENS MÚLTIPLAS ---
    // Procura o nome do arquivo ou URL por múltiplos mapeamentos compatíveis
    const nomeImagem = p.nomeArquivoImagem || p.imagem || p.Imagem || p.foto || p.Foto || '';
    const pastaLocal = p.local || './imagens/produtos/'; // Garante caminho padrão caso esteja nulo/vazio
    
    let caminhoImagem = PLACEHOLDER_IMG;
    
    if (p.imagemSrc) {
      caminhoImagem = p.imagemSrc;
    } else if (p.imagemBase64) {
      // Imagem salva pelo cadastro EJS (data URL em Base64) — usa direto
      caminhoImagem = p.imagemBase64;
    } else if (nomeImagem) {
      // Se for caminho absoluto, URL remota ou relativa direta, utiliza sem alteração
      caminhoImagem = (nomeImagem.startsWith('http') || nomeImagem.startsWith('./') || nomeImagem.startsWith('/') || nomeImagem.startsWith('data:')) 
        ? nomeImagem 
        : (pastaLocal + nomeImagem);
    }
    // ---------------------------------------------------------------

    const idProduto = p.id;
    const precoVenda = p.precoVenda || p.preco || p.Preco || p.valor || p.Valor || 0;
    const codBarsExibir = p.codigoBarras || p.codBarras || '—';
    
    return `
      <div class="col-md-6">
        <div class="card produto-card shadow-sm h-100 overflow-hidden" onclick="adicionarCarrinhoPorID('${escaparHTML(idProduto)}')">
          <div class="row g-0 h-100 align-items-center">
            <div class="col-4 bg-light d-flex justify-content-center p-2" style="height: 100px;">
              <img src="${escaparHTML(caminhoImagem)}" class="img-fluid rounded object-fit-contain" style="max-height: 80px; max-width: 80px;" alt="${escaparHTML(p.nome || '')}" onerror="this.onerror=null;this.src=PLACEHOLDER_IMG">
            </div>
            <div class="col-8">
              <div class="card-body p-2 text-start">
                <div class="fw-bold text-truncate text-body" style="font-size: 0.9rem;" title="${escaparHTML(p.nome || '')}">
                  ${escaparHTML(p.nome || '')}
                </div>
                <small class="text-muted d-block" style="font-size: 0.75rem;">
                  Código: ${escaparHTML(p.codigo || idProduto || '')}
                </small>
                <small class="text-muted d-block text-truncate" style="font-size: 0.72rem;" title="${escaparHTML(codBarsExibir)}">
                  EAN: ${escaparHTML(codBarsExibir)}
                </small>
                <div class="text-success fw-bold mt-1" style="font-size: 0.9rem;">
                  R$ ${Number(precoVenda).toFixed(2).replace('.', ',')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filtrarProdutos() {
  const termo = document.getElementById('busca').value.toLowerCase().trim();
  
  // Realiza a filtragem padrão dos itens visíveis no catálogo
  const filtrados = produtos.filter(p => 
    (p.nome || '').toLowerCase().includes(termo) || 
    (p.codigo || p.id || '').toString().toLowerCase().includes(termo) ||
    (p.codigoBarras || p.codBarras || '').toString().toLowerCase().includes(termo)
  );
  renderizarProdutos(filtrados);

  // DETECÇÃO EM TEMPO REAL: Alimenta os inputs superiores assim que houver correspondência exata
  if (termo) {
    const itemIdentificado = produtos.find(p => 
      (p.codigo || p.id || '').toString().toLowerCase() === termo ||
      (p.codigoBarras || p.codBarras || '').toString().toLowerCase() === termo
    );
    
    if (itemIdentificado) {
      atualizarCamposDetalhe(itemIdentificado);
    } else {
      atualizarCamposDetalhe(null);
    }
  } else {
    atualizarCamposDetalhe(null);
  }
}
////////////////////////////////////////////////////////////////
// ATUALIZAÇÃO AUTOMÁTICA DOS INPUTS DE DETALHE SUPERIORES
////////////////////////////////////////////////////////////////
function atualizarCamposDetalhe(produto) {
  const campoDescricao = document.getElementById('exibirDescricao');
  const campoUnidade = document.getElementById('exibirUnidade');

  if (produto) {
    // MAPEAMENTO DAS CHAVES COMPATÍVEIS DO BANCO DE DADOS LOCAL
    const desc = produto.descricao || produto.desc || produto.Descricao || produto.nome || '';
    const unid = produto.unidade || produto.unid || produto.Unidade || produto.unidadeMedida || produto.peso || 'UN';

    if (campoDescricao) campoDescricao.value = desc;
    if (campoUnidade) campoUnidade.value = unid;
  } else {
    // RESET EM CASO DE LIMPEZA OU PRODUTO INVÁLIDO
    if (campoDescricao) campoDescricao.value = '';
    if (campoUnidade) campoUnidade.value = '';
  }
}

////////////////////////////////////////////////////////////////
// ACIONAMENTO AUTOMÁTICO E CIRÚRGICO POR CÓDIGO DE BARRAS (ENTER DO LEITOR / CÂMERA)
////////////////////////////////////////////////////////////////
function processarCodigoBarras() {
  const campoBusca = document.getElementById('busca');
  if (!campoBusca) return;
  const eanBuscado = campoBusca.value.trim();
  if (!eanBuscado) return;

  // Busca o código de barras entre os produtos carregados do MySQL.
  const produtoAchado = produtos.find(p => 
    (p.codigoBarras || p.codBarras || '').toString().trim() === eanBuscado
  );

  if (produtoAchado) {
    // Garante a sincronização dos campos da interface
    atualizarCamposDetalhe(produtoAchado);

    // CASO EXISTA: Coloca direto no carrinho automaticamente
    const idProduto = produtoAchado.id || produtoAchado.ID || produtoAchado.codigo || produtoAchado.Codigo;
    adicionarCarrinhoDirect(produtoAchado, idProduto);
    campoBusca.value = '';
    campoBusca.focus();
    filtrarProdutos(); // Limpa filtros e reseta estados da busca
  } else {
    // CASO NÃO EXISTA: Dispara o fluxo de direcionamento para o cadastro
    campoBusca.value = ''; 
    atualizarCamposDetalhe(null); 

    if (confirm(`Produto não cadastrado! Deseja cadastrar o código de barras [ ${eanBuscado} ]?`)) {
      window.location.href = `/produtos/novo?codigoBarras=${encodeURIComponent(eanBuscado)}`;
    } else {
      campoBusca.focus();
    }
  }
}

function buscarProduto() {
  const campoCodigo = document.getElementById('buscaInterna') || document.getElementById('busca');
  if (!campoCodigo) return;
  const codigoBuscado = campoCodigo.value.trim().toUpperCase();
  if (!codigoBuscado) {
    alert("Por favor, insira o código do produto.");
    return;
  }

  const produtoAchado = produtos.find(p => 
    (p.codigo || p.id || p.Codigo || p.ID || '').toString().toUpperCase() === codigoBuscado ||
    (p.codigoBarras || p.codBarras || '').toString() === codigoBuscado
  );

  if (produtoAchado) {
    // Sincroniza os inputs superiores
    atualizarCamposDetalhe(produtoAchado);

    const idProduto = produtoAchado.id || produtoAchado.ID || produtoAchado.codigo || produtoAchado.Codigo;
    adicionarCarrinhoDirect(produtoAchado, idProduto);
    campoCodigo.value = '';
    campoCodigo.focus();
    filtrarProdutos();
  } else {
    atualizarCamposDetalhe(null); 
    if (confirm(`Produto não cadastrado! Deseja cadastrar o código de barras [ ${codigoBuscado} ]?`)) {
      window.location.href = `/produtos/novo?codigoBarras=${encodeURIComponent(codigoBuscado)}`;
    } else {
      campoCodigo.focus();
    }
  }
}

////////////////////////////////////////////////////////////////
// CAMPO DE QUANTIDADE (#quant)
////////////////////////////////////////////////////////////////
function quantidadeProduto() {
  const campo = document.getElementById('quant');
  if (!campo) return;
  // Aceita dígitos e UM separador decimal (vírgula ou ponto), com até 3 casas (ex.: 0,250 = 250 g)
  let valor = campo.value.replace(/[^\d.,]/g, '');
  const posSep = valor.search(/[.,]/);
  if (posSep !== -1) {
    valor = valor.slice(0, posSep) + ',' + valor.slice(posSep + 1).replace(/[.,]/g, '').slice(0, 3);
  }
  valor = valor.replace(/^0+(?=\d)/, ''); // remove zeros à esquerda, mantendo "0,25"
  campo.value = valor;
}

function obterQuantidadeSelecionada() {
  const campo = document.getElementById('quant');
  if (!campo) return 1;
  const valor = parseFloat(campo.value.replace(',', '.'));
  return (!valor || valor <= 0) ? 1 : arredondarQtd(valor);
}

////////////////////////////////////////////////////////////////
// UNIDADE E QUANTIDADE FRACIONADA (PRODUTOS EM KG)
////////////////////////////////////////////////////////////////
function obterUnidadeProduto(produto) {
  return produto.unidade || produto.unid || produto.Unidade || produto.unidadeMedida || 'UN';
}

function ehUnidadeKg(unidade) {
  return String(unidade || '').trim().toUpperCase() === 'KG';
}

function ehProdutoKg(produto) {
  return ehUnidadeKg(obterUnidadeProduto(produto));
}

// Evita erros de ponto flutuante (ex.: 0.1 + 0.2) mantendo 3 casas (gramas)
function arredondarQtd(valor) {
  return Math.round(valor * 1000) / 1000;
}

// Kg: "0,250 Kg" | UN: "2"
function formatarQtd(item) {
  if (ehUnidadeKg(item.unidade)) {
    return Number(item.qtd).toFixed(3).replace('.', ',') + ' Kg';
  }
  return String(item.qtd);
}

////////////////////////////////////////////////////////////////
// GERENCIAMENTO DO CARRINHO (AÇÕES)
////////////////////////////////////////////////////////////////
function adicionarCarrinhoPorID(id) {
  const produto = produtos.find(p => String(p.id || p.ID || p.codigo || p.Codigo) === String(id));
  if (!produto) return;
  
  // Atualiza os inputs superiores caso clique direto no card do catálogo
  if (typeof atualizarCamposDetalhe === 'function') {
    atualizarCamposDetalhe(produto);
  }
  
  adicionarCarrinhoDirect(produto, id);
}

function adicionarCarrinhoDirect(produto, id) {
  const ehKg = ehProdutoKg(produto);
  const quantidade = obterQuantidadeSelecionada();

  // Só produtos em Kg aceitam quantidade fracionada (ex.: 0,250 = 250 g)
  if (!ehKg && !Number.isInteger(quantidade)) {
    alert('Este produto é vendido por unidade e não aceita quantidade fracionada. Informe um número inteiro.');
    return;
  }

  const item = carrinho.find(i => String(i.id) === String(id));
  const precoVenda = produto.precoVenda || produto.preco || produto.Preco || produto.valor || produto.Valor || 0;

  if (item) {
    item.qtd = arredondarQtd(item.qtd + quantidade);
  } else {
    carrinho.push({
      id: id,
      nome: produto.nome || "Produto sem nome",
      preco: Number(precoVenda),
      qtd: quantidade,
      unidade: ehKg ? 'KG' : obterUnidadeProduto(produto)
    });
  }
  atualizarCarrinho();
  
  const campoQuant = document.getElementById('quant');
  if (campoQuant) campoQuant.value = '';
}

////////////////////////////////////////////////////////////////
// ATUALIZAR CARRINHO COMPACTO (ESTILO COMPROVANTE FISCAL)
////////////////////////////////////////////////////////////////
function atualizarCarrinho() {
  const div = document.getElementById('carrinho');
  const spanTotal = document.getElementById('total');
  if (!div) return;
  let total = 0;

  if (carrinho.length === 0) {
    div.innerHTML = '<p class="text-muted small py-4 text-center">Nenhum item no carrinho.</p>';
    if (spanTotal) spanTotal.innerText = '0,00';
    salvarCarrinhoNoStorage();
    return;
  }

  div.innerHTML = carrinho.map(i => {
    const subtotal = Math.round(i.preco * i.qtd * 100) / 100;
    total += subtotal;
    return `
      <div class="py-2 border-bottom border-secondary-subtle" style="font-size: 0.88rem;">
        <div class="carrinho-linha">
          <div class="d-flex align-items-center me-2">
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1 fw-bold" style="font-size: 0.7rem; line-height: 1;" onclick="alterarQuantidade('${escaparHTML(i.id)}', -1)">-</button>
            <span class="mx-2 fw-bold text-body" style="min-width: 15px; text-align: center;">${formatarQtd(i)}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1 fw-bold" style="font-size: 0.7rem; line-height: 1;" onclick="alterarQuantidade('${escaparHTML(i.id)}', 1)">+</button>
          </div>
          <span class="carrinho-nome text-body fw-medium" title="${escaparHTML(i.nome)}">${escaparHTML(i.nome)}</span>
          <div class="carrinho-pontos"></div>
          <div class="carrinho-valores text-body">
            <small class="text-muted me-1">(${formatarQtd(i)} x R$ ${i.preco.toFixed(2).replace('.', ',')})</small>
            <span class="fw-bold text-success">R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
            <button type="button" class="btn btn-sm text-danger border-0 p-0 ms-2 fw-bold" style="font-size: 0.9rem;" onclick="removerItem('${escaparHTML(i.id)}')">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (spanTotal) {
    spanTotal.innerText = total.toFixed(2).replace('.', ',');
  }
  salvarCarrinhoNoStorage();
}

function alterarQuantidade(id, delta) {
  const item = carrinho.find(i => String(i.id) === String(id));
  if (!item) return;
  // Itens em Kg variam de 0,100 em 0,100; os demais de 1 em 1
  const passo = ehUnidadeKg(item.unidade) ? 0.1 : 1;
  item.qtd = arredondarQtd(item.qtd + delta * passo);
  if (item.qtd <= 0) {
    removerItem(id);
  } else {
    atualizarCarrinho();
  }
}

function removerItem(id) {
  carrinho = carrinho.filter(i => String(i.id) !== String(id));
  atualizarCarrinho();
}

function cancelarVenda() {
  if (carrinho.length === 0) {
    alert('O carrinho já está vazio!');
    return;
  }
  if (confirm("Deseja realmente cancelar a venda atual e esvaziar o carrinho?")) {
    carrinho = [];
    atualizarCarrinho();
    
    // RESETA OS INPUTS SUPERIORES AO LIMPAR A OPERAÇÃO
    if (typeof atualizarCamposDetalhe === 'function') {
      atualizarCamposDetalhe(null);
    }
    
    alert('Venda cancelada com sucesso.');
  }
}

////////////////////////////////////////////////////////////////
// FINALIZAR VENDA WITH REBOBINAÇÃO TÉRMICA
////////////////////////////////////////////////////////////////
function finalizarVenda() {
  if (carrinho.length === 0) {
    alert('O carrinho está vazio!');
    return;
  }
  let total = 0;
  const dataHora = new Date().toLocaleString('pt-BR');
  let htmlCupom = `
    <div style="text-align: center; font-weight: bold;">FULLTIME TECHNOLOGY</div>
    <div style="text-align: center;">FRENTE DE CAIXA PDV</div>
    <div class="cupom-tracejado"></div>
    <div>DATA/HORA: ${dataHora}</div>
    <div class="cupom-tracejado"></div>
    <div style="font-weight: bold; display: flex; justify-content: space-between;">
      <span>ITEM DESC.</span>
      <span>QTDxUNIT = TOTAL</span>
    </div>
    <div class="cupom-tracejado"></div>
  `;

  carrinho.forEach((i, idx) => {
    const sub = Math.round(i.preco * i.qtd * 100) / 100;
    total += sub;
    htmlCupom += `
      <div class="cupom-item-linha">
        <span>${String(idx + 1).padStart(2, '0')} ${escaparHTML(i.nome.substring(0, 18))}</span>
        <span>${formatarQtd(i)}x${i.preco.toFixed(2)} = ${sub.toFixed(2)}</span>
      </div>
    `;
  });

  htmlCupom += `
    <div class="cupom-tracejado"></div>
    <div style="font-weight: bold; font-size: 14px; display: flex; justify-content: space-between;">
      <span>TOTAL:</span>
      <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
    </div>
    <div class="cupom-tracejado"></div>
    <div style="text-align: center; margin-top: 15px;">OBRIGADO PELA PREFERÊNCIA!</div>
  `;

  document.getElementById('area-impressao-cupom').innerHTML = htmlCupom;
  window.print();
  carrinho = [];
  atualizarCarrinho();

  // RESETA OS INPUTS SUPERIORES APÓS CONCLUIR E IMPRIMIR O COMPROVANTE
  if (typeof atualizarCamposDetalhe === 'function') {
    atualizarCamposDetalhe(null);
  }
}
