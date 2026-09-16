import os
import sqlite3
import datetime
import uuid
import jwt
import random
import json
import urllib.request
import shutil
import re
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

try:
    from supabase_client import SupabaseDB
except ImportError:
    try:
        from api.supabase_client import SupabaseDB
    except ImportError:
        import sys
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from supabase_client import SupabaseDB

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})

class VercelPathMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        query_string = environ.get('QUERY_STRING', '')
        if '__path__=' in query_string:
            import urllib.parse
            params = urllib.parse.parse_qs(query_string, keep_blank_values=True)
            if '__path__' in params and params['__path__']:
                environ['PATH_INFO'] = params['__path__'][0]
                del params['__path__']
                environ['QUERY_STRING'] = urllib.parse.urlencode(params, doseq=True)
        return self.wsgi_app(environ, start_response)

app.wsgi_app = VercelPathMiddleware(app.wsgi_app)

SECRET_KEY = "stalker-expedition-dossier-secret-key-1986"

# Vercel Serverless environment handling (/tmp is writable)
IS_VERCEL = os.environ.get('VERCEL') == '1' or 'VERCEL_ENV' in os.environ

if IS_VERCEL:
    DB_PATH = "/tmp/stalker.db"
    UPLOAD_FOLDER = "/tmp/uploads"
    for candidate in [
        os.path.join(os.path.dirname(__file__), "stalker.db"),
        os.path.join(os.path.dirname(__file__), "..", "stalker.db"),
        os.path.join(os.getcwd(), "stalker.db")
    ]:
        if os.path.exists(candidate) and not os.path.exists(DB_PATH):
            try:
                shutil.copyfile(candidate, DB_PATH)
                break
            except Exception as e:
                print("DB copy error:", e)
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "stalker.db")
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}

# Telegram Bot Credentials
TELEGRAM_BOT_TOKEN = "8902880627:AAG9tIwu8f1vZfEFXQUVZK3Bzzy7SMoDL9U"
TELEGRAM_BOT_USERNAME = "stalker_recon_bot"

def send_telegram_message(chat_id, text, reply_markup=None):
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload_dict = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML"
        }
        if reply_markup is not None:
            payload_dict["reply_markup"] = reply_markup
        payload = json.dumps(payload_dict).encode('utf-8')
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print("Telegram send error:", e)

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
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'approved'
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
        ("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'approved'",),
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

    # Seed Admin 2 User if not exists
    cursor.execute("SELECT * FROM users WHERE username = 'commander2'")
    if not cursor.fetchone():
        pwd2 = generate_password_hash("Muxammad2008!")
        cursor.execute("""
        INSERT INTO users (username, email, password_hash, role, callsign, phone, phone_verified, clearance_level, created_at)
        VALUES ('commander2', 'commander2@zone.recon', ?, 'admin', 'КОМАНДОР-02', '+998900000002', 1, 5, ?)
        """, (pwd2, datetime.datetime.now().isoformat()))

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

# Initialize DB on load
try:
    init_db()
except Exception as err:
    print("Database init warning:", err)

# CORS headers hook
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response

# Auth Decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
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
@app.route('/api/uploads/<path:filename>')
def serve_upload(filename):
    for folder in [
        UPLOAD_FOLDER,
        os.path.join(os.path.dirname(__file__), 'uploads'),
        os.path.join(os.path.dirname(__file__), '..', 'uploads'),
        os.path.join(os.getcwd(), 'uploads')
    ]:
        if os.path.exists(os.path.join(folder, filename)):
            return send_from_directory(folder, filename)
    return jsonify({'error': 'Файл не найден'}), 404

@app.route('/api/upload', methods=['POST', 'OPTIONS'])
@app.route('/upload', methods=['POST', 'OPTIONS'])
def upload_file():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

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

# ── Telegram Phone Verification & Polling / Webhook ─────────────────────

KNOWN_CHATS = {1592260229}

