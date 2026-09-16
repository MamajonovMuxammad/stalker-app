-- =======================================================
-- STALKER DATABASE SCHEMA FOR SUPABASE (PostgreSQL)
-- Скопируйте и выполните этот скрипт в Supabase -> SQL Editor
-- =======================================================

-- 1. Таблица пользователей (Users)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'stalker',
    callsign VARCHAR(100),
    phone VARCHAR(50),
    phone_verified INTEGER DEFAULT 0,
    clearance_level INTEGER DEFAULT 1,
    last_lat DOUBLE PRECISION,
    last_lng DOUBLE PRECISION,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending'
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 2. Таблица кодов верификации телефонов (Phone Verifications)
CREATE TABLE IF NOT EXISTS phone_verifications (
    phone VARCHAR(50) PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Таблица утверждённых локаций (Locations)
CREATE TABLE IF NOT EXISTS locations (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    danger_level INTEGER DEFAULT 1,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    image_url TEXT,
    status VARCHAR(50) DEFAULT 'approved',
    submitted_by VARCHAR(100),
    resolution TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Таблица заявок на модерацию локаций (Submissions)
CREATE TABLE IF NOT EXISTS submissions (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    danger_level INTEGER DEFAULT 1,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    images TEXT, -- JSON строка со списком картинок
    status VARCHAR(50) DEFAULT 'pending',
    submitted_by VARCHAR(100),
    resolution TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Начальные аккаунты (Командир и Следопыт)
-- Пароль по умолчанию для обоих: stalker1986
INSERT INTO users (username, email, password_hash, role, callsign, phone, phone_verified, clearance_level, status)
VALUES 
(
    'commander',
    'commander@zone.recon',
    'scrypt:32768:8:1$K5zJv02TfO4XjL7G$2e4d0b115a3bb436d4dfbc34b6b66d8e20e8b2b73be5c6e8e8ea6f6630f55cf55a004eb7cbfb49e29a3a936a282b0e687895e6d6d8495a452ef3ff8c6cfd8fca',
    'admin',
    'КОМАНДОР-01',
    '+998900000001',
    1,
    3,
    'approved'
),
(
    'tracker_89',
    'tracker@zone.recon',
    'scrypt:32768:8:1$K5zJv02TfO4XjL7G$2e4d0b115a3bb436d4dfbc34b6b66d8e20e8b2b73be5c6e8e8ea6f6630f55cf55a004eb7cbfb49e29a3a936a282b0e687895e6d6d8495a452ef3ff8c6cfd8fca',
    'stalker',
    'СЛЕДОПЫТ',
    '+998900000089',
    1,
    2,
    'approved'
)
ON CONFLICT (username) DO NOTHING;
