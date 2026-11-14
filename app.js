/**
 * ============================================================================
 * Gastei & Agora? - Sistema de Gestão Financeira e Consultoria IA
 * Vanilla JavaScript (ES6+) com LocalStorage e Motor de Inteligência Financeira
 * ============================================================================
 */

// Chaves do LocalStorage
const STORAGE_KEYS = {
    THEME: 'gastei_agora_theme',
    PRIVACY: 'gastei_agora_privacy',
    USERS: 'gastei_agora_users',
    CURRENT_USER: 'gastei_agora_session',
    FINANCE_DATA: 'gastei_agora_finance_' // prefixo + userId
};

// Estado da Aplicação
let currentUser = null;
let isPrivacyActive = false;
let currentFinanceData = {
    salary: 0,
    debt: 0,
    deadline: '',
    essentials: 0
};

/* ============================================================================
   1. INICIALIZAÇÃO & TEMA (CLARO / AZUL ESCURO) & MODO PRIVACIDADE & SUPABASE
   ============================================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializa o cliente do Supabase se configurado
    if (typeof initSupabase === 'function') {
        initSupabase();
    }

    initTheme();
    initPrivacy();
    setupDateConstraints();
    await checkExistingSession();
    setupPrivacyTouchSupport();
});

function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    applyTheme(savedTheme, false);

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
}

function applyTheme(theme, syncWithDb = true) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);

    const themeText = document.querySelector('.theme-text');
    if (themeText) {
        themeText.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
    }

    if (syncWithDb && currentUser && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        supabaseClient.from('profiles').update({ theme_preference: theme }).eq('id', currentUser.id)
            .then(({ error }) => { if (error) console.warn('Erro ao sincronizar tema no Supabase:', error); });
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme, true);
}

/**
 * Inicialização e Gestão do Modo Privacidade (Ocultar Valores com Hover)
 */
function initPrivacy() {
    const savedPrivacy = localStorage.getItem(STORAGE_KEYS.PRIVACY);
    // Inicia conforme salvo (padrão desligado para primeira experiência amigável)
    setPrivacyMode(savedPrivacy === 'true', false);

    const privacyBtn = document.getElementById('privacyToggleBtn');
    if (privacyBtn) {
        privacyBtn.addEventListener('click', togglePrivacyMode);
    }
}

function togglePrivacyMode() {
    setPrivacyMode(!isPrivacyActive, true);
}

function setPrivacyMode(enabled, syncWithDb = true) {
    isPrivacyActive = enabled;
    localStorage.setItem(STORAGE_KEYS.PRIVACY, enabled ? 'true' : 'false');

    const body = document.body;
    const privacyBtn = document.getElementById('privacyToggleBtn');
    if (!privacyBtn) return;

    const eyeOpen = privacyBtn.querySelector('.eye-open');
    const eyeClosed = privacyBtn.querySelector('.eye-closed');
    const privacyText = privacyBtn.querySelector('.privacy-text');

    if (enabled) {
        body.classList.add('privacy-mode');
        privacyBtn.classList.add('active');
        if (eyeOpen) eyeOpen.classList.add('hidden');
        if (eyeClosed) eyeClosed.classList.remove('hidden');
        if (privacyText) privacyText.textContent = 'Mostrar Valores';
        privacyBtn.setAttribute('title', 'Modo Privacidade ATIVO: números ocultos (passe o mouse para ver)');
    } else {
        body.classList.remove('privacy-mode');
        privacyBtn.classList.remove('active');
        if (eyeOpen) eyeOpen.classList.remove('hidden');
        if (eyeClosed) eyeClosed.classList.add('hidden');
        if (privacyText) privacyText.textContent = 'Ocultar Valores';
        privacyBtn.setAttribute('title', 'Ocultar valores das informações (passe o mouse para ver)');
    }

    if (syncWithDb && currentUser && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        supabaseClient.from('profiles').update({ privacy_mode: enabled }).eq('id', currentUser.id)
            .then(({ error }) => { if (error) console.warn('Erro ao sincronizar privacidade no Supabase:', error); });
    }
}

/**
 * Suporte a toque no celular para revelar valores ocultos ao tocar
 */
function setupPrivacyTouchSupport() {
    document.addEventListener('click', (e) => {
        if (!isPrivacyActive) return;
        const target = e.target.closest('.privacy-value');
        if (target) {
            target.classList.toggle('revealed');
        }
    });
}

// Configura data mínima para o input do calendário (a partir de hoje)
function setupDateConstraints() {
    const deadlineInput = document.getElementById('debtDeadline');
    if (deadlineInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        deadlineInput.min = `${yyyy}-${mm}-${dd}`;
    }
}

/* ============================================================================
   2. AUTENTICAÇÃO (LOGIN / REGISTRO / SESSÃO)
   ============================================================================ */
/* ============================================================================
   2. AUTENTICAÇÃO (LOGIN / REGISTRO / SESSÃO) & VALIDAÇÕES
   ============================================================================ */

/**
 * Validação de E-mail:
 * Exige obrigatoriamente '@' e o provedor completo com extensão válida (ex: outlook.com, gmail.com)
 */
