// ─────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ipt_demo_v1';

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            window.db = JSON.parse(raw);
            return;
        }
    } catch (e) {
        console.warn('Storage corrupt, reseeding...', e);
    }
    window.db = {
        accounts: [{
            id:        1,
            firstName: 'Admin',
            lastName:  'User',
            email:     'admin@example.com',
            password:  'Password123!',
            role:      'admin',
            verified:  true,
            createdAt: new Date().toISOString()
        }],
        departments: [
            { id: 1, name: 'Engineering', description: 'Software team',   createdAt: new Date().toISOString() },
            { id: 2, name: 'HR',          description: 'Human Resources', createdAt: new Date().toISOString() }
        ],
        employees: [],
        requests:  []
    };
    saveToStorage();
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(window.db));
    } catch (e) {
        console.error('Failed to save:', e);
    }
}

const API_BASE_URL = 'http://localhost:3000/api';

function getAuthToken() {
    return sessionStorage.getItem('authToken');
}

function setAuthToken(token) {
    if (token) {
        sessionStorage.setItem('authToken', token);
    } else {
        sessionStorage.removeItem('authToken');
    }
}

function getAuthHeader() {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function decodeJwt(token) {
    try {
        const [header, payload] = token.split('.');
        if (!payload) return null;
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(atob(base64).split('').map(c => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join(''));
        return JSON.parse(json);
    } catch (err) {
        return null;
    }
}

function updateRoleUI(user) {
    const role = user?.role;

    if (role === 'admin') {
        document.body.classList.add('is-admin');
        document.body.classList.remove('is-user');
    } else if (role === 'user') {
        document.body.classList.add('is-user');
        document.body.classList.remove('is-admin');
    } else {
        document.body.classList.remove('is-admin', 'is-user');
    }

    document.querySelectorAll('.role-admin').forEach(el => {
        el.style.display = role === 'admin' ? '' : 'none';
    });
    document.querySelectorAll('.role-user').forEach(el => {
        el.style.display = role === 'user' ? '' : 'none';
    });
}

async function apiFetch(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
        ...options.headers
    };

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers
    });

    let data;
    try {
        data = await response.json();
    } catch (_err) {
        data = {};
    }

    if (!response.ok) {
        const msg = data.error || `API error ${response.status}`;
        throw new Error(msg);
    }
    return data;
}

async function initializeAuth() {
    const token = getAuthToken();
    if (!token) {
        setAuthState(null);
        return;
    }

    let user = null;
    try {
        const data = await apiFetch('/profile', { method: 'GET' });
        user = data.user;
    } catch (err) {
        const payload = decodeJwt(token);
        if (payload) {
            user = { email: payload.email || payload.username, role: payload.role };
        }
    }

    if (user && user.role) {
        setAuthState(user);
    } else {
        setAuthToken(null);
        setAuthState(null);
    }
}

// ─────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const id        = 'toast-' + Date.now();
    const colorMap  = {
        success: 'bg-success',
        danger:  'bg-danger',
        warning: 'bg-warning text-dark',
        info:    'bg-info text-dark'
    };
    const bgClass = colorMap[type] || 'bg-success';

    const toastEl = document.createElement('div');
    toastEl.id        = id;
    toastEl.className = `toast align-items-center text-white ${bgClass} border-0 mb-2`;
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body fw-semibold">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>`;

    container.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// ─────────────────────────────────────────────────────────────
// AUTH STATE
// ─────────────────────────────────────────────────────────────
let currentUser = null;

function setAuthState(user) {
    currentUser = user;
    if (!user) {
        document.body.classList.remove('authenticated', 'is-admin', 'is-user');
        document.body.classList.add('not-authenticated');
        document.getElementById('nav-username').textContent = 'Username';
        updateRoleUI(null);
    } else {
        document.body.classList.remove('not-authenticated');
        document.body.classList.add('authenticated');

        const displayName = user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email || user.username || 'User';

        document.getElementById('nav-username').textContent = displayName;

        updateRoleUI(user);
    }
}

