// ============================================================
// БРОНИРОВАНИЕ
// ============================================================
function openBooking(roomId, dateStr, timeStr) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const participantsInput = document.getElementById('bookingParticipants');
    participantsInput.max = room.capacity;
    participantsInput.value = Math.min(2, room.capacity);

    document.getElementById('participantsLabel').textContent =
                            `Количество человек (макс. ${room.capacity})`;

    pendingBooking = { roomId, dateStr, timeStr, roomName: room.name, capacity: room.capacity };

    document.getElementById('bookingInfo').textContent = `${room.name} — ${timeStr}`;
    document.getElementById('bookingDateDisplay').textContent = dateStr;
    document.getElementById('bookingTimeDisplay').textContent = timeStr;
    document.getElementById('bookingParticipants').value = 2;
    document.getElementById('bookingResponsible').value = currentUser?.name || '';

    const list = document.getElementById('participantsList');
    list.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'participant-row';
    row.innerHTML = `
        <input type="text" class="participant-input" placeholder="Фамилия Имя" value="${currentUser?.name || ''}">
        <button class="remove-btn" onclick="removeParticipant(this)">✕</button>
    `;
    list.appendChild(row);

    document.getElementById('participantMax').textContent = room.capacity;
    document.getElementById('participantCount').textContent = '1';

    document.getElementById('bookingModal').classList.add('active');
}

function closeBooking() {
    document.getElementById('bookingModal').classList.remove('active');
    pendingBooking = null;
}

function updateParticipants() {
    const max = pendingBooking.capacity;
    const input = document.getElementById('bookingParticipants');

    if (max < 1) { document.getElementById('bookingParticipants').value = 1; return; }
    if (input.value > max) {
        input.value = max;

        showToast(
        `⚠️ Максимум ${max} человек для этой переговорной`,
        'error'
        );
    }
    const list = document.getElementById('participantsList');
    const rows = list.querySelectorAll('.participant-row');
    const currentCount = rows.length;

    document.getElementById('participantMax').textContent = max;
    document.getElementById('participantCount').textContent = currentCount;

    if (currentCount > max) {
        for (let i = rows.length - 1; i >= max; i--) {
            rows[i].remove();
        }
        document.getElementById('participantCount').textContent = max;
    }
}

function addParticipant() {
    const max = parseInt(document.getElementById('bookingParticipants').value) || 2;
    const list = document.getElementById('participantsList');
    const currentCount = list.querySelectorAll('.participant-row').length;

    if (currentCount >= max) {
        showToast(`⚠️ Максимум ${max} участников`, 'error');
        return;
    }

    const room = rooms.find(
        r => r.id === pendingBooking.roomId
    );

    if (currentCount >= room.capacity) {
        showToast(
            `⚠️ Максимум ${room.capacity} участников`,
            'error'
        );
        return;
    }

    const row = document.createElement('div');
    row.className = 'participant-row';
    row.innerHTML = `
        <input type="text" class="participant-input" placeholder="Фамилия Имя">
        <button class="remove-btn" onclick="removeParticipant(this)">✕</button>
    `;
    list.appendChild(row);
    document.getElementById('participantCount').textContent = list.querySelectorAll('.participant-row').length;
}

function removeParticipant(btn) {
    const list = document.getElementById('participantsList');
    const rows = list.querySelectorAll('.participant-row');
    if (rows.length <= 1) {
        showToast('⚠️ Должен быть хотя бы один участник', 'error');
        return;
    }
    btn.closest('.participant-row').remove();
    document.getElementById('participantCount').textContent = list.querySelectorAll('.participant-row').length;
}

async function confirmBooking() {
    if (!pendingBooking) return;

    const participantsCount = parseInt(document.getElementById('bookingParticipants').value) || 2;
    const responsible = document.getElementById('bookingResponsible').value.trim();
    const participantInputs = document.querySelectorAll('.participant-input');
    const participants = [];

    participantInputs.forEach(inp => {
        const val = inp.value.trim();
        if (val) participants.push(val);
    });

    if (participants.length !== participantsCount) {
        showToast(`⚠️ Указано ${participantsCount} участников, в списке ${participants.length}`, 'error');
        return;
    }

    if (!responsible) {
        showToast('⚠️ Укажите ответственного', 'error');
        return;
    }

    const { roomId, dateStr, timeStr, roomName } = pendingBooking;

    const data = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
            room_id: roomId,
            date: dateStr,
            time: timeStr,
            participants_count: participantsCount,
            participants: participants
        })
    });

    if (data && data.success) {
        closeBooking();
        showToast(`✅ ${roomName} забронирована на ${timeStr}!`, 'success');
        loadRooms();
    } else if (data) {
        showToast(`❌ ${data.error}`, 'error');
    }
}