function validateEmailFormat(email) {
    if (!email || typeof email !== 'string') {
        return { valid: false, message: 'Por favor, digite seu e-mail.' };
    }
    const cleanEmail = email.trim();

    if (!cleanEmail.includes('@')) {
        return { valid: false, message: "O e-mail deve conter o caractere '@'." };
    }

    const parts = cleanEmail.split('@');
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        return { valid: false, message: "Informe o nome de usuário antes do '@' e o provedor depois (ex: usuario@outlook.com)." };
    }

    const domain = parts[1].trim();
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
        return { valid: false, message: "Informe o provedor completo com domínio (ex: @outlook.com, @gmail.com, @hotmail.com)." };
    }

    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2) {
        return { valid: false, message: "A extensão do provedor deve ter pelo menos 2 caracteres (ex: .com, .com.br)." };
    }

    // Validação estrita por Expressão Regular
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(cleanEmail)) {
        return { valid: false, message: "E-mail em formato inválido. Exemplo correto: seuemail@outlook.com" };
    }

    return { valid: true, message: '' };
}

/**
 * Avaliação dos Requisitos da Senha:
 * - Pelo menos 6 caracteres
 * - Letra maiúscula (A-Z)
 * - Letra minúscula (a-z)
 * - Número (0-9)
 * - Símbolo / Caractere Especial (!@#$%...)
 */
function getPasswordCriteria(password) {
    const p = password || '';
    const hasLength = p.length >= 6;
    const hasUpper = /[A-Z]/.test(p);
    const hasLower = /[a-z]/.test(p);
    const hasNumber = /[0-9]/.test(p);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(p);

    const isValid = hasLength && hasUpper && hasLower && hasNumber && hasSpecial;

    return {
        hasLength,
        hasUpper,
        hasLower,
        hasNumber,
        hasSpecial,
        isValid
    };
}

/**
 * Atualiza os indicadores visuais de requisitos de senha em tempo real
 */
function checkPasswordRequirements(password) {
    const criteria = getPasswordCriteria(password);

    updateReqItem('reqLength', criteria.hasLength);
    updateReqItem('reqUpper', criteria.hasUpper);
    updateReqItem('reqLower', criteria.hasLower);
    updateReqItem('reqNumber', criteria.hasNumber);
    updateReqItem('reqSpecial', criteria.hasSpecial);
}

function updateReqItem(elementId, isValid) {
    const item = document.getElementById(elementId);
    if (!item) return;

    const icon = item.querySelector('.req-icon');
    if (isValid) {
        item.classList.remove('invalid');
        item.classList.add('valid');
        if (icon) icon.textContent = '✓';
    } else {
        item.classList.remove('valid');
        item.classList.add('invalid');
        if (icon) icon.textContent = '✕';
    }
}

/**
 * Alterna visualização de senha (texto / password)
 */
function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        btnEl.textContent = '🙈';
        btnEl.setAttribute('title', 'Ocultar senha');
    } else {
        input.type = 'password';
        btnEl.textContent = '👁️';
        btnEl.setAttribute('title', 'Mostrar senha');
    }
}

function switchAuthTab(tab) {
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginError = document.getElementById('loginError');
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');

    loginError.classList.add('hidden');
    registerError.classList.add('hidden');
    registerSuccess.classList.add('hidden');

    if (tab === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    }
}

function getUsersFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS);
    return raw ? JSON.parse(raw) : [];
}

function saveUsersToStorage(users) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
}

async function handleRegister(e) {
    e.preventDefault();
    const nameInput = document.getElementById('regName').value.trim();
    const emailInput = document.getElementById('regEmail').value.trim().toLowerCase();
    const passwordInput = document.getElementById('regPassword').value;
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');

    registerError.classList.add('hidden');
    registerSuccess.classList.add('hidden');

    // 1. Validação de preenchimento
    if (!nameInput || !emailInput || !passwordInput) {
        registerError.textContent = 'Por favor, preencha todos os campos para se cadastrar.';
        registerError.classList.remove('hidden');
        return;
    }

    // 2. Validação estrita de E-mail (obriga @ e provedor ex: outlook.com)
    const emailCheck = validateEmailFormat(emailInput);
    if (!emailCheck.valid) {
        registerError.textContent = emailCheck.message;
        registerError.classList.remove('hidden');
        document.getElementById('regEmail').focus();
        return;
    }

    // 3. Validação estrita de Senha (>=6 chars, maiúscula, minúscula, número, especial)
    const passCheck = getPasswordCriteria(passwordInput);
    if (!passCheck.isValid) {
        const missing = [];
        if (!passCheck.hasLength) missing.push('pelo menos 6 caracteres');
        if (!passCheck.hasUpper) missing.push('uma letra maiúscula');
        if (!passCheck.hasLower) missing.push('uma letra minúscula');
        if (!passCheck.hasNumber) missing.push('um número');
        if (!passCheck.hasSpecial) missing.push('um caractere especial (!@#$%...)');

        registerError.textContent = `Sua senha precisa ter: ${missing.join(', ')}.`;
        registerError.classList.remove('hidden');
        document.getElementById('regPassword').focus();
        return;
    }

    // Se o Supabase estiver configurado, registra no Supabase Auth
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email: emailInput,
                password: passwordInput,
                options: {
                    data: {
                        full_name: nameInput
                    }
                }
            });

            if (error) {
                registerError.textContent = 'Erro ao cadastrar no Supabase: ' + error.message;
                registerError.classList.remove('hidden');
                return;
            }

            if (data?.user) {
                registerSuccess.textContent = 'Conta criada com sucesso no Supabase! Entrando...';
                registerSuccess.classList.remove('hidden');

                const userObj = {
                    id: data.user.id,
                    name: nameInput,
                    email: emailInput
                };

                setTimeout(() => {
                    setSessionUser(userObj);
                }, 850);
                return;
            }
        } catch (err) {
            registerError.textContent = 'Falha de comunicação com o Supabase: ' + err.message;
            registerError.classList.remove('hidden');
            return;
        }
    }

    // Fallback: Armazenamento Local no LocalStorage
    const users = getUsersFromStorage();
    const userExists = users.some(u => u.email === emailInput);

    if (userExists) {
        registerError.textContent = 'Este e-mail já está cadastrado. Alterne para a aba "Entrar".';
        registerError.classList.remove('hidden');
        return;
    }

    const newUser = {
        id: 'usr_' + Date.now(),
        name: nameInput,
        email: emailInput,
        password: passwordInput,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsersToStorage(users);

    registerSuccess.textContent = 'Conta criada com sucesso! Redirecionando para seu painel...';
    registerSuccess.classList.remove('hidden');

    setTimeout(() => {
        setSessionUser(newUser);
    }, 850);
}