async function loadAdminDashboard() {
    try {
        const data = await apiFetch('/admin/dashboard', { method: 'GET' });
        showToast(`Admin API: ${data.message}`, 'success');
    } catch (err) {
        showToast(`Admin API error: ${err.message}`, 'danger');
    }
}

// ─────────────────────────────────────────────────────────────
// ROUTER — maps hash → { pageId, render, guards }
// ─────────────────────────────────────────────────────────────
const router = {
    routes: {
        '/':               { pageId: 'page-home' },
        '/register':       { pageId: 'page-register' },
        '/verify-email':   { pageId: 'page-verify-email' },
        '/login':          { pageId: 'page-login' },
        '/profile':        { pageId: 'page-profile',        render: renderProfile,       auth: true },
        '/employees':      { pageId: 'page-employees',      render: renderEmployees,     auth: true, adminOnly: true },
        '/accounts':       { pageId: 'page-accounts',       render: renderAccounts,      auth: true, adminOnly: true },
        '/departments':    { pageId: 'page-departments',    render: renderDepartments,   auth: true, adminOnly: true },
        '/admin-requests': { pageId: 'page-admin-requests', render: renderAdminRequests, auth: true, adminOnly: true },
        '/my-requests':    { pageId: 'page-my-requests',    render: renderRequests,      auth: true, userOnly: true },
    },

    navigateTo(hash) {
        window.location.hash = hash;
    },

    handleRouting() {
        const hash  = window.location.hash.replace('#', '') || '/';
        const route = this.routes[hash];

        if (!route) {
            this.navigateTo('#/');
            return;
        }
        
        if (hash === '/verify-email' && !localStorage.getItem('unverified_email')) {
            this.navigateTo('#/register');
            return;
        }
        
        if (currentUser && ['/', '/login', '/register'].includes(hash)) {
            this.navigateTo('#/profile');
            return;
        }

        if (route.auth && !currentUser) {
            this.navigateTo('#/login');
            return;
        }

        // Admin only
        if (route.adminOnly && currentUser?.role !== 'admin') {
            showToast('Access denied. Admins only.', 'danger');
            this.navigateTo('#/profile');
            return;
        }

        // User only
        if (route.userOnly && currentUser?.role === 'admin') {
            showToast('Admins manage requests from the Requests page.', 'info');
            this.navigateTo('#/admin-requests');
            return;
        }

        // Page-specific setup
        if (hash === '/verify-email') {
            document.getElementById('verify-email-display').textContent =
                localStorage.getItem('unverified_email') || '';
        }

        if (hash === '/login') {
            document.getElementById('login-error').classList.add('d-none');
            document.getElementById('login-success').classList.add('d-none');
        }

        if (hash === '/admin-requests') {
            loadAdminDashboard();
        }

        // Run renderer if defined
        if (route.render) route.render();

        // Show page
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(route.pageId);
        if (el) el.classList.add('active');
    }
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function showFieldError(el, msg) {
    el.textContent = msg;
    el.classList.remove('d-none');
}

function hideFieldError(el) {
    el.classList.add('d-none');
    el.textContent = '';
}

function setInvalid(input) {
    input.classList.add('is-invalid');
}

function clearInvalid(input) {
    input.classList.remove('is-invalid');
}

// ─────────────────────────────────────────────────────────────
// REGISTRATION
// ─────────────────────────────────────────────────────────────
async function handleRegister() {
    const firstNameEl = document.getElementById('reg-firstname');
    const lastNameEl  = document.getElementById('reg-lastname');
    const emailEl     = document.getElementById('reg-email');
    const passwordEl  = document.getElementById('reg-password');
    const errorBox    = document.getElementById('register-error');

    [firstNameEl, lastNameEl, emailEl, passwordEl].forEach(clearInvalid);
    hideFieldError(errorBox);

    const firstName = firstNameEl.value.trim();
    const lastName  = lastNameEl.value.trim();
    const email     = emailEl.value.trim().toLowerCase();
    const password  = passwordEl.value;

    let valid = true;
    if (!firstName) { setInvalid(firstNameEl); valid = false; }
    if (!lastName)  { setInvalid(lastNameEl);  valid = false; }
    if (!email)     { setInvalid(emailEl);     valid = false; }
    if (!password)  { setInvalid(passwordEl);  valid = false; }

    if (!valid) {
        showFieldError(errorBox, 'All fields are required.');
        return;
    }
    if (password.length < 6) {
        setInvalid(passwordEl);
        showFieldError(errorBox, 'Password must be at least 6 characters.');
        return;
    }

    try {
        await apiFetch('/register', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        showToast('Account created! Please login.', 'success');
        router.navigateTo('#/login');
    } catch (err) {
        const errMsg = err.message || 'Registration failed';
        showFieldError(errorBox, errMsg);
    }
}

// ─────────────────────────────────────────────────────────────
// EMAIL VERIFICATION
// ─────────────────────────────────────────────────────────────
function handleVerify() {
    const email   = localStorage.getItem('unverified_email');
    const account = window.db.accounts.find(acc => acc.email === email);
    if (!account) {
        showToast('No pending account found. Please register again.', 'danger');
        router.navigateTo('#/register');
        return;
    }
    account.verified = true;
    saveToStorage();
    localStorage.removeItem('unverified_email');
    showToast('Email verified! You may now log in.', 'success');
    router.navigateTo('#/login');

    // Show success on login page
    const loginSuccess = document.getElementById('login-success');
    loginSuccess.textContent = '✅ Email verified! You may now log in.';
    loginSuccess.classList.remove('d-none');
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
async function handleLogin() {
    const emailEl    = document.getElementById('login-email');
    const passwordEl = document.getElementById('login-password');
    const errorBox   = document.getElementById('login-error');

    [emailEl, passwordEl].forEach(clearInvalid);
    hideFieldError(errorBox);

    const email    = emailEl.value.trim().toLowerCase();
    const password = passwordEl.value;

    if (!email || !password) {
        if (!email)    setInvalid(emailEl);
        if (!password) setInvalid(passwordEl);
        showFieldError(errorBox, 'Email and password are required.');
        return;
    }

    try {
        const data = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ email, username: email, password })
        });

        setAuthToken(data.token);

        const user = {
            email: data.user.email,
            role: data.user.role,
            firstName: data.user.firstName || data.user.email.split('@')[0],
            lastName: data.user.lastName || ''
        };

        setAuthState(user);
        showToast(`Welcome back, ${user.email}!`, 'success');
        router.navigateTo('#/profile');
    } catch (err) {
        const msg = err.message || 'Login failed';
        showFieldError(errorBox, msg);
    }
}

