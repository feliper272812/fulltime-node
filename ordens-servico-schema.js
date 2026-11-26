const CREATE_TABLE_ORDENS_SERVICO_SQL = `
  CREATE TABLE IF NOT EXISTS ordens_servico (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    data_abertura DATE NOT NULL,
    status ENUM('Aberta', 'Em Andamento', 'Finalizada', 'Cancelada') NOT NULL DEFAULT 'Aberta',
    prioridade ENUM('Baixa', 'Média', 'Alta', 'Urgente') NOT NULL DEFAULT 'Média',
    cliente_nome VARCHAR(255) NOT NULL,
    cliente_telefone VARCHAR(30) NULL,
    equipamento VARCHAR(150) NULL,
    marca VARCHAR(100) NULL,
    modelo VARCHAR(100) NULL,
    numero_serie VARCHAR(150) NULL,
    acessorios TEXT NULL,
    relato_problema TEXT NOT NULL,
    servico_executado TEXT NULL,
    mao_de_obra DECIMAL(12,2) NOT NULL DEFAULT 0,
    pecas DECIMAL(12,2) NOT NULL DEFAULT 0,
    desconto DECIMAL(12,2) NOT NULL DEFAULT 0,
    valor_total DECIMAL(14,2) NOT NULL DEFAULT 0,
    observacoes TEXT NULL,
    data_cadastro DATETIME(3) NOT NULL,
    data_alteracao DATETIME(3) NOT NULL,
    INDEX idx_ordens_servico_cliente (cliente_nome),
    INDEX idx_ordens_servico_status (status),
    INDEX idx_ordens_servico_data (data_abertura)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

module.exports = { CREATE_TABLE_ORDENS_SERVICO_SQL };