async function handleLogin(e) {
    e.preventDefault();
    const emailInput = document.getElementById('loginEmail').value.trim().toLowerCase();
    const passwordInput = document.getElementById('loginPassword').value;
    const loginError = document.getElementById('loginError');

    loginError.classList.add('hidden');

    // Validação do formato de email no login
    const emailCheck = validateEmailFormat(emailInput);
    if (!emailCheck.valid) {
        loginError.textContent = emailCheck.message;
        loginError.classList.remove('hidden');
        document.getElementById('loginEmail').focus();
        return;
    }

    // Se o Supabase estiver configurado, autentica via Supabase Auth
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailInput,
                password: passwordInput
            });

            if (error) {
                loginError.textContent = 'Erro no login: ' + (error.message.includes('Invalid') ? 'E-mail ou senha incorretos.' : error.message);
                loginError.classList.remove('hidden');
                return;
            }

            if (data?.user) {
                // Busca perfil com nome e preferências
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('full_name, theme_preference, privacy_mode')
                    .eq('id', data.user.id)
                    .maybeSingle();

                const userObj = {
                    id: data.user.id,
                    name: profile?.full_name || data.user.user_metadata?.full_name || 'Guerreiro Financeiro',
                    email: data.user.email
                };

                if (profile?.theme_preference) applyTheme(profile.theme_preference, false);
                if (profile?.privacy_mode !== undefined) setPrivacyMode(profile.privacy_mode, false);

                setSessionUser(userObj);
                return;
            }
        } catch (err) {
            loginError.textContent = 'Falha de comunicação com o Supabase: ' + err.message;
            loginError.classList.remove('hidden');
            return;
        }
    }

    // Fallback: Autenticação via LocalStorage
    const users = getUsersFromStorage();
    const user = users.find(u => u.email === emailInput && u.password === passwordInput);

    if (!user) {
        loginError.textContent = 'E-mail ou senha incorretos. Verifique seus dados ou crie uma conta.';
        loginError.classList.remove('hidden');
        return;
    }

    setSessionUser(user);
}

function setSessionUser(user) {
    currentUser = user;
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    renderAppForAuthenticatedUser();
}

async function checkExistingSession() {
    // 1. Tenta recuperar sessão do Supabase se ativo
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        try {
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            if (session?.user) {
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('full_name, theme_preference, privacy_mode')
                    .eq('id', session.user.id)
                    .maybeSingle();

                currentUser = {
                    id: session.user.id,
                    email: session.user.email,
                    name: profile?.full_name || session.user.user_metadata?.full_name || 'Guerreiro Financeiro'
                };

                if (profile?.theme_preference) applyTheme(profile.theme_preference, false);
                if (profile?.privacy_mode !== undefined) setPrivacyMode(profile.privacy_mode, false);

                renderAppForAuthenticatedUser();
                return;
            }
        } catch (err) {
            console.warn('Erro ao verificar sessão Supabase:', err);
        }
    }

    // 2. Fallback: Recupera do LocalStorage
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (raw) {
        try {
            currentUser = JSON.parse(raw);
            renderAppForAuthenticatedUser();
            return;
        } catch (err) {
            console.error('Erro ao recuperar sessão:', err);
        }
    }
    renderAppForGuest();
}

async function handleLogout() {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        try {
            await supabaseClient.auth.signOut();
        } catch (e) {
            console.warn('Erro ao encerrar sessão no Supabase:', e);
        }
    }
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    renderAppForGuest();
}

document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

/**
 * ============================================================================
 * MODAL DE AUTENTICAÇÃO (LOGIN / CADASTRO)
 * ============================================================================
 */
function openAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.remove('hidden');
        switchAuthTab(tab);
        setTimeout(() => {
            if (tab === 'login') {
                document.getElementById('loginEmail')?.focus();
            } else {
                document.getElementById('regName')?.focus();
            }
        }, 80);
    }
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function handleBackdropClick(event) {
    if (event.target.id === 'authModal') {
        closeAuthModal();
    }
}

// Fechar com tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAuthModal();
    }
});