// ─────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────
function handleLogout() {
    setAuthToken(null);
    localStorage.removeItem('token');
    setAuthState(null);
    showToast('You have been logged out.', 'info');
    router.navigateTo('#/');
}

// ─────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────
function renderProfile() {
    if (!currentUser) return;
    document.getElementById('profile-name').textContent  = currentUser.firstName + ' ' + currentUser.lastName;
    document.getElementById('profile-email').textContent = currentUser.email;
    const roleEl = document.getElementById('profile-role');
    roleEl.textContent  = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    roleEl.className    = `badge ${currentUser.role === 'admin' ? 'bg-danger' : 'bg-primary'}`;
}

function toggleEditProfile() {
    const form = document.getElementById('profile-edit-form');
    form.classList.toggle('d-none');
    if (!form.classList.contains('d-none')) {
        document.getElementById('edit-firstname').value = currentUser.firstName;
        document.getElementById('edit-lastname').value  = currentUser.lastName;
        document.getElementById('edit-password').value  = '';
        hideFieldError(document.getElementById('profile-error'));
        hideFieldError(document.getElementById('profile-success'));
    }
}

function handleSaveProfile() {
    const firstName  = document.getElementById('edit-firstname').value.trim();
    const lastName   = document.getElementById('edit-lastname').value.trim();
    const password   = document.getElementById('edit-password').value;
    const errorBox   = document.getElementById('profile-error');
    const successBox = document.getElementById('profile-success');

    hideFieldError(errorBox);
    hideFieldError(successBox);

    if (!firstName || !lastName) {
        showFieldError(errorBox, 'First and last name are required.');
        return;
    }
    if (password && password.length < 6) {
        showFieldError(errorBox, 'Password must be at least 6 characters.');
        return;
    }

    const account     = window.db.accounts.find(acc => acc.email === currentUser.email);
    account.firstName = firstName;
    account.lastName  = lastName;
    if (password) account.password = password;

    saveToStorage();
    setAuthState(account);
    renderProfile();
    showToast('Profile updated successfully!', 'success');
    document.getElementById('profile-edit-form').classList.add('d-none');
}

