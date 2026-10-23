CREATE DATABASE IF NOT EXISTS blossom;
USE blossom;

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_id CHAR(36) NOT NULL,
    local_id CHAR(36) NOT NULL,
    title VARCHAR(120) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_owner_local_task (owner_id, local_id),
    INDEX idx_owner_completed (owner_id, completed)
);
