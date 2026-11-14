-- ============================================================================
-- SCRIPT DE CRIAÇÃO DO BANCO DE DADOS NO SUPABASE (VERSÃO ROBUSTA)
-- Projeto: Gastei & Agora? (Cálculo Financeiro)
-- 
-- DICA IMPORTANTE: 
-- Antes de clicar em "RUN", certifique-se de NÃO ter nenhum trecho de texto
-- selecionado com o mouse, ou use Ctrl+A para selecionar TODO o script.
-- ============================================================================

-- 1. Habilitar extensão de UUID
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 2. TABELA DE PERFIS (PROFILES)
-- ============================================================================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null check (char_length(trim(full_name)) > 0),
    theme_preference text not null default 'dark' check (theme_preference in ('dark', 'light')),
    privacy_mode boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 3. TABELA DE REGISTROS FINANCEIROS (FINANCIAL_RECORDS)
-- ============================================================================
create table if not exists public.financial_records (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    monthly_salary numeric(12, 2) not null default 0.00 check (monthly_salary >= 0),
    total_debt numeric(12, 2) not null default 0.00 check (total_debt >= 0),
    deadline date not null,
    essential_expenses numeric(12, 2) not null default 0.00 check (essential_expenses >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. TABELA DE HISTÓRICO DO CHAT DA IA (CHAT_MESSAGES)
-- ============================================================================
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    sender text not null check (sender in ('user', 'ai')),
    message text not null check (char_length(trim(message)) > 0),
    created_at timestamptz not null default now()
);

-- ============================================================================
-- 5. HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.financial_records enable row level security;
alter table public.chat_messages enable row level security;

-- ============================================================================
-- 6. POLÍTICAS DE SEGURANÇA (RLS)
-- Cada instrução inicia com CREATE POLICY em linha única contígua
-- ============================================================================

-- Políticas para Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Políticas para Financial Records
drop policy if exists "financial_records_select_own" on public.financial_records;
create policy "financial_records_select_own" on public.financial_records for select to authenticated using (auth.uid() = user_id);

drop policy if exists "financial_records_insert_own" on public.financial_records;
create policy "financial_records_insert_own" on public.financial_records for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "financial_records_update_own" on public.financial_records;
create policy "financial_records_update_own" on public.financial_records for update to authenticated using (auth.uid() = user_id);

-- Políticas para Chat Messages
drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own" on public.chat_messages for select to authenticated using (auth.uid() = user_id);

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own" on public.chat_messages for insert to authenticated with check (auth.uid() = user_id);

-- ============================================================================
-- 7. TRIGGER: CRIAR PERFIL AUTOMATICAMENTE NO CADASTRO
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, full_name, theme_preference, privacy_mode)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', 'Guerreiro Financeiro'),
        'dark',
        false
    )
    on conflict (id) do nothing;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