// ─────────────────────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────────────────────
function renderEmployees() {
    const tbody     = document.getElementById('employees-tbody');
    const employees = window.db.employees || [];

    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No employees yet.</td></tr>';
        return;
    }

    tbody.innerHTML = employees.map(emp => {
        const dept = (window.db.departments || []).find(d => d.id == emp.departmentId);
        return `<tr>
            <td>${emp.empId}</td>
            <td>${emp.email}</td>
            <td>${emp.position}</td>
            <td>${dept ? dept.name : '—'}</td>
            <td>${emp.hireDate || '—'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" data-action="edit-employee" data-id="${emp.id}">Edit</button>
                <button class="btn btn-sm btn-outline-danger" data-action="delete-employee" data-id="${emp.id}">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

function populateDepartmentDropdown() {
    const select = document.getElementById('emp-department');
    select.innerHTML = (window.db.departments || []).map(d =>
        `<option value="${d.id}">${d.name}</option>`
    ).join('');
}

function showEmployeeForm(emp = null) {
    document.getElementById('emp-editing-id').value = emp ? emp.id : '';
    document.getElementById('emp-id').value         = emp ? emp.empId : '';
    document.getElementById('emp-email').value      = emp ? emp.email : '';
    document.getElementById('emp-position').value   = emp ? emp.position : '';
    document.getElementById('emp-hiredate').value   = emp ? emp.hireDate : '';
    hideFieldError(document.getElementById('employee-error'));
    populateDepartmentDropdown();
    if (emp) document.getElementById('emp-department').value = emp.departmentId;
    document.getElementById('employee-form').classList.remove('d-none');
}

function handleSaveEmployee() {
    const editingId = document.getElementById('emp-editing-id').value;
    const empId     = document.getElementById('emp-id').value.trim();
    const email     = document.getElementById('emp-email').value.trim().toLowerCase();
    const position  = document.getElementById('emp-position').value.trim();
    const deptId    = document.getElementById('emp-department').value;
    const hireDate  = document.getElementById('emp-hiredate').value;
    const errorBox  = document.getElementById('employee-error');

    hideFieldError(errorBox);

    if (!empId || !email || !position || !deptId || !hireDate) {
        showFieldError(errorBox, 'All fields are required.');
        return;
    }

    // Validate email matches existing account
    const userExists = window.db.accounts.find(a => a.email === email);
    if (!userExists) {
        showFieldError(errorBox, 'No account found with that email. Create an account first.');
        return;
    }

    if (editingId) {
        const emp        = window.db.employees.find(e => e.id == editingId);
        emp.empId        = empId;
        emp.email        = email;
        emp.position     = position;
        emp.departmentId = deptId;
        emp.hireDate     = hireDate;
        showToast('Employee updated.', 'success');
    } else {
        window.db.employees.push({
            id: Date.now(), empId, email, position,
            departmentId: deptId, hireDate, createdAt: new Date().toISOString()
        });
        showToast('Employee added.', 'success');
    }

    saveToStorage();
    document.getElementById('employee-form').classList.add('d-none');
    renderEmployees();
}

// ─────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────
function renderAccounts() {
    const tbody    = document.getElementById('accounts-tbody');
    const accounts = window.db.accounts || [];

    tbody.innerHTML = accounts.map(acc => `
        <tr>
            <td>${acc.firstName} ${acc.lastName}</td>
            <td>${acc.email}</td>
            <td><span class="badge ${acc.role === 'admin' ? 'bg-danger' : 'bg-primary'}">${acc.role}</span></td>
            <td>${acc.verified ? '✅' : '❌'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" data-action="edit-account" data-id="${acc.id}">Edit</button>
                <button class="btn btn-sm btn-outline-warning me-1" data-action="reset-password" data-id="${acc.id}">Reset PW</button>
                <button class="btn btn-sm btn-outline-danger" data-action="delete-account" data-id="${acc.id}">Delete</button>
            </td>
        </tr>
    `).join('');
}

function showAccountForm(acc = null) {
    document.getElementById('acc-editing-id').value = acc ? acc.id : '';
    document.getElementById('acc-firstname').value  = acc ? acc.firstName : '';
    document.getElementById('acc-lastname').value   = acc ? acc.lastName : '';
    document.getElementById('acc-email').value      = acc ? acc.email : '';
    document.getElementById('acc-password').value   = '';
    document.getElementById('acc-role').value       = acc ? acc.role : 'user';
    document.getElementById('acc-verified').checked = acc ? acc.verified : false;
    hideFieldError(document.getElementById('account-error'));
    document.getElementById('account-form').classList.remove('d-none');
}

function handleSaveAccount() {
    const editingId = document.getElementById('acc-editing-id').value;
    const firstName = document.getElementById('acc-firstname').value.trim();
    const lastName  = document.getElementById('acc-lastname').value.trim();
    const email     = document.getElementById('acc-email').value.trim().toLowerCase();
    const password  = document.getElementById('acc-password').value;
    const role      = document.getElementById('acc-role').value;
    const verified  = document.getElementById('acc-verified').checked;
    const errorBox  = document.getElementById('account-error');

    hideFieldError(errorBox);

    if (!firstName || !lastName || !email) {
        showFieldError(errorBox, 'First name, last name, and email are required.');
        return;
    }

    if (editingId) {
        const acc     = window.db.accounts.find(a => a.id == editingId);
        acc.firstName = firstName;
        acc.lastName  = lastName;
        acc.email     = email;
        acc.role      = role;
        acc.verified  = verified;
        if (password) acc.password = password;
        showToast('Account updated.', 'success');
    } else {
        if (!password || password.length < 6) {
            showFieldError(errorBox, 'Password must be at least 6 characters.');
            return;
        }
        if (window.db.accounts.find(a => a.email === email)) {
            showFieldError(errorBox, 'An account with that email already exists.');
            return;
        }
        window.db.accounts.push({
            id: Date.now(), firstName, lastName, email, password,
            role, verified, createdAt: new Date().toISOString()
        });
        showToast('Account created.', 'success');
    }

    saveToStorage();
    document.getElementById('account-form').classList.add('d-none');
    renderAccounts();
}

function handleResetPassword(id) {
    const acc = window.db.accounts.find(a => a.id === id);
    if (!acc) return;
    const newPass = prompt(`Enter new password for ${acc.email}:`);
    if (newPass === null) return;
    if (!newPass || newPass.length < 6) {
        showToast('Password must be at least 6 characters.', 'danger');
        return;
    }
    acc.password = newPass;
    saveToStorage();
    showToast('Password reset successfully.', 'success');
}

function handleDeleteAccount(id) {
    if (currentUser && currentUser.id === id) {
        showToast('You cannot delete your own account.', 'danger');
        return;
    }
    if (!confirm('Delete this account?')) return;
    window.db.accounts = window.db.accounts.filter(a => a.id !== id);
    saveToStorage();
    showToast('Account deleted.', 'success');
    renderAccounts();
}

// ─────────────────────────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────────────────────────
function renderDepartments() {
    const tbody = document.getElementById('departments-tbody');
    const depts = window.db.departments || [];

    if (depts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">No departments yet.</td></tr>';
        return;
    }

    tbody.innerHTML = depts.map(d => `
        <tr>
            <td>${d.name}</td>
            <td>${d.description || '—'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" data-action="edit-department" data-id="${d.id}">Edit</button>
                <button class="btn btn-sm btn-outline-danger" data-action="delete-department" data-id="${d.id}">Delete</button>
            </td>
        </tr>
    `).join('');
}

function showDepartmentForm(dept = null) {
    document.getElementById('dept-editing-id').value  = dept ? dept.id : '';
    document.getElementById('dept-name').value        = dept ? dept.name : '';
    document.getElementById('dept-description').value = dept ? dept.description || '' : '';
    hideFieldError(document.getElementById('department-error'));
    document.getElementById('department-form').classList.remove('d-none');
}

function handleSaveDepartment() {
    const editingId   = document.getElementById('dept-editing-id').value;
    const name        = document.getElementById('dept-name').value.trim();
    const description = document.getElementById('dept-description').value.trim();
    const errorBox    = document.getElementById('department-error');

    hideFieldError(errorBox);

    if (!name) {
        showFieldError(errorBox, 'Department name is required.');
        return;
    }

    if (editingId) {
        const dept       = window.db.departments.find(d => d.id == editingId);
        dept.name        = name;
        dept.description = description;
        showToast('Department updated.', 'success');
    } else {
        window.db.departments.push({
            id: Date.now(), name, description, createdAt: new Date().toISOString()
        });
        showToast('Department added.', 'success');
    }

    saveToStorage();
    document.getElementById('department-form').classList.add('d-none');
    renderDepartments();
}

// ─────────────────────────────────────────────────────────────
// REQUESTS — USER SIDE
// ─────────────────────────────────────────────────────────────
let requestModalInstance = null;

function showRequestModal() {
    document.getElementById('req-type-input').value     = 'Equipment';
    document.getElementById('req-items-list').innerHTML = '';
    hideFieldError(document.getElementById('request-error'));
    addRequestItem();
    addRequestItem();
    requestModalInstance = new bootstrap.Modal(document.getElementById('requestModal'));
    requestModalInstance.show();
}

function addRequestItem() {
    const list = document.getElementById('req-items-list');
    const row  = document.createElement('div');
    row.className = 'd-flex gap-2 mb-2 align-items-center';
    row.innerHTML = `
        <input type="text" class="form-control req-item-name" placeholder="Item name">
        <input type="number" class="form-control req-item-qty" value="1" min="1" style="width:80px;">
        <button type="button" class="btn btn-outline-danger btn-sm remove-item">×</button>
    `;
    row.querySelector('.remove-item').addEventListener('click', () => row.remove());
    list.appendChild(row);
}

function handleSaveRequest() {
    const type     = document.getElementById('req-type-input').value;
    const errorBox = document.getElementById('request-error');

    hideFieldError(errorBox);

    const items = [];
    document.querySelectorAll('#req-items-list .d-flex').forEach(row => {
        const name = row.querySelector('.req-item-name').value.trim();
        const qty  = parseInt(row.querySelector('.req-item-qty').value) || 1;
        if (name) items.push({ name, qty });
    });

    if (items.length === 0) {
        showFieldError(errorBox, 'Please add at least one item with a name.');
        return;
    }

    window.db.requests.push({
        id:            Date.now(),
        employeeEmail: currentUser.email,
        type,
        items,
        status:        'Pending',
        date:          new Date().toISOString(),
        createdAt:     new Date().toISOString()
    });

    saveToStorage();
    if (requestModalInstance) requestModalInstance.hide();
    showToast('Request submitted successfully!', 'success');
    renderRequests();
}

function renderRequests() {
    const tbody    = document.getElementById('requests-tbody');
    const table    = document.getElementById('requests-table');
    const empty    = document.getElementById('requests-empty');
    const requests = (window.db.requests || []).filter(r => r.employeeEmail === currentUser?.email);

    if (requests.length === 0) {
        table.classList.add('d-none');
        empty.classList.remove('d-none');
        return;
    }

    table.classList.remove('d-none');
    empty.classList.add('d-none');

    tbody.innerHTML = requests.map(r => {
        const itemSummary = Array.isArray(r.items)
            ? r.items.map(i => `${i.name} (x${i.qty})`).join(', ') : '—';
        const badgeColor  = r.status === 'Pending'  ? 'warning text-dark'
                          : r.status === 'Approved' ? 'success' : 'danger';
        return `<tr>
            <td>${r.type}</td>
            <td>${itemSummary}</td>
            <td>${new Date(r.date).toLocaleDateString()}</td>
            <td><span class="badge bg-${badgeColor}">${r.status}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-danger" data-action="delete-request" data-id="${r.id}">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────
// REQUESTS — ADMIN SIDE
// ─────────────────────────────────────────────────────────────
function renderAdminRequests() {
    const tbody    = document.getElementById('admin-requests-tbody');
    const requests = window.db.requests || [];

    if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No requests submitted yet.</td></tr>';
        return;
    }

    tbody.innerHTML = requests.map(r => {
        const itemSummary = Array.isArray(r.items)
            ? r.items.map(i => `${i.name} (x${i.qty})`).join(', ') : '—';
        const badgeColor  = r.status === 'Pending'  ? 'warning text-dark'
                          : r.status === 'Approved' ? 'success' : 'danger';
        return `<tr>
            <td>${r.employeeEmail}</td>
            <td>${r.type}</td>
            <td>${itemSummary}</td>
            <td>${new Date(r.date).toLocaleDateString()}</td>
            <td><span class="badge bg-${badgeColor}">${r.status}</span></td>
            <td>
                ${r.status === 'Pending' ? `
                    <button class="btn btn-sm btn-success me-1" data-action="approve-request" data-id="${r.id}">Approve</button>
                    <button class="btn btn-sm btn-danger" data-action="reject-request" data-id="${r.id}">Reject</button>
                ` : '<span class="text-muted small">—</span>'}
            </td>
        </tr>`;
    }).join('');
}

function updateRequestStatus(id, status) {
    const req = window.db.requests.find(r => r.id === id);
    if (!req) return;
    req.status = status;
    saveToStorage();
    showToast(`Request ${status.toLowerCase()}.`, status === 'Approved' ? 'success' : 'danger');
    renderAdminRequests();
}

// ─────────────────────────────────────────────────────────────
// EVENT LISTENERS (replaces all inline onclick handlers)
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    loadFromStorage();
    await initializeAuth();

    // Set hash to / if empty
    if (!window.location.hash) window.location.hash = '#/';
    router.handleRouting();

    // Routing
    window.addEventListener('hashchange', () => router.handleRouting());

    // ── Navbar ──
    document.getElementById('nav-brand').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/'); });
    document.getElementById('nav-login').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/login'); });
    document.getElementById('nav-register').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/register'); });
    document.getElementById('nav-profile').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/profile'); });
    document.getElementById('nav-employees').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/employees'); });
    document.getElementById('nav-accounts').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/accounts'); });
    document.getElementById('nav-departments').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/departments'); });
    document.getElementById('nav-admin-requests').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/admin-requests'); });
    document.getElementById('nav-my-requests').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/my-requests'); });
    document.getElementById('nav-logout').addEventListener('click', e => { e.preventDefault(); handleLogout(); });

    // ── Home ──
    document.getElementById('btn-get-started').addEventListener('click', e => { e.preventDefault(); router.navigateTo('#/register'); });

    // ── Register ──
    document.getElementById('btn-register').addEventListener('click', handleRegister);
    document.getElementById('btn-register-cancel').addEventListener('click', () => router.navigateTo('#/'));
    document.getElementById('reg-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); });

    // ── Verify ──
    document.getElementById('btn-verify').addEventListener('click', handleVerify);
    document.getElementById('btn-verify-cancel').addEventListener('click', () => router.navigateTo('#/login'));

    // ── Login ──
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-login-cancel').addEventListener('click', () => router.navigateTo('#/'));
    document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

    // ── Profile ──
    document.getElementById('btn-edit-profile').addEventListener('click', toggleEditProfile);
    document.getElementById('btn-save-profile').addEventListener('click', handleSaveProfile);
    document.getElementById('btn-cancel-profile').addEventListener('click', toggleEditProfile);

    // ── Employees ──
    document.getElementById('btn-add-employee').addEventListener('click', () => showEmployeeForm());
    document.getElementById('btn-save-employee').addEventListener('click', handleSaveEmployee);
    document.getElementById('btn-cancel-employee').addEventListener('click', () => {
        document.getElementById('employee-form').classList.add('d-none');
    });

    // ── Accounts ──
    document.getElementById('btn-add-account').addEventListener('click', () => showAccountForm());
    document.getElementById('btn-save-account').addEventListener('click', handleSaveAccount);
    document.getElementById('btn-cancel-account').addEventListener('click', () => {
        document.getElementById('account-form').classList.add('d-none');
    });

    // ── Departments ──
    document.getElementById('btn-add-department').addEventListener('click', () => showDepartmentForm());
    document.getElementById('btn-save-department').addEventListener('click', handleSaveDepartment);
    document.getElementById('btn-cancel-department').addEventListener('click', () => {
        document.getElementById('department-form').classList.add('d-none');
    });

    // ── Requests (user) ──
    document.getElementById('btn-new-request').addEventListener('click', showRequestModal);
    document.getElementById('btn-create-request').addEventListener('click', showRequestModal);
    document.getElementById('btn-add-item').addEventListener('click', addRequestItem);
    document.getElementById('btn-submit-request').addEventListener('click', handleSaveRequest);

    // ── Delegated events for table action buttons ──
    document.addEventListener('click', e => {
        const btn    = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id     = parseInt(btn.dataset.id);

        switch (action) {
            case 'edit-employee':
                showEmployeeForm(window.db.employees.find(emp => emp.id === id));
                break;
            case 'delete-employee':
                if (!confirm('Delete this employee?')) break;
                window.db.employees = window.db.employees.filter(e => e.id !== id);
                saveToStorage();
                showToast('Employee deleted.', 'success');
                renderEmployees();
                break;
            case 'edit-account':
                showAccountForm(window.db.accounts.find(acc => acc.id === id));
                break;
            case 'reset-password':
                handleResetPassword(id);
                break;
            case 'delete-account':
                handleDeleteAccount(id);
                break;
            case 'edit-department':
                showDepartmentForm(window.db.departments.find(d => d.id === id));
                break;
            case 'delete-department':
                if (!confirm('Delete this department?')) break;
                window.db.departments = window.db.departments.filter(d => d.id !== id);
                saveToStorage();
                showToast('Department deleted.', 'success');
                renderDepartments();
                break;
            case 'delete-request':
                if (!confirm('Delete this request?')) break;
                window.db.requests = window.db.requests.filter(r => r.id !== id);
                saveToStorage();
                showToast('Request deleted.', 'success');
                renderRequests();
                break;
            case 'approve-request':
                updateRequestStatus(id, 'Approved');
                break;
            case 'reject-request':
                updateRequestStatus(id, 'Rejected');
                break;
        }
    });
});