def process_telegram_update(data):
    message = data.get('message', {})
    chat = message.get('chat', {})
    chat_id = chat.get('id')
    text = message.get('text', '').strip()
    contact = message.get('contact', {})

    if not chat_id:
        return

    KNOWN_CHATS.add(chat_id)

    # If user clicked /start verify_123456
    if text.startswith('/start'):
        parts = text.split()
        if len(parts) > 1 and parts[1].startswith('verify_'):
            code = parts[1].replace('verify_', '').strip()
            welcome = (
                f"🛡️ <b>СЛУЖБА БЕЗОПАСНОСТИ STALKER</b>\n\n"
                f"Ваш проверочный код доступа:\n"
                f"🔑 <code>{code}</code>\n\n"
                f"<i>(Нажмите на код, чтобы скопировать)</i>\n"
                f"Введите этот 6-значный код на сайте в окне регистрации."
            )
            remove_kb = {"remove_keyboard": True}
            send_telegram_message(chat_id, welcome, reply_markup=remove_kb)
            return
        else:
            welcome = (
                f"🛡️ <b>СЛУЖБА БЕЗОПАСНОСТИ STALKER</b>\n\n"
                f"Приветствуем, сталкер!\n"
                f"Для верификации и получения проверочного кода нажмите кнопку ниже <b>«📱 Поделиться номером»</b>, либо введите номер на сайте и нажмите кнопку подтверждения."
            )
            keyboard = {
                "keyboard": [
                    [{"text": "📱 Поделиться номером", "request_contact": True}]
                ],
                "resize_keyboard": True,
                "one_time_keyboard": True
            }
            send_telegram_message(chat_id, welcome, reply_markup=keyboard)
            return

    if contact and contact.get('phone_number'):
        raw_phone = str(contact.get('phone_number', '')).strip()
        is_val, phone_fmt, _ = validate_uzbekistan_phone(raw_phone)
        if not is_val:
            raw_digits = re.sub(r'\D', '', raw_phone)
            phone_fmt = f"+{raw_digits}"
        code = f"{random.randint(100000, 999999)}"
        now_iso = datetime.datetime.now().isoformat()
        try:
            SupabaseDB.upsert_phone_code(phone_fmt, code)
            SupabaseDB.upsert_phone_code(phone_fmt.replace('+', ''), code)
        except Exception as e:
            print("[Supabase] contact upsert error:", e)

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO phone_verifications (phone, code, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET code = excluded.code, created_at = excluded.created_at
        """, (phone_fmt, code, now_iso))
        cursor.execute("""
        INSERT INTO phone_verifications (phone, code, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET code = excluded.code, created_at = excluded.created_at
        """, (phone_fmt.replace('+', ''), code, now_iso))
        conn.commit()
        conn.close()

        msg = (
            f"✅ <b>Номер подтверждён: {phone_fmt}</b>\n\n"
            f"Ваш проверочный код доступа:\n"
            f"🔑 <code>{code}</code>\n\n"
            f"<i>(Нажмите на код, чтобы скопировать)</i>\n"
            f"Введите этот код в окне регистрации на сайте."
        )
        remove_kb = {"remove_keyboard": True}
        send_telegram_message(chat_id, msg, reply_markup=remove_kb)
        return

    # Default fallback with contact button
    fallback = (
        f"Для получения проверочного кода нажмите кнопку <b>«📱 Поделиться номером»</b> ниже "
        f"или перейдите по ссылке с сайта регистрации."
    )
    keyboard = {
        "keyboard": [
            [{"text": "📱 Поделиться номером", "request_contact": True}]
        ],
        "resize_keyboard": True,
        "one_time_keyboard": True
    }
    send_telegram_message(chat_id, fallback, reply_markup=keyboard)

@app.route('/api/tg/webhook', methods=['POST', 'GET'])
@app.route('/tg/webhook', methods=['POST', 'GET'])
def telegram_webhook():
    if request.method == 'GET':
        return jsonify({'status': 'online', 'bot': TELEGRAM_BOT_USERNAME, 'chats': list(KNOWN_CHATS)})

    data = request.get_json() or {}
    process_telegram_update(data)
    return jsonify({'ok': True})

def start_telegram_polling():
    import threading
    import time

    def poll_worker():
        offset = 0
        while True:
            try:
                url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates?offset={offset}&timeout=5"
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    payload = json.loads(resp.read().decode('utf-8'))
                    for item in payload.get('result', []):
                        offset = item['update_id'] + 1
                        process_telegram_update(item)
            except Exception:
                time.sleep(2)

    t = threading.Thread(target=poll_worker, daemon=True)
    t.start()

# Launch polling on startup
# ── Strict Uzbekistan Phone Validation ─────────────────────────────
def validate_uzbekistan_phone(raw_phone):
    """
    Strict validation and normalization for Uzbekistan phone numbers (+998).
    Allowed operator / regional prefixes (2 digits after 998):
    20, 33, 50, 55, 61, 62, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 88, 90, 91, 93, 94, 95, 97, 98, 99.
    Returns: (is_valid, normalized_phone_with_plus, error_msg)
    """
    if not raw_phone or not str(raw_phone).strip():
        return False, None, "Номер телефона обязателен для авторизации в СБ"

    digits = re.sub(r'\D', '', str(raw_phone))
    if digits.startswith('998'):
        digits = digits[3:]
    elif len(digits) == 9:
        pass
    else:
        return False, None, "Укажите полный номер телефона Узбекистана: +998 (XX) XXX-XX-XX (ровно 9 цифр после +998)"

    if len(digits) != 9:
        return False, None, f"Номер телефона не завершён (введено {len(digits)} из 9 цифр после +998)"

    uz_op_pattern = r'^(20|33|50|55|61|62|65|66|67|69|70|71|72|73|74|75|76|77|78|79|88|90|91|93|94|95|97|98|99)\d{7}$'
    if not re.match(uz_op_pattern, digits):
        op = digits[:2]
        return False, None, f"Неверный код оператора Узбекистана (+998 {op}). Разрешены: 90, 91, 93, 94, 95, 97, 98, 99, 33, 88, 77, 20 и др."

    return True, f"+998{digits}", None

if not IS_VERCEL:
    start_telegram_polling()

@app.route('/api/auth/send-tg-code', methods=['POST', 'OPTIONS'])
@app.route('/auth/send-tg-code', methods=['POST', 'OPTIONS'])
def send_tg_code():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    data = request.get_json() or {}
    raw_phone = data.get('phone', '')
    is_valid, phone_with_plus, err = validate_uzbekistan_phone(raw_phone)
    if not is_valid:
        return jsonify({'error': err}), 400

    phone_no_plus = phone_with_plus.replace('+', '')

    code = f"{random.randint(100000, 999999)}"
    now = datetime.datetime.now().isoformat()

    # Save verification code to Supabase and SQLite fallback
    try:
        SupabaseDB.upsert_phone_code(phone_with_plus, code)
        SupabaseDB.upsert_phone_code(phone_no_plus, code)
    except Exception as e:
        print("[Supabase] phone verification upsert error:", e)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO phone_verifications (phone, code, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET code = excluded.code, created_at = excluded.created_at
    """, (phone_with_plus, code, now))
    cursor.execute("""
    INSERT INTO phone_verifications (phone, code, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET code = excluded.code, created_at = excluded.created_at
    """, (phone_no_plus, code, now))
    conn.commit()
    conn.close()

    # Proactively deliver code to known active Telegram chats
    for cid in KNOWN_CHATS:
        send_telegram_message(
            cid,
            f"🛡️ <b>СЛУЖБА БЕЗОПАСНОСТИ STALKER</b>\n\n"
            f"Код подтверждения для номера {phone_with_plus}:\n"
            f"🔑 <code>{code}</code>\n\n"
            f"<i>(Нажмите на код, чтобы скопировать)</i>\n"
            f"Введите его в форме регистрации на сайте."
        )

    bot_url = f"https://t.me/{TELEGRAM_BOT_USERNAME}?start=verify_{code}"

    return jsonify({
        'message': 'Код верификации сгенерирован',
        'code': code,
        'bot_url': bot_url,
        'phone': phone_with_plus
    })

@app.route('/api/auth/register', methods=['POST', 'OPTIONS'])
@app.route('/auth/register', methods=['POST', 'OPTIONS'])
def register():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

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

    # Username: Latin letters, numbers, and underscore only (3-30 chars)
    if not re.match(r'^[a-zA-Z0-9_]{3,30}$', username):
        return jsonify({'error': 'Имя пользователя (логин) должно содержать только латинские буквы, цифры и символ подчеркивания (от 3 до 30 символов)'}), 400

    # Callsign: Russian and Latin letters, numbers, spaces, hyphens (2-30 chars)
    if callsign and not re.match(r'^[a-zA-Zа-яА-ЯёЁ0-9\s_-]{2,30}$', callsign):
        return jsonify({'error': 'Позывной может содержать только русские и латинские буквы, цифры, дефис и пробелы (от 2 до 30 символов)'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Длина пароля должна быть не менее 6 символов'}), 400

    is_valid, phone_with_plus, err = validate_uzbekistan_phone(phone)
    if not is_valid:
        return jsonify({'error': err}), 400

    phone_no_plus = phone_with_plus.replace('+', '')

    # 1. Verify phone code via Supabase
    tg_code = None
    try:
        tg_code = SupabaseDB.get_latest_phone_code(phone_with_plus, phone_no_plus)
    except Exception as e:
        print("[Supabase] get_latest_phone_code error:", e)

    if not tg_code or tg_code != code:
        # Fallback to local SQLite
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT code FROM phone_verifications WHERE phone = ? OR phone = ? ORDER BY created_at DESC LIMIT 1", (phone_with_plus, phone_no_plus))
        ver = cursor.fetchone()
        conn.close()
        if not ver or ver['code'] != code:
            return jsonify({'error': 'Неверный 6-значный код подтверждения из Telegram бота'}), 400

    # 2. Check duplicate username or email in Supabase
    existing = None
    try:
        existing = SupabaseDB.get_user_by_username_or_email(username)
        if not existing:
            existing = SupabaseDB.get_user_by_username_or_email(email)
    except Exception as e:
        print("[Supabase] duplicate check error:", e)

    if existing:
        return jsonify({'error': 'Исследователь с таким логином или email уже зарегистрирован'}), 400

    now_iso = datetime.datetime.now().isoformat()
    pwd_hash = generate_password_hash(password)

    user_payload = {
        'username': username,
        'email': email,
        'password_hash': pwd_hash,
        'role': 'stalker',
        'callsign': callsign,
        'phone': phone_with_plus,
        'phone_verified': 1,
        'clearance_level': 1,
        'last_lat': lat,
        'last_lng': lng,
        'last_seen': now_iso,
        'created_at': now_iso,
        'status': 'pending'
    }

    # Save to Supabase (persistent across Vercel invocations)
    try:
        SupabaseDB.create_user(user_payload)
    except Exception as e:
        print("[Supabase] create_user error:", e)

    # Also record into local SQLite for fallback
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO users (username, email, password_hash, role, callsign, phone, phone_verified, clearance_level, last_lat, last_lng, last_seen, created_at, status)
        VALUES (?, ?, ?, 'stalker', ?, ?, 1, 1, ?, ?, ?, ?, 'pending')
        """, (username, email, pwd_hash, callsign, phone_with_plus, lat, lng, now_iso, now_iso))
        conn.commit()
        conn.close()
    except Exception:
        pass

    return jsonify({
        'status': 'pending',
        'message': 'Ваша заявка на регистрацию принята и находится на рассмотрении администрации базы STALKER. После одобрения вы сможете войти в систему под своим логином.'
    }), 201

@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
@app.route('/auth/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    lat = data.get('lat')
    lng = data.get('lng')

    if not username or not password:
        return jsonify({'error': 'Укажите позывной и код доступа'}), 400

    user = None
    try:
        user = SupabaseDB.get_user_by_username_or_email(username)
    except Exception as e:
        print("[Supabase] login get_user error:", e)

    if not user:
        # Fallback to local SQLite
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ? OR email = ?", (username, username))
        user_row = cursor.fetchone()
        conn.close()
        if user_row:
            user = dict(user_row)

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Неверный логин или пароль'}), 401

    # Check registration approval status
    user_status = user.get('status', 'approved')
    if user_status == 'pending':
        return jsonify({'error': 'Ваша заявка на регистрацию находится на рассмотрении администрации. Ожидайте подтверждения допуска.'}), 403
    if user_status == 'rejected':
        return jsonify({'error': 'Ваша заявка на регистрацию была отклонена администратором.'}), 403

    now_iso = datetime.datetime.now().isoformat()
    try:
        update_data = {'last_seen': now_iso}
        if user.get('role') != 'admin' and lat is not None and lng is not None:
            update_data['last_lat'] = lat
            update_data['last_lng'] = lng
        elif user.get('role') == 'admin':
            update_data['last_lat'] = None
            update_data['last_lng'] = None
        SupabaseDB.update_user(user['id'], update_data)
    except Exception as e:
        print("[Supabase] login update_user error:", e)

    token = jwt.encode({
        'user_id': user['id'],
        'username': user['username'],
        'role': user.get('role', 'stalker'),
        'callsign': user.get('callsign'),
        'clearance_level': user.get('clearance_level', 1),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, SECRET_KEY, algorithm="HS256")

    return jsonify({
        'message': 'Допуск подтверждён',
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user.get('role', 'stalker'),
            'callsign': user.get('callsign'),
            'clearance_level': user.get('clearance_level', 1)
        }
    })

# ── User Geolocation Update ─────────────────────────────────────────────

@app.route('/api/user/location', methods=['POST', 'OPTIONS'])
@app.route('/user/location', methods=['POST', 'OPTIONS'])
@token_required
def update_user_location(current_user):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    if current_user.get('role') == 'admin':
        # Admin locations are classified and hidden from radar
        return jsonify({'status': 'ok', 'note': 'admin_location_masked'})

    data = request.get_json() or {}
    lat = data.get('lat')
    lng = data.get('lng')
    if lat is None or lng is None:
        return jsonify({'error': 'Координаты не указаны'}), 400

    now_iso = datetime.datetime.now().isoformat()
    try:
        SupabaseDB.update_user(current_user['user_id'], {
            'last_lat': lat,
            'last_lng': lng,
            'last_seen': now_iso
        })
    except Exception as e:
        print("[Supabase] location update error:", e)

    return jsonify({'status': 'ok'})

# ── Locations Routes ────────────────────────────────────────────────────

@app.route('/api/locations', methods=['GET', 'OPTIONS'])
@app.route('/locations', methods=['GET', 'OPTIONS'])
def get_locations():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

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

@app.route('/api/locations/<loc_id>', methods=['GET', 'OPTIONS'])
@app.route('/locations/<loc_id>', methods=['GET', 'OPTIONS'])
def get_location(loc_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

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

@app.route('/api/admin/locations/<loc_id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@app.route('/admin/locations/<loc_id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@token_required
def modify_location(current_user, loc_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Требуется уровень допуска Администратора Архива'}), 403

    conn = get_db()
    cursor = conn.cursor()

    if request.method == 'DELETE':
        cursor.execute("DELETE FROM locations WHERE id = ?", (loc_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Объект удалён из реестра'})

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
        conn.close()
        return jsonify({'error': 'Название и регион обязательны'}), 400

    cursor.execute("""
    UPDATE locations SET
        name = ?, type = ?, icon = ?, color = ?, region = ?,
        lat = ?, lng = ?, difficulty = ?, description = ?, access = ?, photos = ?
    WHERE id = ?
    """, (name, loc_type, icon, color, region, lat, lng, difficulty, description, access, photos_str, loc_id))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Объект успешно обновлён'})

# ── Submissions Routes ──────────────────────────────────────────────────

@app.route('/api/submissions', methods=['GET', 'POST', 'OPTIONS'])
@app.route('/submissions', methods=['GET', 'POST', 'OPTIONS'])
def handle_submissions():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    if request.method == 'GET':
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

    # POST - Requires Token
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({'error': 'Допуск не предоставлен'}), 401
    try:
        current_user = jwt.decode(auth_header.split(" ")[1], SECRET_KEY, algorithms=["HS256"])
    except Exception:
        return jsonify({'error': 'Недействительный токен'}), 401

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
        return jsonify({'error': 'Обязательные поля: наименование объекта и регион'}), 400

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

@app.route('/api/admin/submissions/<sub_id>/approve', methods=['POST', 'OPTIONS'])
@app.route('/admin/submissions/<sub_id>/approve', methods=['POST', 'OPTIONS'])
@token_required
def approve_submission(current_user, sub_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

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

@app.route('/api/admin/submissions/<sub_id>/reject', methods=['POST', 'OPTIONS'])
@app.route('/admin/submissions/<sub_id>/reject', methods=['POST', 'OPTIONS'])
@token_required
def reject_submission(current_user, sub_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

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

@app.route('/api/admin/radar', methods=['GET', 'OPTIONS'])
@app.route('/admin/radar', methods=['GET', 'OPTIONS'])
@token_required
def get_admin_radar(current_user):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Доступ запрещён'}), 403

    users = []
    try:
        raw_users = SupabaseDB.get_all_users_for_radar()
        for r in raw_users:
            is_adm = r.get('role') == 'admin'
            users.append({
                'id': r['id'],
                'username': r.get('username'),
                'email': r.get('email'),
                'role': r.get('role', 'stalker'),
                'callsign': r.get('callsign'),
                'phone': r.get('phone') or 'Не указан',
                'status': r.get('status', 'approved'),
                'coords': None if is_adm else ([r['last_lat'], r['last_lng']] if (r.get('last_lat') is not None and r.get('last_lng') is not None) else None),
                'last_seen': r.get('last_seen'),
                'created_at': r.get('created_at')
            })
    except Exception as e:
        print("[Supabase] get_admin_radar error:", e)
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, email, role, callsign, phone, last_lat, last_lng, last_seen, created_at, status FROM users ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC")
        rows = cursor.fetchall()
        conn.close()
        for r in rows:
            is_adm = r['role'] == 'admin'
            users.append({
                'id': r['id'],
                'username': r['username'],
                'email': r['email'],
                'role': r['role'],
                'callsign': r['callsign'],
                'phone': r['phone'] or 'Не указан',
                'status': r['status'] if ('status' in r.keys() and r['status']) else 'approved',
                'coords': None if is_adm else ([r['last_lat'], r['last_lng']] if (r['last_lat'] and r['last_lng']) else None),
                'last_seen': r['last_seen'],
                'created_at': r['created_at']
            })

    return jsonify(users)

@app.route('/api/admin/users/<int:user_id>/approve', methods=['POST', 'OPTIONS'])
@app.route('/admin/users/<int:user_id>/approve', methods=['POST', 'OPTIONS'])
@token_required
def approve_user(current_user, user_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Требуются права Администратора'}), 403

    try:
        SupabaseDB.update_user(user_id, {'status': 'approved'})
    except Exception as e:
        print("[Supabase] approve_user error:", e)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET status = 'approved' WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    return jsonify({'status': 'ok', 'message': 'Пользователь успешно одобрен'})

@app.route('/api/admin/users/<int:user_id>/reject', methods=['POST', 'OPTIONS'])
@app.route('/admin/users/<int:user_id>/reject', methods=['POST', 'OPTIONS'])
@token_required
def reject_user(current_user, user_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Требуются права Администратора'}), 403

    try:
        SupabaseDB.update_user(user_id, {'status': 'rejected'})
    except Exception as e:
        print("[Supabase] reject_user error:", e)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET status = 'rejected' WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    return jsonify({'status': 'ok', 'message': 'Заявка пользователя отклонена'})

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE', 'OPTIONS'])
@app.route('/admin/users/<int:user_id>', methods=['DELETE', 'OPTIONS'])
@token_required
def delete_user(current_user, user_id):
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    if current_user.get('role') != 'admin':
        return jsonify({'error': 'Требуются права Администратора'}), 403

    try:
        SupabaseDB.delete_user(user_id)
    except Exception as e:
        print("[Supabase] delete_user error:", e)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    return jsonify({'status': 'ok', 'message': 'Пользователь удален'})

@app.route('/api/admin/stats', methods=['GET', 'OPTIONS'])
@app.route('/admin/stats', methods=['GET', 'OPTIONS'])
def get_stats():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    try:
        stats = SupabaseDB.get_stats()
        # Always count locations from SQLite if not populated in Supabase yet
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM locations WHERE status = 'approved'")
        sqlite_locs = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM submissions WHERE status = 'pending'")
        sqlite_pending_subs = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM submissions WHERE status = 'rejected'")
        sqlite_rej_subs = cursor.fetchone()[0]
        conn.close()

        if stats.get('total_locations', 0) == 0:
            stats['total_locations'] = sqlite_locs
        if stats.get('pending_submissions', 0) == 0:
            stats['pending_submissions'] = sqlite_pending_subs
        if stats.get('rejected_submissions', 0) == 0:
            stats['rejected_submissions'] = sqlite_rej_subs

        return jsonify(stats)
    except Exception as e:
        print("[Supabase] get_stats error:", e)
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
        try:
            cursor.execute("SELECT COUNT(*) FROM users WHERE status = 'pending'")
            pending_users = cursor.fetchone()[0]
        except Exception:
            pending_users = 0
        conn.close()

        return jsonify({
            'total_locations': approved_count,
            'pending_submissions': pending_count,
            'rejected_submissions': rejected_count,
            'registered_stalkers': users_count,
            'pending_users': pending_users
        })

handler = app

if __name__ == '__main__':
    print("=== STALKER Backend initialized ===")
    print("Commander login: commander / stalker1986")
    print("Stalker login: tracker_89 / stalker1986")
    app.run(host='0.0.0.0', port=5000, debug=True)
