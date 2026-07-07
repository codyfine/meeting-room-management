// ============================================================
// АДМИН-ПАНЕЛЬ: расширенная статистика
// ============================================================

let currentAdminPeriod = 'week';
let customAdminDateFrom = '';
let customAdminDateTo = '';

function setAdminPeriod(period) {
    currentAdminPeriod = period;
    customAdminDateFrom = '';
    customAdminDateTo = '';

    document.querySelectorAll('.admin-period-btn[data-period]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });

    loadAdminStats();
}

function applyCustomAdminPeriod() {
    const dateFrom = document.getElementById('adminDateFrom').value;
    const dateTo = document.getElementById('adminDateTo').value;

    if (!dateFrom || !dateTo) {
        showToast('Выберите дату начала и дату окончания', 'error');
        return;
    }

    if (dateFrom > dateTo) {
        showToast('Дата начала не может быть позже даты окончания', 'error');
        return;
    }

    currentAdminPeriod = 'custom';
    customAdminDateFrom = dateFrom;
    customAdminDateTo = dateTo;

    document.querySelectorAll('.admin-period-btn[data-period]').forEach(btn => {
        btn.classList.remove('active');
    });

    loadAdminStats();
}

async function loadAdminStats() {
    let url = `/api/admin/visits?period=${currentAdminPeriod}`;

    if (currentAdminPeriod === 'custom') {
        url += `&date_from=${encodeURIComponent(customAdminDateFrom)}&date_to=${encodeURIComponent(customAdminDateTo)}`;
    }

    const data = await apiFetch(url);

    if (!data || data.error) {
        showToast(data?.error || 'Не удалось загрузить статистику', 'error');
        return;
    }

    document.getElementById('adminPeriodTitle').textContent = data.periodTitle;
    document.getElementById('adminPeriodDates').textContent = `${formatDateRu(data.dateFrom)} — ${formatDateRu(data.dateTo)}`;
    document.getElementById('adminTotalBookings').textContent = data.summary.totalBookings;
    document.getElementById('adminActiveUsers').textContent = data.summary.activeUsers;
    document.getElementById('adminUtilization').textContent = `${data.summary.utilizationPercent}%`;
    document.getElementById('adminTopRoom').textContent = formatTopRoom(data.summary.topRoom);
    document.getElementById('adminTopHour').textContent = formatTopHour(data.summary.topHour);
    document.getElementById('adminAverageDuration').textContent = `${data.summary.averageDuration} мин`;
    document.getElementById('adminCancelled').textContent = data.summary.cancelled;
    document.getElementById('adminCancelledDetails').textContent = `авто: ${data.summary.autoCancelled}, вручную: ${data.summary.userCancelled}`;

    renderTimelineStats('allRoomsStats', data.allRoomsTimeline);
    renderRoomStats('roomStats', data.roomStats);
    renderPeakHours('peakHoursStats', data.peakHours);
    renderTopUsers('topUsersStats', data.topUsers);
    renderRoomTable(data.roomStats);
}

function formatDateRu(value) {
    if (!value) return '—';
    const date = new Date(value);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatTopRoom(room) {
    if (!room) return 'Нет данных';
    return `№${room.number} — ${room.bookings} броней`;
}

function formatTopHour(hour) {
    if (!hour) return 'Нет данных';
    return `${hour.label} — ${hour.bookings} броней`;
}

function renderTimelineStats(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-stats">Нет данных</div>';
        return;
    }

    items.forEach(item => {
        container.appendChild(createTimelineRow(item, 0));
    });
}

function getTimelineChildren(item) {
    if (item.type === 'year' && Array.isArray(item.months)) return item.months;
    if (item.type === 'month' && Array.isArray(item.days)) return item.days;
    return [];
}

function createTimelineRow(item, level = 0) {
    const row = document.createElement('div');
    const children = getTimelineChildren(item);
    const isExpandable = children.length > 0;

    row.className = `stats-row timeline-row timeline-level-${level} ${isExpandable ? 'stats-row-expandable' : ''}`;

    const labelPrefix = isExpandable ? '<span class="stats-arrow">›</span>' : '';
    row.innerHTML = `
        <div class="stats-row-header ${isExpandable ? 'stats-row-toggle' : ''}">
            <span>${labelPrefix}${item.label}</span>
            <strong>${item.bookings} броней</strong>
        </div>
        <div class="stats-bar">
            <div class="stats-bar-fill" style="width:${item.percent || 0}%"></div>
        </div>
        <div class="stats-meta">Посетителей: ${item.participants}</div>
    `;

    if (isExpandable) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'stats-children';

        children.forEach(child => {
            childrenContainer.appendChild(createTimelineRow(child, level + 1));
        });

        row.appendChild(childrenContainer);

        row.querySelector('.stats-row-toggle').addEventListener('click', (event) => {
            event.stopPropagation();
            row.classList.toggle('expanded');
        });
    }

    return row;
}

function renderRoomStats(containerId, rooms) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        container.innerHTML = '<div class="empty-stats">Нет данных</div>';
        return;
    }

    const sortedRooms = [...rooms].sort((a, b) => b.bookings - a.bookings || a.number - b.number);

    sortedRooms.forEach((room, index) => {
        const row = document.createElement('div');
        row.className = 'stats-row room-stats-row';
        row.innerHTML = `
            <div class="stats-row-header">
                <span>${index === 0 && room.bookings > 0 ? '🏆 ' : ''}№${room.number} — ${room.name}</span>
                <strong>${room.bookings} броней</strong>
            </div>
            <div class="stats-bar">
                <div class="stats-bar-fill" style="width:${room.percent}%"></div>
            </div>
            <div class="stats-meta">Загрузка: ${room.utilization}% · Посетителей: ${room.participants}</div>
        `;
        container.appendChild(row);
    });
}

function renderPeakHours(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-stats">Нет данных</div>';
        return;
    }

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'stats-row';
        row.innerHTML = `
            <div class="stats-row-header">
                <span>${item.label}</span>
                <strong>${item.bookings}</strong>
            </div>
            <div class="stats-bar">
                <div class="stats-bar-fill" style="width:${item.percent}%"></div>
            </div>
        `;
        container.appendChild(row);
    });
}

function renderTopUsers(containerId, users) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (!users || users.length === 0) {
        container.innerHTML = '<div class="empty-stats">Нет данных</div>';
        return;
    }

    users.forEach((user, index) => {
        const row = document.createElement('div');
        row.className = 'stats-row';
        row.innerHTML = `
            <div class="stats-row-header">
                <span>${index + 1}. ${user.name}</span>
                <strong>${user.bookings} броней</strong>
            </div>
            <div class="stats-bar">
                <div class="stats-bar-fill" style="width:${user.percent}%"></div>
            </div>
            <div class="stats-meta">Посетителей в его бронях: ${user.participants}</div>
        `;
        container.appendChild(row);
    });
}

function renderRoomTable(rooms) {
    const tbody = document.getElementById('roomTableBody');
    tbody.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Нет данных</td></tr>';
        return;
    }

    const sortedRooms = [...rooms].sort((a, b) => a.number - b.number);

    sortedRooms.forEach(room => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>№${room.number} — ${room.name}</td>
            <td>${room.bookings}</td>
            <td>${room.utilization}%</td>
            <td>${room.participants}</td>
            <td>${room.uniqueUsers}</td>
            <td>${room.averageDuration} мин</td>
            <td>${room.cancelled}</td>
            <td>${room.lastBooking}</td>
        `;
        tbody.appendChild(tr);
    });
}

document.addEventListener('DOMContentLoaded', loadAdminStats);
