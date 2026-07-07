async function loadDashboard() {
    try {
        const data = await apiFetch("/api/dashboard");
        
        updateSummary(data.summary);
        renderRooms(data.rooms);
    }
    catch(err){
        showToast("Не удалось загрузить данные", "error");
    }

}

// Часы
function updateClock() {
    const now = date_now();

    document.getElementById("currentClock").textContent =
        now.toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

}

// Статистика
function updateSummary(summary) {
    document.getElementById("busyCount").textContent = summary.occupied;
    document.getElementById("freeCount").textContent = summary.free;
}

// Отрисовка карточек
function getDashboardRoomFloor(roomName) {
    const match = String(roomName).match(/\d+/);
    const number = match ? parseInt(match[0], 10) : 0;
    return number >= 1 && number <= 3 ? 2 : 3;
}

function createDashboardRoomCard(room) {
    const card = document.createElement("div");
    card.className = "dashboard-card " + room.status;

    if (room.status === "occupied") {
        card.innerHTML = `
            <div class="room-title">${room.name}</div>
            <div class="room-status ${room.physicalPresent ? 'occupied' : 'reserved'}">${room.physicalPresent ? '🟢 Физически занята' : '🟡 Бронь без отметки'}</div>
            <div class="room-user">${room.user}</div>
            <div class="room-time">${room.start} – ${room.end}</div>
            <div class="room-remaining">Осталось ${room.remaining} мин</div>
        `;
    } else {
        card.innerHTML = `
            <div class="room-title">${room.name}</div>
            <div class="room-status free">⚪ Свободна</div>
            ${
                room.nextBooking
                    ? `<div class="next-booking">
                        Следующая бронь
                        <br>
                        ${room.nextBooking}
                        <br>
                        ${room.nextUser}
                    </div>`
                    : `<div class="next-booking">
                        До конца дня свободна
                    </div>`
            }
        `;
    }

    return card;
}

function renderRooms(rooms) {
    updateSummary(rooms);

    const container = document.getElementById("roomsGrid");
    container.className = "rooms-by-floor";
    container.innerHTML = "";

    const floors = {
        2: rooms.filter(room => getDashboardRoomFloor(room.name) === 2),
        3: rooms.filter(room => getDashboardRoomFloor(room.name) === 3)
    };

    Object.entries(floors).forEach(([floor, floorRooms]) => {
        if (!floorRooms.length) return;

        const section = document.createElement("section");
        section.className = "floor-section";
        section.innerHTML = `
            <div class="floor-header">
                <div>
                    <h2>${floor} этаж</h2>
                    <p>${floorRooms.length} переговорн${floorRooms.length === 1 ? 'ая' : 'ые'}</p>
                </div>
            </div>
            <div class="floor-rooms-grid"></div>
        `;

        const floorGrid = section.querySelector(".floor-rooms-grid");
        floorRooms.forEach(room => floorGrid.appendChild(createDashboardRoomCard(room)));
        container.appendChild(section);
    });
}

// Запуск
document.addEventListener("DOMContentLoaded", ()=>{

    updateClock();

    loadDashboard();

    setInterval(updateClock,1000);

    setInterval(loadDashboard,30000);

});