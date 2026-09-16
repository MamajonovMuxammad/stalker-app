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
DROP TABLE IF EXISTS locations CASCADE;
CREATE TABLE locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT DEFAULT 'bunker',
    color TEXT DEFAULT '#2563EB',
    region TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    difficulty INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved',
    description TEXT,
    access TEXT,
    inventory TEXT,
    photos TEXT,
    tags TEXT,
    visits INTEGER DEFAULT 0,
    bookmarks INTEGER DEFAULT 0,
    date_added TEXT NOT NULL
);

-- 4. Таблица заявок на модерацию локаций (Submissions)
DROP TABLE IF EXISTS submissions CASCADE;
CREATE TABLE submissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT DEFAULT 'bunker',
    color TEXT DEFAULT '#2563EB',
    region TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    difficulty INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    author TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    access TEXT,
    photos TEXT,
    resolution TEXT
);

ALTER TABLE locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE submissions DISABLE ROW LEVEL SECURITY;

-- 5. Начальные аккаунты (Командир и Следопыт)
-- Пароль по умолчанию для обоих: stalker1986
INSERT INTO users (username, email, password_hash, role, callsign, phone, phone_verified, clearance_level, status)
VALUES 
(
    'commander',
    'commander@zone.recon',
    'scrypt:32768:8:1$Tfw20i1aDOARXBjd$23ba9bd56d1d6957d347ef4e86c247fe056ea009c34a57c64dc35e8939fdc2103217e41483bb83d80fa20ab6747ced8611703425360fd1b40c0fcfa419f747cf',
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
    'scrypt:32768:8:1$Tfw20i1aDOARXBjd$23ba9bd56d1d6957d347ef4e86c247fe056ea009c34a57c64dc35e8939fdc2103217e41483bb83d80fa20ab6747ced8611703425360fd1b40c0fcfa419f747cf',
    'stalker',
    'СЛЕДОПЫТ',
    '+998900000089',
    1,
    2,
    'approved'
)
ON CONFLICT (username) DO NOTHING;
