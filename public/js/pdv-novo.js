////////////////////////////////////////////////////////////////
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
////////////////////////////////////////////////////////////////
const STORAGE_KEY = 'PDV_PRODUTOS';
const EDIT_KEY = 'PRODUTO_EDITAR';
const SESSION_KEY = 'PDV_HABILITADO';
const CART_STORAGE_KEY = 'PDV_CARRINHO';


let produtos = [];
let carrinho = [];

////////////////////////////////////////////////////////////////
// INIT - INICIALIZAÇÃO DA APLICAÇÃO (SEM ATALHOS DE TECLADO)
////////////////////////////////////////////////////////////////
document.addEventListener('DOMContentLoaded', () => {
    // Guarda de Rota — Executado obrigatoriamente no início do DOMContentLoaded
    if (localStorage.getItem("PDV_HABILITADO") !== "1") {
        alert("Acesso negado! Por favor, realize o login.");
        window.location.href = "index.html";
        return;
    }
    carregarProdutos();
    carregarCarrinhoSalvo(); 
    renderizarProdutos();
    atualizarCarrinho();
    
    const campoCodigo = document.getElementById('buscaInterna');
    if (campoCodigo) campoCodigo.focus();
});

////////////////////////////////////////////////////////////////
// PERSISTÊNCIA DE DADOS
////////////////////////////////////////////////////////////////
function carregarProdutos() {
    produtos = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    console.log('[PDV] produtos carregados:', produtos.length);
}

function carregarCarrinhoSalvo() {
    carrinho = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
}

function salvarCarrinhoNoStorage() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(carrinho));
}

// Importação que lê o JSON e joga instantaneamente na tela da esquerda
function carregarJsonParaLocalStorage() {
    const inputArquivo = document.createElement('input');
    inputArquivo.type = 'file';
    inputArquivo.accept = '.json';

    inputArquivo.onchange = function (event) {
        const arquivo = event.target.files;
        if (!arquivo || arquivo.length === 0) return;

        const leitor = new FileReader();
        leitor.onload = function (e) {
            try {
                const conteudoTexto = e.target.result;
                const dadosValidados = JSON.parse(conteudoTexto);

                localStorage.setItem(STORAGE_KEY, JSON.stringify(dadosValidados));
                alert(`Sucesso! O arquivo "${arquivo[0].name}" foi carregado com sucesso no Local Storage (PDV_PRODUTOS).`);
                
                carregarProdutos();   
                renderizarProdutos(); 
            } catch (error) {
                console.error("Erro ao processar o arquivo JSON:", error);
                alert("Erro: O arquivo selecionado não contém um formato JSON válido.");
            }
        };
        leitor.readAsText(arquivo[0]);
    };
    inputArquivo.click();
}

