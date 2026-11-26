const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');

const markdown = new MarkdownIt({ html: true, linkify: true });
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);
const MIME_EXTENSIONS = {
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

function isSafeFileName(fileName) {
  return typeof fileName === 'string'
    && fileName.length > 0
    && fileName.length <= 255
    && fileName === path.basename(fileName)
    && !fileName.includes('\0');
}

function isMarkdownFileName(fileName) {
  return isSafeFileName(fileName) && path.extname(fileName).toLowerCase() === '.md';
}

function isImageFileName(fileName) {
  return isSafeFileName(fileName) && IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

async function listMarkdownFiles(readmeDir) {
  const entries = await fs.readdir(readmeDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && isMarkdownFileName(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function resolveMarkdownFile(readmeDir, fileName) {
  if (!isMarkdownFileName(fileName)) return null;
  const files = await listMarkdownFiles(readmeDir);
  if (!files.includes(fileName)) return null;
  const filePath = path.resolve(readmeDir, fileName);
  return path.dirname(filePath) === path.resolve(readmeDir) ? filePath : null;
}

async function listImages(readmeDir) {
  const imageFiles = [];
  const directories = [
    { directory: readmeDir, prefix: '' },
    { directory: path.join(readmeDir, 'assets'), prefix: 'assets/' }
  ];

  for (const { directory, prefix } of directories) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' && prefix) continue;
      throw error;
    }

    for (const entry of entries) {
      if (entry.isFile() && isImageFileName(entry.name)) {
        imageFiles.push({
          path: `${prefix}${entry.name}`,
          label: `${prefix}${entry.name}`
        });
      }
    }
  }

  return imageFiles.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function localImageUrl(src) {
  if (typeof src !== 'string' || !src) return '';
  if (/^https?:\/\//i.test(src) || src.startsWith('/')) return src;

  let relative = src.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  if (relative.startsWith('ReadMe/')) relative = relative.slice('ReadMe/'.length);

  if (relative.startsWith('assets/')) {
    const fileName = relative.slice('assets/'.length);
    return isImageFileName(fileName)
      ? `/markdown-editor/images/assets/${encodeURIComponent(fileName)}`
      : '';
  }

  return isImageFileName(relative)
    ? `/markdown-editor/images/${encodeURIComponent(relative)}`
    : '';
}

function renderMarkdown(content) {
  const html = markdown.render(content);
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['div', 'img', 'span']),
    allowedAttributes: {
      '*': ['class'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      div: ['align'],
      p: ['align']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (tagName, attributes) => ({
        tagName,
        attribs: {
          ...attributes,
          ...(attributes.target === '_blank' ? { rel: 'noopener noreferrer' } : {})
        }
      }),
      img: (tagName, attributes) => {
        const src = localImageUrl(attributes.src);
        const attribs = { ...attributes };
        if (src) attribs.src = src;
        else delete attribs.src;
        return { tagName, attribs };
      }
    }
  });
}

function imageSignatureIsValid(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/gif') {
    return buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null;
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function jsonError(res, status, message) {
  return res.status(status).json({ sucesso: false, mensagem: message });
}

function registerMarkdownEditorRoutes(app, { exigirAutenticacao, projectDir }) {
  const readmeDir = path.resolve(projectDir, 'ReadMe');
  const assetsDir = path.join(readmeDir, 'assets');

  app.get('/markdown-editor', exigirAutenticacao, async (req, res) => {
    try {
      const files = await listMarkdownFiles(readmeDir);
      const requestedFile = typeof req.query.file === 'string' ? req.query.file : '';
      let currentFile = '';

      if (requestedFile) {
        if (!files.includes(requestedFile)) {
          return res.status(404).send('Arquivo Markdown não encontrado em ReadMe/.');
        }
        currentFile = requestedFile;
      } else {
        currentFile = files.find(file => file.toLowerCase() === 'readme.md') || files[0] || '';
      }

      const content = currentFile
        ? await fs.readFile(path.join(readmeDir, currentFile), 'utf8')
        : '';
      const images = await listImages(readmeDir);
      return res.render('markdown-editor', {
        files,
        currentFile,
        content,
        images,
        mensagem: req.query.salvo === '1' ? 'Arquivo salvo com sucesso.' : ''
      });
    } catch (error) {
      console.error('[ERRO ao abrir o editor Markdown]:', error);
      return res.status(500).send('Não foi possível carregar os arquivos Markdown.');
    }
  });

  app.get('/markdown-editor/api/files/:fileName', exigirAutenticacao, async (req, res) => {
    try {
      const filePath = await resolveMarkdownFile(readmeDir, req.params.fileName);
      if (!filePath) return jsonError(res, 404, 'Arquivo Markdown não encontrado.');
      const content = await fs.readFile(filePath, 'utf8');
      return res.json({ sucesso: true, fileName: req.params.fileName, content });
    } catch (error) {
      console.error('[ERRO ao ler arquivo Markdown]:', error);
      return jsonError(res, 500, 'Não foi possível ler o arquivo Markdown.');
    }
  });

  app.put('/markdown-editor/api/files/:fileName', exigirAutenticacao, async (req, res) => {
    const { content } = req.body || {};
    if (typeof content !== 'string') {
      return jsonError(res, 400, 'O conteúdo Markdown enviado é inválido.');
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) {
      return jsonError(res, 413, 'O arquivo Markdown excede o limite de 2 MB.');
    }

    try {
      const filePath = await resolveMarkdownFile(readmeDir, req.params.fileName);
      if (!filePath) return jsonError(res, 404, 'Arquivo Markdown não encontrado em ReadMe/.');

      const temporaryPath = path.join(
        readmeDir,
        `.markdown-${randomBytes(8).toString('hex')}.tmp`
      );
      try {
        await fs.writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
        await fs.rename(temporaryPath, filePath);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(cleanupError => {
          console.error('[ERRO ao limpar arquivo temporário Markdown]:', cleanupError);
        });
        throw error;
      }
      return res.json({ sucesso: true, mensagem: 'Arquivo salvo com sucesso.' });
    } catch (error) {
      console.error('[ERRO ao salvar arquivo Markdown]:', error);
      return jsonError(res, 500, 'Não foi possível salvar o arquivo Markdown.');
    }
  });

  app.post('/markdown-editor/api/preview', exigirAutenticacao, (req, res) => {
    const { content } = req.body || {};
    if (typeof content !== 'string') {
      return jsonError(res, 400, 'O conteúdo para pré-visualização é inválido.');
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) {
      return jsonError(res, 413, 'O conteúdo excede o limite de 2 MB.');
    }
    return res.json({ sucesso: true, html: renderMarkdown(content) });
  });

  app.post('/markdown-editor/api/images', exigirAutenticacao, async (req, res) => {
    const dataUrl = req.body && req.body.dataUrl;
    const match = typeof dataUrl === 'string'
      ? /^data:(image\/(?:gif|jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl)
      : null;
    if (!match) return jsonError(res, 400, 'Envie uma imagem PNG, JPEG, GIF ou WebP válida.');

    const mimeType = match[1].toLowerCase();
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) {
      return jsonError(res, 413, 'A imagem deve ter no máximo 10 MB.');
    }
    if (buffer.toString('base64') !== base64 || !imageSignatureIsValid(buffer, mimeType)) {
      return jsonError(res, 400, 'O conteúdo da imagem não corresponde ao formato informado.');
    }

    try {
      await fs.mkdir(assetsDir, { recursive: true });
      const extension = MIME_EXTENSIONS[mimeType];
      const fileName = `imagem-${Date.now()}-${randomBytes(5).toString('hex')}${extension}`;
      await fs.writeFile(path.join(assetsDir, fileName), buffer, { flag: 'wx' });
      return res.status(201).json({
        sucesso: true,
        path: `assets/${fileName}`,
        label: `assets/${fileName}`
      });
    } catch (error) {
      console.error('[ERRO ao enviar imagem para o editor Markdown]:', error);
      return jsonError(res, 500, 'Não foi possível salvar a imagem em ReadMe/assets/.');
    }
  });

  const sendImage = async (res, directory, fileName) => {
    if (!isImageFileName(fileName)) return res.status(404).end();
    try {
      const filePath = path.join(directory, fileName);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return res.status(404).end();
      const image = await fs.readFile(filePath);
      return res.type(path.extname(fileName)).send(image);
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).end();
      console.error('[ERRO ao servir imagem Markdown]:', error);
      return res.status(500).end();
    }
  };

  app.get('/markdown-editor/images/assets/:fileName', exigirAutenticacao, (req, res) => (
    sendImage(res, assetsDir, req.params.fileName)
  ));
  app.get('/markdown-editor/images/:fileName', exigirAutenticacao, (req, res) => (
    sendImage(res, readmeDir, req.params.fileName)
  ));
}

module.exports = {
  registerMarkdownEditorRoutes
};
