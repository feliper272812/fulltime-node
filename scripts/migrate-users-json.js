const fs = require('fs');
const path = require('path');
const { hashPassword, isPasswordHash } = require('../password-utils');

async function migrarArquivoUsuarios() {
  const caminho = path.join(__dirname, '..', 'data', 'cadUsuarios.json');
  const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  const usuarios = Array.isArray(dados) ? dados : [dados];
  let migrados = 0;

  for (const usuario of usuarios) {
    if (!usuario || typeof usuario !== 'object' || Array.isArray(usuario)) {
      throw new Error('O JSON contém um registro de usuário inválido.');
    }

    if (isPasswordHash(usuario.senhaHash) && !Object.prototype.hasOwnProperty.call(usuario, 'senha')) {
      continue;
    }
    if (typeof usuario.senha !== 'string' || !usuario.senha.trim()) {
      throw new Error('Há um registro sem senha válida para migrar.');
    }

    usuario.senhaHash = await hashPassword(usuario.senha.trim());
    delete usuario.senha;
    migrados++;
  }

  const temporario = `${caminho}.tmp`;
  fs.writeFileSync(temporario, `${JSON.stringify(dados, null, 2)}\n`, 'utf8');
  fs.renameSync(temporario, caminho);
  console.log(`Migração concluída: ${migrados} senha(s) convertida(s); nenhum valor foi exibido.`);
}

migrarArquivoUsuarios().catch(erro => {
  console.error('Não foi possível migrar cadUsuarios.json:', erro.message);
  process.exitCode = 1;
});
