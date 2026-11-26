(() => {
    const fileSelect = document.getElementById('markdown-file');
    const editor = document.getElementById('markdown-content');
    const preview = document.getElementById('markdown-preview');
    const saveButton = document.getElementById('save-markdown');
    const saveStatus = document.getElementById('save-status');
    const imageModalElement = document.getElementById('image-picker-modal');
    const imageModal = bootstrap.Modal.getOrCreateInstance(imageModalElement);
    const imageSelect = document.getElementById('existing-image');
    const imageInput = document.getElementById('new-image');
    const imageStatus = document.getElementById('image-upload-status');

    let currentFile = fileSelect.value;
    let savedContent = editor.value;
    let previewTimer;
    let previewRequest = 0;

    function setSaveStatus(message, isError = false) {
        saveStatus.textContent = message;
        saveStatus.classList.toggle('text-danger', isError);
        saveStatus.classList.toggle('text-body-secondary', !isError);
    }

    function resetEditorPosition() {
        editor.setSelectionRange(0, 0);
        editor.scrollTop = 0;
        preview.scrollTop = 0;
    }

    function replaceSelection(value) {
        editor.setRangeText(value, editor.selectionStart, editor.selectionEnd, 'select');
        editor.focus();
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertText(before, after = '', placeholder = '') {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selected = editor.value.slice(start, end) || placeholder;
        replaceSelection(`${before}${selected}${after}`);
    }

    function prefixSelectedLines(prefix) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIndex = editor.value.indexOf('\n', end);
        const lineEnd = lineEndIndex === -1 ? editor.value.length : lineEndIndex;
        const selected = editor.value.slice(lineStart, lineEnd) || 'Texto';
        const formatted = selected.split('\n').map(line => `${prefix}${line}`).join('\n');
        editor.setRangeText(formatted, lineStart, lineEnd, 'select');
        editor.focus();
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertAlignment(align) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selected = editor.value.slice(start, end) || 'Texto';
        const formatted = `<div align="${align}">\n\n${selected}\n\n</div>`;
        replaceSelection(formatted);
    }

    function queuePreview() {
        window.clearTimeout(previewTimer);
        const requestId = ++previewRequest;
        previewTimer = window.setTimeout(() => renderPreview(requestId), 250);
    }

    async function renderPreview(requestId) {
        try {
            const response = await fetch('/markdown-editor/api/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editor.value })
            });
            const result = await response.json();
            if (requestId !== previewRequest) return;
            if (!response.ok || !result.sucesso) {
                throw new Error(result.mensagem || 'Não foi possível atualizar a pré-visualização.');
            }
            preview.innerHTML = result.html;
        } catch (error) {
            if (requestId === previewRequest) {
                preview.textContent = error.message;
            }
        }
    }

    async function loadFile(fileName) {
        const response = await fetch(`/markdown-editor/api/files/${encodeURIComponent(fileName)}`);
        const result = await response.json();
        if (!response.ok || !result.sucesso) {
            throw new Error(result.mensagem || 'Não foi possível abrir o arquivo.');
        }
        currentFile = result.fileName;
        editor.value = result.content;
        savedContent = result.content;
        resetEditorPosition();
        window.history.replaceState(null, '', `/markdown-editor?file=${encodeURIComponent(currentFile)}`);
        setSaveStatus('');
        queuePreview();
    }

    async function saveFile() {
        if (!currentFile || saveButton.disabled) return;
        const fileName = currentFile;
        const contentToSave = editor.value;
        saveButton.disabled = true;
        setSaveStatus('Salvando...');
        try {
            const response = await fetch(`/markdown-editor/api/files/${encodeURIComponent(fileName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: contentToSave })
            });
            const result = await response.json();
            if (!response.ok || !result.sucesso) {
                throw new Error(result.mensagem || 'Não foi possível salvar o arquivo.');
            }
            if (currentFile === fileName) {
                savedContent = contentToSave;
                setSaveStatus(editor.value === contentToSave ? 'Salvo.' : 'Alterações não salvas.');
            }
        } catch (error) {
            if (currentFile === fileName) setSaveStatus(error.message, true);
        } finally {
            saveButton.disabled = false;
        }
    }

    function insertImage(imagePath) {
        if (!imagePath) return;
        const alt = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim() || 'Descrição da imagem';
        replaceSelection(`![${alt}](${imagePath})`);
        imageModal.hide();
    }

    document.querySelectorAll('[data-md-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.mdAction;
            if (action === 'bold') insertText('**', '**', 'texto');
            else if (action === 'italic') insertText('*', '*', 'texto');
            else if (action === 'strike') insertText('~~', '~~', 'texto');
            else if (action === 'heading') prefixSelectedLines('## ');
            else if (action === 'quote') prefixSelectedLines('> ');
            else if (action === 'unordered-list') prefixSelectedLines('- ');
            else if (action === 'ordered-list') prefixSelectedLines('1. ');
            else if (action === 'code') insertText('`', '`', 'código');
            else if (action === 'align-left') insertAlignment('left');
            else if (action === 'align-center') insertAlignment('center');
            else if (action === 'align-right') insertAlignment('right');
            else if (action === 'align-justify') insertAlignment('justify');
            else if (action === 'link') {
                const url = window.prompt('Informe a URL do link:');
                if (url) insertText('[', `](${url})`, 'texto do link');
            }
        });
    });

    editor.addEventListener('input', () => {
        setSaveStatus(editor.value === savedContent ? '' : 'Alterações não salvas.');
        queuePreview();
    });

    fileSelect.addEventListener('change', async () => {
        const selectedFile = fileSelect.value;
        if (editor.value !== savedContent && !window.confirm('Descartar as alterações não salvas?')) {
            fileSelect.value = currentFile;
            return;
        }
        try {
            await loadFile(selectedFile);
        } catch (error) {
            fileSelect.value = currentFile;
            setSaveStatus(error.message, true);
        }
    });

    saveButton.addEventListener('click', saveFile);
    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            saveFile();
        }
    });

    document.getElementById('open-image-picker').addEventListener('click', () => {
        imageStatus.textContent = '';
        imageModal.show();
    });
    document.getElementById('insert-existing-image').addEventListener('click', () => {
        insertImage(imageSelect.value);
    });

    document.getElementById('upload-and-insert-image').addEventListener('click', () => {
        const file = imageInput.files[0];
        if (!file) {
            imageStatus.textContent = 'Selecione uma imagem primeiro.';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            imageStatus.textContent = 'A imagem deve ter no máximo 10 MB.';
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => {
            imageStatus.textContent = 'Não foi possível ler a imagem selecionada.';
        };
        reader.onload = async () => {
            imageStatus.textContent = 'Enviando imagem...';
            try {
                const response = await fetch('/markdown-editor/api/images', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl: reader.result })
                });
                const result = await response.json();
                if (!response.ok || !result.sucesso) {
                    throw new Error(result.mensagem || 'Não foi possível enviar a imagem.');
                }
                const option = new Option(result.label, result.path, true, true);
                imageSelect.add(option);
                imageInput.value = '';
                imageStatus.textContent = 'Imagem enviada.';
                insertImage(result.path);
            } catch (error) {
                imageStatus.textContent = error.message;
            }
        };
        reader.readAsDataURL(file);
    });

    resetEditorPosition();
    queuePreview();
})();
