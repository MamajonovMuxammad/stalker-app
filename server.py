import os
import sqlite3
import datetime
import uuid
import jwt
import random
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)
SECRET_KEY = "stalker-expedition-dossier-secret-key-1986"
DB_PATH = os.path.join(os.path.dirname(__file__), "stalker.db")
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}

# Telegram Bot username for verification
TELEGRAM_BOT_USERNAME = "stalker_recon_bot"

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'stalker',
        callsign TEXT,
        phone TEXT,
        phone_verified INTEGER DEFAULT 0,
        tg_verification_code TEXT,
        clearance_level INTEGER DEFAULT 1,
        last_lat REAL,
        last_lng REAL,
        last_seen TEXT,
        created_at TEXT NOT NULL
    )
    """)
    
    # Locations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT DEFAULT 'bunker',
        color TEXT DEFAULT '#2563EB',
        region TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
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
    )
    """)
    
    # Submissions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT DEFAULT 'bunker',
        color TEXT DEFAULT '#2563EB',
        region TEXT NOT NULL,
        lat REAL,
        lng REAL,
        difficulty INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        author TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        access TEXT,
        photos TEXT,
        resolution TEXT
    )
    """)

    # Phone verification temporary store
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS phone_verifications (
        phone TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    # Migrations for existing tables if columns missing
    migrations = [
        ("ALTER TABLE locations ADD COLUMN icon TEXT DEFAULT 'bunker'",),
        ("ALTER TABLE locations ADD COLUMN color TEXT DEFAULT '#2563EB'",),
        ("ALTER TABLE submissions ADD COLUMN icon TEXT DEFAULT 'bunker'",),
        ("ALTER TABLE submissions ADD COLUMN color TEXT DEFAULT '#2563EB'",),
        ("ALTER TABLE users ADD COLUMN phone TEXT",),
        ("ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0",),
        ("ALTER TABLE users ADD COLUMN tg_verification_code TEXT",),
        ("ALTER TABLE users ADD COLUMN last_lat REAL",),
        ("ALTER TABLE users ADD COLUMN last_lng REAL",),
        ("ALTER TABLE users ADD COLUMN last_seen TEXT",),
    ]
    for m in migrations:
        try:
            cursor.execute(m[0])
        except sqlite3.OperationalError:
            pass

    # Seed Admin User if not exists
    cursor.execute("SELECT * FROM users WHERE username = 'commander'")
    if not cursor.fetchone():
        pwd = generate_password_hash("stalker1986")
        cursor.execute("""
        INSERT INTO users (username, email, password_hash, role, callsign, phone, phone_verified, clearance_level, created_at)
        VALUES ('commander', 'commander@zone.recon', ?, 'admin', 'КОМАНДОР-01', '+998901234567', 1, 5, ?)
        """, (pwd, datetime.datetime.now().isoformat()))

    # Seed Stalker User
    cursor.execute("SELECT * FROM users WHERE username = 'tracker_89'")
    if not cursor.fetchone():
        pwd = generate_password_hash("stalker1986")
        cursor.execute("""
        INSERT INTO users (username, email, password_hash, role, callsign, phone, phone_verified, clearance_level, created_at)
        VALUES ('tracker_89', 'tracker@zone.recon', ?, 'stalker', 'СЛЕДОПЫТ', '+998939876543', 1, 3, ?)
        """, (pwd, datetime.datetime.now().isoformat()))

    conn.commit()
    conn.close()

# Auth Decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({'error': 'Допуск не предоставлен: токен авторизации отсутствует'}), 401
        token = auth_header.split(" ")[1]
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data
        except Exception:
            return jsonify({'error': 'Срок действия пропуска истёк или подпись недействительна'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

# ── ROUTES ─────────────────────────────────────────────────────────────

# Serve Static HTML & assets
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files and 'files' not in request.files:
        return jsonify({'error': 'Файлы для загрузки не найдены'}), 400
    
    files = request.files.getlist('files')
    if not files and 'file' in request.files:
        files = [request.files['file']]

    uploaded_urls = []
    for file in files:
        if file and file.filename != '':
            if not allowed_file(file.filename):
                return jsonify({'error': f'Недопустимый формат файла: {file.filename}. Разрешены: PNG, JPG, JPEG, WEBP, GIF'}), 400
            
            ext = file.filename.rsplit('.', 1)[1].lower()
            unique_name = f"{uuid.uuid4().hex[:12]}_{int(datetime.datetime.now().timestamp())}.{ext}"
            file_path = os.path.join(UPLOAD_FOLDER, unique_name)
            file.save(file_path)
            uploaded_urls.append(f"/uploads/{unique_name}")

    if not uploaded_urls:
        return jsonify({'error': 'Ни один файл не был сохранён'}), 400

    return jsonify({
        'urls': uploaded_urls,
        'url': uploaded_urls[0] if uploaded_urls else None
    })

# ── Telegram Phone Verification ─────────────────────────────────────────

@app.route('/api/auth/send-tg-code', methods=['POST'])
def send_tg_code():
    data = request.get_json() or {}
    phone = data.get('phone', '').strip().replace(' ', '').replace('-', '')
    if not phone or len(phone) < 7:
        return jsonify({'error': 'Укажите корректный номер телефона в международном формате (+998...)'}), 400

    # Generate 6-digit code
    code = f"{random.randint(100000, 999999)}"
    now = datetime.datetime.now().isoformat()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO phone_verifications (phone, code, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET code = excluded.code, created_at = excluded.created_at
    """, (phone, code, now))
    conn.commit()
    conn.close()

    bot_url = f"https://t.me/{TELEGRAM_BOT_USERNAME}?start=verify_{code}"

    return jsonify({
        'message': 'Код верификации сгенерирован',
        'code': code, # provided for verification / testing
        'bot_url': bot_url,
        'phone': phone
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    callsign = data.get('callsign', '').strip() or username.upper()
    phone = data.get('phone', '').strip().replace(' ', '').replace('-', '')
    code = data.get('code', '').strip()
    lat = data.get('lat')
    lng = data.get('lng')

    if not username or not email or not password:
        return jsonify({'error': 'Не все обязательные поля формуляра заполнены'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Длина пароля должна быть не менее 6 символов'}), 400
    if not phone:
        return jsonify({'error': 'Номер телефона обязателен для авторизации в системе безопасности'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Verify phone code
    cursor.execute("SELECT code FROM phone_verifications WHERE phone = ?", (phone,))
    ver = cursor.fetchone()
    if not ver or ver['code'] != code:
        conn.close()
        return jsonify({'error': 'Неверный 6-значный код подтверждения из Telegram бота'}), 400

    cursor.execute("SELECT id FROM users WHERE username = ? OR email = ?", (username, email))
    if cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Исследователь с таким логином или email уже зарегистрирован'}), 400

    now_iso = datetime.datetime.now().isoformat()
    pwd_hash = generate_password_hash(password)
    cursor.execute("""
    INSERT INTO users (username, email, password_hash, role, callsign, phone, phone_verified, clearance_level, last_lat, last_lng, last_seen, created_at)
    VALUES (?, ?, ?, 'stalker', ?, ?, 1, 1, ?, ?, ?, ?)
    """, (username, email, pwd_hash, callsign, phone, lat, lng, now_iso, now_iso))
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    token = jwt.encode({
        'user_id': user_id,
        'username': username,
        'role': 'stalker',
        'callsign': callsign,
        'clearance_level': 1,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, SECRET_KEY, algorithm="HS256")

    return jsonify({
        'message': 'Допуск успешно оформлен',
        'token': token,
        'user': {
            'id': user_id,
            'username': username,
            'role': 'stalker',
            'callsign': callsign,
            'clearance_level': 1
        }
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    lat = data.get('lat')
    lng = data.get('lng')

    if not username or not password:
        return jsonify({'error': 'Укажите позывной и код доступа'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ? OR email = ?", (username, username))
    user = cursor.fetchone()

    if not user or not check_password_hash(user['password_hash'], password):
        conn.close()
        return jsonify({'error': 'Неверный позывной или код доступа'}), 401

    # Update geolocation if provided
    now_iso = datetime.datetime.now().isoformat()
    if lat is not None and lng is not None:
        cursor.execute("UPDATE users SET last_lat = ?, last_lng = ?, last_seen = ? WHERE id = ?", (lat, lng, now_iso, user['id']))
    else:
        cursor.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now_iso, user['id']))
    conn.commit()
    conn.close()

    token = jwt.encode({
        'user_id': user['id'],
        'username': user['username'],
        'role': user['role'],
        'callsign': user['callsign'],
        'clearance_level': user['clearance_level'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, SECRET_KEY, algorithm="HS256")

    return jsonify({
        'message': 'Допуск подтверждён',
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'callsign': user['callsign'],
            'clearance_level': user['clearance_level']
        }
    })

# ── User Geolocation Update ─────────────────────────────────────────────

@app.route('/api/user/location', methods=['POST'])
@token_required
def update_user_location(current_user):
    data = request.get_json() or {}
    lat = data.get('lat')
    lng = data.get('lng')
    if lat is None or lng is None:
        return jsonify({'error': 'Координаты не указаны'}), 400

    conn = get_db()
    cursor = conn.cursor()
    now_iso = datetime.datetime.now().isoformat()
    cursor.execute("UPDATE users SET last_lat = ?, last_lng = ?, last_seen = ? WHERE id = ?", (lat, lng, now_iso, current_user['user_id']))
    conn.commit()
    conn.close()

    return jsonify({'status': 'ok'})

# ── Locations Routes ────────────────────────────────────────────────────

@app.route('/api/locations', methods=['GET'])
def get_locations():
    conn = get_db()
    cursor = conn.cursor()
    
    loc_type = request.args.get('type')
    difficulty = request.args.get('difficulty')
    search = request.args.get('q')

    query = "SELECT * FROM locations WHERE status = 'approved'"
    params = []

    if loc_type and loc_type != 'all':
        query += " AND type = ?"
        params.append(loc_type)
    if difficulty and difficulty != 'all':
        query += " AND difficulty = ?"
        params.append(int(difficulty))
    if search:
        query += " AND (name LIKE ? OR region LIKE ? OR description LIKE ? OR tags LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term, term])

    query += " ORDER BY date_added DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append({
            'id': r['id'],
            'name': r['name'],
            'type': r['type'],
            'icon': r['icon'] if 'icon' in r.keys() and r['icon'] else 'bunker',
            'color': r['color'] if 'color' in r.keys() and r['color'] else '#2563EB',
            'region': r['region'],
            'coords': [r['lat'], r['lng']],
            'difficulty': r['difficulty'],
            'status': r['status'],
            'description': r['description'],
            'access': r['access'],
            'inventory': r['inventory'],
            'photos': r['photos'].split(',') if r['photos'] else [],
            'tags': r['tags'].split(',') if r['tags'] else [],
            'visits': r['visits'],
            'bookmarks': r['bookmarks'],
            'date_added': r['date_added']
        })
    return jsonify(result)

@app.route('/api/locations/<loc_id>', methods=['GET'])
def get_location(loc_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM locations WHERE id = ?", (loc_id,))
    r = cursor.fetchone()
    conn.close()

    if not r:
        return jsonify({'error': 'Досье объекта не найдено в архиве'}), 404

    return jsonify({
        'id': r['id'],
        'name': r['name'],
        'type': r['type'],
        'icon': r['icon'] if 'icon' in r.keys() and r['icon'] else 'bunker',
        'color': r['color'] if 'color' in r.keys() and r['color'] else '#2563EB',
        'region': r['region'],
        'coords': [r['lat'], r['lng']],
        'difficulty': r['difficulty'],
        'status': r['status'],
        'description': r['description'],
        'access': r['access'],
        'inventory': r['inventory'],
        'photos': r['photos'].split(',') if r['photos'] else [],
        'tags': r['tags'].split(',') if r['tags'] else [],
        'visits': r['visits'],
        'bookmarks': r['bookmarks'],
        'date_added': r['date_added']
    })

# ── Admin Location Edit & Delete ────────────────────────────────────────

@app.route('/api/admin/locations/<loc_id>', methods=['PUT'])
@token_required
def update_location(current_user, loc_id):
    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Требуется уровень допуска Администратора Архива'}), 403

    data = request.get_json() or {}
    name = data.get('name', '').strip()
    loc_type = data.get('type', 'abandoned')
    icon = data.get('icon', 'bunker')
    color = data.get('color', '#2563EB')
    region = data.get('region', '').strip()
    description = data.get('description', '').strip()
    access = data.get('access', '').strip()
    difficulty = int(data.get('difficulty', 3))
    lat = data.get('lat')
    lng = data.get('lng')
    photos = data.get('photos', [])
    photos_str = ",".join(photos) if isinstance(photos, list) else str(photos)

    if not name or not region:
        return jsonify({'error': 'Название и регион обязательны'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE locations SET
        name = ?, type = ?, icon = ?, color = ?, region = ?,
        lat = ?, lng = ?, difficulty = ?, description = ?, access = ?, photos = ?
    WHERE id = ?
    """, (name, loc_type, icon, color, region, lat, lng, difficulty, description, access, photos_str, loc_id))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Объект успешно обновлён'})

@app.route('/api/admin/locations/<loc_id>', methods=['DELETE'])
@token_required
def delete_location(current_user, loc_id):
    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Требуется уровень допуска Администратора Архива'}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM locations WHERE id = ?", (loc_id,))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Объект удалён из реестра'})

# ── Submissions Routes ──────────────────────────────────────────────────

@app.route('/api/submissions', methods=['GET'])
def get_submissions():
    status = request.args.get('status', 'all')
    conn = get_db()
    cursor = conn.cursor()
    if status == 'all':
        cursor.execute("SELECT * FROM submissions ORDER BY date DESC")
    else:
        cursor.execute("SELECT * FROM submissions WHERE status = ? ORDER BY date DESC", (status,))
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append({
            'id': r['id'],
            'name': r['name'],
            'type': r['type'],
            'icon': r['icon'] if 'icon' in r.keys() and r['icon'] else 'bunker',
            'color': r['color'] if 'color' in r.keys() and r['color'] else '#2563EB',
            'region': r['region'],
            'lat': r['lat'],
            'lng': r['lng'],
            'difficulty': r['difficulty'],
            'status': r['status'],
            'author': r['author'],
            'date': r['date'],
            'description': r['description'],
            'access': r['access'],
            'photos': r['photos'].split(',') if r['photos'] else [],
            'resolution': r['resolution']
        })
    return jsonify(result)

@app.route('/api/submissions', methods=['POST'])
@token_required
def create_submission(current_user):
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    loc_type = data.get('type', 'abandoned')
    icon = data.get('icon', 'bunker')
    color = data.get('color', '#2563EB')
    region = data.get('region', '').strip()
    description = data.get('description', '').strip()
    access = data.get('access', '').strip()
    difficulty = int(data.get('difficulty', 3))
    lat = data.get('lat')
    lng = data.get('lng')
    photos = data.get('photos', [])
    photos_str = ",".join(photos) if isinstance(photos, list) else str(photos)

    if not name or not region:
        return jsonify({'error': 'Обязательные поля: наименование объекта и регион расположения'}), 400

    sub_id = f"sub-{int(datetime.datetime.now().timestamp())}"
    now_date = datetime.date.today().isoformat()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO submissions (id, name, type, icon, color, region, lat, lng, difficulty, status, author, date, description, access, photos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    """, (sub_id, name, loc_type, icon, color, region, lat, lng, difficulty, current_user.get('callsign') or current_user['username'], now_date, description, access, photos_str))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Заявка опубликована', 'submission_id': sub_id}), 201

# ── Admin Moderation & Stats ────────────────────────────────────────────

@app.route('/api/admin/submissions/<sub_id>/approve', methods=['POST'])
@token_required
def approve_submission(current_user, sub_id):
    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Требуется уровень допуска Администратора Архива'}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM submissions WHERE id = ?", (sub_id,))
    sub = cursor.fetchone()
    if not sub:
        conn.close()
        return jsonify({'error': 'Заявка не найдена'}), 404

    cursor.execute("UPDATE submissions SET status = 'approved', resolution = 'Одобрено. Досье внесено в общий реестр.' WHERE id = ?", (sub_id,))

    loc_id = f"loc-{int(datetime.datetime.now().timestamp())}"
    inv_num = f"{sub['type'][:3].upper()}-{datetime.date.today().strftime('%y')}-РЕК-{loc_id[-3:]}"
    cursor.execute("""
    INSERT INTO locations (id, name, type, icon, color, region, lat, lng, difficulty, status, description, access, inventory, photos, tags, visits, bookmarks, date_added)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, 0, 0, ?)
    """, (
        loc_id, sub['name'], sub['type'], sub['icon'] if 'icon' in sub.keys() and sub['icon'] else 'bunker',
        sub['color'] if 'color' in sub.keys() and sub['color'] else '#2563EB', sub['region'],
        sub['lat'] or 41.3111, sub['lng'] or 69.2406, sub['difficulty'] or 3,
        sub['description'], sub['access'], inv_num,
        sub['photos'], 'Рассекречено,Полевой отчёт', datetime.date.today().isoformat()
    ))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Место одобрено', 'location_id': loc_id})

@app.route('/api/admin/submissions/<sub_id>/reject', methods=['POST'])
@token_required
def reject_submission(current_user, sub_id):
    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Требуется уровень допуска Администратора Архива'}), 403

    data = request.get_json() or {}
    resolution = data.get('resolution', '').strip()
    if not resolution:
        return jsonify({'error': 'Резолюция отклонения обязательна для фиксации в журнале'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE submissions SET status = 'rejected', resolution = ? WHERE id = ?", (resolution, sub_id))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Заявка отклонена'})

@app.route('/api/admin/radar', methods=['GET'])
@token_required
def get_admin_radar(current_user):
    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Доступ запрещён'}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, role, callsign, phone, last_lat, last_lng, last_seen, created_at FROM users")
    rows = cursor.fetchall()
    conn.close()

    users = []
    for r in rows:
        users.append({
            'id': r['id'],
            'username': r['username'],
            'email': r['email'],
            'role': r['role'],
            'callsign': r['callsign'],
            'phone': r['phone'] or 'Не указан', # visible only to Admin
            'coords': [r['last_lat'], r['last_lng']] if (r['last_lat'] and r['last_lng']) else None,
            'last_seen': r['last_seen'],
            'created_at': r['created_at']
        })

    return jsonify(users)

@app.route('/api/admin/stats', methods=['GET'])
def get_stats():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM locations WHERE status = 'approved'")
    approved_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM submissions WHERE status = 'pending'")
    pending_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM submissions WHERE status = 'rejected'")
    rejected_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM users")
    users_count = cursor.fetchone()[0]
    conn.close()

    return jsonify({
        'total_locations': approved_count,
        'pending_submissions': pending_count,
        'rejected_submissions': rejected_count,
        'registered_stalkers': users_count
    })

if __name__ == '__main__':
    init_db()
    print("=== STALKER Backend initialized ===")
    print("Commander login: commander / stalker1986")
    print("Stalker login: tracker_89 / stalker1986")
    app.run(host='0.0.0.0', port=5000, debug=True)
