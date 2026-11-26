const CREATE_TABLE_PRODUTOS_SQL = `
  CREATE TABLE IF NOT EXISTS produtos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(60) NOT NULL UNIQUE,
    codigo_barras VARCHAR(100) NULL UNIQUE,
    sku VARCHAR(100) NULL UNIQUE,
    nome VARCHAR(255) NOT NULL,
    marca VARCHAR(150) NULL,
    categoria VARCHAR(150) NULL,
    unidade VARCHAR(20) NOT NULL DEFAULT 'UN',
    ncm VARCHAR(20) NULL,
    cest VARCHAR(20) NULL,
    preco_custo DECIMAL(12,2) NOT NULL DEFAULT 0,
    preco_venda DECIMAL(12,2) NOT NULL DEFAULT 0,
    estoque DECIMAL(12,3) NOT NULL DEFAULT 0,
    estoque_minimo DECIMAL(12,3) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
    descricao TEXT NULL,
    imagem_base64 LONGTEXT NULL,
    imagem_nome VARCHAR(255) NULL,
    local_imagem VARCHAR(255) NULL,
    nome_arquivo_imagem VARCHAR(255) NULL,
    data_cadastro DATETIME(3) NOT NULL,
    data_alteracao DATETIME(3) NOT NULL,
    INDEX idx_produtos_nome (nome),
    INDEX idx_produtos_categoria (categoria)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

module.exports = { CREATE_TABLE_PRODUTOS_SQL };
