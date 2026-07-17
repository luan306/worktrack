-- MySQL dump 10.13  Distrib 8.0.29, for Win64 (x86_64)
--
-- Host: localhost    Database: worktrack
-- ------------------------------------------------------
-- Server version	8.0.29

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `daily_task_groups`
--

DROP TABLE IF EXISTS `daily_task_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_task_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '?',
  `created_by` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_tg_group` (`group_id`),
  KEY `idx_tg_active` (`is_active`),
  CONSTRAINT `daily_task_groups_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `daily_task_groups_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_task_groups`
--

LOCK TABLES `daily_task_groups` WRITE;
/*!40000 ALTER TABLE `daily_task_groups` DISABLE KEYS */;
INSERT INTO `daily_task_groups` VALUES (4,4,'MES','?',67,1,'2026-07-07 22:58:42');
/*!40000 ALTER TABLE `daily_task_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `daily_task_logs`
--

DROP TABLE IF EXISTS `daily_task_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_task_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `daily_task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `log_date` date NOT NULL,
  `is_done` tinyint(1) NOT NULL DEFAULT '0',
  `score` decimal(6,1) NOT NULL DEFAULT '0.0',
  `note` text COLLATE utf8mb4_unicode_ci,
  `scored_by` int DEFAULT NULL,
  `scored_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_log` (`daily_task_id`,`user_id`,`log_date`),
  KEY `scored_by` (`scored_by`),
  KEY `idx_log_date` (`log_date`),
  KEY `idx_log_user_date` (`user_id`,`log_date`),
  KEY `idx_log_task_user_date` (`daily_task_id`,`user_id`,`log_date`),
  CONSTRAINT `daily_task_logs_ibfk_1` FOREIGN KEY (`daily_task_id`) REFERENCES `daily_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `daily_task_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `daily_task_logs_ibfk_3` FOREIGN KEY (`scored_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=79 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_task_logs`
--

LOCK TABLES `daily_task_logs` WRITE;
/*!40000 ALTER TABLE `daily_task_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `daily_task_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `daily_tasks`
--

DROP TABLE IF EXISTS `daily_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_group_id` int NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `max_score` decimal(6,1) NOT NULL DEFAULT '10.0',
  `frequency` enum('daily','weekly','monthly') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'daily',
  `frequency_day` tinyint DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_group` (`task_group_id`),
  KEY `idx_task_active` (`is_active`),
  CONSTRAINT `daily_tasks_ibfk_1` FOREIGN KEY (`task_group_id`) REFERENCES `daily_task_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_tasks`
--

LOCK TABLES `daily_tasks` WRITE;
/*!40000 ALTER TABLE `daily_tasks` DISABLE KEYS */;
INSERT INTO `daily_tasks` VALUES (5,4,'ABC',3.0,'daily',NULL,0,1,'2026-07-07 22:58:42');
/*!40000 ALTER TABLE `daily_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `group_members`
--

DROP TABLE IF EXISTS `group_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `group_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `user_id` int NOT NULL,
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gm` (`group_id`,`user_id`),
  KEY `idx_gm_group` (`group_id`),
  KEY `idx_gm_user` (`user_id`),
  CONSTRAINT `group_members_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `group_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `group_members`
--

LOCK TABLES `group_members` WRITE;
/*!40000 ALTER TABLE `group_members` DISABLE KEYS */;
INSERT INTO `group_members` VALUES (6,2,5,'2026-06-22 22:54:12'),(7,2,53,'2026-06-24 21:19:31'),(8,2,54,'2026-06-24 21:19:31'),(14,4,63,'2026-06-24 21:35:32'),(16,4,7,'2026-06-24 21:48:11'),(17,4,55,'2026-06-24 23:22:20'),(18,4,67,'2026-06-28 16:36:02'),(19,4,68,'2026-07-09 21:50:08');
/*!40000 ALTER TABLE `group_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `groups`
--

DROP TABLE IF EXISTS `groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '?',
  `leader_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `leader_id` (`leader_id`),
  CONSTRAINT `groups_ibfk_1` FOREIGN KEY (`leader_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `groups`
--

LOCK TABLES `groups` WRITE;
/*!40000 ALTER TABLE `groups` DISABLE KEYS */;
INSERT INTO `groups` VALUES (1,'Nhóm A','?',NULL,0,'2026-06-21 09:01:44','2026-06-21 09:45:57'),(2,'MES','?',NULL,0,'2026-06-21 09:46:03','2026-06-21 10:03:48'),(3,'MES','?',NULL,0,'2026-06-21 10:04:45','2026-06-24 21:35:20'),(4,'MES','?',NULL,1,'2026-06-24 21:35:32','2026-06-24 21:35:32');
/*!40000 ALTER TABLE `groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `actor_id` int DEFAULT NULL,
  `type` varchar(40) NOT NULL,
  `entity_type` varchar(30) NOT NULL DEFAULT 'request',
  `entity_id` int NOT NULL,
  `payload` json DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_unread` (`user_id`,`is_read`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  KEY `fk_notif_actor` (`actor_id`),
  CONSTRAINT `fk_notif_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=87 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,54,67,'request_assigned','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',1,'2026-07-07 16:46:04'),(2,67,54,'request_assigned','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-07 16:58:41'),(3,67,54,'request_status_changed','request',10,'{\"title\": \"dđ\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-08 14:10:54'),(4,67,54,'request_assigned','request',2,'{\"title\": \"A\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-08 14:25:15'),(5,54,67,'request_assigned','request',12,'{\"title\": \"ABC\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:33:48'),(6,67,54,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-08 14:34:38'),(7,54,67,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Nguyễn Thành Luân\"}',1,'2026-07-08 14:35:11'),(8,67,54,'request_status_changed','request',12,'{\"title\": \"ABC\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-08 14:36:37'),(9,67,54,'request_status_changed','request',12,'{\"title\": \"ABC\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-08 14:36:43'),(10,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:47:46'),(11,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:47:49'),(12,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:47:58'),(13,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:47:59'),(14,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:00'),(15,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:02'),(16,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:03'),(17,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:05'),(18,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:06'),(19,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:07'),(20,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:08'),(21,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:09'),(22,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:10'),(23,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:11'),(24,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:12'),(25,63,67,'request_assigned','request',13,'{\"title\": \"cccc\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 12:51:22'),(26,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 12:57:36'),(27,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 12:57:36'),(28,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"cancelled\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 13:06:34'),(29,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 13:06:34'),(30,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 13:07:16'),(31,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 13:07:24'),(32,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 13:07:24'),(33,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"cancelled\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 13:31:31'),(34,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 13:31:31'),(35,63,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:07:32'),(36,67,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:07:32'),(37,63,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:07:42'),(38,67,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:07:42'),(39,63,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:22:06'),(40,67,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:22:06'),(41,63,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:22:56'),(42,67,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:22:56'),(43,67,54,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:28:17'),(44,67,54,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:29:04'),(45,67,54,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:35:06'),(46,67,54,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:35:44'),(47,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:39:19'),(48,54,67,'request_assigned','request',14,'{\"title\": \"C\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 14:43:25'),(49,67,54,'request_status_changed','request',14,'{\"title\": \"C\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:58:05'),(50,67,54,'request_status_changed','request',14,'{\"title\": \"C\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:58:48'),(51,54,67,'request_assigned','request',15,'{\"title\": \"DDD\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:17:31'),(52,54,67,'request_status_changed','request',15,'{\"title\": \"DDD\", \"status\": \"in_progress\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:17:58'),(53,54,67,'request_assigned','request',18,'{\"title\": \"v\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:41:00'),(54,67,54,'request_claimed','request',19,'{\"title\": \"ds\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 15:42:38'),(55,67,54,'request_status_changed','request',19,'{\"title\": \"ds\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 15:43:09'),(56,67,54,'request_status_changed','request',19,'{\"title\": \"ds\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 15:43:13'),(57,54,67,'request_status_changed','request',19,'{\"title\": \"ds\", \"status\": \"reviewing\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:44:37'),(58,54,67,'request_status_changed','request',19,'{\"title\": \"ds\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:44:44'),(59,67,54,'request_claimed','request',20,'{\"title\": \"dssđssdv\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 15:55:26'),(60,67,54,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 15:55:30'),(61,67,54,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 15:55:42'),(62,54,67,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"in_progress\", \"actorName\": \"Nguyễn Thành Luân\"}',1,'2026-07-09 15:57:45'),(63,67,54,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 15:58:22'),(64,54,67,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"reviewing\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:59:05'),(65,54,67,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:59:11'),(66,54,67,'request_scored','request',20,'{\"score\": 10, \"title\": \"dssđssdv\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:59:11'),(67,54,63,'request_assigned','request',22,'{\"title\": \"abababba\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 05:59:52'),(68,63,54,'request_status_changed','request',22,'{\"title\": \"abababba\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-12 06:00:43'),(69,63,54,'request_status_changed','request',22,'{\"title\": \"abababba\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-12 06:00:47'),(70,54,63,'request_status_changed','request',22,'{\"title\": \"abababba\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 06:07:19'),(71,54,63,'request_assigned','request',23,'{\"title\": \"hôm nay\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 06:09:57'),(72,63,54,'request_status_changed','request',23,'{\"title\": \"hôm nay\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-12 06:10:39'),(73,63,54,'request_status_changed','request',23,'{\"title\": \"hôm nay\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-12 06:10:44'),(74,63,54,'request_status_changed','request',23,'{\"title\": \"hôm nay\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-12 06:10:46'),(75,54,63,'request_status_changed','request',22,'{\"title\": \"abababba\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:11:17'),(76,54,63,'request_scored','request',22,'{\"score\": 10, \"title\": \"abababba\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:11:17'),(77,7,63,'request_assigned','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:22:45'),(78,7,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:03'),(79,67,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:03'),(80,7,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:04'),(81,67,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:04'),(82,7,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:06'),(83,67,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:06'),(84,7,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:11'),(85,67,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:11'),(86,7,63,'request_scored','request',13,'{\"score\": 10, \"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:23:11');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refresh_tokens`
--

DROP TABLE IF EXISTS `refresh_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refresh_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `refresh_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=106 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refresh_tokens`
--

LOCK TABLES `refresh_tokens` WRITE;
/*!40000 ALTER TABLE `refresh_tokens` DISABLE KEYS */;
INSERT INTO `refresh_tokens` VALUES (34,63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjMsImlhdCI6MTc4MjMxMzExMSwiZXhwIjoxNzgyOTE3OTExfQ.ris1Z7Uq5jQ4fPRihYxiAzmAtYhUSpcxpIYBjLrPugo','2026-07-01 21:58:32','2026-06-24 21:58:31'),(41,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4MjYzODY1MiwiZXhwIjoxNzgzMjQzNDUyfQ.9Fra9KunTkH7LAzXgJnFOO7N82Yjw3jcpq5Kx9hmWug','2026-07-05 16:24:12','2026-06-28 16:24:12'),(42,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MjYzOTM3NCwiZXhwIjoxNzgzMjQ0MTc0fQ.uX2oUtVl1LJ0lZfSPCni0y9lviQ0El09uJE-58kHud8','2026-07-05 16:36:14','2026-06-28 16:36:14'),(43,63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjMsImlhdCI6MTc4MjY1ODMyOSwiZXhwIjoxNzgzMjYzMTI5fQ.BXQfQfjJgD-DMm3FGrvU2VRApG7_bNIY_KdLHR25lDU','2026-07-05 21:52:10','2026-06-28 21:52:09'),(44,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MjY1OTE5NSwiZXhwIjoxNzgzMjYzOTk1fQ.O07Vf1yZNZRhWy_gpuUhHzdBtY8s2Zzg-83esQGelfM','2026-07-05 22:06:36','2026-06-28 22:06:35'),(45,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MjY2MzY2NiwiZXhwIjoxNzgzMjY4NDY2fQ.F4znj4ie1AeHVsyiamRTcR_O87ZvlWGgcOJXWfdkvAs','2026-07-05 23:21:06','2026-06-28 23:21:06'),(58,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MzQ0MzUzMywiZXhwIjoxNzg0MDQ4MzMzfQ.NSlJF73w5imPbw2w6UC7KQKwqyogvkEPlyLxfSPu4M4','2026-07-14 23:58:54','2026-07-07 23:58:53'),(82,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4MzYxMTY5MiwiZXhwIjoxNzg0MjE2NDkyfQ.DqqxzL_jgF-ygePx7VVFRW75kXHtiD6QfiNzBiw1kaU','2026-07-16 22:41:33','2026-07-09 22:41:32'),(85,63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjMsImlhdCI6MTc4Mzc2NjQ4NywiZXhwIjoxNzg0MzcxMjg3fQ.T55Ospxn2deErnxPZEz3feyG1GxTh1PF4kMNqDabrXQ','2026-07-18 17:41:27','2026-07-11 17:41:27'),(100,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MzgzNzQxNiwiZXhwIjoxNzg0NDQyMjE2fQ.X2wgbg-Dv4bw0smCt4SFaWU0vTH4e_zvrDtxd4ExvKc','2026-07-19 13:23:37','2026-07-12 13:23:36'),(101,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4Mzg3MTUzMywiZXhwIjoxNzg0NDc2MzMzfQ.iVlwx808eoZVQGPkkB8tCw7oxiT6IlqNkljSZltSCkY','2026-07-19 22:52:13','2026-07-12 22:52:13'),(104,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4NDIwODI3MCwiZXhwIjoxNzg0ODEzMDcwfQ.yVLymwQkU3fHzGZ-MPsnzbybznBDGIHxKwcf2fqmTBE','2026-07-23 20:24:31','2026-07-16 20:24:30'),(105,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4NDIxNTg1MywiZXhwIjoxNzg0ODIwNjUzfQ.BijdY5p4MxAmtO6wM3Qj4l6aAbV-3wHiLNPevpd6h10','2026-07-23 22:30:54','2026-07-16 22:30:53');
/*!40000 ALTER TABLE `refresh_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `request_task_assignees`
--

DROP TABLE IF EXISTS `request_task_assignees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_task_assignees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `role` enum('main','support') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'main',
  `accepted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ta` (`task_id`,`user_id`),
  KEY `idx_rta_user` (`user_id`),
  KEY `idx_rta_task` (`task_id`),
  CONSTRAINT `request_task_assignees_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `request_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `request_task_assignees_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `request_task_assignees`
--

LOCK TABLES `request_task_assignees` WRITE;
/*!40000 ALTER TABLE `request_task_assignees` DISABLE KEYS */;
INSERT INTO `request_task_assignees` VALUES (2,2,54,'main',NULL,'2026-06-24 23:09:56'),(6,7,67,'main',NULL,'2026-06-28 21:54:46'),(7,8,54,'main',NULL,'2026-07-07 23:00:01'),(8,9,67,'main',NULL,'2026-07-07 23:32:49'),(9,10,54,'main',NULL,'2026-07-07 23:46:04'),(10,11,67,'main',NULL,'2026-07-07 23:58:41'),(11,2,67,'main',NULL,'2026-07-08 21:25:15'),(12,12,54,'main',NULL,'2026-07-08 21:33:48'),(13,13,63,'main',NULL,'2026-07-09 19:51:22'),(14,14,54,'main',NULL,'2026-07-09 21:43:25'),(16,15,54,'main',NULL,'2026-07-09 22:17:31'),(17,16,67,'main',NULL,'2026-07-09 22:21:21'),(18,17,67,'main',NULL,'2026-07-09 22:28:16'),(20,19,54,'main',NULL,'2026-07-09 22:42:38'),(21,20,54,'main',NULL,'2026-07-09 22:55:26'),(22,22,54,'main',NULL,'2026-07-12 12:59:52'),(23,23,54,'main',NULL,'2026-07-12 13:09:57'),(24,13,7,'support',NULL,'2026-07-12 13:22:45');
/*!40000 ALTER TABLE `request_task_assignees` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `request_task_comments`
--

DROP TABLE IF EXISTS `request_task_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_task_comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `content` text COLLATE utf8mb4_unicode_ci,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stored_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'comment',
  PRIMARY KEY (`id`),
  KEY `task_id` (`task_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `request_task_comments_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `request_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `request_task_comments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `request_task_comments`
--

LOCK TABLES `request_task_comments` WRITE;
/*!40000 ALTER TABLE `request_task_comments` DISABLE KEYS */;
INSERT INTO `request_task_comments` VALUES (2,12,54,'hello','2026-07-08 21:34:38',NULL,NULL,NULL,NULL,'comment'),(3,12,67,'how','2026-07-08 21:35:11',NULL,NULL,NULL,NULL,'comment'),(4,10,67,'hi\n','2026-07-08 21:47:46',NULL,NULL,NULL,NULL,'comment'),(5,10,67,'hơ','2026-07-08 21:47:49',NULL,NULL,NULL,NULL,'comment'),(6,10,67,'are','2026-07-08 21:47:58',NULL,NULL,NULL,NULL,'comment'),(7,10,67,'s','2026-07-08 21:47:59',NULL,NULL,NULL,NULL,'comment'),(8,10,67,'s','2026-07-08 21:48:00',NULL,NULL,NULL,NULL,'comment'),(9,10,67,'s','2026-07-08 21:48:02',NULL,NULL,NULL,NULL,'comment'),(10,10,67,'s','2026-07-08 21:48:03',NULL,NULL,NULL,NULL,'comment'),(11,10,67,'s','2026-07-08 21:48:05',NULL,NULL,NULL,NULL,'comment'),(12,10,67,'s','2026-07-08 21:48:06',NULL,NULL,NULL,NULL,'comment'),(13,10,67,'s','2026-07-08 21:48:07',NULL,NULL,NULL,NULL,'comment'),(14,10,67,'s','2026-07-08 21:48:08',NULL,NULL,NULL,NULL,'comment'),(15,10,67,'s','2026-07-08 21:48:09',NULL,NULL,NULL,NULL,'comment'),(16,10,67,'s','2026-07-08 21:48:10',NULL,NULL,NULL,NULL,'comment'),(17,10,67,'s','2026-07-08 21:48:11',NULL,NULL,NULL,NULL,'comment'),(18,10,67,'s','2026-07-08 21:48:12',NULL,NULL,NULL,NULL,'comment'),(19,11,54,'Đổi trạng thái: Pending → Done','2026-07-09 19:57:36',NULL,NULL,NULL,NULL,'comment'),(20,11,54,'Đổi trạng thái: Done → Cancelled','2026-07-09 20:06:34',NULL,NULL,NULL,NULL,'comment'),(21,11,54,'ok','2026-07-09 20:07:16',NULL,NULL,NULL,NULL,'comment'),(22,11,54,'Đổi trạng thái: Cancelled → Done','2026-07-09 20:07:24',NULL,NULL,NULL,NULL,'comment'),(23,11,54,'Đổi trạng thái: Done → Cancelled','2026-07-09 20:31:31',NULL,NULL,NULL,NULL,'comment'),(24,13,54,'','2026-07-09 21:07:32',NULL,NULL,NULL,NULL,'comment'),(25,13,54,'','2026-07-09 21:07:42',NULL,NULL,NULL,NULL,'comment'),(26,13,54,'','2026-07-09 21:22:06',NULL,NULL,NULL,NULL,'comment'),(27,13,54,'','2026-07-09 21:22:56',NULL,NULL,NULL,NULL,'comment'),(28,12,54,'','2026-07-09 21:28:17',NULL,NULL,NULL,NULL,'comment'),(29,12,54,'','2026-07-09 21:29:04',NULL,NULL,NULL,NULL,'comment'),(30,12,54,'','2026-07-09 21:35:06','','2026-06-30T21-45 Giao dá»ch sá» 27357307763952953-27404401469243586.pdf','1783607706046-kqnccpmfx3e.pdf','/uploads/1783607706046-kqnccpmfx3e.pdf','comment'),(31,10,54,'','2026-07-09 21:35:44','','2026-06-30T21-45 Giao dá»ch sá» 27357307763952953-27404401469243586.pdf','1783607744904-82wtfvia9k.pdf','/uploads/1783607744904-82wtfvia9k.pdf','comment');
/*!40000 ALTER TABLE `request_task_comments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `request_task_files`
--

DROP TABLE IF EXISTS `request_task_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_task_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `filepath` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `filesize` int DEFAULT NULL,
  `uploaded_by` int NOT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `stored_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mimetype` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `task_id` (`task_id`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `request_task_files_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `request_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `request_task_files_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `request_task_files`
--

LOCK TABLES `request_task_files` WRITE;
/*!40000 ALTER TABLE `request_task_files` DISABLE KEYS */;
INSERT INTO `request_task_files` VALUES (2,2,'AppIcons.zip','/uploads/1782664336120-xsm71lefb7b.zip',1766159,67,'2026-06-28 23:32:16','1782664336120-xsm71lefb7b.zip','application/x-zip-compressed');
/*!40000 ALTER TABLE `request_task_files` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `request_tasks`
--

DROP TABLE IF EXISTS `request_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `tools` text COLLATE utf8mb4_unicode_ci,
  `priority` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` enum('pending','assigned','in_progress','scoring','reviewing','done','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_by` int DEFAULT NULL,
  `group_id` int DEFAULT NULL,
  `deadline` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `score` decimal(6,1) DEFAULT NULL,
  `scored_by` int DEFAULT NULL,
  `scored_at` datetime DEFAULT NULL,
  `is_late` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `hours_spent` decimal(5,1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `group_id` (`group_id`),
  KEY `scored_by` (`scored_by`),
  KEY `idx_rt_status` (`status`),
  KEY `idx_rt_completed` (`completed_at`),
  KEY `request_tasks_ibfk_3` (`created_by`),
  CONSTRAINT `request_tasks_ibfk_2` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `request_tasks_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `request_tasks`
--

LOCK TABLES `request_tasks` WRITE;
/*!40000 ALTER TABLE `request_tasks` DISABLE KEYS */;
INSERT INTO `request_tasks` VALUES (2,'A','A',NULL,'high','done',63,NULL,'2026-07-01 16:09:00','2026-06-28 09:31:15','2026-06-28 16:21:41',NULL,NULL,NULL,0,'2026-06-24 23:09:56','2026-07-12 14:23:44',NULL),(7,'c','B',NULL,'medium','done',63,4,'2026-06-28 21:54:00','2026-06-28 15:30:50','2026-06-28 15:50:00',NULL,NULL,NULL,0,'2026-06-28 21:54:46','2026-06-28 22:51:31',NULL),(8,'ABC','ABC',NULL,'high','done',67,4,'2026-07-08 05:03:00','2026-07-07 16:08:22','2026-07-07 16:08:40',NULL,NULL,NULL,0,'2026-07-07 23:00:01','2026-07-07 23:08:41',NULL),(9,'á','ssss',NULL,'medium','assigned',54,4,'2026-07-17 15:32:00',NULL,NULL,NULL,NULL,NULL,0,'2026-07-07 23:32:49','2026-07-07 23:32:49',NULL),(10,'dđ','dđ',NULL,'high','in_progress',67,4,'2026-07-14 23:45:00','2026-07-08 14:10:54',NULL,NULL,NULL,NULL,0,'2026-07-07 23:46:04','2026-07-08 21:10:54',NULL),(11,'sd','đa',NULL,'medium','in_progress',54,4,'2026-07-22 16:58:00','2026-07-09 14:39:19',NULL,NULL,NULL,NULL,0,'2026-07-07 23:58:41','2026-07-09 21:39:19',NULL),(12,'ABC','ABC',NULL,'high','done',67,4,'2026-07-09 21:33:00','2026-07-08 14:36:37','2026-07-08 14:36:43',NULL,NULL,NULL,0,'2026-07-08 21:33:48','2026-07-08 21:36:43',NULL),(13,'cccc','cccccc',NULL,'high','done',67,4,'2026-07-10 19:51:00','2026-07-12 06:23:03','2026-07-12 06:23:04',NULL,NULL,NULL,1,'2026-07-09 19:51:22','2026-07-12 14:23:44',NULL),(14,'C','C',NULL,'medium','done',67,4,'2026-07-16 21:42:00','2026-07-09 14:58:05','2026-07-09 14:58:48',NULL,NULL,NULL,0,'2026-07-09 21:42:46','2026-07-09 21:58:48',NULL),(15,'DDD','DDD',NULL,'high','in_progress',67,4,'2026-07-16 22:15:00','2026-07-09 15:17:58',NULL,NULL,NULL,NULL,0,'2026-07-09 22:15:20','2026-07-09 22:17:58',NULL),(16,'vvvv','vvvvvvvvvv',NULL,'high','assigned',67,4,'2026-07-16 22:19:00',NULL,NULL,NULL,NULL,NULL,0,'2026-07-09 22:19:42','2026-07-09 22:21:21',NULL),(17,'xz','xz',NULL,'medium','assigned',67,4,NULL,NULL,NULL,NULL,NULL,NULL,0,'2026-07-09 22:27:42','2026-07-09 22:28:16',NULL),(18,'v','vv',NULL,'low','assigned',67,4,'2026-07-23 22:40:00',NULL,NULL,NULL,NULL,NULL,0,'2026-07-09 22:40:32','2026-07-09 22:41:00',NULL),(19,'ds','sd',NULL,'medium','done',67,4,'2026-07-23 22:42:00','2026-07-09 15:43:09','2026-07-09 15:43:13',NULL,NULL,NULL,0,'2026-07-09 22:42:29','2026-07-09 22:44:44',NULL),(20,'dssđssdv','sdvsdvdvsdsvdvdvs',NULL,'medium','done',67,4,'2026-07-25 08:54:00','2026-07-09 15:55:30','2026-07-09 15:58:22',NULL,NULL,NULL,0,'2026-07-09 22:54:28','2026-07-12 14:23:44',NULL),(21,'g','g',NULL,'medium','pending',67,4,'2026-07-16 23:00:00',NULL,NULL,20.0,NULL,NULL,0,'2026-07-09 23:00:09','2026-07-09 23:00:09',NULL),(22,'abababba','aaaaaaaaaaaaaaaaaaaa',NULL,'medium','done',63,4,'2026-07-28 12:59:00','2026-07-12 06:00:43','2026-07-12 06:00:47',NULL,NULL,NULL,0,'2026-07-12 12:59:52','2026-07-12 14:23:44',NULL),(23,'hôm nay','hôm nay',NULL,'medium','scoring',63,4,'2026-07-15 13:09:00','2026-07-12 06:10:44','2026-07-12 06:10:39',10.0,NULL,NULL,0,'2026-07-12 13:09:57','2026-07-12 13:10:46',NULL),(24,'sss','ssss',NULL,'low','pending',66,4,'2026-07-14 22:58:00',NULL,NULL,2.0,NULL,NULL,0,'2026-07-12 22:58:21','2026-07-12 22:58:21',NULL);
/*!40000 ALTER TABLE `request_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `score_periods`
--

DROP TABLE IF EXISTS `score_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `score_periods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` datetime DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `locked_by` int DEFAULT NULL,
  `excel_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_locked` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `locked_by` (`locked_by`),
  CONSTRAINT `score_periods_ibfk_1` FOREIGN KEY (`locked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `score_periods`
--

LOCK TABLES `score_periods` WRITE;
/*!40000 ALTER TABLE `score_periods` DISABLE KEYS */;
INSERT INTO `score_periods` VALUES (1,'Period 1','2026-06-20 22:57:43','2026-06-21 21:54:24','2026-06-21 21:54:24',NULL,'worktrack_period_1_2026-06-21.xlsx',1,'2026-06-20 22:57:43'),(2,'Period 2','2026-06-21 21:54:24','2026-06-21 21:54:48','2026-06-21 21:54:48',NULL,'worktrack_period_2_2026-06-21.xlsx',1,'2026-06-21 21:54:24'),(3,'Period 3','2026-06-21 21:54:48','2026-07-12 14:23:44','2026-07-12 14:23:44',67,'worktrack_period_3_2026-07-12.xlsx',1,'2026-06-21 21:54:48'),(4,'Period 4','2026-07-12 14:23:44','2026-07-12 14:24:12','2026-07-12 14:24:12',67,'worktrack_period_4_2026-07-12.xlsx',1,'2026-07-12 14:23:44'),(5,'Period 5','2026-07-12 14:24:12','2026-07-12 14:29:15','2026-07-12 14:29:15',67,'worktrack_period_5_2026-07-12.xlsx',1,'2026-07-12 14:24:12'),(6,'Period 6','2026-07-12 14:29:15','2026-07-12 14:30:18','2026-07-12 14:30:18',67,'worktrack_period_6_2026-07-12.xlsx',1,'2026-07-12 14:29:15'),(7,'Period 7','2026-07-12 14:30:18','2026-07-12 14:34:43','2026-07-12 14:34:43',67,'worktrack_period_7_2026-07-12.xlsx',1,'2026-07-12 14:30:18'),(8,'Period 8','2026-07-12 14:34:43','2026-07-12 14:39:23','2026-07-12 14:39:23',67,'worktrack_period_8_2026-07-12.xlsx',1,'2026-07-12 14:34:43'),(9,'Period 9','2026-07-12 14:39:23','2026-07-12 14:44:18','2026-07-12 14:44:18',67,'worktrack_period_9_2026-07-12.xlsx',1,'2026-07-12 14:39:23'),(10,'Period 10','2026-07-12 14:44:18','2026-07-12 14:45:12','2026-07-12 14:45:12',67,'worktrack_period_10_2026-07-12.xlsx',1,'2026-07-12 14:44:18'),(11,'Period 11','2026-07-12 14:45:12',NULL,NULL,NULL,NULL,0,'2026-07-12 14:45:12');
/*!40000 ALTER TABLE `score_periods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `score_snapshots`
--

DROP TABLE IF EXISTS `score_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `score_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `period_id` int NOT NULL,
  `user_id` int NOT NULL,
  `score_daily` decimal(8,1) NOT NULL DEFAULT '0.0',
  `score_request` decimal(8,1) NOT NULL DEFAULT '0.0',
  `score_support` decimal(8,1) NOT NULL DEFAULT '0.0',
  `score_total` decimal(8,1) NOT NULL DEFAULT '0.0',
  `cv_daily_count` int NOT NULL DEFAULT '0',
  `cv_request_main` int NOT NULL DEFAULT '0',
  `cv_request_support` int NOT NULL DEFAULT '0',
  `cv_ontime` int NOT NULL DEFAULT '0',
  `cv_late` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ps` (`period_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `score_snapshots_ibfk_1` FOREIGN KEY (`period_id`) REFERENCES `score_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `score_snapshots_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `score_snapshots`
--

LOCK TABLES `score_snapshots` WRITE;
/*!40000 ALTER TABLE `score_snapshots` DISABLE KEYS */;
INSERT INTO `score_snapshots` VALUES (5,3,7,24.0,10.0,0.0,34.0,5,0,1,0,1,'2026-07-12 14:23:44'),(6,3,54,0.0,30.0,0.0,30.0,0,7,0,7,0,'2026-07-12 14:23:44'),(7,3,63,0.0,10.0,0.0,10.0,0,1,0,0,1,'2026-07-12 14:23:44'),(8,3,67,0.0,10.0,0.0,10.0,0,2,0,2,0,'2026-07-12 14:23:44'),(9,3,55,3.0,0.0,0.0,3.0,1,0,0,0,0,'2026-07-12 14:23:44'),(10,3,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:23:44'),(11,3,53,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:23:44'),(12,3,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:23:44'),(13,4,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:24:12'),(14,4,7,0.0,0.0,0.0,0.0,0,0,1,0,1,'2026-07-12 14:24:12'),(15,4,53,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:24:12'),(16,4,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:24:12'),(17,4,55,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:24:12'),(18,4,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:24:12'),(19,4,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:24:12'),(20,4,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:24:12'),(21,5,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:29:15'),(22,5,7,0.0,0.0,0.0,0.0,0,0,1,0,1,'2026-07-12 14:29:15'),(23,5,53,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:29:15'),(24,5,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:29:15'),(25,5,55,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:29:15'),(26,5,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:29:15'),(27,5,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:29:15'),(28,5,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:29:15'),(29,6,7,3.0,0.0,0.0,3.0,1,0,1,0,1,'2026-07-12 14:30:18'),(30,6,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:30:18'),(31,6,53,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:30:18'),(32,6,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:30:18'),(33,6,55,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:30:18'),(34,6,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:30:18'),(35,6,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:30:18'),(36,6,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:30:18'),(37,7,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:34:43'),(38,7,7,0.0,0.0,0.0,0.0,0,0,1,0,1,'2026-07-12 14:34:43'),(39,7,53,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:34:43'),(40,7,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:34:43'),(41,7,55,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:34:43'),(42,7,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:34:43'),(43,7,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:34:43'),(44,7,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:34:43'),(45,8,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:39:23'),(46,8,7,0.0,0.0,0.0,0.0,0,0,1,0,1,'2026-07-12 14:39:23'),(47,8,53,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:39:23'),(48,8,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:39:23'),(49,8,55,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:39:23'),(50,8,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:39:23'),(51,8,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:39:23'),(52,8,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:39:23'),(53,9,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:44:18'),(54,9,7,0.0,0.0,0.0,0.0,0,0,1,0,1,'2026-07-12 14:44:18'),(55,9,53,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:44:18'),(56,9,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:44:18'),(57,9,55,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:44:18'),(58,9,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:44:18'),(59,9,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:44:18'),(60,9,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:44:18'),(61,10,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:45:12'),(62,10,7,0.0,0.0,0.0,0.0,0,0,1,0,1,'2026-07-12 14:45:12'),(63,10,53,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:45:12'),(64,10,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:45:12'),(65,10,55,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:45:12'),(66,10,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:45:12'),(67,10,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:45:12'),(68,10,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:45:12');
/*!40000 ALTER TABLE `score_snapshots` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','manager','leader','user') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `avatar_color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '#3a7bd5',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (5,'a.nv','nva@smc.com','$2a$10$p.xPVT/gw8ld50LxtTxo3uAmi03BG7JI6ugmtMkd68tWsr2yXZQK2','Nguyễn Văn A','user','#e74c3c',1,NULL,'2026-06-22 22:54:12','2026-06-22 22:54:12'),(7,'c.lv','lvc@smc.com','$2a$10$UyroDvZ/C0T9Pj7UygmcOuW5TM/ID8pdRGMfIW2O9gu5FPMUSka12','Lê Văn C','user','#c0392b',1,'2026-06-22 23:32:05','2026-06-22 22:54:12','2026-06-23 21:20:27'),(42,'hie.tt','','$2a$10$.NNbbJQPty.EFFG05UMJ6eQgFDaZLIRUoYPtCK.WXAPy4N.3KWzOG','Trần Thị Hie','user','#16a085',1,NULL,'2026-06-24 21:03:30','2026-06-24 21:03:30'),(53,'uc.pv','duc.pv@smc.com','$2a$10$minqfwZDbeTPzYBaSW1qi.If7oOcaEsLWpqhJKiMidmMu3UMDfqem','Phạm Văn Đức','user','#e74c3c',1,NULL,'2026-06-24 21:19:31','2026-06-24 21:19:31'),(54,'mai.ht','mai.ht@smc.com','$2a$10$pt.Dwdjf0hMiOuCu9Go.rOHkV/WsciUsiV1NB2Tikx3c4orvhcZgu','Hoàng Thị Mai','user','#e74c3c',1,'2026-07-16 22:30:53','2026-06-24 21:19:31','2026-07-16 22:31:03'),(55,'tuan.vm','tuan.vm@smc.com','$2a$10$3JcENOvTc6H/SJMgJikyfO3S.M/DG6dQG6aWRGuT1TsiYChbRQme6','Vũ Minh Tuấn','user','#16a085',1,'2026-06-24 23:22:38','2026-06-24 21:19:32','2026-06-24 23:22:38'),(63,'mi.ht','mi.ht@smc.com','$2a$10$dO4J6LF8vf7tObQWxChDDO0OgL/6TQk7ReaUJt6Lv7zl/NUciR/lq','Hoàng Thị Mi','leader','#16a085',1,'2026-07-12 13:10:56','2026-06-24 21:35:32','2026-07-12 13:10:56'),(66,'admin','admin@worktrack.local','$2a$10$N1QXWotLpEt34CXSdwbfKe9ITN119X0ZIntyMYsn6VVb7iR/Zqo9a','System Admin','admin','#1e2a3a',1,'2026-07-16 20:24:03','2026-06-25 23:40:11','2026-07-16 20:24:03'),(67,'luan.nt','nguyen.thanhluan@smc.com','$2a$10$wjYtCrZZZcUS5iMQB8JkXu77yziUyjQ82dzGONpCsrH3QC2PEo5ca','Nguyễn Thành Luân','manager','#3a7bd5',1,'2026-07-12 13:23:36','2026-06-28 16:36:02','2026-07-12 13:23:36'),(68,'anh.t','anh.t@smc.com','$2a$10$EGaWefxKzMLRHP0Jsssm8ewwvTvmaaWzdjnVCetbDYJr.vuecNNvO','Tạ Anh','leader','#3a7bd5',1,'2026-07-09 21:50:19','2026-07-09 21:50:08','2026-07-09 21:51:48'),(69,'nguyenvanc','c.nv@smc.com','$2a$10$UV5ZAUpTwSkG7T/YpuDinO/fCJKsjiYQ7o8GXchkVTLNtq2M/nVP6','nguyen van c','user','#3a7bd5',1,NULL,'2026-07-12 00:05:31','2026-07-12 00:05:31');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-17 22:36:53