function renderAppForAuthenticatedUser() {
    closeAuthModal();
    const landing = document.getElementById('homeLandingSection');
    const dashboard = document.getElementById('dashboardSection');
    const userPill = document.getElementById('userPill');
    const loginNavBtn = document.getElementById('loginNavBtn');

    if (landing) landing.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    if (userPill) userPill.classList.remove('hidden');
    if (loginNavBtn) loginNavBtn.classList.add('hidden');

    const nameDisplay = document.getElementById('userNameDisplay');
    const salutationName = document.getElementById('salutationName');
    
    if (nameDisplay) nameDisplay.textContent = currentUser.name;
    if (salutationName) salutationName.textContent = currentUser.name;

    // Carregar dados financeiros salvos do usuário
    loadUserFinanceData();
}

function renderAppForGuest() {
    closeAuthModal();
    const landing = document.getElementById('homeLandingSection');
    const dashboard = document.getElementById('dashboardSection');
    const userPill = document.getElementById('userPill');
    const loginNavBtn = document.getElementById('loginNavBtn');

    if (landing) landing.classList.remove('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    if (userPill) userPill.classList.add('hidden');
    if (loginNavBtn) loginNavBtn.classList.remove('hidden');
}

/* ============================================================================
   3. GESTÃO DOS DADOS FINANCEIROS (SALÁRIO, DÍVIDA, DEADLINE)
   ============================================================================ */
async function loadUserFinanceData() {
    if (!currentUser) return;

    let loaded = false;

    // 1. Tenta carregar do Supabase se ativo
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('financial_records')
                .select('*')
                .eq('user_id', currentUser.id)
                .maybeSingle();

            if (data) {
                currentFinanceData = {
                    salary: parseFloat(data.monthly_salary) || 0,
                    debt: parseFloat(data.total_debt) || 0,
                    deadline: data.deadline || '',
                    essentials: parseFloat(data.essential_expenses) || 0,
                    updatedAt: data.updated_at
                };
                document.getElementById('monthlySalary').value = currentFinanceData.salary || '';
                document.getElementById('totalDebt').value = currentFinanceData.debt || '';
                document.getElementById('debtDeadline').value = currentFinanceData.deadline || '';
                document.getElementById('essentialExpenses').value = currentFinanceData.essentials || '';
                calculateAndRenderMetrics();
                loaded = true;
            }

            // Carrega histórico de mensagens do chat se houver
            loadChatHistoryFromSupabase();
        } catch (err) {
            console.warn('Erro ao carregar dados financeiros do Supabase:', err);
        }
    }

    // 2. Se não carregou do Supabase, tenta o LocalStorage
    if (!loaded) {
        const key = STORAGE_KEYS.FINANCE_DATA + currentUser.id;
        const raw = localStorage.getItem(key);

        if (raw) {
            try {
                currentFinanceData = JSON.parse(raw);
                document.getElementById('monthlySalary').value = currentFinanceData.salary || '';
                document.getElementById('totalDebt').value = currentFinanceData.debt || '';
                document.getElementById('debtDeadline').value = currentFinanceData.deadline || '';
                document.getElementById('essentialExpenses').value = currentFinanceData.essentials || '';
                calculateAndRenderMetrics();
            } catch (e) {
                console.error('Erro ao ler finanças do LocalStorage:', e);
            }
        } else {
            // Preenche com uma deadline padrão (ex: daqui a 6 meses) para guiar o usuário
            const defaultDeadline = new Date();
            defaultDeadline.setMonth(defaultDeadline.getMonth() + 6);
            const yyyy = defaultDeadline.getFullYear();
            const mm = String(defaultDeadline.getMonth() + 1).padStart(2, '0');
            const dd = String(defaultDeadline.getDate()).padStart(2, '0');
            document.getElementById('debtDeadline').value = `${yyyy}-${mm}-${dd}`;
        }
    }
}

async function handleSaveFinanceData(e) {
    e.preventDefault();
    if (!currentUser) return;

    const salary = parseFloat(document.getElementById('monthlySalary').value) || 0;
    const debt = parseFloat(document.getElementById('totalDebt').value) || 0;
    const deadline = document.getElementById('debtDeadline').value;
    const essentials = parseFloat(document.getElementById('essentialExpenses').value) || 0;

    if (!deadline) {
        alert('Por favor, escolha uma data limite (deadline) no calendário.');
        return;
    }

    currentFinanceData = {
        salary,
        debt,
        deadline,
        essentials,
        updatedAt: new Date().toISOString()
    };

    // 1. Sempre mantém cópia local em cache no LocalStorage
    const key = STORAGE_KEYS.FINANCE_DATA + currentUser.id;
    localStorage.setItem(key, JSON.stringify(currentFinanceData));

    // 2. Salva no Supabase se ativo
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('financial_records')
                .upsert({
                    user_id: currentUser.id,
                    monthly_salary: salary,
                    total_debt: debt,
                    deadline: deadline,
                    essential_expenses: essentials,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                console.error('Erro ao salvar no Supabase:', error);
            } else {
                console.log('✅ Dados financeiros sincronizados na nuvem do Supabase.');
            }
        } catch (err) {
            console.warn('Erro ao conectar ao Supabase durante salvamento:', err);
        }
    }

    calculateAndRenderMetrics();
    
    // Notificação breve para o usuário
    appendAIMessage(`Excelente, ${currentUser.name}! Seus dados foram salvos: Salário de <strong>${formatCurrency(salary)}</strong>, dívida de <strong>${formatCurrency(debt)}</strong> e deadline para <strong>${formatDateBR(deadline)}</strong>. Clique em "Gerar Diagnóstico Rápido" ou confira as metas calculadas ao lado!`);
}

