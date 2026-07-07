// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let currentUser = null;
let isLoginMode = true;
let pendingBooking = null;
let isDark = localStorage.getItem('theme') === 'dark';

let rooms = [];
let selectedRoomId = 1;
let currentWeekOffset = 0;
let toastTimer = null;

// ============================================================
// API
// ============================================================
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        return await response.json();
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('❌ Ошибка соединения с сервером', 'error');
        return null;
    }
}

async function checkAuth() {
    const data = await apiFetch('/api/auth/me');
    if (data && data.authenticated) {
        currentUser = data.user;
        renderAuth();
        if (typeof loadRooms === 'function') loadRooms();
    } else {
        currentUser = null;
        renderAuth();
        if (typeof loadRooms === 'function') loadRooms();
    }
}

// ============================================================
// ПОЛУЧАЕМ СЕРВЕРНОЕ ВРЕМЯ
// ============================================================
const startServerTime = new Date(SERVER_TIME);
const startClientTime = Date.now();

function date_now() {
    const elapsed =
        Date.now() - startClientTime;
    return new Date(
        startServerTime.getTime() + elapsed
    );
}
