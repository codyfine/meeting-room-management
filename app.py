from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, extract
from flask_login import LoginManager, login_user, logout_user, login_required, current_user, UserMixin
from datetime import datetime, timedelta
from sys import argv
from functools import wraps
import hashlib
import secrets
import json
import re

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(16)

if len(argv) == 2 and argv[1] == 'debug':
    print('DEBUG: Режим отладки, -12 часов ко времени')
    DEBUGGING = True
else:
    DEBUGGING = False

MAX_BOOKING_DAYS = 14 # На сколько дней вперед можно забронировать комнату
ROOM_CHECKIN_CODES = {
    1: '1SFGHP',
    2: '2KGJTH',
    3: '3KGIFM',
    4: '4ASADJ',
    5: '5GGIHJ',
    6: '6LKIGH',
    7: '7KLKIG',
}
MYSQL_PASSWORD = '12355'

app.config['SQLALCHEMY_DATABASE_URI'] = f'mysql+pymysql://mysql:{MYSQL_PASSWORD}@localhost/school21_booking'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
CORS(app, supports_credentials=True)

def validate_email(email):
    """Проверка корректности email"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_name(name):
    """Проверка ФИО (минимум 2 слова, каждое не менее 2 букв)"""
    parts = name.strip().split()
    return len(parts) >= 2 and all(len(p) >= 2 for p in parts)

def dt_now():
    """Функция для изменения текущего времени при отладке"""
    if DEBUGGING:
        return datetime.now() - timedelta(hours=12)
    else:
        return datetime.now()

# ============================================
# МОДЕЛИ
# ============================================

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=dt_now())
    is_active = db.Column(db.Boolean, default=True)
    is_admin = db.Column(db.Boolean, default=False)
    
    bookings = db.relationship('Booking', backref='user', lazy=True)
    
    def set_password(self, password):
        salt = secrets.token_hex(8)
        self.password_hash = hashlib.sha256((salt + password).encode()).hexdigest() + ':' + salt
    
    def check_password(self, password):
        if not self.password_hash:
            return False
        hash_part, salt = self.password_hash.split(':')
        return hash_part == hashlib.sha256((salt + password).encode()).hexdigest()
    
    def get_id(self):
        return str(self.id)

class Room(db.Model):
    __tablename__ = 'rooms'
    
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    capacity = db.Column(db.Integer, default=4)
    
    bookings = db.relationship('Booking', backref='room', lazy=True)

class Booking(db.Model):
    __tablename__ = 'bookings'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey('rooms.id'), nullable=False)
    topic = db.Column(db.String(200))
    status = db.Column(db.String(20), default='active')
    booked_date = db.Column(db.Date, nullable=False)
    booked_time = db.Column(db.Time, nullable=False)
    occupied_until = db.Column(db.DateTime, nullable=False)
    participants_count = db.Column(db.Integer, default=1)
    participants = db.Column(db.Text)
    checked_in = db.Column(db.Boolean, default=False)
    checked_in_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=dt_now)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def admin_required(f):
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not getattr(current_user, 'is_admin', False):
            return jsonify({'error': 'Доступ только для администратора'}), 403
        return f(*args, **kwargs)
    return decorated_function

# ============================================
# СОЗДАНИЕ ТАБЛИЦ
# ============================================

with app.app_context():
    try:
        db.create_all()
        try:
            db.session.execute(db.text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE"))
            db.session.commit()
            print('✅ Добавлена колонка is_admin')
        except Exception:
            db.session.rollback()
        try:
            db.session.execute(db.text("ALTER TABLE bookings ADD COLUMN checked_in BOOLEAN DEFAULT FALSE"))
            db.session.commit()
            print('✅ Добавлена колонка checked_in')
        except Exception:
            db.session.rollback()
        try:
            db.session.execute(db.text("ALTER TABLE bookings ADD COLUMN checked_in_at DATETIME NULL"))
            db.session.commit()
            print('✅ Добавлена колонка checked_in_at')
        except Exception:
            db.session.rollback()
        print('✅ Подключение к MySQL успешно!')
    except Exception as e:
        print(f'❌ Ошибка подключения к MySQL: {e}')
        print('Проверьте пароль в строке 24!')
    
    # Создаём 7 комнат, если их нет
    if Room.query.count() == 0:
        for i in range(1, 8):
            room = Room(number=i, name=f'Переговорная {i}', capacity=4)
            db.session.add(room)
        db.session.commit()
        print('✅ Создано 7 переговорных')
    
    # Создаём тестового пользователя
    test_user = User.query.filter_by(email='student@21-school.ru').first()
    if not test_user:
        user = User(
            name='Тестовый Студент',
            email='student@21-school.ru'
        )
        user.set_password('12345')
        db.session.add(user)
        db.session.commit()
        print('✅ Создан тестовый пользователь')
        print('   Email: student@21-school.ru')
        print('   Пароль: 12345')

    # Создаём администратора
    admin_user = User.query.filter_by(email='admin@21-school.ru').first()
    if not admin_user:
        admin = User(
            name='Администратор',
            email='admin@21-school.ru',
            is_admin=True
        )
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.commit()
        print('✅ Создан администратор')
        print('   Email: admin@21-school.ru')
        print('   Пароль: admin123')
    elif not admin_user.is_admin:
        admin_user.is_admin = True
        db.session.commit()

    print('============================================')
    print('🔐 Данные для входа в админ-панель')
    print('   Адрес: http://127.0.0.1:5000/admin')
    print('   Email: admin@21-school.ru')
    print('   Пароль: admin123')
    print('============================================')

# ============================================
# API ЭНДПОИНТЫ
# ============================================

@app.route('/')
def index():
    return render_template('index.html', server_time=dt_now().isoformat())

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html", server_time=dt_now().isoformat())

@app.route("/admin")
@login_required
def admin_panel():
    if not getattr(current_user, 'is_admin', False):
        return render_template("index.html", server_time=dt_now().isoformat())
    return render_template("admin.html", server_time=dt_now().isoformat())

# ---------- АВТОРИЗАЦИЯ ----------

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    
    # Валидация
    if not name:
        return jsonify({'error': 'Введите ФИО'}), 400
    
    if not validate_name(name):
        return jsonify({'error': 'Введите имя и фамилию (минимум 2 слова)'}), 400
    
    if not email:
        return jsonify({'error': 'Введите email'}), 400
    
    if not validate_email(email):
        return jsonify({'error': 'Введите корректный email'}), 400
    
    if not password:
        return jsonify({'error': 'Введите пароль'}), 400
    
    if len(password) < 4:
        return jsonify({'error': 'Пароль должен быть не менее 4 символов'}), 400
    
    # Проверка уникальности email
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Эта почта уже используется'}), 400
    
    # Создание пользователя
    user = User(
        name=name,
        email=email
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    
    login_user(user)
    
    return jsonify({
        'success': True,
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'is_admin': user.is_admin
        }
    })

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    
    if not email:
        return jsonify({'error': 'Введите email'}), 400
    
    if not password:
        return jsonify({'error': 'Введите пароль'}), 400
    
    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 401
    
    if not user.check_password(password):
        return jsonify({'error': 'Неверный пароль'}), 401
    
    login_user(user)
    
    return jsonify({
        'success': True,
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'is_admin': user.is_admin
        }
    })

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})

@app.route('/api/auth/me')
def get_current_user():
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'user': {
                'id': current_user.id,
                'name': current_user.name,
                'email': current_user.email,
                'is_admin': current_user.is_admin
            }
        })
    return jsonify({'authenticated': False})


# ---------- ОБНОВЛЕНИЕ ПРОФИЛЯ ----------

@app.route('/api/profile/update', methods=['PUT'])
@login_required
def update_profile():
    data = request.json
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    
    if not name or not validate_name(name):
        return jsonify({'error': 'Введите корректное ФИО (Имя и Фамилия)'}), 400
    
    if not email or not validate_email(email):
        return jsonify({'error': 'Введите корректный email'}), 400
    
    existing_user = User.query.filter(User.email == email, User.id != current_user.id).first()
    if existing_user:
        return jsonify({'error': 'Этот email уже используется'}), 400
    
    current_user.name = name
    current_user.email = email
    db.session.commit()
    
    return jsonify({
        'success': True,
        'user': {
            'id': current_user.id,
            'name': current_user.name,
            'email': current_user.email,
            'is_admin': current_user.is_admin
        }
    })

# ---------- КОМНАТЫ ----------

@app.route('/api/rooms')
def get_rooms():
    rooms = Room.query.all()
    result = []
    
    for room in rooms:
        booking = Booking.query.filter(
            Booking.room_id == room.id,
            Booking.status == 'active',
            Booking.occupied_until > dt_now()
        ).first()
        
        all_bookings = Booking.query.filter(
            Booking.room_id == room.id,
            Booking.status == 'active'
        ).all()
        
        bookings_data = []
        for b in all_bookings:
            bookings_data.append({
                'id': b.id,
                'date': b.booked_date.strftime('%Y-%m-%d'),
                'time': b.booked_time.strftime('%H:%M'),
                'userId': b.user_id,
                'userName': b.user.name if b.user else 'Unknown',
                'topic': b.topic,
                'status': b.status,
                'participants_count': b.participants_count,
                'participants': b.participants,
                'checked_in': bool(b.checked_in),
                'checked_in_at': b.checked_in_at.isoformat() if b.checked_in_at else None,
            })
        
        result.append({
            'id': room.id,
            'number': room.number,
            'name': room.name,
            'capacity': room.capacity,
            'status': 'occupied' if booking else 'free',
            'students': [booking.user.name] if booking else [],
            'booked_by': booking.user_id if booking else None,
            'booked_by_name': booking.user.name if booking else None,
            'topic': booking.topic if booking else None,
            'occupied_until': booking.occupied_until.isoformat() if booking else None,
            'bookings': bookings_data,
            'current_booking': {
                'id': booking.id if booking else None,
                'date': booking.booked_date.strftime('%Y-%m-%d') if booking else None,
                'time': booking.booked_time.strftime('%H:%M') if booking else None,
                'topic': booking.topic if booking else None,
                'user_id': booking.user_id if booking else None,
                'user_name': booking.user.name if booking else None,
                'participants_count': booking.participants_count if booking else None,
                'status': booking.status if booking else None,
                'checked_in': bool(booking.checked_in) if booking else False,
                'checked_in_at': booking.checked_in_at.isoformat() if booking and booking.checked_in_at else None,
            } if booking else None
        })
    
    return jsonify(result)

# ---------- БРОНИРОВАНИЕ ----------

@app.route('/api/bookings', methods=['POST'])
@login_required
def create_booking():
    data = request.json
    room_id = data.get('room_id')
    date_str = data.get('date')
    time_str = data.get('time')
    topic = ''
    participants_count = data.get('participants_count', 1)
    participants = data.get('participants', [])
    
    if not room_id or not date_str or not time_str:
        return jsonify({'error': 'Не указаны дата или время'}), 400
    
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Комната не найдена'}), 404
    
    # Проверяем, не занято ли уже это время
    existing = Booking.query.filter(
        Booking.room_id == room_id,
        Booking.status == 'active',
        Booking.booked_date == date_str,
        Booking.booked_time == time_str
    ).first()
    
    if existing:
        return jsonify({'error': 'Это время уже занято'}), 400
    
    user = current_user
    
    booked_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    booked_time = datetime.strptime(time_str, '%H:%M').time()

    max_date = dt_now().date() + timedelta(days=MAX_BOOKING_DAYS)
    if booked_date > max_date:
        return jsonify({
            "success": False,
            "message": "Бронирование пока не доступно на данное время"
        }), 400
    
    dt = datetime.combine(booked_date, booked_time)
    occupied_until = dt + timedelta(hours=1)
    
    booking = Booking(
        user_id=user.id,
        room_id=room_id,
        booked_date=booked_date,
        booked_time=booked_time,
        occupied_until=occupied_until,
        participants_count=participants_count,
        participants=json.dumps(participants) if participants else None
    )
    db.session.add(booking)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'booking': {
            'id': booking.id,
            'room_id': booking.room_id,
            'date': booking.booked_date.strftime('%Y-%m-%d'),
            'time': booking.booked_time.strftime('%H:%M'),
            'topic': booking.topic,
            'occupied_until': booking.occupied_until.isoformat()
        }
    })

# ---------- ОТМЕНА БРОНИРОВАНИЯ ----------

@app.route('/api/bookings/<int:booking_id>/cancel', methods=['PUT'])
@login_required
def cancel_booking(booking_id):
    booking = Booking.query.get(booking_id)
    if not booking:
        return jsonify({'error': 'Бронирование не найдено'}), 404
    
    if booking.user_id != current_user.id:
        return jsonify({'error': 'Только владелец может отменить бронирование'}), 403
    
    if booking.status != 'active':
        return jsonify({'error': 'Бронирование уже отменено или завершено'}), 400
    
    booking.status = 'cancelled'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': 'Бронирование отменено'
    })


@app.route('/api/bookings/<int:booking_id>/check-in', methods=['POST'])
@login_required
def check_in_booking(booking_id):
    data = request.json or {}
    code = str(data.get('code', '')).strip().upper()

    booking = Booking.query.get(booking_id)
    if not booking:
        return jsonify({'error': 'Бронирование не найдено'}), 404

    if booking.user_id != current_user.id:
        return jsonify({'error': 'Отметиться может только пользователь, который забронировал комнату'}), 403

    if booking.status != 'active':
        return jsonify({'error': 'Можно отметиться только по активной брони'}), 400

    now = dt_now()
    start = datetime.combine(booking.booked_date, booking.booked_time)
    end = booking.occupied_until
    if not (start <= now < end):
        return jsonify({'error': 'Отметиться можно только во время своей брони'}), 400

    expected_code = ROOM_CHECKIN_CODES.get(booking.room_id)
    if not expected_code or code != expected_code:
        return jsonify({'error': 'Неверный код комнаты'}), 400

    booking.checked_in = True
    booking.checked_in_at = now
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Присутствие подтверждено',
        'booking': {
            'id': booking.id,
            'room_id': booking.room_id,
            'checked_in': bool(booking.checked_in),
            'checked_in_at': booking.checked_in_at.isoformat() if booking.checked_in_at else None
        }
    })

@app.route('/api/rooms/<int:room_id>/free', methods=['POST'])
@login_required
def free_room(room_id):
    booking = Booking.query.filter(
        Booking.room_id == room_id,
        Booking.status == 'active',
        Booking.occupied_until > dt_now()
    ).first()
    
    if not booking:
        return jsonify({'error': 'Комната уже свободна'}), 400
    
    if booking.user_id != current_user.id:
        return jsonify({'error': 'Только владелец может освободить комнату'}), 403
    
    booking.status = 'ended'
    db.session.commit()
    
    return jsonify({'success': True})

# ---------- СТАТИСТИКА ----------

@app.route('/api/stats')
def stats():
    total = Room.query.count()
    occupied = Booking.query.filter(
        Booking.status == 'active',
        Booking.occupied_until > dt_now()
    ).count()
    free = total - occupied
    
    return jsonify({
        'total': total,
        'free': free,
        'occupied': occupied
    })

@app.route('/api/my-bookings')
@login_required
def my_bookings():
    bookings = Booking.query.filter(
        Booking.user_id == current_user.id,
        Booking.status == 'active',
        Booking.occupied_until > dt_now()
    ).all()
    
    result = []
    for booking in bookings:
        room = Room.query.get(booking.room_id)
        result.append({
            'id': booking.id,
            'room_id': booking.room_id,
            'room_name': room.name if room else 'Unknown',
            'date': booking.booked_date.strftime('%Y-%m-%d'),
            'time': booking.booked_time.strftime('%H:%M'),
            'topic': booking.topic,
            'occupied_until': booking.occupied_until.isoformat()
        })
    
    return jsonify(result)

# ---------- DASHBOARD ----------

@app.route("/api/dashboard")
def api_dashboard():
    now = dt_now()
    rooms_data = []
    occupied = 0

    rooms = Room.query.order_by(Room.id).all()
    total_rooms = len(rooms)

    for room in rooms:
        current_booking = None
        next_booking = None

        bookings = sorted(room.bookings, key=lambda b: (b.booked_date, b.booked_time))

        for booking in bookings:
            start = datetime.strptime(f"{booking.booked_date} {booking.booked_time}", "%Y-%m-%d %H:%M:%S")
            end = start + timedelta(hours=1)

            if start <= now < end:
                current_booking = booking
                break

            if start > now and next_booking is None and booking.status == 'active':
                next_booking = booking

        if current_booking:
            occupied += 1

            start = datetime.strptime(f"{current_booking.booked_date} {current_booking.booked_time}", "%Y-%m-%d %H:%M:%S")
            end = start + timedelta(hours=1)
            remaining = max(0, int((end - now).total_seconds() // 60))

            rooms_data.append({
                "id": room.id,
                "name": room.name,
                "roomState": "OCCUPIED",
                "physicalPresent": bool(current_booking.checked_in),
                "currentBooking": {
                    "user": current_booking.user.name,
                    "topic": current_booking.topic,
                    "participants": current_booking.participants_count,
                    "start": start.strftime("%H:%M"),
                    "end": end.strftime("%H:%M"),
                    "remaining": remaining,
                    "checkedIn": bool(current_booking.checked_in),
                    "checkedInAt": current_booking.checked_in_at.isoformat() if current_booking.checked_in_at else None
                },
                "nextBooking": None
            })
        else:
            rooms_data.append({
                "id": room.id,
                "name": room.name,
                "roomState": "FREE",
                "physicalPresent": False,
                "currentBooking": None,
                "nextBooking": {
                    "date": next_booking.booked_date.isoformat(),
                    "start": next_booking.booked_time.strftime("%H:%M"),
                    "user": next_booking.user.name
                } if next_booking else None,
            })

    utilization = round(occupied / total_rooms * 100) if total_rooms else 0

    return jsonify({
        "serverTime": now.isoformat(),
        "maxBookingDate": dt_now().date() + timedelta(days=MAX_BOOKING_DAYS),
        "summary": {
            "total": total_rooms,
            "occupied": occupied,
            "free": total_rooms - occupied,
            "utilization": utilization
        },
        "rooms": rooms_data
    })


# ---------- АДМИНИСТРАТОР ----------

@app.route('/api/admin/visits')
@admin_required
def admin_visits():
    """Расширенная статистика для админ-панели.

    period=week/month/year — готовые периоды
    date_from/date_to      — произвольный период в формате YYYY-MM-DD
    """
    period = request.args.get('period', 'week').lower()
    if period not in ['week', 'month', 'year', 'custom']:
        period = 'week'

    today = dt_now().date()
    now = dt_now()

    def parse_report_date(value, field_name):
        try:
            return datetime.strptime(value, '%Y-%m-%d').date()
        except Exception:
            raise ValueError(f'Некорректная дата {field_name}. Используйте формат YYYY-MM-DD')

    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    if date_from and date_to:
        try:
            start_date = parse_report_date(date_from, 'date_from')
            end_date = parse_report_date(date_to, 'date_to')
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

        if start_date > end_date:
            return jsonify({'error': 'Дата начала не может быть позже даты окончания'}), 400

        period = 'custom'
        period_title = 'Выбранный период'
        days_span = (end_date - start_date).days + 1
        if days_span > 730:
            timeline_mode = 'year'
        elif days_span > 62:
            timeline_mode = 'month'
        else:
            timeline_mode = 'day'
    elif period == 'week':
        start_date = today - timedelta(days=today.weekday())
        end_date = start_date + timedelta(days=6)
        period_title = 'Текущая неделя'
        timeline_mode = 'day'
    elif period == 'month':
        start_date = today.replace(day=1)
        if today.month == 12:
            end_date = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            end_date = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
        period_title = 'Текущий месяц'
        timeline_mode = 'day'
    else:
        start_date = today.replace(month=1, day=1)
        end_date = today.replace(month=12, day=31)
        period_title = 'Текущий год'
        timeline_mode = 'month'

    # Брони, которые считаем реальными посещениями.
    visit_statuses = ['active', 'ended']
    cancel_statuses = ['cancelled', 'auto_cancelled', 'no_show']

    rooms = Room.query.order_by(Room.number).all()
    all_period_bookings = Booking.query.filter(
        Booking.booked_date >= start_date,
        Booking.booked_date <= end_date
    ).all()
    visit_bookings = [b for b in all_period_bookings if b.status in visit_statuses]
    cancelled_bookings = [b for b in all_period_bookings if b.status in cancel_statuses]

    def booking_start_datetime(booking):
        return datetime.combine(booking.booked_date, booking.booked_time)

    def booking_duration_minutes(booking):
        try:
            minutes = int((booking.occupied_until - booking_start_datetime(booking)).total_seconds() // 60)
            return max(minutes, 0)
        except Exception:
            return 0

    def format_last_booking(booking):
        if not booking:
            return '—'
        booking_date = booking.booked_date
        if booking_date == today:
            return 'Сегодня'
        if booking_date == today - timedelta(days=1):
            return 'Вчера'
        return booking_date.strftime('%d.%m.%Y')

    def percent(value, max_value):
        return round(value / max_value * 100) if max_value else 0

    total_bookings = len(visit_bookings)
    total_participants = sum(int(b.participants_count or 0) for b in visit_bookings)
    active_users = len({b.user_id for b in visit_bookings})
    total_cancelled = len(cancelled_bookings)
    auto_cancelled = len([b for b in cancelled_bookings if b.status in ['auto_cancelled', 'no_show']])
    user_cancelled = len([b for b in cancelled_bookings if b.status == 'cancelled'])
    total_duration = sum(booking_duration_minutes(b) for b in visit_bookings)
    average_duration = round(total_duration / total_bookings) if total_bookings else 0

    days_count = max((end_date - start_date).days + 1, 1)
    work_slots_per_day = 12  # 09:00–20:00, как в календаре проекта
    possible_slots = max(len(rooms) * days_count * work_slots_per_day, 1)
    utilization_percent = round(total_bookings / possible_slots * 100, 1)
    average_per_day = round(total_bookings / days_count, 1)

    # ---------- Статистика по комнатам ----------
    room_stats = []
    max_room_bookings = 0
    for room in rooms:
        bookings = [b for b in visit_bookings if b.room_id == room.id]
        participants = sum(int(b.participants_count or 0) for b in bookings)
        duration = sum(booking_duration_minutes(b) for b in bookings)
        last_booking = max(bookings, key=lambda b: booking_start_datetime(b), default=None)
        cancelled_for_room = [b for b in cancelled_bookings if b.room_id == room.id]
        max_room_bookings = max(max_room_bookings, len(bookings))
        room_stats.append({
            'id': room.id,
            'number': room.number,
            'name': room.name,
            'bookings': len(bookings),
            'participants': participants,
            'uniqueUsers': len({b.user_id for b in bookings}),
            'cancelled': len(cancelled_for_room),
            'averageDuration': round(duration / len(bookings)) if bookings else 0,
            'utilization': round(len(bookings) / max(days_count * work_slots_per_day, 1) * 100, 1),
            'lastBooking': format_last_booking(last_booking)
        })

    for room in room_stats:
        room['percent'] = percent(room['bookings'], max_room_bookings)

    top_room = max(room_stats, key=lambda item: item['bookings']) if room_stats else None
    if top_room and top_room['bookings'] == 0:
        top_room = None

    # ---------- Общая динамика за период ----------
    month_names = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
    all_rooms_timeline = []

    def month_start_date(value):
        return value.replace(day=1)

    def next_month_date(value):
        if value.month == 12:
            return value.replace(year=value.year + 1, month=1, day=1)
        return value.replace(month=value.month + 1, day=1)

    def make_day_rows(day_from, day_to, source_bookings):
        days = []
        current_day = day_from
        while current_day <= day_to:
            day_bookings = [b for b in source_bookings if b.booked_date == current_day]
            days.append({
                'type': 'day',
                'key': current_day.isoformat(),
                'label': current_day.strftime('%d.%m'),
                'bookings': len(day_bookings),
                'participants': sum(int(b.participants_count or 0) for b in day_bookings)
            })
            current_day += timedelta(days=1)

        max_day_bookings = max([day['bookings'] for day in days], default=0)
        for day in days:
            day['percent'] = percent(day['bookings'], max_day_bookings)
        return days

    def make_month_row(month_start_raw, source_start, source_end, source_bookings):
        y = month_start_raw.year
        m = month_start_raw.month
        next_month = next_month_date(month_start_raw)
        month_start = max(month_start_raw, source_start)
        month_end = min(next_month - timedelta(days=1), source_end)
        month_bookings = [
            b for b in source_bookings
            if month_start <= b.booked_date <= month_end
        ]
        days = make_day_rows(month_start, month_end, month_bookings)
        return {
            'type': 'month',
            'key': f'{y:04d}-{m:02d}',
            'label': f'{month_names[m - 1]} {y}',
            'bookings': len(month_bookings),
            'participants': sum(int(b.participants_count or 0) for b in month_bookings),
            'days': days
        }

    if timeline_mode == 'day':
        all_rooms_timeline = make_day_rows(start_date, end_date, visit_bookings)
    elif timeline_mode == 'month':
        current_month = month_start_date(start_date)
        while current_month <= month_start_date(end_date):
            all_rooms_timeline.append(make_month_row(current_month, start_date, end_date, visit_bookings))
            current_month = next_month_date(current_month)
    else:
        current_year = start_date.year
        while current_year <= end_date.year:
            year_start = max(start_date, datetime(current_year, 1, 1).date())
            year_end = min(end_date, datetime(current_year, 12, 31).date())
            year_bookings = [
                b for b in visit_bookings
                if year_start <= b.booked_date <= year_end
            ]

            months = []
            current_month = month_start_date(year_start)
            while current_month <= month_start_date(year_end):
                months.append(make_month_row(current_month, year_start, year_end, year_bookings))
                current_month = next_month_date(current_month)

            max_month_bookings = max([month['bookings'] for month in months], default=0)
            for month in months:
                month['percent'] = percent(month['bookings'], max_month_bookings)

            all_rooms_timeline.append({
                'type': 'year',
                'key': str(current_year),
                'label': str(current_year),
                'bookings': len(year_bookings),
                'participants': sum(int(b.participants_count or 0) for b in year_bookings),
                'months': months
            })
            current_year += 1

    max_timeline_bookings = max([item['bookings'] for item in all_rooms_timeline], default=0)
    for item in all_rooms_timeline:
        item['percent'] = percent(item['bookings'], max_timeline_bookings)

    # ---------- Пиковые часы ----------
    peak_hours = []
    hour_rows = []
    for hour in range(9, 21):
        hour_bookings = [b for b in visit_bookings if b.booked_time.hour == hour]
        hour_rows.append({
            'hour': hour,
            'label': f'{hour:02d}:00',
            'bookings': len(hour_bookings),
            'participants': sum(int(b.participants_count or 0) for b in hour_bookings)
        })
    max_hour_bookings = max([item['bookings'] for item in hour_rows], default=0)
    for item in hour_rows:
        item['percent'] = percent(item['bookings'], max_hour_bookings)
        peak_hours.append(item)

    top_hour = max(peak_hours, key=lambda item: item['bookings']) if peak_hours else None
    if top_hour and top_hour['bookings'] == 0:
        top_hour = None

    # ---------- Активные пользователи ----------
    users_map = {}
    for booking in visit_bookings:
        user_name = booking.user.name if booking.user else 'Неизвестный пользователь'
        if booking.user_id not in users_map:
            users_map[booking.user_id] = {
                'id': booking.user_id,
                'name': user_name,
                'bookings': 0,
                'participants': 0
            }
        users_map[booking.user_id]['bookings'] += 1
        users_map[booking.user_id]['participants'] += int(booking.participants_count or 0)

    top_users = sorted(
        users_map.values(),
        key=lambda item: (-item['bookings'], item['name'])
    )[:10]
    max_user_bookings = max([item['bookings'] for item in top_users], default=0)
    for item in top_users:
        item['percent'] = percent(item['bookings'], max_user_bookings)

    return jsonify({
        'period': period,
        'periodTitle': period_title,
        'dateFrom': start_date.isoformat(),
        'dateTo': end_date.isoformat(),
        'summary': {
            'totalBookings': int(total_bookings),
            'totalParticipants': int(total_participants),
            'activeUsers': int(active_users),
            'averagePerDay': average_per_day,
            'averageDuration': int(average_duration),
            'utilizationPercent': utilization_percent,
            'cancelled': int(total_cancelled),
            'autoCancelled': int(auto_cancelled),
            'userCancelled': int(user_cancelled),
            'topRoom': top_room,
            'topHour': top_hour
        },
        'allRoomsTimeline': all_rooms_timeline,
        'roomStats': room_stats,
        'peakHours': peak_hours,
        'topUsers': top_users
    })

# ============================================
# АВТООСВОБОЖДЕНИЕ
# ============================================

def clear_expired_bookings():
    with app.app_context():
        now = dt_now()
        expired = Booking.query.filter(
            Booking.status == 'active',
            Booking.occupied_until < now
        ).all()
        
        for booking in expired:
            booking.status = 'ended'
            print(f'🔄 Автоосвобождение: комната {booking.room_id}')
        
        if expired:
            db.session.commit()
            print(f'🔄 Очищено {len(expired)} просроченных бронирований')

import threading
import time

def background_cleanup():
    while True:
        try:
            clear_expired_bookings()
        except Exception as e:
            print(f'⚠️ Ошибка: {e}')
        time.sleep(60)

threading.Thread(target=background_cleanup, daemon=True).start()

# ---------- ИСТОРИЯ БРОНИРОВАНИЙ ----------

@app.route('/api/bookings/history')
@login_required
def booking_history():
    """Получить историю бронирований текущего пользователя с фильтрацией"""
    filter_type = request.args.get('filter', 'all')
    now = dt_now()
    
    # Базовый запрос
    query = Booking.query.filter(Booking.user_id == current_user.id)
    
    # Применяем фильтр
    if filter_type == 'active':
        query = query.filter(
            Booking.status == 'active',
            Booking.occupied_until > now
        )
    elif filter_type == 'completed':
        query = query.filter(
            Booking.status == 'ended',
            Booking.occupied_until < now
        )
    elif filter_type == 'cancelled':
        query = query.filter(Booking.status == 'cancelled')
    # 'all' - показываем все
    
    bookings = query.order_by(Booking.booked_date.desc(), Booking.booked_time.desc()).all()
    
    result = []
    for booking in bookings:
        room = Room.query.get(booking.room_id)
        start_dt = datetime.combine(booking.booked_date, booking.booked_time)
        
        # Определяем статус для отображения
        display_status = booking.status
        if booking.status == 'active' and booking.occupied_until <= now:
            display_status = 'completed'
        
        # Безопасный парсинг participants
        participants = []
        if booking.participants:
            try:
                participants = json.loads(booking.participants)
                if not isinstance(participants, list):
                    participants = []
            except:
                participants = []
        
        result.append({
            'id': booking.id,
            'room_id': booking.room_id,
            'room_name': room.name if room else 'Удалённая комната',
            'room_number': room.number if room else None,
            'date': booking.booked_date.strftime('%Y-%m-%d'),
            'time': booking.booked_time.strftime('%H:%M'),
            'topic': booking.topic,
            'status': display_status,
            'participants_count': booking.participants_count or 1,
            'participants': participants,
            'occupied_until': booking.occupied_until.isoformat(),
            'checked_in': bool(booking.checked_in),
            'checked_in_at': booking.checked_in_at.isoformat() if booking.checked_in_at else None,
            'created_at': booking.created_at.isoformat() if booking.created_at else None
        })
    
    # Статистика по бронированиям
    total_bookings = Booking.query.filter(Booking.user_id == current_user.id).count()
    active_count = Booking.query.filter(
        Booking.user_id == current_user.id,
        Booking.status == 'active',
        Booking.occupied_until > now
    ).count()
    completed_count = Booking.query.filter(
        Booking.user_id == current_user.id,
        Booking.status == 'ended',
        Booking.occupied_until < now
    ).count()
    cancelled_count = Booking.query.filter(
        Booking.user_id == current_user.id,
        Booking.status == 'cancelled'
    ).count()
    
    return jsonify({
        'bookings': result,
        'stats': {
            'total': total_bookings,
            'active': active_count,
            'completed': completed_count,
            'cancelled': cancelled_count
        }
    })
@app.route("/history")
@login_required
def history_page():
    return render_template("history.html", server_time=dt_now().isoformat())

# ============================================
# ЗАПУСК
# ============================================
if __name__ == '__main__':
    print('\n' + '='*50)
    print('🏫 ШКОЛА 21 — БРОНИРОВАНИЕ ПЕРЕГОВОРНЫХ')
    print('='*50)
    print('📱 Откройте: http://localhost:5000')
    print('👤 Тестовый доступ:')
    print('   Email: student@21-school.ru')
    print('   Пароль: 12345')
    print('='*50 + '\n')
    # app.run(debug=True, host='0.0.0.0', port=5000)
    app.run(debug=True, host='127.0.0.1', port=5000)