/* ============================================================================
   4. CÁLCULO DAS MÉTRICAS & INDICADORES FINANCEIROS
   ============================================================================ */
function calculateAndRenderMetrics() {
    const { salary, debt, deadline } = currentFinanceData;

    const metricTotalDebt = document.getElementById('metricTotalDebt');
    const metricTimeRemaining = document.getElementById('metricTimeRemaining');
    const metricMonthlyTarget = document.getElementById('metricMonthlyTarget');
    const metricDailyTarget = document.getElementById('metricDailyTarget');
    const metricSalaryPercent = document.getElementById('metricSalaryPercent');
    const lblCurrentDate = document.getElementById('lblCurrentDate');
    const lblTargetDate = document.getElementById('lblTargetDate');
    const progressBar = document.getElementById('deadlineProgressBar');
    const debtHealthBadge = document.getElementById('debtHealthBadge');
    const debtHealthText = document.getElementById('debtHealthText');
    const feasibilityBox = document.getElementById('feasibilityAlert');
    const feasibilityTitle = document.getElementById('feasibilityTitle');
    const feasibilityMessage = document.getElementById('feasibilityMessage');

    metricTotalDebt.textContent = formatCurrency(debt);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    lblCurrentDate.textContent = formatDateBR(today);

    if (!deadline) {
        metricTimeRemaining.textContent = '--';
        metricMonthlyTarget.textContent = formatCurrency(0);
        metricDailyTarget.textContent = 'R$ 0,00 / dia';
        metricSalaryPercent.textContent = '0% do seu salário';
        return;
    }

    const [targetYear, targetMonth, targetDay] = deadline.split('-').map(Number);
    const targetDate = new Date(targetYear, targetMonth - 1, targetDay);
    targetDate.setHours(0, 0, 0, 0);

    lblTargetDate.textContent = formatDateBR(targetDate);

    // Diferença em milissegundos
    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        metricTimeRemaining.textContent = 'Vencido hoje ou no passado!';
        metricTimeRemaining.classList.add('text-danger');
        feasibilityBox.className = 'feasibility-box danger';
        feasibilityTitle.textContent = '⚠️ Deadline Ultrapassado';
        feasibilityMessage.textContent = 'A data escolhida já chegou ou passou. Selecione uma data futura para podermos distribuir suas parcelas de pagamento.';
        debtHealthBadge.className = 'status-chip critical';
        debtHealthText.textContent = 'Prazo Vencido';
        progressBar.style.width = '100%';
        return;
    }

    metricTimeRemaining.classList.remove('text-danger');

    // Cálculo de meses aproximados (dias / 30.41)
    const approxMonths = Math.max(diffDays / 30.41, 0.5);
    const monthsRounded = Math.ceil(approxMonths);

    // Texto de tempo restante
    if (diffDays < 30) {
        metricTimeRemaining.textContent = `${diffDays} dia(s)`;
    } else {
        metricTimeRemaining.textContent = `${diffDays} dias (~${monthsRounded} meses)`;
    }

    // Metas de economia
    const monthlyPayment = debt / approxMonths;
    const dailyPayment = debt / diffDays;

    metricMonthlyTarget.textContent = formatCurrency(monthlyPayment) + ' / mês';
    metricDailyTarget.textContent = formatCurrency(dailyPayment) + ' / dia';

    // % do salário
    let salaryPct = 0;
    if (salary > 0) {
        salaryPct = (monthlyPayment / salary) * 100;
        metricSalaryPercent.textContent = `${salaryPct.toFixed(1)}% do seu salário`;
    } else {
        metricSalaryPercent.textContent = `Informe seu salário para ver o impacto %`;
    }

    // Progresso temporal (estimativa com base em 1 ano padrão)
    const maxReferenceDays = 365;
    const progressPct = Math.min(Math.max((diffDays / maxReferenceDays) * 100, 10), 100);
    progressBar.style.width = `${progressPct}%`;

    // Avaliação de Viabilidade Financeira
    if (debt <= 0) {
        feasibilityBox.className = 'feasibility-box success';
        feasibilityTitle.textContent = '🎉 Parabéns! Você está livre de dívidas!';
        feasibilityMessage.textContent = 'Sua dívida está zerada. Agora foque em criar sua reserva de emergência e investir seu dinheiro.';
        debtHealthBadge.className = 'status-chip healthy';
        debtHealthText.textContent = 'Dívida Zerada';
    } else if (salary <= 0) {
        feasibilityBox.className = 'feasibility-box warning';
        feasibilityTitle.textContent = 'ℹ️ Informe sua renda mensal';
        feasibilityMessage.textContent = 'Para sabermos se essa meta de pagamento é sustentável, informe o quanto você recebe por mês no formulário.';
        debtHealthBadge.className = 'status-chip moderate';
        debtHealthText.textContent = 'Renda não informada';
    } else if (salaryPct <= 25) {
        feasibilityBox.className = 'feasibility-box success';
        feasibilityTitle.textContent = '🟢 Meta Perfeitamente Viável!';
        feasibilityMessage.innerHTML = `A parcela de <span class="privacy-value" title="Passe o mouse para revelar">${formatCurrency(monthlyPayment)}</span> consome apenas <span class="privacy-value" title="Passe o mouse para revelar">${salaryPct.toFixed(1)}%</span> da sua renda. Mantendo a disciplina, você quitará tudo com folga até ${formatDateBR(targetDate)}.`;
        debtHealthBadge.className = 'status-chip healthy';
        debtHealthText.textContent = 'Plano Sustentável';
    } else if (salaryPct <= 45) {
        feasibilityBox.className = 'feasibility-box warning';
        feasibilityTitle.textContent = '🟡 Atenção: Esforço Moderado Necessário';
        feasibilityMessage.innerHTML = `A parcela de <span class="privacy-value" title="Passe o mouse para revelar">${formatCurrency(monthlyPayment)}</span> representa <span class="privacy-value" title="Passe o mouse para revelar">${salaryPct.toFixed(1)}%</span> do salário. Será preciso cortar gastos supérfluos e delivery para não apertar o mês.`;
        debtHealthBadge.className = 'status-chip moderate';
        debtHealthText.textContent = 'Atenção Necessária';
    } else {
        feasibilityBox.className = 'feasibility-box danger';
        feasibilityTitle.textContent = '🔴 Alerta Crítico: Risco de Inadimplência!';
        feasibilityMessage.innerHTML = `Comprometer <span class="privacy-value" title="Passe o mouse para revelar">${salaryPct.toFixed(1)}%</span> do salário (<span class="privacy-value" title="Passe o mouse para revelar">${formatCurrency(monthlyPayment)}</span>/mês) é insustentável. Recomendamos estender o deadline no calendário ou renegociar para prazos mais longos!`;
        debtHealthBadge.className = 'status-chip critical';
        debtHealthText.textContent = 'Risco Alto de Asfixia';
    }
}