////////////////////////////////////////////////////////////////
// CATÁLOGO DE PRODUTOS (RENDERIZAÇÃO E FILTRO)
////////////////////////////////////////////////////////////////
function renderizarProdutos(lista = produtos) {
    const div = document.getElementById('listaProdutos');
    if (!div) return;

    if (lista.length === 0) {
        div.innerHTML = '<div class="col-12 text-center text-muted py-5">Nenhum produto cadastrado na base local.</div>';
        return;
    }

    div.innerHTML = lista.map(p => {
        const caminhoImagem = (p.local && p.nomeArquivoImagem) ? (p.local + p.nomeArquivoImagem) : 'https://placehold.co';
        const idProduto = p.id || p.ID || p.codigo || p.Codigo;
        const precoVenda = p.precoVenda || p.preco || p.Preco || p.valor || p.Valor || 0;

        return `
        <div class="col-md-6">
            <div class="card produto-card shadow-sm h-100 overflow-hidden" onclick="adicionarCarrinho('${idProduto}')">
                <div class="row g-0 h-100 align-items-center">
                    <div class="col-4 bg-light d-flex justify-content-center p-2" style="height: 100px;">
                        <img src="${caminhoImagem}" class="img-fluid rounded object-fit-contain" style="max-height: 80px; max-width: 80px;" alt="${p.nome || ''}" onerror="this.src='https://placehold.co'">
                    </div>
                    <div class="col-8">
                        <div class="card-body p-2 text-start">
                            <div class="fw-bold text-truncate text-body" style="font-size: 0.9rem;" title="${p.nome || ''}">
                                ${p.nome || ''}
                            </div>
                            <small class="text-muted d-block" style="font-size: 0.75rem;">
                                Código: ${p.codigo || idProduto || ''}
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
    const termo = document.getElementById('busca').value.toLowerCase();
    const filtrados = produtos.filter(p =>
        (p.nome || '').toLowerCase().includes(termo) ||
        (p.codigo || p.id || '').toString().toLowerCase().includes(termo)
    );
    renderizarProdutos(filtrados);
}

////////////////////////////////////////////////////////////////
// BUSCA CIRÚRGICA POR CÓDIGO INTERNO (BIPE OU ENTER)
////////////////////////////////////////////////////////////////
function buscarNoLocalStorage() {
    const campoCodigo = document.getElementById('buscaInterna');
    if (!campoCodigo) return;

    const codigoBuscado = campoCodigo.value.trim().toUpperCase(); 
    if (!codigoBuscado) {
        alert("Por favor, insira o código do produto.");
        return;
    }

    const produtoAchado = produtos.find(p => 
        (p.codigo || p.id || p.Codigo || p.ID || '').toString().toUpperCase() === codigoBuscado
    );

    if (produtoAchado) {
        const idProduto = produtoAchado.id || produtoAchado.ID || produtoAchado.codigo || produtoAchado.Codigo;
        adicionarCarrinho(idProduto);
        campoCodigo.value = '';
        campoCodigo.focus();
    } else {
        alert(`Produto com o código "${codigoBuscado}" não foi localizado.`);
    }
}

////////////////////////////////////////////////////////////////
// CAMPO DE QUANTIDADE (#quant)
////////////////////////////////////////////////////////////////
// Sanitiza o campo enquanto o usuário digita: só números inteiros positivos.
function quantidadeProduto() {
    const campo = document.getElementById('quant');
    if (!campo) return;

    let valor = campo.value.replace(/\D/g, ''); // remove tudo que não for dígito
    if (valor.length > 1) valor = valor.replace(/^0+/, ''); // sem zeros à esquerda
    campo.value = valor;
}

// Lê a quantidade atualmente definida no campo #quant.
// Retorna 1 (padrão) se o campo estiver vazio, zerado ou inválido.
function obterQuantidadeSelecionada() {
    const campo = document.getElementById('quant');
    if (!campo) return 1;

    const valor = parseInt(campo.value, 10);
    return (!valor || valor < 1) ? 1 : valor;
}

////////////////////////////////////////////////////////////////
// GERENCIAMENTO DO CARRINHO (AÇÕES)
////////////////////////////////////////////////////////////////
function adicionarCarrinho(id) {
    const produto = produtos.find(p => String(p.id || p.ID || p.codigo || p.Codigo) === String(id));
    if (!produto) return;

    const quantidade = obterQuantidadeSelecionada();
    const item = carrinho.find(i => String(i.id) === String(id));
    const precoVenda = produto.precoVenda || produto.preco || produto.Preco || produto.valor || produto.Valor || 0;

    if (item) {
        item.qtd += quantidade;
    } else {
        carrinho.push({
            id: id,
            nome: produto.nome || "Produto sem nome",
            preco: Number(precoVenda),
            qtd: quantidade
        });
    }
    atualizarCarrinho();

    // Reseta o campo de quantidade para o padrão (1) após adicionar
    const campoQuant = document.getElementById('quant');
    if (campoQuant) campoQuant.value = '';
}

function alterarQuantidade(id, delta) {
    const item = carrinho.find(i => String(i.id) === String(id));
    if (!item) return;

    item.qtd += delta;
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

// NOVA FUNÇÃO: Limpa a tela do carrinho ao clicar no botão Cancelar Venda
function cancelarVenda() {
    if (carrinho.length === 0) {
        alert('O carrinho já está vazio!');
        return;
    }
    if (confirm("Deseja realmente cancelar a venda atual e esvaziar o carrinho?")) {
        carrinho = [];
        atualizarCarrinho();
        alert('Venda cancelada com sucesso.');
    }
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
        const subtotal = i.preco * i.qtd;
        total += subtotal;

        return `
            <div class="py-2 border-bottom border-secondary-subtle" style="font-size: 0.88rem;">
                <div class="carrinho-linha">
                    <div class="d-flex align-items-center me-2">
                        <button class="btn btn-sm btn-outline-secondary py-0 px-1 fw-bold" style="font-size: 0.7rem; line-height: 1;" onclick="alterarQuantidade('${i.id}', -1)">-</button>
                        <span class="mx-2 fw-bold text-body" style="min-width: 15px; text-align: center;">${i.qtd}</span>
                        <button class="btn btn-sm btn-outline-secondary py-0 px-1 fw-bold" style="font-size: 0.7rem; line-height: 1;" onclick="alterarQuantidade('${i.id}', 1)">+</button>
                    </div>

                    <span class="carrinho-nome text-body fw-medium" title="${i.nome}">${i.nome}</span>
                    <div class="carrinho-pontos"></div>
                    
                    <div class="carrinho-valores text-body">
                        <small class="text-muted me-1">(${i.qtd}x R$ ${i.preco.toFixed(2).replace('.', ',')})</small>
                        <span class="fw-bold text-success">R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
                        <button class="btn btn-sm text-danger border-0 p-0 ms-2 fw-bold" style="font-size: 0.9rem;" onclick="removerItem('${i.id}')">✕</button>
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

////////////////////////////////////////////////////////////////
// FINALIZAR VENDA COM REBOBINAÇÃO TÉRMICA
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
        const sub = i.preco * i.qtd;
        total += sub;
        htmlCupom += `
            <div class="cupom-item-linha">
                <span>${String(idx + 1).padStart(2, '0')} ${i.nome.substring(0, 18)}</span>
                <span>${i.qtd}x${i.preco.toFixed(2)} = ${sub.toFixed(2)}</span>
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
}

