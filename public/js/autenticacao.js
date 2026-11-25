/**
 * =========================================================
 * ARQUIVO: autenticacao.js
 * Sistema de Controle de Acesso Centralizado
 * Autor: Felipe Rodrigues - FullTime Technology (Revisado 2026)
 * =========================================================
 */

document.addEventListener("DOMContentLoaded", function () {
    // Detecta em qual página o usuário está atualmente
    const paginaAtual = window.location.pathname.split("/").pop();
    
    // Verifica o status de autenticação no armazenamento do navegador
    const pdvHabilitado = localStorage.getItem("PDV_HABILITADO");

    // ==========================================
    // LÓGICA PARA AS PÁGINAS INTERNAS DO SISTEMA
    // ==========================================
    if (paginaAtual !== "index.html" && paginaAtual !== "index.html/" && paginaAtual !== "") {
        // Se NÃO estiver na index e o PDV NÃO estiver habilitado, expulsa o usuário
        if (pdvHabilitado !== "1") {
            window.location.href = "index.html";
        }
    }
});

// =========================================================================
// GESTÃO GLOBAL DE LOGOUT (IMUNE A ATRASOS DE CARREGAMENTO DA NAVBAR/INCLUDE.JS)
// =========================================================================
document.addEventListener('click', function (event) {
    // Detecta de forma passiva e precisa o clique no botão ou link de ID #btnSair
    const alvoSair = event.target.closest('#btnSair') || event.target.closest('.dropdown-menu .text-danger');
    
    if (alvoSair) {
        event.preventDefault(); // Impede a ação padrão do link '#'
        
        // Define o estado como bloqueado e desloga o operador mantendo o banco seguro
        localStorage.setItem("PDV_HABILITADO", "0"); 
        
        // Captura a página atual para evitar loops visuais redundantes na index
        const naIndex = window.location.pathname.split("/").pop();
        
        if (naIndex === "index.html" || naIndex === "") {
            // Se já estiver na index, apenas puxa e exibe o modal dinâmico na tela
            document.body.classList.add('autenticacao-pendente');
            const modalEl = document.getElementById('loginModal');
            if (modalEl) {
                const bootstrapModal = bootstrap.Modal.getOrCreateInstance(modalEl);
                bootstrapModal.show();
            }
        } else {
            // Se estiver em qualquer outra página interna, expulsa para a raiz exibir o login
            window.location.href = "index.html";
        }
    }
});