/* ============================================================================
   5. IA FINANCEIRA (FinAI) - DIAGNÓSTICO & CHAT INTERATIVO
   ============================================================================ */
function triggerAutomaticAIDiagnosis() {
    const { salary, debt, deadline, essentials } = currentFinanceData;

    if (!debt || debt <= 0) {
        appendAIMessage(`Oi, ${currentUser?.name || 'amigo'}! Pelo que vi, sua dívida está zerada ou você ainda não preencheu o valor no formulário. Insira o valor da sua dívida para eu traçar uma rota de escape cirúrgica!`);
        return;
    }

    if (!deadline) {
        appendAIMessage(`Para eu planejar quando e como você vai pagar, preciso que escolha uma data no calendário de <strong>Deadline</strong>.`);
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [tY, tM, tD] = deadline.split('-').map(Number);
    const targetDate = new Date(tY, tM - 1, tD);
    const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
    const approxMonths = Math.max(diffDays / 30.41, 0.5);
    const monthlyTarget = debt / approxMonths;
    const salaryPct = salary > 0 ? ((monthlyTarget / salary) * 100) : 0;
    const disposableIncome = salary - essentials;

    let diagnosisHtml = `
        <p>📋 <strong>Diagnóstico Completo da FinAI para ${currentUser.name}:</strong></p>
        <p>Analisando sua dívida de <strong>${formatCurrency(debt, true)}</strong> com prazo limite até <strong>${formatDateBR(targetDate)}</strong> (${diffDays} dias restantes):</p>
        
        <ul>
            <li><strong>Meta de amortização mensal:</strong> ${formatCurrency(monthlyTarget, true)}/mês</li>
            <li><strong>Esforço diário correspondente:</strong> ${formatCurrency(debt / diffDays, true)}/dia</li>
            <li><strong>Comprometimento da renda:</strong> ${salary > 0 ? `<span class="privacy-value" title="Passe o mouse para ver">${salaryPct.toFixed(1)}%</span>` : 'Salário não informado'}</li>
        </ul>
    `;

    if (salary > 0 && salaryPct > 60) {
        diagnosisHtml += `
            <p>🚨 <strong>Aviso de Sobrecarga Financeira:</strong> Pagar <span class="privacy-value" title="Passe o mouse para ver">${salaryPct.toFixed(1)}%</span> do seu salário todo mês tem risco altíssimo de você se endividar de novo para pagar comida ou contas básicas. 
            <br>💡 <em>Minha recomendação:</em> Aumente o prazo no calendário em pelo menos mais 4 a 6 meses ou ligue para os credores pedindo desconto para pagamento à vista se tiver alguma reserva.</p>
        `;
    } else if (salary > 0 && salaryPct <= 35) {
        diagnosisHtml += `
            <p>✅ <strong>Plano Muito Realista:</strong> Esse valor de parcela cabe no orçamento sem desespero. Se você cortar pequenos desperdícios (assinaturas não usadas, entregas frequentes), você pode inclusive quitar <em>antes</em> do prazo!</p>
        `;
    }

    diagnosisHtml += `
        <p>🎯 <strong>Estratégia Anti-Impulso Recomendada:</strong></p>
        <ol>
            <li><strong>Desvincule o cartão de crédito</strong> dos apps de compras e delivery (Shopee, Mercado Livre, iFood). O atrito de ter que digitar o cartão reduz até 40% das compras impulsivas.</li>
            <li><strong>Regra das 72 Horas:</strong> Viu algo legal que "precisa muito"? Espere 3 dias. Se ainda fizer sentido e você tiver o dinheiro sobrando (sem mexer na meta de ${formatCurrency(monthlyTarget, true)}), aí pense no assunto.</li>
            <li><strong>Separe a parcela no dia do pagamento:</strong> Não deixe para quitar a dívida com "o que sobrar" no fim do mês. Quem espera sobrar, gasta. Transfira a cota da dívida assim que o salário cair.</li>
        </ol>
        <p>Se quiser simular um plano específico ou tiver dúvidas sobre juros, me chame aqui embaixo!</p>
    `;

    appendAIMessage(diagnosisHtml);
}

function handleSendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chatUserInput');
    const question = input.value.trim();
    if (!question) return;

    appendUserMessage(question);
    input.value = '';

    // Simula tempo de raciocínio da IA
    showTypingIndicator();

    setTimeout(() => {
        removeTypingIndicator();
        const aiResponse = generateSmartAIResponse(question);
        appendAIMessage(aiResponse);
    }, 800);
}

