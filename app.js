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
    FINANCE_DATA: 'gastei_agora_finance_', // prefixo + userId
    CALENDAR_NOTES: 'gastei_agora_calendar_notes_', // prefixo + userId
    AUDIT_LOGS: 'gastei_agora_audit_logs', // log de atividades e auditoria
    ADMIN_PIN_HASH: 'gastei_agora_admin_pin_hash', // hash SHA-256 do PIN exclusivo do administrador
    ADMIN_EMAIL: 'gastei_agora_admin_email' // email personalizado do administrador
};

// E-mail padrão do proprietário/administrador oficial do sistema
const DEFAULT_ADMIN_EMAIL = 'gustavo.brilhamais@gmail.com';
const MASTER_ADMIN_KEYS = ['admin2026', 'gustavo2026', 'gustavo.brilhamais@gmail.com'];
const MAX_SAFE_FINANCE_VALUE = 999999999999999; // 999 Trilhões (limite seguro contra estouro de float IEEE-754)

// Estado da Aplicação
let currentUser = null;
let isPrivacyActive = false;
let isAdminUnlocked = false; // Controle de acesso em memória aos logs de auditoria
let adminPinMode = 'verify'; // 'verify' | 'setup' | 'change'
let brandClickCount = 0;
let brandClickTimer = null;
let currentFinanceData = {
    salary: 0,
    debt: 0,
    deadline: '',
    essentials: 0
};

/**
 * Verifica se o usuário atual é o administrador do sistema
 */
function isCurrentUserAdmin() {
    if (isAdminUnlocked) return true;
    if (!currentUser || !currentUser.email) return false;

    const userEmail = currentUser.email.toLowerCase().trim();
    const adminList = [DEFAULT_ADMIN_EMAIL.toLowerCase()];

    const customAdmin = localStorage.getItem(STORAGE_KEYS.ADMIN_EMAIL);
    if (customAdmin) {
        adminList.push(customAdmin.toLowerCase().trim());
    }

    return adminList.includes(userEmail);
}

/**
 * Atualiza a visibilidade dos botões de auditoria.
 * Totalmente invisível para qualquer visitante ou usuário comum.
 */
function updateAdminVisibility() {
    const isAdm = isCurrentUserAdmin();
    const auditNavBtn = document.getElementById('auditNavBtn');
    const auditGreetingBtn = document.getElementById('auditGreetingBtn');

    if (auditNavBtn) {
        if (isAdm) {
            auditNavBtn.classList.remove('hidden');
        } else {
            auditNavBtn.classList.add('hidden');
        }
    }

    if (auditGreetingBtn) {
        if (isAdm) {
            auditGreetingBtn.classList.remove('hidden');
        } else {
            auditGreetingBtn.classList.add('hidden');
        }
    }
}

/**
 * Gatilho secreto: 5 cliques rápidos no logo 'Gastei & Agora?' ativam o desafio de administrador
 */
function handleBrandSecretClick() {
    brandClickCount++;
    clearTimeout(brandClickTimer);
    brandClickTimer = setTimeout(() => { brandClickCount = 0; }, 2500);

    if (brandClickCount >= 5) {
        brandClickCount = 0;
        triggerAdminSecretChallenge();
    }
}

/**
 * Aciona o modal de identificação do administrador
 */
function triggerAdminSecretChallenge() {
    openAdminPinModal('verify');
}

// Estado do Calendário de Pagamentos
let calendarState = {
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(), // 0-indexed (0 = Jan, 11 = Dez)
    selectedDateStr: null,
    notes: {} // chave: 'YYYY-MM-DD' -> array de { id, text, value, isDeadline, createdAt }
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
    setupPrivacyTouchSupport();
    startMachineClock();
    updateAdminVisibility();
    initServiceWorker();
    setupNetworkStatusListeners();

    // Configura o ouvinte oficial reativo do Supabase Auth
    await setupAuthListener();
});

/**
 * Configura o listener reativo oficial do Supabase Auth (onAuthStateChange)
 * Trata login, logout, renovação de token e sincronização entre abas
 */
async function setupAuthListener() {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        // Registra o listener reativo para eventos de autenticação
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Supabase Auth Event:', event);

            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                if (session?.user) {
                    await loadUserSessionFromSupabase(session.user);
                }
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
                const dashboard = document.getElementById('dashboardSection');
                if (dashboard && !dashboard.classList.contains('hidden')) {
                    window.location.reload();
                } else {
                    renderAppForGuest();
                }
            }
        });
    } else {
        // Fallback: Recupera sessão local do LocalStorage com verificação de integridade
        await checkExistingSessionLocalStorage();
    }
}

