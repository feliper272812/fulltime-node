const CREATE_TABLE_EDICOES_SQL = `
  CREATE TABLE IF NOT EXISTS edicoes (
    id VARCHAR(80) NOT NULL PRIMARY KEY,
    numero INT UNSIGNED NOT NULL,
    data DATE NOT NULL,
    titulo VARCHAR(120) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'Editando',
    responsavel VARCHAR(120) NULL,
    observacao VARCHAR(400) NULL,
    arquivo VARCHAR(255) NULL,
    criado_em DATETIME(3) NOT NULL,
    atualizado_em DATETIME(3) NOT NULL,
    fechada_em DATETIME(3) NULL,
    UNIQUE KEY uq_edicoes_numero (numero),
    UNIQUE KEY uq_edicoes_data (data),
    INDEX idx_edicoes_titulo (titulo),
    INDEX idx_edicoes_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_TABLE_MATERIAS_SQL = `
  CREATE TABLE IF NOT EXISTS materias (
    edicao_id VARCHAR(80) NOT NULL,
    id VARCHAR(80) NOT NULL,
    coluna TINYINT UNSIGNED NOT NULL,
    ordem INT UNSIGNED NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'Ativo',
    categoria VARCHAR(40) NULL,
    titulo VARCHAR(200) NOT NULL,
    link TEXT NULL,
    resumo TEXT NULL,
    autor VARCHAR(120) NULL,
    tempo VARCHAR(40) NULL,
    imagem MEDIUMTEXT NULL,
    legenda VARCHAR(200) NULL,
    criado_em DATETIME(3) NOT NULL,
    atualizado_em DATETIME(3) NOT NULL,
    PRIMARY KEY (edicao_id, id),
    INDEX idx_materias_edicao_posicao (edicao_id, coluna, ordem),
    INDEX idx_materias_titulo (titulo),
    CONSTRAINT fk_materias_edicao
      FOREIGN KEY (edicao_id) REFERENCES edicoes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

module.exports = {
  CREATE_TABLE_EDICOES_SQL,
  CREATE_TABLE_MATERIAS_SQL
};
