const CREATE_TABLE_ORCAMENTOS_SQL = `
  CREATE TABLE IF NOT EXISTS orcamentos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente VARCHAR(255) NOT NULL,
    valor_total DECIMAL(14,2) NOT NULL,
    data_cadastro DATETIME(3) NOT NULL,
    data_alteracao DATETIME(3) NOT NULL,
    INDEX idx_orcamentos_cliente (cliente)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_TABLE_ORCAMENTO_ITENS_SQL = `
  CREATE TABLE IF NOT EXISTS orcamento_itens (
    orcamento_id INT UNSIGNED NOT NULL,
    sequencia SMALLINT UNSIGNED NOT NULL,
    descricao VARCHAR(1000) NOT NULL,
    quantidade INT UNSIGNED NOT NULL,
    valor_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (orcamento_id, sequencia),
    CONSTRAINT fk_orcamento_itens_orcamento
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

module.exports = {
  CREATE_TABLE_ORCAMENTOS_SQL,
  CREATE_TABLE_ORCAMENTO_ITENS_SQL
};