async function hashPassword(plainTextPassword) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainTextPassword + '_salt_gastei_agora_v1');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateSessionToken(userId, userEmail) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${userId}:${userEmail}:gastei_agora_auth_secret_token_v1`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadUserSessionFromSupabase(authUser) {
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('full_name, theme_preference, privacy_mode')
            .eq('id', authUser.id)
            .maybeSingle();

        currentUser = {
            id: authUser.id,
            email: authUser.email,
            name: profile?.full_name || authUser.user_metadata?.full_name || 'Guerreiro Financeiro'
        };

        if (profile?.theme_preference) applyTheme(profile.theme_preference, false);
        if (profile?.privacy_mode !== undefined) setPrivacyMode(profile.privacy_mode, false);

        renderAppForAuthenticatedUser();
    } catch (err) {
        console.warn('Erro ao carregar perfil do Supabase:', err);
    }
}

async function checkExistingSessionLocalStorage() {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id && parsed.email) {
                const expectedToken = await generateSessionToken(parsed.id, parsed.email);
                // Valida a integridade da sessão local contra manipulação no console
                if (parsed.sessionToken === expectedToken) {
                    const users = getUsersFromStorage();
                    const validUser = users.find(u => u.id === parsed.id && u.email === parsed.email);
                    if (validUser) {
                        currentUser = {
                            id: validUser.id,
                            name: validUser.name,
                            email: validUser.email,
                            sessionToken: expectedToken
                        };
                        renderAppForAuthenticatedUser();
                        return;
                    }
                }
            }
            console.warn('Sessão local inválida ou adulterada. Redirecionando para login.');
            logActivity('SECURITY_ALERT', '⚠️ Tentativa de adulteração de token de sessão detectada e bloqueada.', {});
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        } catch (err) {
            console.error('Erro ao recuperar sessão do LocalStorage:', err);
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        }
    }
    renderAppForGuest();
}

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

    // Sincroniza o meta theme-color para navegadores móveis e status bar no PWA
    const metaTheme = document.getElementById('metaThemeColor');
    if (metaTheme) {
        metaTheme.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#0f172a');
    }

    const themeText = document.querySelector('.theme-text');
    if (themeText) {
        themeText.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
    }

    if (syncWithDb && currentUser && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        supabaseClient.from('profiles').update({ theme_preference: theme }).eq('id', currentUser.id)
            .then(({ error }) => { if (error) console.warn('Erro ao sincronizar tema no Supabase:', error); });
    }
}

/**
 * Registra o Service Worker do PWA com tratamento de ciclo de vida
 */
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then((registration) => {
                    console.log('✅ [PWA] Service Worker registrado com sucesso:', registration.scope);

                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (installingWorker) {
                            installingWorker.onstatechange = () => {
                                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('🔄 [PWA] Nova versão disponível em segundo plano.');
                                }
                            };
                        }
                    };
                })
                .catch((error) => {
                    console.warn('⚠️ [PWA] Falha ao registrar Service Worker:', error);
                });
        });
    }
}

/**
 * Monitora o status de conectividade online/offline com feedback visual suave
 */
function setupNetworkStatusListeners() {
    window.addEventListener('online', () => {
        showFeedback('📶 Conexão reestabelecida! Seus dados estão sincronizados.', 'success');
        if (currentUser && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
            loadUserFinanceData();
            loadCalendarNotesFromStorage();
        }
    });

    window.addEventListener('offline', () => {
        showFeedback('📡 Você está desconectado da internet. O modo offline do app está ativo.', 'info');
    });
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Ativa transição suave apenas durante a alternância manual do usuário
    document.body.classList.add('theme-transitioning');
    applyTheme(newTheme, true);
    logActivity('SETTINGS_CHANGE', `Tema visual alternado para: ${newTheme === 'dark' ? 'Modo Escuro' : 'Modo Claro'}`, { theme: newTheme });
    setTimeout(() => {
        document.body.classList.remove('theme-transitioning');
    }, 350);
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

    if (syncWithDb) {
        logActivity('SETTINGS_CHANGE', `Modo Privacidade ${enabled ? 'ativado (valores ocultos)' : 'desativado (valores visíveis)'}`, { privacy: enabled });
    }

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

// Configura data mínima para o input do calendário (a partir de hoje) e ouvinte de atualização
function setupDateConstraints() {
    const deadlineInput = document.getElementById('debtDeadline');
    if (deadlineInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        deadlineInput.min = `${yyyy}-${mm}-${dd}`;

        // Sincroniza dinamicamente o calendário ao alterar a data no campo
        deadlineInput.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                currentFinanceData.deadline = val;
                syncDeadlineWithCalendarNotes();
                const [y, m] = val.split('-').map(Number);
                calendarState.viewYear = y;
                calendarState.viewMonth = m - 1;
                calendarState.selectedDateStr = val;
                renderCalendarGrid();
                renderSelectedDateNotes();
            }
        });
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
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : 'Criar Conta & Começar';

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

    // Feedback visual de carregamento
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Criando sua conta...';
    }

    try {
        // Se o Supabase estiver configurado, registra no Supabase Auth
        if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
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
                let msg = error.message;
                if (msg.includes('already registered')) {
                    msg = 'Este e-mail já está cadastrado. Por favor, faça login.';
                } else if (msg.includes('Password should be')) {
                    msg = 'A senha informada não atende aos requisitos de segurança do Supabase.';
                }
                registerError.textContent = 'Erro ao cadastrar: ' + msg;
                registerError.classList.remove('hidden');
                return;
            }

            if (data?.user) {
                // Caso o Supabase esteja configurado para exigir confirmação de e-mail (sem sessão imediata)
                if (!data.session) {
                    registerSuccess.innerHTML = `
                        🎉 <strong>Conta criada com sucesso!</strong><br>
                        Enviamos um link de confirmação para <em>${escapeHtml(emailInput)}</em>.<br>
                        Por favor, clique no link do seu e-mail para ativar sua conta e fazer login.
                    `;
                    registerSuccess.classList.remove('hidden');
                    return;
                }

                // Se auto-confirm estiver ativado, a sessão é iniciada imediatamente
                registerSuccess.textContent = 'Conta criada com sucesso! Acessando seu painel...';
                registerSuccess.classList.remove('hidden');
                setTimeout(() => {
                    closeAuthModal();
                    window.location.reload();
                }, 500);
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

        const passwordHash = await hashPassword(passwordInput);
        const newUser = {
            id: 'usr_' + Date.now(),
            name: nameInput,
            email: emailInput,
            passwordHash: passwordHash, // Senha armazenada exclusivamente via hash SHA-256
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveUsersToStorage(users);

        registerSuccess.textContent = 'Conta criada com sucesso! Redirecionando para seu painel...';
        registerSuccess.classList.remove('hidden');

        await logActivity('AUTH_REGISTER', `Nova conta cadastrada: ${nameInput} (${emailInput})`, { name: nameInput, email: emailInput });

        setTimeout(async () => {
            await setSessionUser(newUser);
            window.location.reload();
        }, 600);
    } catch (err) {
        registerError.textContent = 'Falha ao processar cadastro: ' + err.message;
        registerError.classList.remove('hidden');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : 'Acessar Meu Painel';

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

    // Feedback visual de carregamento
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando credenciais...';
    }

    try {
        // Se o Supabase estiver configurado, autentica via Supabase Auth
        if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailInput,
                password: passwordInput
            });

            if (error) {
                let msg = error.message;
                if (msg.includes('Invalid login credentials')) {
                    msg = 'E-mail ou senha incorretos. Verifique suas credenciais.';
                } else if (msg.includes('Email not confirmed')) {
                    msg = 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada e clique no link de ativação enviado pelo Supabase.';
                } else if (msg.includes('Too many requests')) {
                    msg = 'Muitas tentativas em sequência. Por favor, aguarde alguns instantes antes de tentar novamente.';
                }
                loginError.textContent = msg;
                loginError.classList.remove('hidden');
                return;
            }

            if (data?.session) {
                await logActivity('AUTH_LOGIN', `Login realizado com sucesso via Supabase por ${emailInput}`, { email: emailInput });
                closeAuthModal();
                window.location.reload();
                return;
            }
        }

        // Fallback: Autenticação segura via LocalStorage com hash criptográfico
        const users = getUsersFromStorage();
        const inputHash = await hashPassword(passwordInput);
        const user = users.find(u => u.email === emailInput && (u.passwordHash === inputHash || u.password === passwordInput));

        if (!user) {
            loginError.textContent = 'E-mail ou senha incorretos. Verifique seus dados ou crie uma conta.';
            loginError.classList.remove('hidden');
            return;
        }

        // Se o usuário possuía senha legada em plaintext, migra automaticamente para hash
        if (user.password && !user.passwordHash) {
            user.passwordHash = inputHash;
            delete user.password;
            saveUsersToStorage(users);
        }

        await logActivity('AUTH_LOGIN', `Login realizado com sucesso por ${emailInput}`, { email: emailInput });
        await setSessionUser(user);
        window.location.reload();
    } catch (err) {
        loginError.textContent = 'Falha de comunicação: ' + err.message;
        loginError.classList.remove('hidden');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }
}

async function setSessionUser(user) {
    const sessionToken = await generateSessionToken(user.id, user.email);
    // Guarda apenas dados públicos sanitizados e o token de validação de integridade
    currentUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        sessionToken
    };
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
    renderAppForAuthenticatedUser();
}

async function handleLogout() {
    const loggingOutEmail = currentUser?.email || 'usuário';
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
        try {
            await supabaseClient.auth.signOut();
        } catch (e) {
            console.warn('Erro ao encerrar sessão no Supabase:', e);
        }
    }
    await logActivity('AUTH_LOGOUT', `Sessão encerrada por ${loggingOutEmail}`, {});
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    sessionStorage.clear();
    // Recarrega a página automaticamente para deslogar e resetar totalmente os dados
    window.location.reload();
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

// Fechar com tecla ESC & Atalho secreto do Administrador (Ctrl + Shift + L)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAuthModal();
        closeAuditModal();
        closeAdminPinModal();
        closeNotificationExplanationModal();
        closeInAppNotificationFallback();
    }
    // Atalho secreto do Administrador (Ctrl + Shift + L)
    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        triggerAdminSecretChallenge();
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

    // Atualiza visibilidade dos recursos de administrador
    updateAdminVisibility();

    // Carregar dados financeiros salvos do usuário
    loadUserFinanceData();
}

function renderAppForGuest() {
    closeAuthModal();
    isAdminUnlocked = false;
    const landing = document.getElementById('homeLandingSection');
    const dashboard = document.getElementById('dashboardSection');
    const userPill = document.getElementById('userPill');
    const loginNavBtn = document.getElementById('loginNavBtn');

    if (landing) landing.classList.remove('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    if (userPill) userPill.classList.add('hidden');
    if (loginNavBtn) loginNavBtn.classList.remove('hidden');

    // Oculta completamente quaisquer botões de auditoria
    updateAdminVisibility();

    // Reseta todos os dados e inputs para evitar qualquer resquício
    currentFinanceData = { salary: 0, debt: 0, deadline: '', essentials: 0 };
    const monthlySalary = document.getElementById('monthlySalary');
    const totalDebt = document.getElementById('totalDebt');
    const debtDeadline = document.getElementById('debtDeadline');
    const essentialExpenses = document.getElementById('essentialExpenses');
    if (monthlySalary) monthlySalary.value = '';
    if (totalDebt) totalDebt.value = '';
    if (debtDeadline) debtDeadline.value = '';
    if (essentialExpenses) essentialExpenses.value = '';
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
                loaded = true;
            } catch (e) {
                console.error('Erro ao ler finanças do LocalStorage:', e);
            }
        }
    }

    // 3. Se for um usuário novo (sem dados salvos no Supabase nem no LocalStorage), reseta todos os campos
    if (!loaded) {
        currentFinanceData = {
            salary: 0,
            debt: 0,
            deadline: '',
            essentials: 0
        };
        document.getElementById('monthlySalary').value = '';
        document.getElementById('totalDebt').value = '';
        document.getElementById('essentialExpenses').value = '';

        // Preenche com uma deadline padrão (ex: daqui a 6 meses) para guiar o usuário
        const defaultDeadline = new Date();
        defaultDeadline.setMonth(defaultDeadline.getMonth() + 6);
        const yyyy = defaultDeadline.getFullYear();
        const mm = String(defaultDeadline.getMonth() + 1).padStart(2, '0');
        const dd = String(defaultDeadline.getDate()).padStart(2, '0');
        const defaultDeadlineStr = `${yyyy}-${mm}-${dd}`;
        document.getElementById('debtDeadline').value = defaultDeadlineStr;
        currentFinanceData.deadline = defaultDeadlineStr;

        calculateAndRenderMetrics();
    }

    // Inicializa o calendário com notas e deadline do usuário
    initCalendar();
}

async function handleSaveFinanceData(e) {
    e.preventDefault();
    if (!currentUser) return;

    let salary = parseFloat(document.getElementById('monthlySalary').value) || 0;
    let debt = parseFloat(document.getElementById('totalDebt').value) || 0;
    const deadline = document.getElementById('debtDeadline').value;
    let essentials = parseFloat(document.getElementById('essentialExpenses').value) || 0;

    let wasCapped = false;
    if (salary > MAX_SAFE_FINANCE_VALUE) { salary = MAX_SAFE_FINANCE_VALUE; wasCapped = true; }
    if (debt > MAX_SAFE_FINANCE_VALUE) { debt = MAX_SAFE_FINANCE_VALUE; wasCapped = true; }
    if (essentials > MAX_SAFE_FINANCE_VALUE) { essentials = MAX_SAFE_FINANCE_VALUE; wasCapped = true; }

    if (wasCapped) {
        showFeedback('Valores acima de R$ 999 Trilhões foram limitados para preservar a precisão dos cálculos e a integridade visual.', 'info');
        document.getElementById('monthlySalary').value = salary;
        document.getElementById('totalDebt').value = debt;
        if (document.getElementById('essentialExpenses')) document.getElementById('essentialExpenses').value = essentials;
    }

    if (!deadline) {
        alert('Por favor, escolha uma data limite (deadline) no calendário.');
        return;
    }

    const oldSalary = currentFinanceData.salary;
    const oldDebt = currentFinanceData.debt;
    const oldDeadline = currentFinanceData.deadline;
    const oldEssentials = currentFinanceData.essentials;

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
    syncDeadlineWithCalendarNotes();
    renderCalendarGrid();
    renderSelectedDateNotes();

    const changes = [];
    if (oldSalary !== salary) changes.push(`Salário: ${formatCurrency(oldSalary)} ➜ ${formatCurrency(salary)}`);
    if (oldDebt !== debt) changes.push(`Dívida: ${formatCurrency(oldDebt)} ➜ ${formatCurrency(debt)}`);
    if (oldDeadline !== deadline) changes.push(`Deadline: ${formatDateBR(oldDeadline)} ➜ ${formatDateBR(deadline)}`);
    if (oldEssentials !== essentials) changes.push(`Gastos: ${formatCurrency(oldEssentials)} ➜ ${formatCurrency(essentials)}`);

    const logDesc = changes.length > 0 ? `Atualização financeira: ${changes.join(' | ')}` : 'Dados financeiros confirmados';
    await logActivity('FINANCE_UPDATE', logDesc, {
        old: { salary: oldSalary, debt: oldDebt, deadline: oldDeadline, essentials: oldEssentials },
        new: { salary, debt, deadline, essentials }
    });
    
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
    let num = Number(val);
    if (!isFinite(num) || num > MAX_SAFE_FINANCE_VALUE) {
        num = MAX_SAFE_FINANCE_VALUE;
    } else if (num < -MAX_SAFE_FINANCE_VALUE) {
        num = -MAX_SAFE_FINANCE_VALUE;
    }
    const formatted = num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
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

/* ============================================================================
   7. CALENDÁRIO INTERATIVO & NOTAS / LEMBRETES DE PAGAMENTO
   ============================================================================ */

/**
 * Inicializa o calendário: sincronizado na data e horário exatos da máquina do usuário
 */
function initCalendar() {
    loadCalendarNotes();

    // Se houver uma deadline cadastrada, sincroniza a nota da deadline
    if (currentFinanceData.deadline) {
        syncDeadlineWithCalendarNotes();
    }

    // Inicializa SEMPRE no mês e ano da data atual da máquina
    const machineNow = new Date();
    calendarState.viewYear = machineNow.getFullYear();
    calendarState.viewMonth = machineNow.getMonth(); // 0 a 11
    calendarState.selectedDateStr = toISODateString(machineNow);

    // Inicia e atualiza o relógio em tempo real da máquina
    startMachineClock();

    // Ativa delegação de eventos segura para o calendário
    setupCalendarDelegation();

    renderCalendarGrid();
    renderSelectedDateNotes();
}

let machineClockTimer = null;
function startMachineClock() {
    updateMachineClock();
    if (machineClockTimer) clearInterval(machineClockTimer);
    machineClockTimer = setInterval(updateMachineClock, 1000);
}

function updateMachineClock() {
    const clockEl = document.getElementById('calendarMachineClock');
    if (!clockEl) return;
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const timeFormatted = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    clockEl.innerHTML = `📅 <strong>${dateFormatted}</strong> &bull; ⏰ <strong class="clock-time-digits">${timeFormatted}</strong>`;

    // Sincroniza o calendário se o dia da máquina virar (à meia-noite)
    const currentToday = toISODateString(now);
    if (clockEl.dataset.todayStr && clockEl.dataset.todayStr !== currentToday) {
        calendarState.viewYear = now.getFullYear();
        calendarState.viewMonth = now.getMonth();
        calendarState.selectedDateStr = currentToday;
        renderCalendarGrid();
        renderSelectedDateNotes();
    }
    clockEl.dataset.todayStr = currentToday;
}

/**
 * Formata um objeto Date local para string YYYY-MM-DD
 */
function toISODateString(d) {
    if (!d || isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Retorna o nome por extenso do mês em Português
 */
function getMonthNamePT(monthIdx) {
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[monthIdx] || '';
}

/**
 * Carrega as notas do LocalStorage para o usuário ativo (ou convidado)
 */
function loadCalendarNotes() {
    const key = STORAGE_KEYS.CALENDAR_NOTES + (currentUser ? currentUser.id : 'guest');
    const raw = localStorage.getItem(key);
    if (raw) {
        try {
            calendarState.notes = JSON.parse(raw);
        } catch (e) {
            console.warn('Erro ao carregar notas do calendário:', e);
            calendarState.notes = {};
        }
    } else {
        calendarState.notes = {};
    }
}

/**
 * Salva as notas do calendário no LocalStorage
 */
function saveCalendarNotes() {
    const key = STORAGE_KEYS.CALENDAR_NOTES + (currentUser ? currentUser.id : 'guest');
    try {
        localStorage.setItem(key, JSON.stringify(calendarState.notes));
    } catch (e) {
        console.error('Erro ao persistir notas do calendário:', e);
    }
}

/**
 * Sincroniza automaticamente a data de pagamento (deadline) como uma nota no calendário
 */
function syncDeadlineWithCalendarNotes() {
    // 1. Remove qualquer nota de deadline automática anterior de todas as datas
    for (const dateKey in calendarState.notes) {
        if (Array.isArray(calendarState.notes[dateKey])) {
            calendarState.notes[dateKey] = calendarState.notes[dateKey].filter(n => !n.isDeadline);
            if (calendarState.notes[dateKey].length === 0) {
                delete calendarState.notes[dateKey];
            }
        }
    }

    // 2. Se houver deadline configurada, adiciona a nota oficial de quitação
    const deadlineDate = currentFinanceData.deadline;
    if (deadlineDate) {
        if (!calendarState.notes[deadlineDate]) {
            calendarState.notes[deadlineDate] = [];
        }

        const deadlineNote = {
            id: 'deadline_official_' + deadlineDate,
            text: '🏁 Quitação da Dívida (Deadline Oficial)',
            value: currentFinanceData.debt || 0,
            isDeadline: true,
            createdAt: new Date().toISOString()
        };

        // Insere a nota no início da lista para destaque
        calendarState.notes[deadlineDate].unshift(deadlineNote);
    }

    saveCalendarNotes();
}

/**
 * Renderiza os dias do mês na grade do calendário
 */
function renderCalendarGrid() {
    const gridEl = document.getElementById('calendarDaysGrid');
    const displayEl = document.getElementById('calendarMonthYearDisplay');
    if (!gridEl || !displayEl) return;

    const { viewYear, viewMonth, selectedDateStr } = calendarState;

    // Atualiza cabeçalho de navegação (Ex: Novembro 2026)
    displayEl.textContent = `${getMonthNamePT(viewMonth)} ${viewYear}`;

    // Primeiro dia do mês atual e quantidade de dias
    const firstDayDate = new Date(viewYear, viewMonth, 1);
    const startingDayOfWeek = firstDayDate.getDay(); // 0 = Domingo, 6 = Sábado
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const todayStr = toISODateString(new Date());
    const deadlineStr = currentFinanceData.deadline || '';

    let html = '';

    // 1. Dias do mês anterior para preencher o início da semana
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const dayNum = daysInPrevMonth - i;
        const prevMonthIdx = viewMonth === 0 ? 11 : viewMonth - 1;
        const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
        const dateStr = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

        html += `
            <div class="cal-day other-month" data-action="select-day" data-date="${escapeHtml(dateStr)}" data-other-month="true">
                <span class="day-number">${dayNum}</span>
                <div class="day-indicators"></div>
            </div>
        `;
    }

    // 2. Dias do mês atual
    for (let day = 1; day <= daysInCurrentMonth; day++) {
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const isDeadline = dateStr === deadlineStr;
        const isSelected = dateStr === selectedDateStr;
        const notes = calendarState.notes[dateStr] || [];
        const hasNotes = notes.length > 0;

        const classList = ['cal-day'];
        if (isToday) classList.push('today');
        if (isDeadline) classList.push('deadline');
        if (isSelected) classList.push('selected');
        if (hasNotes) classList.push('has-notes');

        // Indicadores (bandeira da deadline e ponto de lembretes)
        let indicatorsHtml = '';
        if (isDeadline) {
            indicatorsHtml += `<span class="indicator-flag" title="Data Limite de Pagamento (Deadline)">🏁</span>`;
        }
        if (hasNotes && (!isDeadline || notes.length > 1)) {
            const count = isDeadline ? notes.length - 1 : notes.length;
            indicatorsHtml += `<span class="indicator-dot" title="${count} nota(s) de pagamento"></span>`;
        }

        html += `
            <div class="${classList.join(' ')}" data-action="select-day" data-date="${escapeHtml(dateStr)}" title="${isDeadline ? 'Data de quitação da dívida' : ''}">
                <span class="day-number">${day}</span>
                <div class="day-indicators">${indicatorsHtml}</div>
            </div>
        `;
    }

    // 3. Dias do próximo mês para completar a última semana
    const totalCells = startingDayOfWeek + daysInCurrentMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let nextDay = 1; nextDay <= remainingCells; nextDay++) {
        const nextMonthIdx = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
        const dateStr = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;

        html += `
            <div class="cal-day other-month" data-action="select-day" data-date="${escapeHtml(dateStr)}" data-other-month="true">
                <span class="day-number">${nextDay}</span>
                <div class="day-indicators"></div>
            </div>
        `;
    }

    gridEl.innerHTML = html;
}

/**
 * Configura delegação segura de eventos no calendário (previne XSS e inline event handlers)
 */
let isCalendarDelegationSetup = false;
function setupCalendarDelegation() {
    if (isCalendarDelegationSetup) return;
    isCalendarDelegationSetup = true;

    const gridEl = document.getElementById('calendarDaysGrid');
    if (gridEl) {
        gridEl.addEventListener('click', (e) => {
            const dayEl = e.target.closest('[data-action="select-day"]');
            if (dayEl && dayEl.dataset.date) {
                const isOtherMonth = dayEl.dataset.otherMonth === 'true';
                selectCalendarDate(dayEl.dataset.date, isOtherMonth);
            }
        });
    }

    const notesListEl = document.getElementById('selectedDateNotesList');
    if (notesListEl) {
        notesListEl.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('[data-action="delete-note"]');
            if (deleteBtn && deleteBtn.dataset.date && deleteBtn.dataset.noteId) {
                handleDeleteCalendarNote(deleteBtn.dataset.date, deleteBtn.dataset.noteId);
            }
        });
    }
}

/**
 * Seleciona uma data no calendário e exibe suas notas
 */
function selectCalendarDate(dateStr, fromOtherMonth = false) {
    if (!dateStr) return;

    calendarState.selectedDateStr = dateStr;

    if (fromOtherMonth) {
        const [y, m] = dateStr.split('-').map(Number);
        calendarState.viewYear = y;
        calendarState.viewMonth = m - 1;
    }

    renderCalendarGrid();
    renderSelectedDateNotes();
}

/**
 * Renderiza o painel de notas da data selecionada
 */
function renderSelectedDateNotes() {
    const titleEl = document.getElementById('selectedDateTitle');
    const countBadgeEl = document.getElementById('selectedDateCountBadge');
    const notesListEl = document.getElementById('selectedDateNotesList');
    const hiddenDateEl = document.getElementById('selectedDateHidden');

    if (!notesListEl) return;

    const dateStr = calendarState.selectedDateStr || toISODateString(new Date());
    calendarState.selectedDateStr = dateStr;

    if (hiddenDateEl) hiddenDateEl.value = dateStr;

    const todayStr = toISODateString(new Date());
    const isToday = dateStr === todayStr;
    const isDeadline = dateStr === (currentFinanceData.deadline || '');

    let dateLabel = formatDateBR(dateStr);
    if (isToday) dateLabel += ' (Hoje)';
    if (isDeadline) dateLabel += ' 🏁';

    if (titleEl) titleEl.textContent = `Notas de ${dateLabel}`;

    const notes = calendarState.notes[dateStr] || [];
    if (countBadgeEl) {
        countBadgeEl.textContent = `${notes.length} nota${notes.length === 1 ? '' : 's'}`;
    }

    if (notes.length === 0) {
        notesListEl.innerHTML = `
            <p class="empty-notes-hint">
                Nenhum lembrete para esta data. Digite uma descrição abaixo para adicionar notas ou parcelas de pagamento.
            </p>
        `;
        return;
    }

    notesListEl.innerHTML = notes.map(note => `
        <div class="note-item ${note.isDeadline ? 'is-deadline' : ''}">
            <div class="note-item-content">
                <span class="note-item-text">${escapeHtml(note.text)}</span>
                ${note.value ? `<span class="note-item-amount">${formatCurrency(note.value)}</span>` : ''}
            </div>
            ${!note.isDeadline ? `
                <button type="button" class="note-item-delete" data-action="delete-note" data-date="${escapeHtml(dateStr)}" data-note-id="${escapeHtml(note.id)}" title="Excluir este lembrete">
                    🗑️
                </button>
            ` : `<span title="Lembrete automático sincronizado com a deadline" style="font-size: 0.85rem; cursor: help;">🔒</span>`}
        </div>
    `).join('');
}

/**
 * Salva uma nova nota/lembrete para a data selecionada
 */
function handleSaveCalendarNote(event) {
    if (event) event.preventDefault();

    const dateStr = document.getElementById('selectedDateHidden')?.value || calendarState.selectedDateStr;
    const textInput = document.getElementById('noteTextInput');
    const valInput = document.getElementById('noteValueInput');

    if (!dateStr || !textInput) return;

    const text = textInput.value.trim();
    if (!text) return;

    let val = parseFloat(valInput.value) || null;
    if (val !== null && val > MAX_SAFE_FINANCE_VALUE) {
        val = MAX_SAFE_FINANCE_VALUE;
        valInput.value = val;
    }

    if (!calendarState.notes[dateStr]) {
        calendarState.notes[dateStr] = [];
    }

    const newNote = {
        id: 'note_' + Date.now(),
        text: text,
        value: val,
        isDeadline: false,
        createdAt: new Date().toISOString()
    };

    calendarState.notes[dateStr].push(newNote);
    saveCalendarNotes();

    logActivity('NOTE_ADDED', `Lembrete adicionado em ${formatDateBR(dateStr)}: "${text}"${val ? ` (${formatCurrency(val)})` : ''}`, { date: dateStr, text, value: val });

    // Limpa os campos
    textInput.value = '';
    if (valInput) valInput.value = '';

    renderCalendarGrid();
    renderSelectedDateNotes();
}

/**
 * Exclui uma nota manual do calendário
 */
function handleDeleteCalendarNote(dateStr, noteId) {
    if (!calendarState.notes[dateStr]) return;

    const noteToDelete = calendarState.notes[dateStr]?.find(n => n.id === noteId);
    const noteDesc = noteToDelete ? `"${noteToDelete.text}"${noteToDelete.value ? ` (${formatCurrency(noteToDelete.value)})` : ''}` : noteId;

    calendarState.notes[dateStr] = calendarState.notes[dateStr].filter(n => n.id !== noteId);
    if (calendarState.notes[dateStr].length === 0) {
        delete calendarState.notes[dateStr];
    }

    saveCalendarNotes();
    logActivity('NOTE_DELETED', `Lembrete removido em ${formatDateBR(dateStr)}: ${noteDesc}`, { date: dateStr, noteId });

    renderCalendarGrid();
    renderSelectedDateNotes();
}

/**
 * Altera o mês de visualização do calendário (+1 ou -1)
 */
function changeCalendarMonth(delta) {
    calendarState.viewMonth += delta;
    if (calendarState.viewMonth < 0) {
        calendarState.viewMonth = 11;
        calendarState.viewYear--;
    } else if (calendarState.viewMonth > 11) {
        calendarState.viewMonth = 0;
        calendarState.viewYear++;
    }
    renderCalendarGrid();
}

/**
 * Vai diretamente para o dia de hoje no calendário
 */
function goToTodayCalendar() {
    const now = new Date();
    calendarState.viewYear = now.getFullYear();
    calendarState.viewMonth = now.getMonth();
    selectCalendarDate(toISODateString(now));
}

/**
 * Vai diretamente para a data da deadline de pagamento
 */
function goToDeadlineCalendar() {
    if (!currentFinanceData.deadline) {
        alert('Você ainda não definiu uma data de quitação (deadline). Selecione uma data no formulário acima.');
        document.getElementById('debtDeadline')?.focus();
        return;
    }

    const [y, m] = currentFinanceData.deadline.split('-').map(Number);
    calendarState.viewYear = y;
    calendarState.viewMonth = m - 1;
    selectCalendarDate(currentFinanceData.deadline);
}

/* ============================================================================
   8. SISTEMA DE AUDITORIA & RASTREAMENTO DE ATIVIDADES (AUDIT LOGS)
   Permite identificar quem, quando e o que alterou no site, com encadeamento de hash SHA-256
   ============================================================================ */

/**
 * Retorna os logs de auditoria armazenados localmente
 */
function getAuditLogsFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('Erro ao ler logs de auditoria:', e);
        return [];
    }
}

/**
 * Salva os logs de auditoria no LocalStorage
 */
function saveAuditLogsToStorage(logs) {
    try {
        localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
    } catch (e) {
        console.error('Erro ao salvar logs de auditoria:', e);
    }
}

/**
 * Calcula o hash SHA-256 encadeado de uma entrada de log para integridade à prova de adulteração
 */
async function calculateLogHash(previousHash, timestamp, action, description, email) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${previousHash}|${timestamp}|${action}|${description}|${email}|audit_secret_v1`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Registra uma atividade no log de auditoria local e na nuvem do Supabase (se conectado)
 */
