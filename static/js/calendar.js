
// ============================================================
// КОМНАТЫ (Получение данных с /api/rooms и /api/dashboard, затем отрисовка комнат)
// ============================================================
async function loadRooms() {
    const data = await apiFetch('/api/rooms');
    const dashboard_data = await apiFetch("/api/dashboard");
    
    if (data) {
        rooms = data;
        room_info = {};
        dashboard_data.rooms.forEach(r => {
            room_info[r.id] = r;
        });
        maxBookingDate = dashboard_data.maxBookingDate;
        renderRooms();
        if (document.getElementById('calendarPage').style.display !== 'none') {
            renderCalendar(selectedRoomId);
        }
    }
}

function getRoomFloor(roomNumber) {
    return roomNumber >= 1 && roomNumber <= 3 ? 2 : 3;
}

function createRoomCard(room, info) {
    const card = document.createElement('div');
    card.className = 'room-card';

    card.innerHTML = `
        <div class="room-number-circle">${room.number}</div>
        <div class="room-name">${room.name}</div>
        <div class="room-capacity">до ${room.capacity} человек</div>
    `;

    if (info.roomState === "OCCUPIED") {
        const presenceText = info.currentBooking.checkedIn
            ? '🟢 В комнате'
            : '🟡 Бронь без отметки';

        card.innerHTML += `
            <div class="room-status ${info.currentBooking.checkedIn ? 'occupied' : 'reserved'}">
                ${presenceText}
            </div>
            <div class="room-note">
                ${info.currentBooking.user}
                <br>
                ${info.currentBooking.start} – ${info.currentBooking.end}
                <br>
                Осталось ${info.currentBooking.remaining} мин
            </div>
        `;
    } else {
        const isNextBookingToday = info.nextBooking
            ? isToday(new Date(info.nextBooking.date))
            : false;

        card.innerHTML += `
            <div class="room-status free">
                ⚪ Свободно
            </div>
            ${
                isNextBookingToday
                    ? `<div class="room-note">
                        Следующая бронь
                        <br>
                        ${info.nextBooking.start}
                        <br>
                        ${info.nextBooking.user}
                    </div>`
                    : `<div class="room-note">
                        до конца дня
                    </div>`
            }
        `;
    }

    card.addEventListener('click', () => {
        selectedRoomId = room.id;
        currentWeekOffset = 0;
        showCalendar(room.id);
    });

    return card;
}

function renderRooms() {
    const container = document.getElementById('roomsGrid');
    container.className = 'rooms-by-floor';
    container.innerHTML = '';

    const floors = {
        2: rooms.filter(room => room.number >= 1 && room.number <= 3),
        3: rooms.filter(room => room.number >= 4 && room.number <= 7)
    };

    Object.entries(floors).forEach(([floor, floorRooms]) => {
        if (!floorRooms.length) return;

        const section = document.createElement('section');
        section.className = 'floor-section';

        section.innerHTML = `
            <div class="floor-header">
                <div>
                    <h2>${floor} этаж</h2>
                    <p>${floorRooms.length} переговорн${floorRooms.length === 1 ? 'ая' : 'ые'}</p>
                </div>
            </div>
            <div class="floor-rooms-grid"></div>
        `;

        const floorGrid = section.querySelector('.floor-rooms-grid');
        floorRooms.forEach(room => {
            const info = room_info[room.id];
            if (!info) return;
            floorGrid.appendChild(createRoomCard(room, info));
        });

        container.appendChild(section);
    });
}

// ============================================================
// КАЛЕНДАРЬ
// ============================================================
function showCalendar(roomId) {
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('calendarPage').style.display = 'block';

    const room = rooms.find(r => r.id === roomId);
    if (room) {
        document.getElementById('calendarRoomName').textContent = room.name;
        document.getElementById('calendarRoomCapacity').textContent = `до ${room.capacity} человек`;
    }

    renderCalendar(roomId);
}

function getWeekDates(offset) {
    const now = date_now();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff + offset * 7);
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
    }
    return dates;
}

