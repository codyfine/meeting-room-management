DROP DATABASE IF EXISTS school21_booking;
CREATE DATABASE IF NOT EXISTS school21_booking;
USE school21_booking;

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE;
);

-- Таблица комнат
CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    number INT UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    capacity INT DEFAULT 4
);

-- Таблица бронирований
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    topic VARCHAR(200),
    status VARCHAR(20) DEFAULT 'active',
    booked_date DATE NOT NULL,
    booked_time TIME NOT NULL,
    occupied_until DATETIME NOT NULL,
    participants_count INT DEFAULT 1,
    participants TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    INDEX idx_booking_status (status),
    INDEX idx_booking_date (booked_date)
);

-- Вставляем 7 комнат
INSERT IGNORE INTO rooms (number, name, capacity) VALUES
(1, 'Переговорная 1', 4),
(2, 'Переговорная 2', 4),
(3, 'Переговорная 3', 4),
(4, 'Переговорная 4', 4),
(5, 'Переговорная 5', 4),
(6, 'Переговорная 6', 4),
(7, 'Переговорная 7', 7);

-- Тестовый пользователь (пароль: 12355)

-- После запуска app.py администратор создастся автоматически:
-- admin@school21.ru / admin123