async function logActivity(action, description, details = {}) {
    try {
        const logs = getAuditLogsFromStorage();
        const now = new Date();
        const timestamp = now.toISOString();
        const email = currentUser ? currentUser.email : 'Visitante';
        const userName = currentUser ? currentUser.name : 'Visitante';

        const previousHash = logs.length > 0 ? (logs[0].hash || 'genesis_hash') : 'genesis_hash';
        const hash = await calculateLogHash(previousHash, timestamp, action, description, email);

        const newEntry = {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            timestamp,
            dateFormatted: now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            timeFormatted: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            action,
            description,
            details,
            userEmail: email,
            userName: userName,
            previousHash,
            hash
        };

        logs.unshift(newEntry);

        // Limita a 200 entradas mais recentes para otimização de espaço
        if (logs.length > 200) {
            logs.length = 200;
        }

        saveAuditLogsToStorage(logs);

        // Se o Supabase estiver configurado, salva também na nuvem
        if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && supabaseClient) {
            supabaseClient.from('audit_logs').insert({
                user_id: currentUser ? currentUser.id : null,
                user_email: email,
                action: action,
                description: description,
                details: details,
                checksum: hash,
                created_at: timestamp
            }).then(({ error }) => {
                if (error) console.warn('Erro ao sincronizar log com Supabase:', error);
            });
        }

        // Se o modal estiver aberto, atualiza a lista em tempo real
        const modal = document.getElementById('auditModal');
        if (modal && !modal.classList.contains('hidden')) {
            renderAuditLogsList();
        }
    } catch (err) {
        console.warn('Erro ao registrar log de atividade:', err);
    }
}

