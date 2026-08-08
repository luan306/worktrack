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
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `actor_id` int NOT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_action_type` (`action_type`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_actor_id` (`actor_id`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
INSERT INTO `activity_logs` VALUES (1,67,'request_assignee_added','request',24,'Nguyễn Thành Luân đã thêm Hoàng Thị Mai vào CV \"sss\" (Chính)','{\"role\": \"main\", \"added_user_id\": 54}','2026-07-31 16:15:07'),(2,67,'daily_score_edited','daily_task',5,'Nguyễn Thành Luân đã SỬA điểm \"ABC\" cho Lê Văn C: 1.5đ → 0đ (ngày 2026-07-27). Lý do: a','{\"reason\": \"a\", \"new_score\": 0, \"old_score\": \"1.5\"}','2026-07-31 16:16:03'),(3,63,'daily_score_edited','daily_task',5,'Hoàng Thị Mi đã SỬA điểm \"ABC\" cho Lê Văn C: 0.0đ → 1đ (ngày 2026-07-27). Lý do: ssssssssssssssss','{\"reason\": \"ssssssssssssssss\", \"new_score\": 1, \"old_score\": \"0.0\"}','2026-07-31 16:22:04'),(4,67,'request_scored','request',24,'Nguyễn Thành Luân đã chấm điểm CV \"sss\": 2đ',NULL,'2026-07-31 22:57:05'),(5,67,'request_completed','request',24,'Nguyễn Thành Luân đã duyệt hoàn thành CV \"sss\" — điểm cuối: 2đ',NULL,'2026-07-31 22:57:15'),(6,66,'request_completed','request',31,'System Admin đã duyệt hoàn thành CV \"ssasssssssssssss\" — điểm cuối: 5đ',NULL,'2026-07-31 23:03:08'),(7,63,'request_created','request',32,'Hoàng Thị Mi đã tạo CV \"ưqwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww\"',NULL,'2026-08-01 23:36:21'),(8,63,'request_assignee_removed','request',32,'Hoàng Thị Mi đã xóa Hoàng Thị Mai khỏi CV \"ưqwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww\"','{\"removed_user_id\": 54}','2026-08-01 23:45:04'),(9,63,'request_assignee_added','request',32,'Hoàng Thị Mi đã thêm Lê Văn C vào CV \"ưqwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww\" (Chính)','{\"role\": \"main\", \"added_user_id\": 7}','2026-08-01 23:45:11'),(10,63,'request_created','request',33,'Hoàng Thị Mi đã tạo CV \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"',NULL,'2026-08-01 23:47:36'),(11,63,'request_created','request',34,'Hoàng Thị Mi đã tạo CV \"áccccccccccccccccccccccccccccccc\"',NULL,'2026-08-01 23:50:47'),(12,63,'request_created','request',35,'Hoàng Thị Mi đã tạo CV \"assszzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\"',NULL,'2026-08-01 23:54:24'),(13,63,'daily_scored','daily_task',5,'Hoàng Thị Mi đã chấm \"ABC\" cho Lê Văn C: 3đ (ngày 2026-08-03)',NULL,'2026-08-03 23:36:08'),(14,63,'daily_score_edited','daily_task',5,'Hoàng Thị Mi đã SỬA điểm \"ABC\" cho Lê Văn C: 3.0đ → 1.5đ (ngày 2026-08-03). Lý do: a','{\"reason\": \"a\", \"new_score\": 1.5, \"old_score\": \"3.0\"}','2026-08-03 23:36:20'),(15,66,'daily_scored','daily_task',5,'System Admin đã chấm \"ABC\" cho Lê Văn C: 2đ (ngày 2026-08-04)',NULL,'2026-08-04 23:06:53'),(16,66,'daily_scored','daily_task',7,'System Admin đã chấm \"abc\" cho Lê Văn C: 3đ (ngày 2026-08-03)',NULL,'2026-08-04 23:10:07'),(17,66,'daily_scored','daily_task',7,'System Admin đã chấm \"abc\" cho Lê Văn C: 1.5đ (ngày 2026-08-04)',NULL,'2026-08-04 23:10:07'),(18,66,'daily_scored','daily_task',7,'System Admin đã chấm \"abc\" cho Lê Văn C: 1đ (ngày 2026-08-04)',NULL,'2026-08-05 22:36:26'),(19,66,'request_scored','request',9,'System Admin đã chấm điểm CV \"á\": 0.5đ',NULL,'2026-08-06 21:44:57'),(20,66,'request_completed','request',9,'System Admin đã duyệt hoàn thành CV \"á\" — điểm cuối: 0.5đ',NULL,'2026-08-06 21:44:59'),(21,63,'request_created','request',36,'Hoàng Thị Mi đã tạo CV \"abv\"',NULL,'2026-08-07 20:35:17'),(22,63,'request_created','request',37,'Hoàng Thị Mi đã tạo CV \"sssssssssssssssssssssss\"',NULL,'2026-08-07 20:37:46'),(23,63,'request_created','request',38,'Hoàng Thị Mi đã tạo CV \"dssssssssssssssssssssssss\"',NULL,'2026-08-07 20:54:58'),(24,63,'request_created','request',39,'Hoàng Thị Mi đã tạo CV \"hhhhhhhhhhhhhhhhhhhhhhhh\"',NULL,'2026-08-07 21:06:27'),(25,63,'request_created','request',40,'Hoàng Thị Mi đã tạo CV \"hhhh\"',NULL,'2026-08-07 21:15:07'),(26,63,'request_created','request',41,'Hoàng Thị Mi đã tạo CV \"hghjgggjgj\"',NULL,'2026-08-07 21:17:56'),(27,63,'request_created','request',42,'Hoàng Thị Mi đã tạo CV \"sdsssssssssssssssssssssssssssss\"',NULL,'2026-08-07 21:46:35'),(28,63,'request_created','request',43,'Hoàng Thị Mi đã tạo CV \"asssssssssssssssssssssssssssssssssssssssssssssssssss\"',NULL,'2026-08-07 21:47:18'),(29,63,'request_created','request',44,'Hoàng Thị Mi đã tạo CV \"SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS\"',NULL,'2026-08-07 21:50:51'),(30,63,'request_created','request',45,'Hoàng Thị Mi đã tạo CV \"dsfffffffffffffffffffffffffffffffffffff\"',NULL,'2026-08-07 21:55:16'),(31,63,'request_created','request',46,'Hoàng Thị Mi đã tạo CV \"reeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\"',NULL,'2026-08-07 21:58:20'),(32,63,'request_created','request',47,'Hoàng Thị Mi đã tạo CV \"âsasasasasasasasasasasasasasasasas\"',NULL,'2026-08-07 21:59:36'),(33,63,'request_created','request',48,'Hoàng Thị Mi đã tạo CV \"54rgggggggggggggg\"',NULL,'2026-08-07 22:13:03'),(34,63,'request_created','request',49,'Hoàng Thị Mi đã tạo CV \"s\"',NULL,'2026-08-07 22:20:02'),(35,63,'request_created','request',50,'Hoàng Thị Mi đã tạo CV \"assssssssssssssssssssssssssssssssssssss\"',NULL,'2026-08-07 22:39:10'),(36,63,'request_created','request',51,'Hoàng Thị Mi đã tạo CV \"luan\"',NULL,'2026-08-07 22:42:05'),(37,67,'request_created','request',52,'Nguyễn Thành Luân đã tạo CV \"ABCXYZ\"',NULL,'2026-08-08 08:00:58'),(38,67,'request_assignee_added','request',52,'Nguyễn Thành Luân đã thêm Nguyen Van E vào CV \"ABCXYZ\" (Chính)','{\"role\": \"main\", \"added_user_id\": 71}','2026-08-08 08:01:30'),(39,67,'request_created','request',53,'Nguyễn Thành Luân đã tạo CV \"saaaaaaaaaaaaaaaaaaaaaaaaaaaa\"',NULL,'2026-08-08 08:07:55'),(40,67,'request_created','request',54,'Nguyễn Thành Luân đã tạo CV \"affffff\"',NULL,'2026-08-08 08:24:59'),(41,67,'request_created','request',55,'Nguyễn Thành Luân đã tạo CV \"assssssssssssssssssssssssss\"',NULL,'2026-08-08 08:28:57');
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
  `edit_reason` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_log` (`daily_task_id`,`user_id`,`log_date`),
  KEY `scored_by` (`scored_by`),
  KEY `idx_log_date` (`log_date`),
  KEY `idx_log_user_date` (`user_id`,`log_date`),
  KEY `idx_log_task_user_date` (`daily_task_id`,`user_id`,`log_date`),
  KEY `idx_user_date` (`user_id`,`log_date`),
  KEY `idx_task_user_date` (`daily_task_id`,`user_id`,`log_date`),
  CONSTRAINT `daily_task_logs_ibfk_1` FOREIGN KEY (`daily_task_id`) REFERENCES `daily_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `daily_task_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `daily_task_logs_ibfk_3` FOREIGN KEY (`scored_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=93 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `frequency` enum('daily','weekly','monthly','weekly_count','monthly_count') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'daily',
  `frequency_day` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_group` (`task_group_id`),
  KEY `idx_task_active` (`is_active`),
  CONSTRAINT `daily_tasks_ibfk_1` FOREIGN KEY (`task_group_id`) REFERENCES `daily_task_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_tasks`
--

LOCK TABLES `daily_tasks` WRITE;
/*!40000 ALTER TABLE `daily_tasks` DISABLE KEYS */;
INSERT INTO `daily_tasks` VALUES (5,4,'ABC',3.0,'daily',NULL,0,0,'2026-07-07 22:58:42'),(6,4,'a',3.0,'weekly_count','3,5',0,1,'2026-07-31 14:51:50'),(7,4,'abc',3.0,'daily',NULL,0,1,'2026-08-04 23:09:53');
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
INSERT INTO `group_members` VALUES (6,2,5,'2026-06-22 22:54:12'),(8,2,54,'2026-06-24 21:19:31'),(14,4,63,'2026-06-24 21:35:32'),(18,4,67,'2026-06-28 16:36:02'),(19,4,68,'2026-07-09 21:50:08');
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
) ENGINE=InnoDB AUTO_INCREMENT=155 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,54,67,'request_assigned','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',1,'2026-07-07 16:46:04'),(2,67,54,'request_assigned','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-07 16:58:41'),(3,67,54,'request_status_changed','request',10,'{\"title\": \"dđ\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-08 14:10:54'),(4,67,54,'request_assigned','request',2,'{\"title\": \"A\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-08 14:25:15'),(5,54,67,'request_assigned','request',12,'{\"title\": \"ABC\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:33:48'),(6,67,54,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-08 14:34:38'),(7,54,67,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Nguyễn Thành Luân\"}',1,'2026-07-08 14:35:11'),(8,67,54,'request_status_changed','request',12,'{\"title\": \"ABC\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-08 14:36:37'),(9,67,54,'request_status_changed','request',12,'{\"title\": \"ABC\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-08 14:36:43'),(10,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:47:46'),(11,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:47:49'),(12,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:47:58'),(13,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:47:59'),(14,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:00'),(15,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:02'),(16,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:03'),(17,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:05'),(18,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:06'),(19,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:07'),(20,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:08'),(21,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:09'),(22,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:10'),(23,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:11'),(24,54,67,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-08 14:48:12'),(25,63,67,'request_assigned','request',13,'{\"title\": \"cccc\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 12:51:22'),(26,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 12:57:36'),(27,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 12:57:36'),(28,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"cancelled\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 13:06:34'),(29,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 13:06:34'),(30,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 13:07:16'),(31,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 13:07:24'),(32,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 13:07:24'),(33,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"cancelled\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 13:31:31'),(34,67,54,'request_commented','request',11,'{\"title\": \"sd\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 13:31:31'),(35,63,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:07:32'),(36,67,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:07:32'),(37,63,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:07:42'),(38,67,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:07:42'),(39,63,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:22:06'),(40,67,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:22:06'),(41,63,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-09 14:22:56'),(42,67,54,'request_commented','request',13,'{\"title\": \"cccc\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:22:56'),(43,67,54,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:28:17'),(44,67,54,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:29:04'),(45,67,54,'request_commented','request',12,'{\"title\": \"ABC\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:35:06'),(46,67,54,'request_commented','request',10,'{\"title\": \"dđ\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:35:44'),(47,67,54,'request_status_changed','request',11,'{\"title\": \"sd\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:39:19'),(48,54,67,'request_assigned','request',14,'{\"title\": \"C\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 14:43:25'),(49,67,54,'request_status_changed','request',14,'{\"title\": \"C\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:58:05'),(50,67,54,'request_status_changed','request',14,'{\"title\": \"C\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 14:58:48'),(51,54,67,'request_assigned','request',15,'{\"title\": \"DDD\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:17:31'),(52,54,67,'request_status_changed','request',15,'{\"title\": \"DDD\", \"status\": \"in_progress\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:17:58'),(53,54,67,'request_assigned','request',18,'{\"title\": \"v\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:41:00'),(54,67,54,'request_claimed','request',19,'{\"title\": \"ds\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 15:42:38'),(55,67,54,'request_status_changed','request',19,'{\"title\": \"ds\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 15:43:09'),(56,67,54,'request_status_changed','request',19,'{\"title\": \"ds\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 15:43:13'),(57,54,67,'request_status_changed','request',19,'{\"title\": \"ds\", \"status\": \"reviewing\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:44:37'),(58,54,67,'request_status_changed','request',19,'{\"title\": \"ds\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:44:44'),(59,67,54,'request_claimed','request',20,'{\"title\": \"dssđssdv\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 15:55:26'),(60,67,54,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 15:55:30'),(61,67,54,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 15:55:42'),(62,54,67,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"in_progress\", \"actorName\": \"Nguyễn Thành Luân\"}',1,'2026-07-09 15:57:45'),(63,67,54,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-09 15:58:22'),(64,54,67,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"reviewing\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:59:05'),(65,54,67,'request_status_changed','request',20,'{\"title\": \"dssđssdv\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:59:11'),(66,54,67,'request_scored','request',20,'{\"score\": 10, \"title\": \"dssđssdv\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-09 15:59:11'),(67,54,63,'request_assigned','request',22,'{\"title\": \"abababba\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 05:59:52'),(68,63,54,'request_status_changed','request',22,'{\"title\": \"abababba\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-12 06:00:43'),(69,63,54,'request_status_changed','request',22,'{\"title\": \"abababba\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',1,'2026-07-12 06:00:47'),(70,54,63,'request_status_changed','request',22,'{\"title\": \"abababba\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 06:07:19'),(71,54,63,'request_assigned','request',23,'{\"title\": \"hôm nay\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 06:09:57'),(72,63,54,'request_status_changed','request',23,'{\"title\": \"hôm nay\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-12 06:10:39'),(73,63,54,'request_status_changed','request',23,'{\"title\": \"hôm nay\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-12 06:10:44'),(74,63,54,'request_status_changed','request',23,'{\"title\": \"hôm nay\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-12 06:10:46'),(75,54,63,'request_status_changed','request',22,'{\"title\": \"abababba\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:11:17'),(76,54,63,'request_scored','request',22,'{\"score\": 10, \"title\": \"abababba\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-12 06:11:17'),(79,67,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 06:23:03'),(81,67,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 06:23:04'),(83,67,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 06:23:06'),(85,67,63,'request_status_changed','request',13,'{\"title\": \"cccc\", \"status\": \"done\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-12 06:23:11'),(87,63,71,'request_claimed','request',25,'{\"title\": \"aaaaaaaaaaaaaa\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:06:32'),(88,63,71,'request_status_changed','request',25,'{\"title\": \"aaaaaaaaaaaaaa\", \"status\": \"in_progress\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:06:46'),(89,63,71,'request_status_changed','request',25,'{\"title\": \"aaaaaaaaaaaaaa\", \"status\": \"scoring\", \"actorName\": \"Nguyen Van E\"}',1,'2026-07-29 16:06:58'),(90,71,63,'request_status_changed','request',25,'{\"title\": \"aaaaaaaaaaaaaa\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-29 16:07:42'),(91,71,67,'request_status_changed','request',25,'{\"title\": \"aaaaaaaaaaaaaa\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:08:52'),(92,63,67,'request_status_changed','request',25,'{\"title\": \"aaaaaaaaaaaaaa\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:08:52'),(93,71,67,'request_scored','request',25,'{\"score\": 10, \"title\": \"aaaaaaaaaaaaaa\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:08:52'),(94,63,71,'request_claimed','request',26,'{\"title\": \"abccccccccccccczzzzzzzzzzz\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:12:07'),(95,63,71,'request_status_changed','request',26,'{\"title\": \"abccccccccccccczzzzzzzzzzz\", \"status\": \"in_progress\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:12:15'),(96,63,71,'request_status_changed','request',26,'{\"title\": \"abccccccccccccczzzzzzzzzzz\", \"status\": \"scoring\", \"actorName\": \"Nguyen Van E\"}',1,'2026-07-29 16:12:26'),(97,71,63,'request_status_changed','request',26,'{\"title\": \"abccccccccccccczzzzzzzzzzz\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-29 16:12:50'),(98,63,71,'request_claimed','request',27,'{\"title\": \"sssssssssssssssssssss\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:18:45'),(99,63,71,'request_status_changed','request',27,'{\"title\": \"sssssssssssssssssssss\", \"status\": \"in_progress\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:18:47'),(100,63,71,'request_status_changed','request',27,'{\"title\": \"sssssssssssssssssssss\", \"status\": \"scoring\", \"actorName\": \"Nguyen Van E\"}',1,'2026-07-29 16:18:49'),(101,71,63,'request_status_changed','request',27,'{\"title\": \"sssssssssssssssssssss\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-29 16:19:05'),(102,71,63,'request_scored','request',27,'{\"score\": 8, \"title\": \"sssssssssssssssssssss\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-29 16:19:05'),(103,71,67,'request_status_changed','request',27,'{\"title\": \"sssssssssssssssssssss\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:20:04'),(104,63,67,'request_status_changed','request',27,'{\"title\": \"sssssssssssssssssssss\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:20:04'),(105,71,67,'request_scored','request',27,'{\"score\": 8, \"title\": \"sssssssssssssssssssss\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:20:04'),(106,63,71,'request_claimed','request',28,'{\"title\": \"ácccccccccccccccc\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:29:27'),(107,63,71,'request_status_changed','request',28,'{\"title\": \"ácccccccccccccccc\", \"status\": \"scoring\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:29:33'),(108,63,71,'request_status_changed','request',28,'{\"title\": \"ácccccccccccccccc\", \"status\": \"in_progress\", \"actorName\": \"Nguyen Van E\"}',0,'2026-07-29 16:29:49'),(109,63,71,'request_status_changed','request',28,'{\"title\": \"ácccccccccccccccc\", \"status\": \"scoring\", \"actorName\": \"Nguyen Van E\"}',1,'2026-07-29 16:29:53'),(110,71,63,'request_status_changed','request',28,'{\"title\": \"ácccccccccccccccc\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-29 16:30:14'),(111,66,63,'request_status_changed','request',28,'{\"title\": \"ácccccccccccccccc\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-29 16:30:14'),(112,67,63,'request_status_changed','request',28,'{\"title\": \"ácccccccccccccccc\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mi\"}',1,'2026-07-29 16:30:14'),(113,71,63,'request_scored','request',28,'{\"score\": 10, \"title\": \"ácccccccccccccccc\", \"actorName\": \"Hoàng Thị Mi\"}',0,'2026-07-29 16:30:14'),(114,71,67,'request_status_changed','request',28,'{\"title\": \"ácccccccccccccccc\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:30:40'),(115,63,67,'request_status_changed','request',28,'{\"title\": \"ácccccccccccccccc\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:30:40'),(116,71,67,'request_scored','request',28,'{\"score\": 10, \"title\": \"ácccccccccccccccc\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-29 16:30:40'),(117,67,54,'request_claimed','request',29,'{\"title\": \"aaa\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-31 04:11:56'),(118,67,54,'request_status_changed','request',29,'{\"title\": \"aaa\", \"status\": \"in_progress\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-31 04:35:42'),(119,67,54,'request_claimed','request',30,'{\"title\": \"asssssssssssssssssss\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-31 05:01:20'),(120,67,54,'request_claimed','request',31,'{\"title\": \"ssasssssssssssss\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-07-31 05:10:39'),(121,63,67,'request_assigned','request',29,'{\"title\": \"aaa\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 05:23:30'),(122,54,67,'request_assigned','request',24,'{\"title\": \"sss\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 09:15:07'),(123,66,67,'request_status_changed','request',24,'{\"title\": \"sss\", \"status\": \"in_progress\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:56:55'),(124,54,67,'request_status_changed','request',24,'{\"title\": \"sss\", \"status\": \"in_progress\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:56:55'),(125,66,67,'request_status_changed','request',24,'{\"title\": \"sss\", \"status\": \"scoring\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:57:01'),(126,54,67,'request_status_changed','request',24,'{\"title\": \"sss\", \"status\": \"scoring\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:57:01'),(127,54,67,'request_status_changed','request',24,'{\"title\": \"sss\", \"status\": \"reviewing\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:57:05'),(128,66,67,'request_status_changed','request',24,'{\"title\": \"sss\", \"status\": \"reviewing\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:57:05'),(129,54,67,'request_scored','request',24,'{\"score\": 2, \"title\": \"sss\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:57:05'),(130,66,67,'request_status_changed','request',24,'{\"title\": \"sss\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:57:15'),(131,54,67,'request_status_changed','request',24,'{\"title\": \"sss\", \"status\": \"done\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:57:15'),(132,54,67,'request_scored','request',24,'{\"score\": 2, \"title\": \"sss\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-07-31 15:57:15'),(133,54,66,'request_status_changed','request',31,'{\"title\": \"ssasssssssssssss\", \"status\": \"reviewing\", \"actorName\": \"System Admin\"}',0,'2026-07-31 16:03:06'),(134,67,66,'request_status_changed','request',31,'{\"title\": \"ssasssssssssssss\", \"status\": \"reviewing\", \"actorName\": \"System Admin\"}',0,'2026-07-31 16:03:06'),(135,54,66,'request_status_changed','request',31,'{\"title\": \"ssasssssssssssss\", \"status\": \"done\", \"actorName\": \"System Admin\"}',0,'2026-07-31 16:03:08'),(136,67,66,'request_status_changed','request',31,'{\"title\": \"ssasssssssssssss\", \"status\": \"done\", \"actorName\": \"System Admin\"}',0,'2026-07-31 16:03:08'),(137,54,66,'request_scored','request',31,'{\"score\": 5, \"title\": \"ssasssssssssssss\", \"actorName\": \"System Admin\"}',0,'2026-07-31 16:03:08'),(138,66,54,'request_status_changed','request',15,'{\"title\": \"DDD\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-08-01 16:33:41'),(139,67,54,'request_status_changed','request',15,'{\"title\": \"DDD\", \"status\": \"reviewing\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-08-01 16:33:41'),(140,63,54,'request_claimed','request',32,'{\"title\": \"ưqwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-08-01 16:37:13'),(142,63,54,'request_claimed','request',33,'{\"title\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-08-01 16:47:50'),(143,63,54,'request_claimed','request',34,'{\"title\": \"áccccccccccccccccccccccccccccccc\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-08-01 16:51:07'),(144,63,54,'request_claimed','request',35,'{\"title\": \"assszzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-08-01 16:55:16'),(145,63,54,'request_status_changed','request',35,'{\"title\": \"assszzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\", \"status\": \"scoring\", \"actorName\": \"Hoàng Thị Mai\"}',0,'2026-08-01 16:55:32'),(146,67,66,'request_status_changed','request',9,'{\"title\": \"á\", \"status\": \"scoring\", \"actorName\": \"System Admin\"}',0,'2026-08-06 14:44:51'),(147,54,66,'request_status_changed','request',9,'{\"title\": \"á\", \"status\": \"scoring\", \"actorName\": \"System Admin\"}',0,'2026-08-06 14:44:51'),(148,67,66,'request_status_changed','request',9,'{\"title\": \"á\", \"status\": \"reviewing\", \"actorName\": \"System Admin\"}',0,'2026-08-06 14:44:57'),(149,54,66,'request_status_changed','request',9,'{\"title\": \"á\", \"status\": \"reviewing\", \"actorName\": \"System Admin\"}',0,'2026-08-06 14:44:57'),(150,67,66,'request_scored','request',9,'{\"score\": 0.5, \"title\": \"á\", \"actorName\": \"System Admin\"}',0,'2026-08-06 14:44:57'),(151,67,66,'request_status_changed','request',9,'{\"title\": \"á\", \"status\": \"done\", \"actorName\": \"System Admin\"}',0,'2026-08-06 14:44:59'),(152,54,66,'request_status_changed','request',9,'{\"title\": \"á\", \"status\": \"done\", \"actorName\": \"System Admin\"}',0,'2026-08-06 14:44:59'),(153,67,66,'request_scored','request',9,'{\"score\": 0.5, \"title\": \"á\", \"actorName\": \"System Admin\"}',0,'2026-08-06 14:44:59'),(154,71,67,'request_assigned','request',52,'{\"title\": \"ABCXYZ\", \"actorName\": \"Nguyễn Thành Luân\"}',0,'2026-08-08 01:01:30');
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
) ENGINE=InnoDB AUTO_INCREMENT=142 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refresh_tokens`
--

LOCK TABLES `refresh_tokens` WRITE;
/*!40000 ALTER TABLE `refresh_tokens` DISABLE KEYS */;
INSERT INTO `refresh_tokens` VALUES (34,63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjMsImlhdCI6MTc4MjMxMzExMSwiZXhwIjoxNzgyOTE3OTExfQ.ris1Z7Uq5jQ4fPRihYxiAzmAtYhUSpcxpIYBjLrPugo','2026-07-01 21:58:32','2026-06-24 21:58:31'),(41,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4MjYzODY1MiwiZXhwIjoxNzgzMjQzNDUyfQ.9Fra9KunTkH7LAzXgJnFOO7N82Yjw3jcpq5Kx9hmWug','2026-07-05 16:24:12','2026-06-28 16:24:12'),(42,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MjYzOTM3NCwiZXhwIjoxNzgzMjQ0MTc0fQ.uX2oUtVl1LJ0lZfSPCni0y9lviQ0El09uJE-58kHud8','2026-07-05 16:36:14','2026-06-28 16:36:14'),(43,63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjMsImlhdCI6MTc4MjY1ODMyOSwiZXhwIjoxNzgzMjYzMTI5fQ.BXQfQfjJgD-DMm3FGrvU2VRApG7_bNIY_KdLHR25lDU','2026-07-05 21:52:10','2026-06-28 21:52:09'),(44,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MjY1OTE5NSwiZXhwIjoxNzgzMjYzOTk1fQ.O07Vf1yZNZRhWy_gpuUhHzdBtY8s2Zzg-83esQGelfM','2026-07-05 22:06:36','2026-06-28 22:06:35'),(45,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MjY2MzY2NiwiZXhwIjoxNzgzMjY4NDY2fQ.F4znj4ie1AeHVsyiamRTcR_O87ZvlWGgcOJXWfdkvAs','2026-07-05 23:21:06','2026-06-28 23:21:06'),(58,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MzQ0MzUzMywiZXhwIjoxNzg0MDQ4MzMzfQ.NSlJF73w5imPbw2w6UC7KQKwqyogvkEPlyLxfSPu4M4','2026-07-14 23:58:54','2026-07-07 23:58:53'),(82,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4MzYxMTY5MiwiZXhwIjoxNzg0MjE2NDkyfQ.DqqxzL_jgF-ygePx7VVFRW75kXHtiD6QfiNzBiw1kaU','2026-07-16 22:41:33','2026-07-09 22:41:32'),(85,63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjMsImlhdCI6MTc4Mzc2NjQ4NywiZXhwIjoxNzg0MzcxMjg3fQ.T55Ospxn2deErnxPZEz3feyG1GxTh1PF4kMNqDabrXQ','2026-07-18 17:41:27','2026-07-11 17:41:27'),(100,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4MzgzNzQxNiwiZXhwIjoxNzg0NDQyMjE2fQ.X2wgbg-Dv4bw0smCt4SFaWU0vTH4e_zvrDtxd4ExvKc','2026-07-19 13:23:37','2026-07-12 13:23:36'),(101,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4Mzg3MTUzMywiZXhwIjoxNzg0NDc2MzMzfQ.iVlwx808eoZVQGPkkB8tCw7oxiT6IlqNkljSZltSCkY','2026-07-19 22:52:13','2026-07-12 22:52:13'),(104,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4NDIwODI3MCwiZXhwIjoxNzg0ODEzMDcwfQ.yVLymwQkU3fHzGZ-MPsnzbybznBDGIHxKwcf2fqmTBE','2026-07-23 20:24:31','2026-07-16 20:24:30'),(105,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4NDIxNTg1MywiZXhwIjoxNzg0ODIwNjUzfQ.BijdY5p4MxAmtO6wM3Qj4l6aAbV-3wHiLNPevpd6h10','2026-07-23 22:30:54','2026-07-16 22:30:53'),(106,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4NDM3OTQzMCwiZXhwIjoxNzg0OTg0MjMwfQ.5SZjMUcDeCJ96QWJWEEqVk--G3bPsh6WQK2ckcoVSqk','2026-07-25 19:57:11','2026-07-18 19:57:10'),(107,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4NTI1MzU0NiwiZXhwIjoxNzg1ODU4MzQ2fQ.z2ldoh5DuzuDKPbExLfo5rstO0AsoO-HkujI-VgFJic','2026-08-04 22:45:46','2026-07-28 22:45:46'),(108,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4NTI1NzAxNywiZXhwIjoxNzg1ODYxODE3fQ.BL0F7HLnvni_Sg34Qwz9DdLb18z3FgWQm4vM2nlRsYM','2026-08-04 23:43:38','2026-07-28 23:43:37'),(109,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4NTMzOTkxMSwiZXhwIjoxNzg1OTQ0NzExfQ.BMjrCN7JGpnmwh9hDSQEFctEd478PcxPm5gFPihZUq8','2026-08-05 22:45:11','2026-07-29 22:45:11'),(110,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4NTMzOTk3MSwiZXhwIjoxNzg1OTQ0NzcxfQ.wgjr0VDdfvnR-icTJRB_IESD8Oybiqh2dLLRDIGMcao','2026-08-05 22:46:12','2026-07-29 22:46:11'),(112,71,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NzEsImlhdCI6MTc4NTM0MTEzOSwiZXhwIjoxNzg1OTQ1OTM5fQ.xQ5SEGIALjAawbGQ-t8B_DxP2FYgIF6ky2BRc1RDlzo','2026-08-05 23:05:39','2026-07-29 23:05:39'),(113,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4NTQ3MDkyNSwiZXhwIjoxNzg2MDc1NzI1fQ.q8TQ0Lf0gzBDsOWIktWNUSed5DTiXF4JGZDAdOOOnzM','2026-08-07 11:08:46','2026-07-31 11:08:45'),(114,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4NTQ3MTAzOCwiZXhwIjoxNzg2MDc1ODM4fQ.78uWe4VkEOcVF5Zab8-KnQeXw_9OtLrKWsFfHBESGy8','2026-08-07 11:10:39','2026-07-31 11:10:38'),(115,63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjMsImlhdCI6MTc4NTQ3NTEwNywiZXhwIjoxNzg2MDc5OTA3fQ.jEtZMsqwWCGSKGE3owVGQDJgAFHqO7gaKvhn2kQZ684','2026-08-07 12:18:28','2026-07-31 12:18:27'),(118,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4NTQ5MDA0NiwiZXhwIjoxNzg2MDk0ODQ2fQ.qh3W6R3zhdvHqMsR74l_rKMH0dtEboNx_Q5BrWxWxK0','2026-08-07 16:27:27','2026-07-31 16:27:26'),(120,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4NTYwMTk5MSwiZXhwIjoxNzg2MjA2NzkxfQ.3DWjAsFv5nIlN31Ik8eiskmZWsbbhaQYentshW8zkFY','2026-08-08 23:33:12','2026-08-01 23:33:11'),(125,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4NTc3NDc4NSwiZXhwIjoxNzg2Mzc5NTg1fQ.KqRnZnN0UbTI29_ot9J7qTTnyB0OQbGOeWeTD-Ik9Og','2026-08-10 23:33:06','2026-08-03 23:33:05'),(129,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4NTkzOTgwNCwiZXhwIjoxNzg2NTQ0NjA0fQ.Y10RvdqOKFDdsZbcTc-8Lrgw_xs16a6HAHZuv9NhfNI','2026-08-12 21:23:24','2026-08-05 21:23:24'),(133,54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTQsImlhdCI6MTc4NjAyNjI3MSwiZXhwIjoxNzg2NjMxMDcxfQ.ZTBf7qtLRcbBQbywB2-Iy28Wsif4zYQJpsrxEayJnpI','2026-08-13 21:24:31','2026-08-06 21:24:31'),(134,66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjYsImlhdCI6MTc4NjEwNDY4MywiZXhwIjoxNzg2NzA5NDgzfQ.TVIq_lVwgL4NF9IreCDbPQtENcS6fD2ucCozvVsaYIY','2026-08-14 19:11:23','2026-08-07 19:11:23'),(135,63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjMsImlhdCI6MTc4NjEwNTc3NywiZXhwIjoxNzg2NzEwNTc3fQ.2JVvlaCzzXGS-Jf6zcmlrdcKFO_f8qRvQZvGM-HWCqw','2026-08-14 19:29:37','2026-08-07 19:29:37'),(139,71,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NzEsImlhdCI6MTc4NjE1MDUwMywiZXhwIjoxNzg2NzU1MzAzfQ.aAiSx6x3SymHbvAp66HPgliJohdyH_mAtZZteSoDLdc','2026-08-15 07:55:03','2026-08-08 07:55:03'),(141,67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcsImlhdCI6MTc4NjE1MDgyMCwiZXhwIjoxNzg2NzU1NjIwfQ.ppRga8ZAqx8bLovCeejtMupMlF4HhHShdHeOtcWz94U','2026-08-15 08:00:21','2026-08-08 08:00:20');
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
  KEY `idx_user` (`user_id`),
  CONSTRAINT `request_task_assignees_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `request_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `request_task_assignees_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `request_task_assignees`
--

LOCK TABLES `request_task_assignees` WRITE;
/*!40000 ALTER TABLE `request_task_assignees` DISABLE KEYS */;
INSERT INTO `request_task_assignees` VALUES (2,2,54,'main',NULL,'2026-06-24 23:09:56'),(6,7,67,'main',NULL,'2026-06-28 21:54:46'),(7,8,54,'main',NULL,'2026-07-07 23:00:01'),(8,9,67,'main',NULL,'2026-07-07 23:32:49'),(9,10,54,'main',NULL,'2026-07-07 23:46:04'),(10,11,67,'main',NULL,'2026-07-07 23:58:41'),(11,2,67,'main',NULL,'2026-07-08 21:25:15'),(12,12,54,'main',NULL,'2026-07-08 21:33:48'),(13,13,63,'main',NULL,'2026-07-09 19:51:22'),(14,14,54,'main',NULL,'2026-07-09 21:43:25'),(16,15,54,'main',NULL,'2026-07-09 22:17:31'),(17,16,67,'main',NULL,'2026-07-09 22:21:21'),(18,17,67,'main',NULL,'2026-07-09 22:28:16'),(20,19,54,'main',NULL,'2026-07-09 22:42:38'),(21,20,54,'main',NULL,'2026-07-09 22:55:26'),(22,22,54,'main',NULL,'2026-07-12 12:59:52'),(23,23,54,'main',NULL,'2026-07-12 13:09:57'),(26,26,71,'main',NULL,'2026-07-29 23:12:07'),(27,27,71,'main',NULL,'2026-07-29 23:18:45'),(28,28,71,'main',NULL,'2026-07-29 23:29:27'),(30,30,54,'main',NULL,'2026-07-31 12:01:20'),(31,31,54,'main',NULL,'2026-07-31 12:10:39'),(32,29,63,'main',NULL,'2026-07-31 12:23:30'),(33,24,54,'main',NULL,'2026-07-31 16:15:07'),(36,33,54,'main',NULL,'2026-08-01 23:47:50'),(37,34,54,'main',NULL,'2026-08-01 23:51:07'),(38,35,54,'main',NULL,'2026-08-01 23:55:16'),(39,52,71,'main',NULL,'2026-08-08 08:01:30');
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
  `status` enum('pending','assigned','in_progress','scoring','reviewing','done','cancelled','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
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
  `started_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `scored_by` (`scored_by`),
  KEY `idx_rt_status` (`status`),
  KEY `idx_rt_completed` (`completed_at`),
  KEY `idx_status_completed` (`status`,`completed_at`),
  KEY `idx_status` (`status`),
  KEY `idx_group_id` (`group_id`),
  KEY `idx_created_by` (`created_by`),
  CONSTRAINT `request_tasks_ibfk_2` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `request_tasks_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `request_tasks`
--

LOCK TABLES `request_tasks` WRITE;
/*!40000 ALTER TABLE `request_tasks` DISABLE KEYS */;
INSERT INTO `request_tasks` VALUES (2,'A','A',NULL,'high','archived',63,NULL,'2026-07-01 16:09:00','2026-06-28 09:31:15','2026-06-28 16:21:41',NULL,NULL,NULL,0,'2026-06-24 23:09:56','2026-07-28 23:30:51',NULL,NULL),(7,'c','B',NULL,'medium','archived',63,4,'2026-06-28 21:54:00','2026-06-28 15:30:50','2026-06-28 15:50:00',NULL,NULL,NULL,0,'2026-06-28 21:54:46','2026-07-28 23:30:51',NULL,NULL),(8,'ABC','ABC',NULL,'high','archived',67,4,'2026-07-08 05:03:00','2026-07-07 16:08:22','2026-07-07 16:08:40',NULL,NULL,NULL,0,'2026-07-07 23:00:01','2026-07-28 23:30:51',NULL,NULL),(9,'á','ssss',NULL,'medium','done',54,4,'2026-07-17 15:32:00',NULL,'2026-08-06 14:44:51',0.5,66,'2026-08-06 14:44:59',1,'2026-07-07 23:32:49','2026-08-06 21:44:59',NULL,NULL),(10,'dđ','dđ',NULL,'high','in_progress',67,4,'2026-07-14 23:45:00','2026-07-08 14:10:54',NULL,NULL,NULL,NULL,0,'2026-07-07 23:46:04','2026-07-08 21:10:54',NULL,NULL),(11,'sd','đa',NULL,'medium','in_progress',54,4,'2026-07-22 16:58:00','2026-07-09 14:39:19',NULL,NULL,NULL,NULL,0,'2026-07-07 23:58:41','2026-07-09 21:39:19',NULL,NULL),(12,'ABC','ABC',NULL,'high','archived',67,4,'2026-07-09 21:33:00','2026-07-08 14:36:37','2026-07-08 14:36:43',NULL,NULL,NULL,0,'2026-07-08 21:33:48','2026-07-28 23:30:51',NULL,NULL),(13,'cccc','cccccc',NULL,'high','archived',67,4,'2026-07-10 19:51:00','2026-07-12 06:23:03','2026-07-12 06:23:04',NULL,NULL,NULL,1,'2026-07-09 19:51:22','2026-07-28 23:30:51',NULL,NULL),(14,'C','C',NULL,'medium','archived',67,4,'2026-07-16 21:42:00','2026-07-09 14:58:05','2026-07-09 14:58:48',NULL,NULL,NULL,0,'2026-07-09 21:42:46','2026-07-28 23:30:51',NULL,NULL),(15,'DDD','DDD',NULL,'high','reviewing',67,4,'2026-07-16 22:15:00','2026-07-09 15:17:58','2026-08-01 16:33:41',NULL,NULL,NULL,0,'2026-07-09 22:15:20','2026-08-01 23:33:41',NULL,NULL),(16,'vvvv','vvvvvvvvvv',NULL,'high','assigned',67,4,'2026-07-16 22:19:00',NULL,NULL,NULL,NULL,NULL,0,'2026-07-09 22:19:42','2026-07-09 22:21:21',NULL,NULL),(17,'xz','xz',NULL,'medium','assigned',67,4,NULL,NULL,NULL,NULL,NULL,NULL,0,'2026-07-09 22:27:42','2026-07-09 22:28:16',NULL,NULL),(18,'v','vv',NULL,'low','assigned',67,4,'2026-07-23 22:40:00',NULL,NULL,NULL,NULL,NULL,0,'2026-07-09 22:40:32','2026-07-09 22:41:00',NULL,NULL),(19,'ds','sd',NULL,'medium','archived',67,4,'2026-07-23 22:42:00','2026-07-09 15:43:09','2026-07-09 15:43:13',NULL,NULL,NULL,0,'2026-07-09 22:42:29','2026-07-28 23:30:51',NULL,NULL),(20,'dssđssdv','sdvsdvdvsdsvdvdvs',NULL,'medium','archived',67,4,'2026-07-25 08:54:00','2026-07-09 15:55:30','2026-07-09 15:58:22',NULL,NULL,NULL,0,'2026-07-09 22:54:28','2026-07-28 23:30:51',NULL,NULL),(21,'g','g',NULL,'medium','pending',67,4,'2026-07-16 23:00:00',NULL,NULL,20.0,NULL,NULL,0,'2026-07-09 23:00:09','2026-07-09 23:00:09',NULL,NULL),(22,'abababba','aaaaaaaaaaaaaaaaaaaa',NULL,'medium','archived',63,4,'2026-07-28 12:59:00','2026-07-12 06:00:43','2026-07-12 06:00:47',NULL,NULL,NULL,0,'2026-07-12 12:59:52','2026-07-28 23:30:51',NULL,NULL),(23,'hôm nay','hôm nay',NULL,'medium','scoring',63,4,'2026-07-15 13:09:00','2026-07-12 06:10:44','2026-07-12 06:10:39',10.0,NULL,NULL,0,'2026-07-12 13:09:57','2026-07-12 13:10:46',NULL,NULL),(24,'sss','ssss',NULL,'low','archived',66,4,'2026-07-14 22:58:00','2026-07-31 15:56:55','2026-07-31 15:57:01',NULL,NULL,NULL,1,'2026-07-12 22:58:21','2026-08-06 21:19:59',NULL,NULL),(26,'abccccccccccccczzzzzzzzzzz','abccccccccccccczzzzzzzzzzz',NULL,'high','reviewing',63,NULL,'2026-07-31 23:11:00','2026-07-29 16:12:15','2026-07-29 16:12:26',10.0,NULL,NULL,0,'2026-07-29 23:11:54','2026-07-29 23:12:50',NULL,NULL),(27,'sssssssssssssssssssss','asssssssssssssssssssssssssssssssss',NULL,'high','archived',63,NULL,'2026-07-30 23:18:00','2026-07-29 16:18:47','2026-07-29 16:18:49',8.0,67,'2026-07-29 16:20:04',0,'2026-07-29 23:18:03','2026-08-04 23:00:23',NULL,NULL),(28,'ácccccccccccccccc','câsasasasasasasasasasasasasasasasasasasas',NULL,'high','archived',63,NULL,'2026-07-30 23:28:00','2026-07-29 16:29:49','2026-07-29 16:29:33',10.0,67,'2026-07-29 16:30:40',0,'2026-07-29 23:28:52','2026-08-04 23:00:23',NULL,NULL),(29,'aaa','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',NULL,'low','in_progress',67,NULL,'2026-08-01 11:10:00','2026-07-31 04:35:42',NULL,10.0,NULL,NULL,0,'2026-07-31 11:10:10','2026-07-31 11:35:42',NULL,NULL),(30,'asssssssssssssssssss','âsasasasasasasasasasasasasasasasasasasasasas',NULL,'high','in_progress',67,NULL,'2026-08-05 12:00:00','2026-07-31 05:01:20',NULL,10.0,NULL,NULL,0,'2026-07-31 12:00:49','2026-07-31 12:01:20',NULL,54),(31,'ssasssssssssssss','ssssssssssssssssssssssssssssssssssssssssssssssss',NULL,'high','archived',67,4,'2026-08-07 12:10:00','2026-07-31 12:10:39','2026-07-31 16:03:06',NULL,NULL,NULL,0,'2026-07-31 12:10:07','2026-08-06 21:19:59',NULL,54),(32,'ưqwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww','wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',NULL,'high','in_progress',63,NULL,'2026-08-12 23:36:00','2026-08-01 23:37:13',NULL,10.0,NULL,NULL,0,'2026-08-01 23:36:21','2026-08-01 23:37:13',NULL,54),(33,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',NULL,'high','in_progress',63,NULL,'2026-09-02 23:47:00','2026-08-01 23:47:50',NULL,10.0,NULL,NULL,0,'2026-08-01 23:47:36','2026-08-01 23:47:50',NULL,54),(34,'áccccccccccccccccccccccccccccccc','acsssssssssssssssssssssssssssssssss',NULL,'high','in_progress',63,NULL,'2026-08-13 23:50:00','2026-08-01 23:51:07',NULL,10.0,NULL,NULL,0,'2026-08-01 23:50:47','2026-08-01 23:51:07',NULL,54),(35,'assszzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz','saaaaaaaaaaaaaaaaaaaaaaaaaaaa',NULL,'high','scoring',63,NULL,'2026-08-14 23:54:00','2026-08-01 23:55:16','2026-08-01 16:55:32',10.0,NULL,NULL,0,'2026-08-01 23:54:24','2026-08-01 23:55:32',NULL,54),(36,'abv','vvvvvv',NULL,'low','pending',63,NULL,'2026-08-07 20:35:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 20:35:17','2026-08-07 20:35:17',NULL,NULL),(37,'sssssssssssssssssssssss','sssssssssssssssssssssssssssssssssssssssssssssssss',NULL,'medium','pending',63,NULL,'2026-08-21 20:37:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 20:37:46','2026-08-07 20:37:46',NULL,NULL),(38,'dssssssssssssssssssssssss','sddddddddddđ',NULL,'medium','pending',63,NULL,'2026-08-07 20:00:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 20:54:58','2026-08-07 20:54:58',NULL,NULL),(39,'hhhhhhhhhhhhhhhhhhhhhhhh','hhhhhhhhhhhhhhhhhhhhhhhhhhh',NULL,'medium','pending',63,NULL,'2026-08-07 21:06:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 21:06:27','2026-08-07 21:06:27',NULL,NULL),(40,'hhhh','hhhhhh',NULL,'medium','pending',63,NULL,'2026-08-07 21:15:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 21:15:07','2026-08-07 21:15:07',NULL,NULL),(41,'hghjgggjgj','hghghghghgy',NULL,'medium','pending',63,NULL,'2026-08-07 21:17:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 21:17:56','2026-08-07 21:17:56',NULL,NULL),(42,'sdsssssssssssssssssssssssssssss','sdsssssssssssssssssssssssssssss',NULL,'medium','pending',63,NULL,'2026-08-07 21:46:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 21:46:35','2026-08-07 21:46:35',NULL,NULL),(43,'asssssssssssssssssssssssssssssssssssssssssssssssssss','asssssssssssssssssssssssssssssssssssssssssssssssssss',NULL,'medium','pending',63,NULL,'2026-08-07 21:47:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 21:47:17','2026-08-07 21:47:17',NULL,NULL),(44,'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS','SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',NULL,'medium','pending',63,NULL,'2026-08-07 21:50:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 21:50:51','2026-08-07 21:50:51',NULL,NULL),(45,'dsfffffffffffffffffffffffffffffffffffff','dsfffffffffffffffffffffffffffffffffffff',NULL,'medium','pending',63,NULL,'2026-08-07 21:55:00',NULL,NULL,20.0,NULL,NULL,0,'2026-08-07 21:55:16','2026-08-07 21:55:16',NULL,NULL),(46,'reeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','reeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',NULL,'medium','pending',63,NULL,'2026-08-07 21:58:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 21:58:20','2026-08-07 21:58:20',NULL,NULL),(47,'âsasasasasasasasasasasasasasasasas','âsasasasasasasasasasasasasasasasas',NULL,'medium','pending',63,NULL,'2026-08-07 21:59:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 21:59:36','2026-08-07 21:59:36',NULL,NULL),(48,'54rgggggggggggggg','54rgggggggggggggg',NULL,'medium','pending',63,NULL,'2026-08-07 22:12:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 22:13:03','2026-08-07 22:13:03',NULL,NULL),(49,'s','s',NULL,'medium','pending',63,NULL,'2026-08-21 22:19:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 22:20:02','2026-08-07 22:20:02',NULL,NULL),(50,'assssssssssssssssssssssssssssssssssssss','assssssssssssssssssssssssssssssssssssss',NULL,'medium','pending',63,NULL,'2026-08-07 22:39:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 22:39:10','2026-08-07 22:39:10',NULL,NULL),(51,'luan','luan',NULL,'medium','pending',63,NULL,'2026-08-07 22:42:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-07 22:42:05','2026-08-07 22:42:05',NULL,NULL),(52,'ABCXYZ','ABCXYZ',NULL,'medium','assigned',67,NULL,'2026-08-08 08:00:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-08 08:00:58','2026-08-08 08:01:30',NULL,NULL),(53,'saaaaaaaaaaaaaaaaaaaaaaaaaaaa','ásaaaaaaaaaaaaaaaaaaaaaaaaaaaa',NULL,'medium','pending',67,NULL,'2026-08-08 08:07:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-08 08:07:55','2026-08-08 08:07:55',NULL,NULL),(54,'affffff','affffff',NULL,'medium','pending',67,NULL,'2026-08-08 08:24:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-08 08:24:59','2026-08-08 08:24:59',NULL,NULL),(55,'assssssssssssssssssssssssss','assssssssssssssssssssssssss',NULL,'medium','pending',67,NULL,'2026-08-08 08:28:00',NULL,NULL,10.0,NULL,NULL,0,'2026-08-08 08:28:57','2026-08-08 08:28:57',NULL,NULL);
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
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `score_periods`
--

LOCK TABLES `score_periods` WRITE;
/*!40000 ALTER TABLE `score_periods` DISABLE KEYS */;
INSERT INTO `score_periods` VALUES (1,'Period 1','2026-06-20 22:57:43','2026-06-21 21:54:24','2026-06-21 21:54:24',NULL,'worktrack_period_1_2026-06-21.xlsx',1,'2026-06-20 22:57:43'),(2,'Period 2','2026-06-21 21:54:24','2026-06-21 21:54:48','2026-06-21 21:54:48',NULL,'worktrack_period_2_2026-06-21.xlsx',1,'2026-06-21 21:54:24'),(3,'Period 3','2026-06-21 21:54:48','2026-07-12 14:23:44','2026-07-12 14:23:44',67,'worktrack_period_3_2026-07-12.xlsx',1,'2026-06-21 21:54:48'),(4,'Period 4','2026-07-12 14:23:44','2026-07-12 14:24:12','2026-07-12 14:24:12',67,'worktrack_period_4_2026-07-12.xlsx',1,'2026-07-12 14:23:44'),(5,'Period 5','2026-07-12 14:24:12','2026-07-12 14:29:15','2026-07-12 14:29:15',67,'worktrack_period_5_2026-07-12.xlsx',1,'2026-07-12 14:24:12'),(6,'Period 6','2026-07-12 14:29:15','2026-07-12 14:30:18','2026-07-12 14:30:18',67,'worktrack_period_6_2026-07-12.xlsx',1,'2026-07-12 14:29:15'),(7,'Period 7','2026-07-12 14:30:18','2026-07-12 14:34:43','2026-07-12 14:34:43',67,'worktrack_period_7_2026-07-12.xlsx',1,'2026-07-12 14:30:18'),(8,'Period 8','2026-07-12 14:34:43','2026-07-12 14:39:23','2026-07-12 14:39:23',67,'worktrack_period_8_2026-07-12.xlsx',1,'2026-07-12 14:34:43'),(9,'Period 9','2026-07-12 14:39:23','2026-07-12 14:44:18','2026-07-12 14:44:18',67,'worktrack_period_9_2026-07-12.xlsx',1,'2026-07-12 14:39:23'),(10,'Period 10','2026-07-12 14:44:18','2026-07-12 14:45:12','2026-07-12 14:45:12',67,'worktrack_period_10_2026-07-12.xlsx',1,'2026-07-12 14:44:18'),(11,'Period 11','2026-07-12 14:45:12','2026-07-28 23:04:15','2026-07-28 23:04:15',66,'worktrack_period_11_2026-07-28.xlsx',1,'2026-07-12 14:45:12'),(12,'Period 12','2026-07-28 23:04:15','2026-07-28 23:12:58','2026-07-28 23:12:58',66,'worktrack_period_12_2026-07-28.xlsx',1,'2026-07-28 23:04:15'),(13,'Period 13','2026-07-28 23:12:58','2026-07-28 23:36:10','2026-07-28 23:36:10',66,'worktrack_period_13_2026-07-28.xlsx',1,'2026-07-28 23:12:58'),(14,'Period 14','2026-07-28 23:36:10','2026-08-04 23:09:33','2026-08-04 23:09:33',66,'worktrack_period_14_2026-08-04.xlsx',1,'2026-07-28 23:36:10'),(15,'Period 15','2026-08-04 23:09:33',NULL,NULL,NULL,NULL,0,'2026-08-04 23:09:33');
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
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `score_snapshots`
--

LOCK TABLES `score_snapshots` WRITE;
/*!40000 ALTER TABLE `score_snapshots` DISABLE KEYS */;
INSERT INTO `score_snapshots` VALUES (6,3,54,0.0,30.0,0.0,30.0,0,7,0,7,0,'2026-07-12 14:23:44'),(7,3,63,0.0,10.0,0.0,10.0,0,1,0,0,1,'2026-07-12 14:23:44'),(8,3,67,0.0,10.0,0.0,10.0,0,2,0,2,0,'2026-07-12 14:23:44'),(10,3,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:23:44'),(12,3,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:23:44'),(13,4,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:24:12'),(16,4,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:24:12'),(18,4,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:24:12'),(19,4,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:24:12'),(20,4,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:24:12'),(21,5,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:29:15'),(24,5,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:29:15'),(26,5,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:29:15'),(27,5,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:29:15'),(28,5,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:29:15'),(30,6,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:30:18'),(32,6,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:30:18'),(34,6,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:30:18'),(35,6,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:30:18'),(36,6,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:30:18'),(37,7,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:34:43'),(40,7,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:34:43'),(42,7,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:34:43'),(43,7,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:34:43'),(44,7,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:34:43'),(45,8,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:39:23'),(48,8,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:39:23'),(50,8,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:39:23'),(51,8,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:39:23'),(52,8,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:39:23'),(53,9,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:44:18'),(56,9,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:44:18'),(58,9,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:44:18'),(59,9,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:44:18'),(60,9,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:44:18'),(61,10,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:45:12'),(64,10,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-12 14:45:12'),(66,10,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-12 14:45:12'),(67,10,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-12 14:45:12'),(68,10,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-12 14:45:12'),(69,11,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:04:15'),(72,11,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-28 23:04:15'),(74,11,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-28 23:04:15'),(75,11,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-28 23:04:15'),(76,11,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:04:15'),(77,12,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:12:58'),(80,12,54,0.0,0.0,0.0,0.0,0,7,0,7,0,'2026-07-28 23:12:58'),(82,12,63,0.0,0.0,0.0,0.0,0,1,0,0,1,'2026-07-28 23:12:58'),(83,12,67,0.0,0.0,0.0,0.0,0,2,0,2,0,'2026-07-28 23:12:58'),(84,12,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:12:58'),(85,13,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:36:10'),(88,13,54,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:36:10'),(90,13,63,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:36:10'),(91,13,67,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:36:10'),(92,13,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-07-28 23:36:10'),(93,14,54,0.0,7.0,0.0,7.0,0,2,0,1,1,'2026-08-04 23:09:33'),(95,14,5,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-08-04 23:09:33'),(96,14,63,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-08-04 23:09:33'),(97,14,67,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-08-04 23:09:33'),(98,14,68,0.0,0.0,0.0,0.0,0,0,0,0,0,'2026-08-04 23:09:33');
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
) ENGINE=InnoDB AUTO_INCREMENT=73 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (5,'a.nv','nva@smc.com','$2a$10$p.xPVT/gw8ld50LxtTxo3uAmi03BG7JI6ugmtMkd68tWsr2yXZQK2','Nguyễn Văn A','user','#e74c3c',1,NULL,'2026-06-22 22:54:12','2026-08-03 23:35:31'),(42,'hie.tt','','$2a$10$.NNbbJQPty.EFFG05UMJ6eQgFDaZLIRUoYPtCK.WXAPy4N.3KWzOG','Trần Thị Hie','user','#16a085',1,NULL,'2026-06-24 21:03:30','2026-08-03 23:35:34'),(54,'mai.ht','mai.ht@smc.com','$2a$10$dhokRDRZun2ViNkXvC68Merv.wArmuor/WPqtVDS4gaKO8LZ.XRfa','Hoàng Thị Mai','user','#e74c3c',1,'2026-08-08 07:59:56','2026-06-24 21:19:31','2026-08-08 07:59:56'),(63,'02318198','mi.ht@smc.com','$2a$10$WbJ4Saplc0Vn4t/Rcqi0leePDkcdKdWVp2.F1.G/uJfGyGhA74dpm','Hoàng Thị Mi','leader','#16a085',1,'2026-08-07 19:29:37','2026-06-24 21:35:32','2026-08-07 20:33:24'),(66,'admin','admin@worktrack.local','$2a$10$N1QXWotLpEt34CXSdwbfKe9ITN119X0ZIntyMYsn6VVb7iR/Zqo9a','System Admin','admin','#1e2a3a',1,'2026-08-05 21:54:55','2026-06-25 23:40:11','2026-08-05 21:54:55'),(67,'luan.nt','nguyen.thanhluan@smc.com','$2a$10$wjYtCrZZZcUS5iMQB8JkXu77yziUyjQ82dzGONpCsrH3QC2PEo5ca','Nguyễn Thành Luân','manager','#3a7bd5',1,'2026-08-08 08:00:20','2026-06-28 16:36:02','2026-08-08 08:00:20'),(68,'anh.t','anh.t@smc.com','$2a$10$EGaWefxKzMLRHP0Jsssm8ewwvTvmaaWzdjnVCetbDYJr.vuecNNvO','Tạ Anh','leader','#3a7bd5',1,'2026-07-09 21:50:19','2026-07-09 21:50:08','2026-07-09 21:51:48'),(69,'nguyenvanc','c.nv@smc.com','$2a$10$juyDtTg4TIvcIfQFy6ZXb.t8gqPwv5sfHe/m5TPzDYOOn6vxzQa5q','nguyen van c','user','#3a7bd5',1,'2026-08-07 19:52:07','2026-07-12 00:05:31','2026-08-07 19:52:07'),(71,'e.nv','e.nv@smc.vom','$2a$10$QGez3Yj13iuvqeySkCx92eLFXbmiy4f7eBOnDNbDPZWIvrBs/yQsi','Nguyen Van E','user','#3a7bd5',1,'2026-08-07 20:37:03','2026-07-29 22:55:18','2026-08-07 20:37:03'),(72,'02222','nguyen.vanc@smc.com','$2a$10$TqDpO8BYk1cwSPc38BdlTuY7o8HfWOSRw1O4Y8yO8lQ3D8653xCu2','Nguyen Van C','user','#3654ff',1,NULL,'2026-08-07 20:22:23','2026-08-07 20:22:23');
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

-- Dump completed on 2026-08-08 11:10:21
