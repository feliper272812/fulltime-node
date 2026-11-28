// backup.js – copia todo o diretório do projeto para %USERPROFILE%\Downloads\<nome‑do‑backup>
// (opcional: ignora /private e /node_modules se desejar)

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// -------------------------------------------------
// CONFIGURAÇÃO
// -------------------------------------------------
const sourceDir  = path.resolve(__dirname);                 // raiz do projeto
const backupName = 'fulltime-node-backup-' + Date.now();   // ex.: fulltime-node-backup-1700000000000
const targetDir  = path.join(os.homedir(), 'Downloads', backupName);

/**
 * Copia recursivamente arquivos e sub‑pastas de src → dest.
 * Se quiser excluir alguma pasta (ex.: private ou node_modules),
 * adicione uma verificação `if (rel.startsWith('private')) return;`.
 */
function copyRecursive(src, dest) {
  // Ignorar pastas que não devem ser incluídas no backup (descomente se precisar)
  // const rel = path.relative(sourceDir, src);
  // if (rel.startsWith('private') || rel.startsWith('node_modules')) return;

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath); // recursão para sub‑pastas
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath); // copia arquivo
    }
    // links simbólicos, sockets etc. são ignorados por simplicidade
  }
}

// -------------------------------------------------
// EXECUÇÃO
// -------------------------------------------------
try {
  console.log(`🔧 Criando backup em: ${targetDir}`);
  copyRecursive(sourceDir, targetDir);
  console.log('✅ Backup concluído com sucesso!');
} catch (err) {
  console.error('❌ Falha ao criar backup:', err);
  process.exit(1);
}
