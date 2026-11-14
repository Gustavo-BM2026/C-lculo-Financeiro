/**
 * ============================================================================
 * Supabase Client Configuration
 * ============================================================================
 * Para conectar seu projeto ao Supabase:
 * 1. Acesse https://supabase.com e crie um projeto gratuito.
 * 2. Vá em Project Settings > API.
 * 3. Copie a Project URL e a anon/public API Key e cole nas constantes abaixo.
 * 4. Execute o script 'supabase_schema.sql' no SQL Editor do painel do Supabase.
 */

const SUPABASE_CONFIG = {
    // Substitua pela URL do seu projeto Supabase (Ex: 'https://xyzcompany.supabase.co')
    URL: 'https://SEU_PROJETO.supabase.co',
    
    // Substitua pela sua chave pública 'anon' (Project Settings > API > anon public)
    ANON_KEY: 'SUA_CHAVE_ANON_AQUI'
};

let supabaseClient = null;

function isSupabaseConfigured() {
    return (
        typeof window.supabase !== 'undefined' &&
        SUPABASE_CONFIG.URL &&
        !SUPABASE_CONFIG.URL.includes('SEU_PROJETO') &&
        SUPABASE_CONFIG.ANON_KEY &&
        !SUPABASE_CONFIG.ANON_KEY.includes('SUA_CHAVE')
    );
}

function initSupabase() {
    if (typeof window.supabase !== 'undefined' && isSupabaseConfigured()) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
            console.log('✅ Supabase conectado com sucesso!');
        } catch (err) {
            console.warn('⚠️ Falha ao inicializar cliente Supabase, usando LocalStorage fallback:', err);
            supabaseClient = null;
        }
    } else {
        console.info('ℹ️ Supabase não configurado. O sistema está utilizando o LocalStorage como armazenamento local.');
    }
}