function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDisplayDate(d) {
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`;
}

function formatWeekLabel(dates) {
    return `${formatDisplayDate(dates[0])}–${formatDisplayDate(dates[6])}`;
}

function getDayName(d) {
    return ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][d.getDay() === 0 ? 6 : d.getDay() - 1];
}

function isToday(d) {
    const today = date_now();
    return d.getDate() === today.getDate() &&
           d.getMonth() === today.getMonth() &&
           d.getFullYear() === today.getFullYear();
}

function isPastDate(d) {
    const today = date_now();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

function isPastHour(date, hour) {
    const now = date_now();
    const slotEnd = new Date(date);
    slotEnd.setHours(hour, 40, 0, 0); // Нельзя забронировать за 20 минут до конца текущего часа
    return slotEnd <= now;
}

function isCurrentHour(date, hour) {
    const now = date_now();
    const d = new Date(date);
    return d.toDateString() === now.toDateString()
        && hour === now.getHours();
}

function isBookableDate(date) {
    if (!maxBookingDate){
        console.log("ERROR: maxBookingDate не получено");
        return true;
    }
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const max = new Date(maxBookingDate);
    max.setHours(23, 59, 59, 999);
    return d <= max;
}

function renderCalendar(roomId) {
    const dates = getWeekDates(currentWeekOffset);
    document.getElementById('weekLabel').textContent = formatWeekLabel(dates);

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const hours = [];
    for (let h = 9; h <= 20; h++) hours.push(h);

    const roomBookings = {};
    if (room.bookings) {
        room.bookings.forEach(b => {
            if (!roomBookings[b.date]) roomBookings[b.date] = {};
            roomBookings[b.date][b.time] = b;
        });
    }

    dates.forEach((date) => {
        const column = document.createElement('div');
        column.className = 'day-column';
        if (isToday(date)) column.classList.add('today');

        const dateStr = formatDate(date);

        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-name';
        dayHeader.innerHTML = `${getDayName(date)}<span class="day-date">${formatDisplayDate(date)}</span>`;
        column.appendChild(dayHeader);

        hours.forEach(hour => {
            const timeStr = `${String(hour).padStart(2,'0')}:00`;
            const slot = document.createElement('div');
            
            const booking = roomBookings[dateStr]?.[timeStr];
            const isPast = isPastHour(date, hour);
            const isCurrent = isCurrentHour(date, hour);
            const isAvailableDate = isBookableDate(date);

            let state;

            if (booking && isPast)
                state = "completed";
            else if (booking)
                state = "booked";
            else if (isPast) // Проверка на прошедшую дату
                state = "past";
            else if (!isAvailableDate) //  Ограничение на будущее время
                state = "future";
            else
                state = "free";
                 
            switch(state) {
                case "completed": {
                    slot.className = 'time-slot time-slot-booked past';
                    const participants = booking.participants ? JSON.parse(booking.participants) : [];
                    slot.innerHTML = `
                        <span class="time">${hour}:00</span>
                        <span class="booked-info">
                            <div class="name">${booking.userName || 'Неизвестно'}</div>
                            <div class="details">${booking.checked_in ? '🟢 присутствует' : (booking.participants_count || 1) + ' чел.'}</div>
                        </span>
                    `;
                    slot.addEventListener('click', () => {
                        showBookingInfo(booking, dateStr, timeStr);
                    });
                } break;

                case "booked": {
                    slot.className = 'time-slot time-slot-booked';
                    const isMyBooking = currentUser && booking.userId === currentUser.id;
                    const participants = booking.participants ? JSON.parse(booking.participants) : [];
                    slot.innerHTML = `
                        <span class="time">${hour}:00</span>
                        <span class="booked-info">
                            <div class="name">${booking.userName || 'Неизвестно'}</div>
                            <div class="details">${booking.checked_in ? '🟢 присутствует' : (booking.participants_count || 1) + ' чел.'}</div>
                        </span>
                    `;
                    slot.addEventListener('click', () => {
                        if (isMyBooking) {
                            showBookingInfo(booking, dateStr, timeStr, true);
                        } else {
                            showBookingInfo(booking, dateStr, timeStr, false);
                        }
                    });
                } break;

                case "past":
                    slot.className = 'time-slot time-slot-free past';
                    slot.innerHTML = `
                        <span class="time">${hour}:00</span>
                        <span class="status-label">Прошло</span>
                    `;
                    break;

                case "future":
                    slot.className = 'time-slot time-slot-free past';
                    slot.innerHTML = `
                        <span class="time">${hour}:00</span>
                        <span class="status-label">Недоступно</span>
                    `;
                    break;

                case "free":
                    slot.className = 'time-slot time-slot-free';
                    slot.innerHTML = `
                        <span class="time">${hour}:00</span>
                        <span class="status-label">Свободно</span>
                    `;
                    slot.addEventListener('click', () => {
                    if (!currentUser) {
                        showToast('⚠️ Сначала войдите в систему', 'error');
                        return;
                    }
                    openBooking(roomId, dateStr, timeStr);
                    });
                    break;
                }

                if (isCurrent) slot.classList.add("current-hour");

            column.appendChild(slot);
        });

        grid.appendChild(column);
    });
}
// ============================================================
// НАВИГАЦИЯ ДЛЯ КАЛЕНДАРЯ
// ============================================================
function goBack() {
    document.getElementById('calendarPage').style.display = 'none';
    document.getElementById('mainPage').style.display = 'block';
}

function goHome() { goBack(); }

function changeWeek(delta) {
    currentWeekOffset += delta;
    renderCalendar(selectedRoomId);
}

function resetWeek() {
    currentWeekOffset = 0;
    renderCalendar(selectedRoomId);
}
// ============================================================
// ИНФОРМАЦИЯ О БРОНИРОВАНИИ + ОТМЕНА
// ============================================================
function showBookingInfo(booking, dateStr, timeStr, isMyBooking = false) {
    let participantsText = 'Не указаны';
    if (booking.participants) {
        try {
            const parts = typeof booking.participants === 'string' ? JSON.parse(booking.participants) : booking.participants;
            if (Array.isArray(parts) && parts.length > 0) {
                participantsText = parts.join(', ');
            }
        } catch(e) {
            participantsText = booking.participants || 'Не указаны';
        }
    }
    
    let actionsHtml = '';
    if (isMyBooking && booking.status !== 'cancelled') {
        const checkInHtml = booking.checked_in
            ? `<div class="checkin-success">🟢 Присутствие подтверждено</div>`
            : `<div class="checkin-box">
                <label>Код комнаты</label>
                <div class="checkin-row">
                    <input type="text" id="checkInCode" placeholder="Введите код с листка" autocomplete="off">
                    <button class="btn-submit checkin-btn" onclick="checkInBooking(${booking.id})">Отметиться</button>
                </div>
            </div>`;

        actionsHtml = `
            ${checkInHtml}
            <button class="btn-submit" style="background:#ff6b6b;margin-top:12px;" onclick="cancelMyBooking(${booking.id})">
                ❌ Отменить бронирование
            </button>
        `;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'bookingInfoModal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>📋 Информация о бронировании</h2>
            <div style="margin:16px 0;">
                <div class="booking-summary">
                    <div class="row"><span class="label">👤 Забронировал</span><span class="value">${booking.userName || 'Неизвестно'}</span></div>
                    <div class="row"><span class="label">👥 Участников</span><span class="value">${booking.participants_count || 1} чел.</span></div>
                    <div class="row"><span class="label">📍 Присутствие</span><span class="value">${booking.checked_in ? 'Подтверждено' : 'Не подтверждено'}</span></div>
                </div>
                ${actionsHtml}
            </div>
            <button class="btn-close" onclick="closeBookingInfo()">Закрыть</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeBookingInfo() {
    const modal = document.getElementById('bookingInfoModal');
    if (modal) modal.remove();
}

async function checkInBooking(bookingId) {
    const input = document.getElementById('checkInCode');
    const code = input ? input.value.trim() : '';

    if (!code) {
        showToast('⚠️ Введите код комнаты', 'error');
        return;
    }

    const data = await apiFetch(`/api/bookings/${bookingId}/check-in`, {
        method: 'POST',
        body: JSON.stringify({ code })
    });

    if (data && data.success) {
        closeBookingInfo();
        showToast('✅ Присутствие подтверждено', 'success');
        await loadRooms();
        if (document.getElementById('calendarPage').style.display !== 'none') {
            renderCalendar(selectedRoomId);
        }
    } else if (data) {
        showToast(`❌ ${data.error}`, 'error');
    }
}

// ===== ОТМЕНА БРОНИРОВАНИЯ =====
async function cancelMyBooking(bookingId) {
    if (!bookingId) {
        showToast('❌ Не удалось определить ID бронирования', 'error');
        return;
    }
    
    if (!confirm('Вы уверены, что хотите отменить это бронирование?')) return;
    
    const data = await apiFetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'PUT'
    });
    
    if (data && data.success) {
        closeBookingInfo();
        showToast('✅ Бронирование отменено', 'success');
        // Обновляем данные
        await loadRooms();
        if (document.getElementById('calendarPage').style.display !== 'none') {
            renderCalendar(selectedRoomId);
        }
    } else if (data) {
        showToast(`❌ ${data.error}`, 'error');
    }
}

