const CREATE_TABLE_CLIENTES_PJ_SQL = `
  CREATE TABLE IF NOT EXISTS clientes_pj (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    razao_social VARCHAR(200) NOT NULL,
    cnpj VARCHAR(14) NOT NULL UNIQUE,
    nome_fantasia VARCHAR(200) NULL,
    ie VARCHAR(30) NULL,
    data_abertura DATE NULL,
    porte VARCHAR(60) NULL,
    regime_tributario VARCHAR(80) NULL,
    nome_responsavel VARCHAR(200) NULL,
    cargo VARCHAR(100) NULL,
    telefone VARCHAR(30) NULL,
    celular VARCHAR(30) NULL,
    email VARCHAR(254) NULL,
    cep VARCHAR(9) NULL,
    rua VARCHAR(255) NULL,
    numero VARCHAR(40) NULL,
    bairro VARCHAR(150) NULL,
    cidade VARCHAR(150) NULL,
    estado CHAR(2) NULL,
    observacoes TEXT NULL,
    data_cadastro DATETIME(3) NOT NULL,
    data_alteracao DATETIME(3) NOT NULL,
    INDEX idx_clientes_pj_razao (razao_social),
    INDEX idx_clientes_pj_fantasia (nome_fantasia)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

module.exports = { CREATE_TABLE_CLIENTES_PJ_SQL };
