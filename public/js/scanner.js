/**
 * =========================================================================
 * ARQUIVO: scanner.js (Versão Híbrida: Câmera + Arquivo Local)
 * GERENCIAMENTO DO SCANNER VIA CÂMERA E UPLOAD DE IMAGEM PARA PDV
 * =========================================================================
 */

let html5QrCodeScanner = null;
const ID_ELEMENTO_LEITOR = "leitor-camera";
const ID_MODAL = "modalScanner";

// Configuração padrão de formatos aceitos (Otimizado para varejo/mercados)
const CONFIG_FORMATOS = {
    formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.QR_CODE
    ]
};

/**
 * Inicializa e gerencia o comportamento do Modal
 */
function abrirScanner() {
    const modalElement = document.getElementById(ID_MODAL);
    const modalBootstrap = bootstrap.Modal.getOrCreateInstance(modalElement);
    
    // Reseta as abas para focar na câmera ao abrir
    const primeiraAba = document.querySelector('#camera-tab');
    if (primeiraAba) bootstrap.Tab.getOrCreateInstance(primeiraAba).show();

    modalBootstrap.show();

    // Inicializa a instância da biblioteca para a aba da Câmera
    html5QrCodeScanner = new Html5Qrcode(ID_ELEMENTO_LEITOR);

    const configCamera = { 
        fps: 15, 
        qrbox: { width: 300, height: 180 },
        ...CONFIG_FORMATOS
    };

    // Inicia fluxo de captura de vídeo
    html5QrCodeScanner.start(
        { facingMode: "environment" }, 
        configCamera, 
        onScanSuccess, 
        onScanFailure
    ).catch(err => {
        console.warn("Acesso à câmera negado ou indisponível (Ambiente local file://).");
        document.getElementById(ID_ELEMENTO_LEITOR).innerHTML = `
            <div class="alert alert-warning text-center m-1 small" role="alert">
                <strong>Modo Local Ativo:</strong> Câmera bloqueada pelo navegador via <code>file://</code>.<br>
                <span class="text-dark fw-bold">Por favor, utilize a aba ao lado "Upload de Imagem".</span>
            </div>
        `;
    });

    // Evento: Desliga a câmera se mudar para a aba de arquivo local
    const abas = modalElement.querySelectorAll('button[data-bs-toggle="tab"]');
    abas.forEach(aba => {
        aba.addEventListener('shown.bs.tab', (event) => {
            if (event.target.id !== 'camera-tab') {
                pararScanner();
            } else {
                abrirScanner(); // Reativa a câmera se voltar para a primeira aba
            }
        });
    });

    // Evento: Adiciona escuta para capturar o upload do arquivo
    const inputArquivo = document.getElementById("leitor-arquivo-input");
    if (inputArquivo) {
        inputArquivo.value = ""; // Limpa seleção anterior
        inputArquivo.addEventListener("change", processarArquivoImagem);
    }

    // Evento: Desliga a câmera definitivamente se fechar o modal
    modalElement.addEventListener('hidden.bs.modal', pararScanner, { once: true });
}

/**
 * Processa a imagem enviada localmente pelo operador (Funciona via file://)
 */
function processarArquivoImagem(e) {
    const arquivo = e.target.files[0];
    const feedback = document.getElementById("feedback-arquivo");
    if (!arquivo) return;

    feedback.className = "small text-primary mt-2";
    feedback.innerText = "Analisando imagem local...";

    // Instancia o leitor para arquivos locais
    const html5QrCodeLocal = new Html5Qrcode("leitor-camera");

    html5QrCodeLocal.scanFile(arquivo, CONFIG_FORMATOS, true)
        .then(decodedText => {
            feedback.className = "small text-success mt-2";
            feedback.innerText = "Código detectado com sucesso!";
            onScanSuccess(decodedText);
        })
        .catch(err => {
            console.error("Falha na leitura do arquivo:", err);
            feedback.className = "small text-danger mt-2";
            feedback.innerText = "Não foi possível ler um código válido nesta imagem. Tente outra foto mais nítida.";
        });
}

/**
 * Callback executado imediatamente quando qualquer código é lido com sucesso (Câmera ou Arquivo)
 */
function onScanSuccess(decodedText) {
    const inputBusca = document.getElementById("busca");
    if (inputBusca) {
        inputBusca.value = decodedText; // Envia o código decodificado para o campo de texto do PDV
        
        // Fecha o modal
        const modalElement = document.getElementById(ID_MODAL);
        const modalBootstrap = bootstrap.Modal.getInstance(modalElement);
        if (modalBootstrap) modalBootstrap.hide();

        // Dispara a busca automática de itens do seu carrinho (função nativa no seu pdv.js)
        if (typeof processarCodigoBarras === "function") {
            processarCodigoBarras();
        }
    }
}

function onScanFailure(error) {
    // Silenciado para evitar gargalo de performance no console em tempo real
}

/**
 * Desliga e limpa o hardware da câmera
 */
function pararScanner() {
    if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
        html5QrCodeScanner.stop().then(() => {
            html5QrCodeScanner.clear();
        }).catch(err => {
            console.error("Erro ao finalizar câmera:", err);
        });
    }
}