/**
 * Valida a integridade encadeada de todos os registros de log
 */
async function verifyAuditLogsIntegrity() {
    const logs = getAuditLogsFromStorage();
    if (logs.length <= 1) return { valid: true };

    for (let i = 0; i < logs.length; i++) {
        const entry = logs[i];
        const prevHash = (i === logs.length - 1) ? 'genesis_hash' : (logs[i + 1].hash || 'genesis_hash');
        const expected = await calculateLogHash(prevHash, entry.timestamp, entry.action, entry.description, entry.userEmail);
        if (entry.hash !== expected) {
            return { valid: false, tamperedIndex: i, entry };
        }
    }
    return { valid: true };
}

/**
 * Abre o modal de auditoria e renderiza os logs (exclusivo para o administrador)
 */
async function openAuditModal() {
    if (!isCurrentUserAdmin()) {
        showFeedback('Acesso negado: Este recurso é restrito exclusivamente ao administrador.', 'error');
        return;
    }
    const modal = document.getElementById('auditModal');
    if (modal) {
        modal.classList.remove('hidden');
        await renderAuditLogsList();
    }
}

/**
 * Fecha o modal de auditoria
 */
function closeAuditModal() {
    const modal = document.getElementById('auditModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function handleAuditBackdropClick(event) {
    if (event.target.id === 'auditModal') {
        closeAuditModal();
    }
}

/**
 * Renderiza os registros de logs no modal com filtro e verificação de integridade
 */
async function renderAuditLogsList() {
    const container = document.getElementById('auditLogsContainer');
    const badgeEl = document.getElementById('auditIntegrityBadge');
    const badgeText = document.getElementById('auditIntegrityText');
    const filterSelect = document.getElementById('auditFilterSelect');

    if (!container) return;

    // Proteção de acesso: se não for administrador, não exibe os dados
    if (!isCurrentUserAdmin()) {
        container.innerHTML = `
            <div class="empty-audit-hint" style="color: var(--danger-color, #ef4444); text-align: center; padding: 2rem 1rem;">
                <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔒</div>
                <p style="font-weight: 700; margin-bottom: 0.25rem;">Acesso Restrito ao Administrador</p>
                <small>Apenas o proprietário do site possui autorização para visualizar o histórico de auditoria.</small>
            </div>
        `;
        return;
    }

    // 1. Verifica integridade dos registros
    const integrity = await verifyAuditLogsIntegrity();
    if (badgeEl && badgeText) {
        if (integrity.valid) {
            badgeEl.className = 'audit-integrity-status';
            badgeText.textContent = 'Integridade: Verificada e Intacta';
        } else {
            badgeEl.className = 'audit-integrity-status tampered';
            badgeText.textContent = '⚠️ Alerta: Registro adulterado externamente!';
        }
    }

    // 2. Filtra registros
    let logs = getAuditLogsFromStorage();
    const filter = filterSelect ? filterSelect.value : 'all';

    if (filter === 'AUTH') {
        logs = logs.filter(l => l.action.startsWith('AUTH_'));
    } else if (filter !== 'all') {
        logs = logs.filter(l => l.action === filter);
    }

    if (logs.length === 0) {
        container.innerHTML = `
            <div class="empty-audit-hint">
                <p>Nenhuma atividade encontrada com o filtro selecionado.</p>
                <small>As ações realizadas no site (alterações de dados, lembretes, acessos) serão exibidas aqui com data e hora exatas.</small>
            </div>
        `;
        return;
    }

    const actionIcons = {
        'FINANCE_UPDATE': '💰',
        'NOTE_ADDED': '📝',
        'NOTE_DELETED': '🗑️',
        'AUTH_LOGIN': '🔑',
        'AUTH_LOGOUT': '🚪',
        'AUTH_REGISTER': '🎉',
        'SETTINGS_CHANGE': '⚙️',
        'SECURITY_ALERT': '🚨',
        'LOGS_CLEARED': '🧹'
    };

    const actionTags = {
        'FINANCE_UPDATE': { text: 'Finanças', cls: 'finance' },
        'NOTE_ADDED': { text: 'Lembrete', cls: 'note' },
        'NOTE_DELETED': { text: 'Remoção', cls: 'note' },
        'AUTH_LOGIN': { text: 'Login', cls: 'auth' },
        'AUTH_LOGOUT': { text: 'Logout', cls: 'auth' },
        'AUTH_REGISTER': { text: 'Cadastro', cls: 'auth' },
        'SETTINGS_CHANGE': { text: 'Configurações', cls: 'settings' },
        'SECURITY_ALERT': { text: 'Segurança', cls: 'security' },
        'LOGS_CLEARED': { text: 'Limpeza', cls: 'settings' }
    };

    container.innerHTML = logs.map(log => {
        const icon = actionIcons[log.action] || '📌';
        const tag = actionTags[log.action] || { text: log.action, cls: 'settings' };

        return `
            <div class="audit-log-item">
                <div class="audit-log-icon">${icon}</div>
                <div class="audit-log-content">
                    <div class="audit-log-header">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span class="audit-log-type-tag ${tag.cls}">${tag.text}</span>
                            <span class="audit-log-user">${escapeHtml(log.userEmail)}</span>
                        </div>
                        <span class="audit-log-time">📅 ${log.dateFormatted} às ${log.timeFormatted}</span>
                    </div>
                    <div class="audit-log-desc">${escapeHtml(log.description)}</div>
                    <div class="audit-log-checksum" title="Checksum SHA-256 da assinatura do log">
                        Hash: ${escapeHtml(log.hash ? log.hash.substring(0, 16) + '...' : 'legado')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Exporta o histórico completo de auditoria em arquivo JSON
 */
function exportAuditLogs() {
    if (!isCurrentUserAdmin()) {
        showFeedback('Acesso negado: Exclusivo ao administrador do sistema.', 'error');
        return;
    }

    const logs = getAuditLogsFromStorage();
    const payload = {
        sistema: 'Gastei & Agora? - Relatório Oficial de Auditoria e Atividades',
        geradoEm: new Date().toISOString(),
        geradoPor: currentUser ? currentUser.email : 'Administrador',
        totalAtividades: logs.length,
        registros: logs
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const yyyymmdd = toISODateString(new Date()).replace(/-/g, '');
    link.href = url;
    link.download = `auditoria_atividades_${yyyymmdd}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Limpa os logs locais após confirmação e registra a ação de limpeza
 */
async function clearAuditLogs() {
    if (!isCurrentUserAdmin()) {
        showFeedback('Acesso negado: Exclusivo ao administrador do sistema.', 'error');
        return;
    }

    if (!confirm('Deseja realmente limpar o histórico local de atividades? Esta ação também será registrada no novo histórico.')) {
        return;
    }

    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
    await logActivity('LOGS_CLEARED', `Histórico local de auditoria foi limpo por ${currentUser?.email || 'Administrador'}`, {});
    await renderAuditLogsList();
}

/**
 * Gera hash SHA-256 com salt fixo para o PIN do administrador
 */
async function hashAdminPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`gastei_agora_pin_salt_v1:${pin}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Abre o modal de PIN/Chave do administrador ('verify' ou 'change')
 */
function openAdminPinModal(mode = 'verify') {
    adminPinMode = mode;

    const modal = document.getElementById('adminPinModal');
    const titleEl = document.getElementById('adminPinModalTitle');
    const subtitleEl = document.getElementById('adminPinModalSubtitle');
    const oldGroup = document.getElementById('adminPinOldGroup');
    const confirmGroup = document.getElementById('adminPinConfirmGroup');
    const inputLabel = document.getElementById('adminPinInputLabel');
    const inputHint = document.getElementById('adminPinHint');
    const submitBtn = document.getElementById('adminPinSubmitBtn');
    const errorEl = document.getElementById('adminPinError');
    const successEl = document.getElementById('adminPinSuccess');
    const pinInput = document.getElementById('adminPinInput');
    const pinOldInput = document.getElementById('adminPinOldInput');
    const pinConfirmInput = document.getElementById('adminPinConfirmInput');

    if (errorEl) { errorEl.classList.add('hidden'); errorEl.textContent = ''; }
    if (successEl) { successEl.classList.add('hidden'); successEl.textContent = ''; }
    if (pinInput) pinInput.value = '';
    if (pinOldInput) pinOldInput.value = '';
    if (pinConfirmInput) pinConfirmInput.value = '';

    if (adminPinMode === 'change') {
        if (titleEl) titleEl.textContent = 'Alterar PIN do Administrador';
        if (subtitleEl) subtitleEl.textContent = 'Confirme o PIN ou Chave atual e defina o novo código de segurança.';
        if (oldGroup) oldGroup.classList.remove('hidden');
        if (confirmGroup) confirmGroup.classList.remove('hidden');
        if (inputLabel) inputLabel.textContent = 'Novo PIN Secreto';
        if (inputHint) inputHint.textContent = 'Mínimo de 4 dígitos.';
        if (submitBtn) submitBtn.innerHTML = '<span>Atualizar PIN</span>';
    } else {
        // verify
        if (titleEl) titleEl.textContent = 'Acesso Exclusivo ao Administrador';
        if (subtitleEl) subtitleEl.textContent = 'Insira a Chave Mestra ou o PIN do Administrador para desbloquear o acesso.';
        if (oldGroup) oldGroup.classList.add('hidden');
        if (confirmGroup) confirmGroup.classList.add('hidden');
        if (inputLabel) inputLabel.textContent = 'Chave Mestra ou PIN';
        if (inputHint) inputHint.textContent = 'Apenas o proprietário do site possui este código de acesso.';
        if (submitBtn) submitBtn.innerHTML = '<span>Desbloquear Painel</span>';
    }

    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            if (adminPinMode === 'change' && pinOldInput) {
                pinOldInput.focus();
            } else if (pinInput) {
                pinInput.focus();
            }
        }, 100);
    }
}

/**
 * Fecha o modal de PIN
 */
function closeAdminPinModal() {
    const modal = document.getElementById('adminPinModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Fecha ao clicar fora da caixa do modal
 */
function handleAdminPinBackdropClick(event) {
    if (event.target.id === 'adminPinModal') {
        closeAdminPinModal();
    }
}

/**
 * Bloqueia o acesso de administrador imediatamente e oculta os botões
 */
function lockAdminAccess() {
    isAdminUnlocked = false;
    closeAuditModal();
    updateAdminVisibility();
    showFeedback('🔒 Painel administrativo bloqueado com segurança.', 'info');
}

/**
 * Dispara o fluxo de alteração de PIN a partir da janela de logs
 */
function promptChangeAdminPin() {
    closeAuditModal();
    openAdminPinModal('change');
}

/**
 * Processa a validação da Chave Mestra ou PIN do administrador
 */
async function handleVerifyAdminPin(event) {
    event.preventDefault();

    const pinInput = document.getElementById('adminPinInput');
    const pinOldInput = document.getElementById('adminPinOldInput');
    const pinConfirmInput = document.getElementById('adminPinConfirmInput');
    const errorEl = document.getElementById('adminPinError');
    const successEl = document.getElementById('adminPinSuccess');

    const showError = (msg) => {
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.classList.remove('hidden');
        }
        if (successEl) successEl.classList.add('hidden');
    };

    const showSuccess = (msg) => {
        if (successEl) {
            successEl.textContent = msg;
            successEl.classList.remove('hidden');
        }
        if (errorEl) errorEl.classList.add('hidden');
    };

    const pin = pinInput ? pinInput.value.trim() : '';
    const oldPin = pinOldInput ? pinOldInput.value.trim() : '';
    const confirmPin = pinConfirmInput ? pinConfirmInput.value.trim() : '';
    const savedPinHash = localStorage.getItem(STORAGE_KEYS.ADMIN_PIN_HASH);

    if (adminPinMode === 'change') {
        if (!oldPin) {
            showError('Por favor, informe a Chave ou PIN atual.');
            return;
        }
        const oldHashed = await hashAdminPin(oldPin);
        const isMaster = MASTER_ADMIN_KEYS.map(k => k.toLowerCase()).includes(oldPin.toLowerCase());
        const isHashMatch = savedPinHash && (oldHashed === savedPinHash);

        if (!isMaster && !isHashMatch) {
            showError('Chave atual incorreta.');
            await logActivity('SECURITY_ALERT', 'Tentativa de alteração de PIN rejeitada (chave incorreta).', {});
            return;
        }
        if (!pin || pin.length < 4) {
            showError('O novo PIN deve ter no mínimo 4 dígitos ou caracteres.');
            return;
        }
        if (pin !== confirmPin) {
            showError('A confirmação do novo PIN não confere.');
            return;
        }

        const newHashed = await hashAdminPin(pin);
        localStorage.setItem(STORAGE_KEYS.ADMIN_PIN_HASH, newHashed);
        isAdminUnlocked = true;

        showSuccess('PIN atualizado com sucesso!');
        await logActivity('SECURITY_ALERT', 'PIN de Administrador alterado com sucesso.', {});

        setTimeout(async () => {
            closeAdminPinModal();
            updateAdminVisibility();
            const modal = document.getElementById('auditModal');
            if (modal) modal.classList.remove('hidden');
            await renderAuditLogsList();
            showFeedback('Chave de segurança atualizada com sucesso.', 'success');
        }, 500);

    } else {
        // Mode 'verify'
        if (!pin) {
            showError('Por favor, digite a Chave Mestra ou seu PIN.');
            return;
        }

        const hashed = await hashAdminPin(pin);
        const isMaster = MASTER_ADMIN_KEYS.map(k => k.toLowerCase()).includes(pin.toLowerCase());
        const isHashMatch = savedPinHash && (hashed === savedPinHash);

        if (isMaster || isHashMatch) {
            isAdminUnlocked = true;

            // Se logado, vincula a conta como administradora permanente
            if (currentUser && currentUser.email) {
                localStorage.setItem(STORAGE_KEYS.ADMIN_EMAIL, currentUser.email.toLowerCase().trim());
            }

            updateAdminVisibility();
            showSuccess('Acesso de Administrador confirmado!');
            await logActivity('AUTH_LOGIN', `Acesso administrativo desbloqueado para ${currentUser?.email || 'Proprietário'}`, {});

            setTimeout(async () => {
                closeAdminPinModal();
                const modal = document.getElementById('auditModal');
                if (modal) modal.classList.remove('hidden');
                await renderAuditLogsList();
                showFeedback('👑 Modo Administrador ativo!', 'success');
            }, 300);
        } else {
            showError('Chave ou PIN incorreto. Apenas o administrador possui este acesso.');
            await logActivity('SECURITY_ALERT', 'Tentativa de acesso não autorizado aos logs com chave incorreta.', {});
        }
    }
}

/* ============================================================================
   9. GERENCIAMENTO DE NOTIFICAÇÕES PWA (WEB NOTIFICATIONS API & SERVICE WORKER)
   ============================================================================ */

let inAppNotifTimer = null;

/**
 * Ponto de entrada ao clicar no botão "Testar Notificação"
 * Avalia suporte do navegador e estado atual de permissão
 */
function handleNotificationButtonClick() {
    // 1. Verifica se a API de Notificações é suportada no navegador atual
    if (!('Notification' in window)) {
        showInAppNotificationFallback(
            'Lembrete de Pagamento (Demonstração)',
            'Seu navegador ou dispositivo atual não possui suporte nativo à Web Notifications API. Esta é uma simulação visual dentro do app!',
            true
        );
        return;
    }

    const currentPermission = Notification.permission;

    // 2. Se já tiver permissão concedida, dispara a demonstração diretamente
    if (currentPermission === 'granted') {
        triggerDemoNotification();
        showFeedback('🔔 Notificação de teste enviada com sucesso!', 'success');
        return;
    }

    // 3. Se estiver bloqueado ('denied') ou ainda não solicitado ('default'), abre o modal explicativo
    openNotificationExplanationModal(currentPermission);
}

/**
 * Abre o modal explicativo contextualizando o propósito dos lembretes
 */
function openNotificationExplanationModal(permissionState = 'default') {
    const modal = document.getElementById('notifExplanationModal');
    const statusMsg = document.getElementById('notifStatusMessage');
    const confirmBtn = document.getElementById('notifConfirmBtn');

    if (!modal) return;

    if (permissionState === 'denied') {
        if (statusMsg) {
            statusMsg.className = 'alert-msg warning';
            statusMsg.innerHTML = '⚠️ As notificações estão bloqueadas nas configurações do seu navegador.<br>Para ativá-las, clique no ícone de <strong>cadeado 🔒</strong> ao lado da barra de endereço e mude "Notificações" para "Permitir".';
            statusMsg.classList.remove('hidden');
        }
        if (confirmBtn) {
            confirmBtn.innerHTML = '<span>Simular Demonstração Visual</span>';
        }
    } else {
        if (statusMsg) {
            statusMsg.classList.add('hidden');
            statusMsg.textContent = '';
        }
        if (confirmBtn) {
            confirmBtn.innerHTML = '<span>🔔 Ativar e Testar Agora</span>';
        }
    }

    modal.classList.remove('hidden');
}

/**
 * Fecha o modal explicativo
 */
function closeNotificationExplanationModal() {
    const modal = document.getElementById('notifExplanationModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Fecha o modal ao clicar fora da caixa
 */
function handleNotificationBackdropClick(event) {
    if (event.target.id === 'notifExplanationModal') {
        closeNotificationExplanationModal();
    }
}

/**
 * Solicita a permissão nativa do navegador após confirmação do usuário
 */
async function confirmAndRequestNotificationPermission() {
    closeNotificationExplanationModal();

    if (!('Notification' in window)) {
        showInAppNotificationFallback(
            'Lembrete de Pagamento',
            'Demonstração visual ativada com sucesso!',
            true
        );
        return;
    }

    if (Notification.permission === 'denied') {
        // Se já estava negado, oferece demonstração visual in-app
        showInAppNotificationFallback(
            'Lembrete de Pagamento',
            'Como as permissões nativas estão bloqueadas no navegador, exibimos este alerta simulado dentro do aplicativo!',
            true
        );
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            await triggerDemoNotification();
            await logActivity('SETTINGS_CHANGE', 'Permissão para notificações do PWA concedida pelo usuário.', {});
            showFeedback('🎉 Notificações ativadas com sucesso! Você receberá lembretes das suas metas.', 'success');
        } else {
            showInAppNotificationFallback(
                'Permissão Não Concedida',
                'Você optou por não receber notificações nativas. Caso mude de ideia, poderá ativá-las a qualquer momento pelo botão 🔔 Notificações.',
                false
            );
        }
    } catch (err) {
        console.warn('Erro ao solicitar permissão de notificações:', err);
        showInAppNotificationFallback('Lembrete de Pagamento', 'Demonstração de lembrete financeiro ativo!', true);
    }
}

/**
 * Dispara uma notificação nativa de demonstração utilizando Service Worker ou Notification API
 */
async function triggerDemoNotification() {
    const title = '🔔 Gastei & Agora? — Lembrete de Pagamento';
    const options = {
        body: 'Você tem uma meta financeira agendada para hoje. Mantenha o foco na sua liberdade financeira! 💰',
        icon: 'icons/icon-192.png',
        badge: 'icons/favicon.svg',
        vibrate: [100, 50, 100],
        tag: 'gastei-agora-demo-notif',
        renotify: true,
        data: { url: './' }
    };

    // 1. Tenta disparar através do Service Worker (Padrão ouro para PWA no Android, Desktop e iOS PWA)
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            if (registration && typeof registration.showNotification === 'function') {
                await registration.showNotification(title, options);
                return;
            }
        } catch (e) {
            console.warn('SW showNotification falhou, tentando fallback direto:', e);
        }
    }

    // 2. Fallback nativo simples
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, options);
            return;
        } catch (e) {
            console.warn('new Notification falhou:', e);
        }
    }

    // 3. Fallback visual in-app se tudo falhar
    showInAppNotificationFallback(title, options.body);
}

/**
 * Exibe notificação simulada in-app caso o navegador não suporte push nativo ou permissão seja negada
 */
function showInAppNotificationFallback(title, message, isUnsupportedWarning = false) {
    const toast = document.getElementById('notifInAppFallback');
    const titleEl = document.getElementById('inAppNotifTitle');
    const msgEl = document.getElementById('inAppNotifMessage');
    const hintEl = document.getElementById('inAppNotifHint');

    if (!toast) return;

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    if (hintEl) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            hintEl.textContent = '💡 Dica para iPhone: Para receber alertas nativos no iOS, instale este app tocando em Compartilhar ➜ "Adicionar à Tela de Início".';
            hintEl.classList.remove('hidden');
        } else if (isUnsupportedWarning) {
            hintEl.textContent = '💡 Este navegador exibe lembretes visuais dentro da própria página.';
            hintEl.classList.remove('hidden');
        } else {
            hintEl.classList.add('hidden');
        }
    }

    toast.classList.remove('hiding');
    toast.classList.remove('hidden');

    if (inAppNotifTimer) clearTimeout(inAppNotifTimer);
    inAppNotifTimer = setTimeout(() => {
        closeInAppNotificationFallback();
    }, 7000);
}

/**
 * Fecha a notificação in-app com animação suave
 */
function closeInAppNotificationFallback() {
    const toast = document.getElementById('notifInAppFallback');
    if (!toast || toast.classList.contains('hidden')) return;

    toast.classList.add('hiding');
    setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove('hiding');
    }, 300);
}
