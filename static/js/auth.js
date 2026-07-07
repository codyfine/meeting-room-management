// ============================================================
// АВТОРИЗАЦИЯ
// ============================================================

// ===== ВХОД =====
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    let valid = true;
    hideAllErrors();

    if (!email || !validateEmail(email)) {
        showFieldError('loginEmailError');
        valid = false;
    }
    if (!password || password.length < 1) {
        showFieldError('loginPasswordError');
        valid = false;
    }
    if (!valid) return;

    const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    if (data && data.success) {
        currentUser = data.user;
        closeModal();
        renderAuth();
        showToast(`👋 Добро пожаловать, ${currentUser.name}!`, 'success');
        if (typeof loadRooms === 'function') loadRooms();
    } else if (data) {
        showToast(`❌ ${data.error}`, 'error');
    }
}

// ===== РЕГИСТРАЦИЯ =====
async function handleRegister() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

    let valid = true;
    hideAllErrors();

    if (!name || !validateName(name)) {
        showFieldError('registerNameError');
        valid = false;
    }
    if (!email || !validateEmail(email)) {
        showFieldError('registerEmailError');
        valid = false;
    }
    if (!password || password.length < 4) {
        showFieldError('registerPasswordError');
        valid = false;
    }
    if (password !== passwordConfirm) {
        showFieldError('registerPasswordConfirmError');
        valid = false;
    }
    if (!valid) return;

    const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
    });

    if (data && data.success) {
        currentUser = data.user;
        closeModal();
        renderAuth();
        showToast(`🎉 Добро пожаловать, ${currentUser.name}!`, 'success');
        if (typeof loadRooms === 'function') loadRooms();
    } else if (data) {
        showToast(`❌ ${data.error}`, 'error');
    }
}

async function logout() {
    if (!confirm('Выйти из аккаунта?')) return;
    await apiFetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    renderAuth();
    closeProfile();
    window.location.href = '/';
}

function renderAuth() {
    const adminBtn = document.getElementById('adminBtn');
    const historyBtn = document.getElementById('historyBtn');

    if (currentUser) {
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('registerBtn').style.display = 'none';
        document.getElementById('profileBtn').style.display = 'flex';
        if (adminBtn) adminBtn.style.display = currentUser.is_admin ? 'inline-block' : 'none';
        if (historyBtn) historyBtn.style.display = 'inline-block';
        const first = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : '?';
        document.getElementById('profileInitials').textContent = first;
    } else {
        document.getElementById('loginBtn').style.display = 'inline-block';
        document.getElementById('registerBtn').style.display = 'inline-block';
        document.getElementById('profileBtn').style.display = 'none';
        if (adminBtn) adminBtn.style.display = 'none';
        if (historyBtn) historyBtn.style.display = 'none';
    }
}

function openModal(mode) {
    if (mode === 'profile') {
        if (!currentUser) {
            showToast('⚠️ Сначала войдите в систему', 'error');
            return;
        }
        document.getElementById('profileName').value = currentUser.name || '';
        document.getElementById('profileEmail').value = currentUser.email || '';
        document.getElementById('profileNameDisplay').textContent = currentUser.name || 'Пользователь';
        document.getElementById('profileModal').classList.add('active');
        return;
    }

    isLoginMode = mode === 'login';
    const modal = document.getElementById('authModal');
    const title = document.getElementById('modalTitle');
    const subtitle = document.getElementById('modalSubtitle');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const footerText = document.getElementById('formFooterText');
    const footerLink = document.getElementById('formFooterLink');

    if (isLoginMode) {
        title.textContent = '🔐 Вход';
        subtitle.textContent = 'Войдите в свой аккаунт';
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        footerText.textContent = 'Нет аккаунта?';
        footerLink.textContent = 'Зарегистрироваться';
    } else {
        title.textContent = '📝 Регистрация';
        subtitle.textContent = 'Создайте новый аккаунт';
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        footerText.textContent = 'Уже есть аккаунт?';
        footerLink.textContent = 'Войти';
    }

    document.querySelectorAll('#authModal input').forEach(inp => inp.value = '');
    document.querySelectorAll('#authModal .error-text').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('#authModal input').forEach(inp => inp.classList.remove('error'));
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('authModal').classList.remove('active');
}

function closeProfile() {
    document.getElementById('profileModal').classList.remove('active');
}

function switchAuthMode() {
    closeModal();
    setTimeout(() => openModal(isLoginMode ? 'register' : 'login'), 300);
}

// ===== ВАЛИДАЦИЯ =====
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateName(name) {
    // Имя должно содержать минимум 2 слова (Имя и Фамилия)
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 && parts.every(p => p.length >= 2);
}

function showFieldError(id) {
    document.getElementById(id).classList.add('show');
    const inputId = id.replace('Error', '');
    const input = document.getElementById(inputId);
    if (input) input.classList.add('error');
}

function hideFieldError(id) {
    document.getElementById(id).classList.remove('show');
    const inputId = id.replace('Error', '');
    const input = document.getElementById(inputId);
    if (input) input.classList.remove('error');
}

function hideAllErrors() {
    document.querySelectorAll('#authModal .error-text').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('#authModal input').forEach(el => el.classList.remove('error'));
}

// ===== ПРОФИЛЬ =====
async function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();

    if (!name || !validateName(name)) {
        showToast('⚠️ Введите корректное ФИО (Имя и Фамилия)', 'error');
        return;
    }
    if (!email || !validateEmail(email)) {
        showToast('⚠️ Введите корректный email', 'error');
        return;
    }

    // Здесь будет API обновления профиля
    currentUser.name = name;
    currentUser.email = email;
    renderAuth();
    closeProfile();
    showToast('✅ Профиль обновлён!', 'success');
}