function sendQuickPrompt(promptText) {
    document.getElementById('chatUserInput').value = promptText;
    document.getElementById('chatForm').dispatchEvent(new Event('submit'));
}

/**
 * Motor de Respostas Inteligentes Contextuais da FinAI
 */
function generateSmartAIResponse(query) {
    const q = query.toLowerCase();
    const { salary, debt, deadline, essentials } = currentFinanceData;
    const name = currentUser ? currentUser.name : 'amigo';

    // 1. Perguntas sobre compras por impulso / gastar muito
    if (q.includes('impulso') || q.includes('gastar') || q.includes('comprar') || q.includes('consumo')) {
        return `
            <p>Entendo perfeitamente, ${name}! Quem gosta de gastar costuma comprar para aliviar o estresse ou pela dopamina imediata.</p>
            <p>Aqui estão 3 travas psicológicas práticas para você aplicar hoje:</p>
            <ul>
                <li><strong>Traduza preços em horas de trabalho:</strong> Se você ganha ${salary > 0 ? formatCurrency(salary) : 'R$ 3.000'} por mês (cerca de ${salary > 0 ? formatCurrency(salary / 160) : 'R$ 18'}/hora), um jantar de R$ 180 custa <strong>10 horas de trabalho</strong>. Vale mesmo meio dia do seu esforço?</li>
                <li><strong>Exclua cartões salvos no navegador e celular:</strong> Ter que levantar e pegar a carteira física corta 50% das compras impensadas de madrugada.</li>
                <li><strong>Crie a lista de "Quero, mas vou esperar":</strong> Anote o que quer comprar numa nota. Se após 15 dias você ainda quiser, planeje a compra sem endividamento.</li>
            </ul>
        `;
    }

    // 2. Parcela pesada / não cabe no salário
    if (q.includes('parcela') || q.includes('pesada') || q.includes('não cabe') || q.includes('salário') || q.includes('alta')) {
        return `
            <p>Se a parcela mensal para atingir seu deadline está sufocando seu salário, calma! Nós temos 3 saídas inteligentes:</p>
            <ol>
                <li><strong>Esticar o Deadline:</strong> Se sua meta está em ${deadline ? formatDateBR(deadline) : 'poucos meses'}, vá ao calendário e aumente em mais 6 a 12 meses. É melhor demorar mais pagando com tranquilidade do que ficar inadimplente.</li>
                <li><strong>Portabilidade ou Empréstimo Consignado:</strong> Se sua dívida é no cartão (que cobra mais de 14% ao mês de juros rotativos), trocar por um crédito consignado ou pessoal a 2% ou 3% ao mês reduz a dívida pela metade.</li>
                <li><strong>Proposta com carência no Desenrola / Feirão Limpa Nome:</strong> Credores costumam dar até 80% de desconto para liquidação ou parcelamento fixo sem juros futuros.</li>
            </ol>
        `;
    }

    // 3. Priorização de dívidas (Bola de neve vs Avalanche)
    if (q.includes('prioriz') || q.includes('ordem') || q.includes('qual pagar') || q.includes('primeiro')) {
        return `
            <p>Existem dois métodos comprovados mundialmente para quem tem múltiplas contas, ${name}:</p>
            <ul>
                <li><strong>Método Avalanche (O mais matemático):</strong> Pague o valor mínimo de todas as contas e jogue todo o dinheiro extra na dívida que tem os <em>maiores juros</em> (geralmente Cartão de Crédito e Cheque Especial). Isso estanca o sangramento do seu dinheiro.</li>
                <li><strong>Método Bola de Neve (O melhor para a mente):</strong> Quite primeiro a <em>menor dívida em valor total</em>, independente dos juros. Ver uma conta sumir por completo dá um alívio psicológico gigante e motiva você a ir para a próxima!</li>
            </ul>
            <p>Se você se sente muito desmotivado, comece pela <strong>Bola de Neve</strong>. Se quer economizar o máximo de juros possível, vá de <strong>Avalanche</strong>!</p>
        `;
    }

    // 4. Empréstimo para quitar cartão
    if (q.includes('empréstimo') || q.includes('emprestimo') || q.includes('compens')) {
        return `
            <p>Essa é a famosa <em>"troca de dívida cara por dívida barata"</em>, e <strong>SIM, costuma compensar muito</strong>, desde que você siga esta regra de ouro:</p>
            <p>⚠️ <strong>Atenção:</strong> O juro do rotativo do cartão passa de <strong>400% ao ano</strong>. Um empréstimo pessoal ou com garantia costuma girar entre 25% a 60% ao ano. Ao trocar, sua parcela cai drasticamente.</p>
            <p><strong>A única armadilha:</strong> Você NÃO pode voltar a usar o cartão liberado enquanto paga o empréstimo! Caso contrário, ficará com DUAS dívidas ao mesmo tempo. Congele ou bloqueie o cartão provisoriamente.</p>
        `;
    }

    // 5. Renegociação / Desconto
    if (q.includes('renegoci') || q.includes('desconto') || q.includes('banco') || q.includes('ligar')) {
        return `
            <p>Dica prática de ouro para falar com o banco:</p>
            <p>Nunca aceite a primeira proposta que o atendente oferecer. Diga a seguinte frase:</p>
            <blockquote style="border-left: 3px solid var(--accent-color); padding-left: 0.8rem; margin: 0.5rem 0; font-style: italic; color: var(--text-secondary);">
                "Eu tenho a intenção firme de pagar toda a minha dívida, porém a minha capacidade real de pagamento hoje é de no máximo R$ [X] por mês até [data]. Se vocês puderem retirar os juros de mora e fixar esse valor, nós fechamos o acordo agora."
            </blockquote>
            <p>Os bancos possuem margens de desconto muito flexíveis nos setores de recuperação de crédito!</p>
        `;
    }

    // Resposta padrão contextual
    return `
        <p>Ótima questão, ${name}! Para a sua situação atual com <strong>${formatCurrency(debt)}</strong> em dívidas:</p>
        <p>O foco principal agora é a consistência. Cada real que você não gastar com coisas supérfluas hoje é um dia a menos de juros para o banco amanhã.</p>
        <p>Você pode testar datas diferentes no calendário acima para ver a parcela mensal mudando em tempo real. Se precisar de dicas sobre renegociação, cortes de despesas ou organização dos cartões, basta me perguntar!</p>
    `;
}

