const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { registerMarkdownEditorRoutes } = require('../markdown-editor-routes');

async function createEditorServer(t) {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fulltime-markdown-'));
  const readmeDir = path.join(projectDir, 'ReadMe');
  await fs.mkdir(path.join(readmeDir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(readmeDir, 'README.md'), '# Original\n');
  await fs.writeFile(path.join(readmeDir, 'guia.MD'), 'Texto de teste.\n');
  await fs.writeFile(path.join(readmeDir, 'EventLoop.jpg'), 'image fixture');
  await fs.writeFile(path.join(projectDir, 'privado.md'), 'Fora do escopo.\n');

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    res.locals.usuarioLogado = { usuario: 'Teste', departamento: 'Geral' };
    next();
  });
  const exigirAutenticacao = (req, res, next) => (
    req.get('x-test-user') === 'ok'
      ? next()
      : res.status(401).json({ sucesso: false, mensagem: 'Não autenticado.' })
  );
  registerMarkdownEditorRoutes(app, { exigirAutenticacao, projectDir });

  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
    await fs.rm(projectDir, { recursive: true, force: true });
  });
  await new Promise(resolve => server.once('listening', resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    readmeDir,
    headers: { 'x-test-user': 'ok' }
  };
}

test('Markdown editor requires authentication and only lists files in ReadMe', async t => {
  const { baseUrl, headers } = await createEditorServer(t);

  const unauthorized = await fetch(`${baseUrl}/markdown-editor`);
  assert.equal(unauthorized.status, 401);

  const page = await fetch(`${baseUrl}/markdown-editor`, { headers });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Editor de arquivos Markdown/);
  assert.match(html, /README\.md/);
  assert.match(html, /guia\.MD/);

  const outsideFile = await fetch(`${baseUrl}/markdown-editor/api/files/privado.md`, { headers });
  assert.equal(outsideFile.status, 404);
});

test('Markdown editor loads and saves only an existing Markdown file', async t => {
  const { baseUrl, readmeDir, headers } = await createEditorServer(t);
  const content = '# Atualizado\n\nTexto **formatado**.\n';

  const response = await fetch(`${baseUrl}/markdown-editor/api/files/guia.MD`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    sucesso: true,
    mensagem: 'Arquivo salvo com sucesso.'
  });
  assert.equal(await fs.readFile(path.join(readmeDir, 'guia.MD'), 'utf8'), content);

  const traversal = await fetch(`${baseUrl}/markdown-editor/api/files/%2E%2E%2Fprivado.md`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'nao' })
  });
  assert.equal(traversal.status, 404);
});

test('Markdown preview formats text, aligns HTML, rewrites local images, and removes scripts', async t => {
  const { baseUrl, headers } = await createEditorServer(t);
  const response = await fetch(`${baseUrl}/markdown-editor/api/preview`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: [
        '**Negrito**',
        '<div align="justify">Texto alinhado</div>',
        '![Diagrama](ReadMe/EventLoop.jpg)',
        '<script>alert(1)</script>'
      ].join('\n\n')
    })
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.html, /<strong>Negrito<\/strong>/);
  assert.match(result.html, /<div align="justify">/);
  assert.match(result.html, /src="\/markdown-editor\/images\/EventLoop\.jpg"/);
  assert.doesNotMatch(result.html, /<script/i);
});

test('image upload accepts verified image data and rejects non-image payloads', async t => {
  const { baseUrl, readmeDir, headers } = await createEditorServer(t);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lAAAAABJRU5ErkJggg==';
  const response = await fetch(`${baseUrl}/markdown-editor/api/images`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: `data:image/png;base64,${png}` })
  });

  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.path, /^assets\/imagem-\d+-[a-f0-9]+\.png$/);
  assert.equal(result.label, result.path);
  const stored = await fs.readFile(path.join(readmeDir, result.path));
  assert.equal(stored.toString('base64'), png);

  const invalid = await fetch(`${baseUrl}/markdown-editor/api/images`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: 'data:text/plain;base64,dGVzdA==' })
  });
  assert.equal(invalid.status, 400);
});
