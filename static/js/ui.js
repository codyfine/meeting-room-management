// ============================================================
// ТЕМА
// ============================================================
function toggleTheme() {
    isDark = !isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.querySelector('.theme-toggle').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.querySelector('.theme-toggle').textContent = '☀️';
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// ============================================================
// ЗАКРЫТИЕ МОДАЛОК
// ============================================================
document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (document.getElementById('authModal').classList.contains('active')) {
            if (isLoginMode) handleLogin();
            else handleRegister();
        }
        if (document.getElementById('bookingModal').classList.contains('active')) {
            confirmBooking();
        }
    }
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
    }
});