function appendUserMessage(text) {
    renderUserBubble(text);
    scrollChatToBottom();
    persistChatMessage('user', text);
}

function appendAIMessage(htmlContent) {
    renderAIBubble(htmlContent);
    scrollChatToBottom();
    persistChatMessage('ai', htmlContent);
}

function renderUserBubble(text) {
    const chatContainer = document.getElementById('chatMessages');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user';
    bubble.innerHTML = `
        <div class="bubble-avatar">👤</div>
        <div class="bubble-text">
            <p>${escapeHtml(text)}</p>
        </div>
    `;
    chatContainer.appendChild(bubble);
}

function renderAIBubble(htmlContent) {
    const chatContainer = document.getElementById('chatMessages');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ai';
    bubble.innerHTML = `
        <div class="bubble-avatar">🤖</div>
        <div class="bubble-text">
            ${htmlContent}
        </div>
    `;
    chatContainer.appendChild(bubble);
}

/**
 * Salva a mensagem no Supabase de forma assíncrona
 */
function persistChatMessage(sender, message) {
    if (!currentUser || typeof isSupabaseConfigured !== 'function' || !isSupabaseConfigured() || !supabaseClient) return;

    supabaseClient
        .from('chat_messages')
        .insert({
            user_id: currentUser.id,
            sender: sender,
            message: message
        })
        .then(({ error }) => {
            if (error) console.warn('Erro ao persistir mensagem no Supabase:', error);
        });
}

/**
 * Carrega o histórico de mensagens da nuvem do Supabase
 */
async function loadChatHistoryFromSupabase() {
    if (!currentUser || typeof isSupabaseConfigured !== 'function' || !isSupabaseConfigured() || !supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('chat_messages')
            .select('sender, message, created_at')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: true });

        if (data && data.length > 0) {
            const chatContainer = document.getElementById('chatMessages');
            chatContainer.innerHTML = '';
            data.forEach(msg => {
                if (msg.sender === 'user') {
                    renderUserBubble(msg.message);
                } else {
                    renderAIBubble(msg.message);
                }
            });
            scrollChatToBottom();
        }
    } catch (e) {
        console.warn('Erro ao carregar histórico do chat do Supabase:', e);
    }
}

function showTypingIndicator() {
    const chatContainer = document.getElementById('chatMessages');
    const bubble = document.createElement('div');
    bubble.id = 'typingIndicator';
    bubble.className = 'chat-bubble ai';
    bubble.innerHTML = `
        <div class="bubble-avatar">🤖</div>
        <div class="bubble-text">
            <span class="typing-dots">
                <span></span><span></span><span></span>
            </span>
            <small style="color: var(--text-secondary); margin-left: 6px;">FinAI analisando finanças...</small>
        </div>
    `;
    chatContainer.appendChild(bubble);
    scrollChatToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

function scrollChatToBottom() {
    const chatContainer = document.getElementById('chatMessages');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/* ============================================================================
   6. FUNÇÕES UTILITÁRIAS
   ============================================================================ */
function formatCurrency(val, wrapPrivacy = false) {
    if (isNaN(val) || val === null) val = 0;
    const formatted = Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (wrapPrivacy) {
        return `<span class="privacy-value" title="Passe o mouse para revelar">${formatted}</span>`;
    }
    return formatted;
}

function formatDateBR(dateInput) {
    if (!dateInput) return '--';
    if (typeof dateInput === 'string') {
        const parts = dateInput.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '--';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
