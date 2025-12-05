-- --------------------------------------------------------
-- Servidor:                     127.0.0.1
-- Versão do servidor:           10.4.32-MariaDB - mariadb.org binary distribution
-- OS do Servidor:               Win64
-- HeidiSQL Versão:              12.11.0.7065
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Copiando estrutura do banco de dados para v_o_c_e
DROP DATABASE IF EXISTS `v_o_c_e`;
CREATE DATABASE IF NOT EXISTS `v_o_c_e` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `v_o_c_e`;

-- Copiando estrutura para tabela v_o_c_e.category_overrides
DROP TABLE IF EXISTS `category_overrides`;
CREATE TABLE IF NOT EXISTS `category_overrides` (
  `hostname` varchar(255) NOT NULL COMMENT 'Hostname (ex: gemini.google.com) em minúsculas',
  `category` varchar(100) NOT NULL COMMENT 'A categoria definida manualmente',
  `updated_by_professor_id` int(11) DEFAULT NULL COMMENT 'ID do professor que fez a última alteração (opcional)',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Quando a regra foi atualizada',
  PRIMARY KEY (`hostname`),
  KEY `updated_by_professor_id` (`updated_by_professor_id`),
  CONSTRAINT `category_overrides_ibfk_1` FOREIGN KEY (`updated_by_professor_id`) REFERENCES `professors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Armazena substituições manuais de categorias para hostnames específicos.';

-- Copiando dados para a tabela v_o_c_e.category_overrides: ~4 rows (aproximadamente)
INSERT INTO `category_overrides` (`hostname`, `category`, `updated_by_professor_id`, `updated_at`) VALUES
	('10.111.9.63', 'Produtividade & Ferramentas', 5, '2025-12-05 13:52:49'),
	('console.cloud.google.com', 'Produtividade & Ferramentas', 5, '2025-12-05 15:53:32'),
	('manus.im', 'IA', 5, '2025-12-05 20:06:14'),
	('www.dafont.com', 'Outros', 5, '2025-12-05 18:27:42');

-- Copiando estrutura para tabela v_o_c_e.classes
DROP TABLE IF EXISTS `classes`;
CREATE TABLE IF NOT EXISTS `classes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `owner_id` int(11) NOT NULL COMMENT 'ID do professor que criou a turma',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `classes_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela v_o_c_e.classes: ~3 rows (aproximadamente)
INSERT INTO `classes` (`id`, `name`, `owner_id`, `created_at`) VALUES
	(1, 'DEV2B', 2, '2025-10-17 19:46:01'),
	(2, 'DEV_B', 1, '2025-10-17 19:46:01'),
	(4, 'DEV_B', 5, '2025-12-05 19:03:17');

-- Copiando estrutura para tabela v_o_c_e.class_members
DROP TABLE IF EXISTS `class_members`;
CREATE TABLE IF NOT EXISTS `class_members` (
  `class_id` int(11) NOT NULL,
  `professor_id` int(11) NOT NULL,
  PRIMARY KEY (`class_id`,`professor_id`),
  KEY `professor_id` (`professor_id`),
  CONSTRAINT `class_members_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `class_members_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela v_o_c_e.class_members: ~4 rows (aproximadamente)
INSERT INTO `class_members` (`class_id`, `professor_id`) VALUES
	(1, 2),
	(1, 12),
	(2, 1),
	(4, 5);

-- Copiando estrutura para tabela v_o_c_e.class_students
DROP TABLE IF EXISTS `class_students`;
CREATE TABLE IF NOT EXISTS `class_students` (
  `class_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  PRIMARY KEY (`class_id`,`student_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `class_students_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `class_students_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela v_o_c_e.class_students: ~0 rows (aproximadamente)

-- Copiando estrutura para tabela v_o_c_e.logs
DROP TABLE IF EXISTS `logs`;
CREATE TABLE IF NOT EXISTS `logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aluno_id` varchar(255) NOT NULL COMMENT 'Pode ser o CPF ou o PC_ID do aluno',
  `url` text NOT NULL,
  `duration` int(11) NOT NULL COMMENT 'Duração em segundos',
  `categoria` varchar(100) DEFAULT NULL,
  `timestamp` datetime NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_timestamp` (`timestamp`) USING BTREE,
  KEY `idx_aluno_id` (`aluno_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=316 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela v_o_c_e.logs: ~27 rows (aproximadamente)
INSERT INTO `logs` (`id`, `aluno_id`, `url`, `duration`, `categoria`, `timestamp`) VALUES
	(289, '49418787873', 'gemini.google.com', 8, 'IA', '2025-12-05 15:53:28'),
	(290, '49418787873', 'gemini.google.com', 166, 'IA', '2025-12-05 15:56:14'),
	(291, '49418787873', '10.111.9.63', 8, 'Produtividade & Ferramentas', '2025-12-05 15:56:27'),
	(292, '49418787873', '10.111.9.63', 256, 'Produtividade & Ferramentas', '2025-12-05 16:00:43'),
	(293, '49418787873', '10.111.9.63', 150, 'Produtividade & Ferramentas', '2025-12-05 16:03:13'),
	(294, '49418787873', 'outlook.office.com', 165, 'Produtividade & Ferramentas', '2025-12-05 16:14:15'),
	(295, '49418787873', 'gemini.google.com', 69, 'IA', '2025-12-05 16:15:24'),
	(296, '49418787873', 'gemini.google.com', 77, 'IA', '2025-12-05 16:16:47'),
	(297, '49418787873', 'gemini.google.com', 128, 'IA', '2025-12-05 16:18:55'),
	(298, '49418787873', 'cdn.socket.io', 7, 'Outros', '2025-12-05 16:19:14'),
	(299, '49418787873', 'gemini.google.com', 8, 'IA', '2025-12-05 16:19:22'),
	(300, '49418787873', 'manus.im', 79, 'Outros', '2025-12-05 16:55:31'),
	(301, '49418787873', '10.111.9.63', 52, 'Produtividade & Ferramentas', '2025-12-05 16:56:23'),
	(302, '49418787873', 'gemini.google.com', 6, 'IA', '2025-12-05 16:56:29'),
	(303, '49418787873', 'gemini.google.com', 56, 'IA', '2025-12-05 16:57:24'),
	(304, '49418787873', 'gemini.google.com', 368, 'IA', '2025-12-05 17:03:33'),
	(305, '49418787873', 'github.com', 16, 'Produtividade & Ferramentas', '2025-12-05 17:03:48'),
	(306, '49418787873', 'gemini.google.com', 27, 'IA', '2025-12-05 17:04:16'),
	(307, '49418787873', 'manus.im', 10, 'Outros', '2025-12-05 17:04:29'),
	(308, '49418787873', 'manus.im', 15, 'Outros', '2025-12-05 17:04:44'),
	(309, '49418787873', 'sesisenaispedu-my.sharepoint.com', 22, 'Produtividade & Ferramentas', '2025-12-05 17:05:20'),
	(310, '49418787873', 'mail.google.com', 22, 'Produtividade & Ferramentas', '2025-12-05 17:05:44'),
	(311, '49418787873', 'mail.google.com', 25, 'Produtividade & Ferramentas', '2025-12-05 17:06:09'),
	(312, '49418787873', '10.111.9.63', 27, 'Produtividade & Ferramentas', '2025-12-05 17:06:36'),
	(313, '49418787873', '10.111.9.63', 13, 'Produtividade & Ferramentas', '2025-12-05 17:06:53'),
	(314, '49418787873', '10.111.9.63', 12, 'Produtividade & Ferramentas', '2025-12-05 17:07:06'),
	(315, '49418787873', 'github.com', 24, 'Produtividade & Ferramentas', '2025-12-05 17:07:45');

-- Copiando estrutura para tabela v_o_c_e.old_logs
DROP TABLE IF EXISTS `old_logs`;
CREATE TABLE IF NOT EXISTS `old_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aluno_id` varchar(255) NOT NULL,
  `archive_date` date NOT NULL COMMENT 'A data a que os logs se referem',
  `daily_logs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Objeto JSON com os dados agregados',
  PRIMARY KEY (`id`),
  KEY `idx_archive_date` (`archive_date`),
  CONSTRAINT `old_logs_chk_1` CHECK (json_valid(`daily_logs`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela v_o_c_e.old_logs: ~0 rows (aproximadamente)

-- Copiando estrutura para tabela v_o_c_e.professors
DROP TABLE IF EXISTS `professors`;
CREATE TABLE IF NOT EXISTS `professors` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) NOT NULL,
  `username` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL COMMENT 'Senha criptografada com bcrypt',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `aceitou_politica` tinyint(1) DEFAULT 0,
  `data_aceite` datetime DEFAULT NULL,
  `reset_password_token` varchar(255) DEFAULT NULL,
  `reset_password_expires` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela v_o_c_e.professors: ~7 rows (aproximadamente)
INSERT INTO `professors` (`id`, `full_name`, `username`, `email`, `password_hash`, `created_at`, `aceitou_politica`, `data_aceite`, `reset_password_token`, `reset_password_expires`) VALUES
	(1, 'Airton sena', 'prof. batida de coco', 'email_0uMZyq5todSIbhdR5tsi7QzixbH3@example.com', '$2b$10$DUMMYPASSWORDHASH', '2025-10-17 19:46:00', 0, NULL, NULL, NULL),
	(2, 'Leonardo Gomes Garcia', 'leoleo', 'email_3H8YJUTTRbWS9rd97vUcIKExze93@example.com', '$2b$10$DUMMYPASSWORDHASH', '2025-10-17 19:46:00', 0, NULL, NULL, NULL),
	(3, 'Ana Clara Fernandinha', 'fefa', 'email_J38WXbzW34WZGCeR8JhO2q2uXIA3@example.com', '$2b$10$DUMMYPASSWORDHASH', '2025-10-17 19:46:00', 0, NULL, NULL, NULL),
	(4, 'Professor Teste', 'prof.teste', 'email_xlZ5ffLyb3aX9d9tFN5oVcejZvg1@example.com', '$2b$10$DUMMYPASSWORDHASH', '2025-10-17 19:46:00', 0, NULL, NULL, NULL),
	(5, 'Prof Guu', 'prof.gu', 'gustavo.sesi.bol@gmail.com', '$2b$10$usiz2t46ANe1cJYtDIU0eeM79qgG78HZPKSoOaw/D9m7eboIO3HPi', '2025-10-22 16:57:51', 0, NULL, NULL, NULL),
	(11, 'Ana Lara', 'Ana ', 'analara@gmail.com', '$2b$10$vx3ZBE2jr5oNxIZKH09Cd.QU2diN8b4bvAF0.9AD2WjPTm.koiZvy', '2025-11-15 18:43:39', 1, NULL, NULL, NULL),
	(12, 'Ana Lara Fernandes', 'nalara', 'analarafer@gmail.com', '$2b$10$WDPB/IRH/xKgAj886rWCsuAC/udBk2HcpGk6Lbey8JCsiEpxKKtBS', '2025-11-25 01:12:47', 0, NULL, NULL, NULL);

-- Copiando estrutura para tabela v_o_c_e.students
DROP TABLE IF EXISTS `students`;
CREATE TABLE IF NOT EXISTS `students` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) NOT NULL,
  `cpf` varchar(20) DEFAULT NULL,
  `pc_id` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`),
  UNIQUE KEY `pc_id` (`pc_id`),
  KEY `fk_students_created_by` (`created_by`),
  CONSTRAINT `fk_students_created_by` FOREIGN KEY (`created_by`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela v_o_c_e.students: ~1 rows (aproximadamente)
INSERT INTO `students` (`id`, `full_name`, `cpf`, `pc_id`, `created_at`, `created_by`) VALUES
	(4, 'Gustavo Alves', '49418787873', 'PC22', '2025-12-05 19:03:29', 5);

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
