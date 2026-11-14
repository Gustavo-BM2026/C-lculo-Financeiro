# 💳 Cálculo Financeiro — Gastei & Agora?

> **Uma plataforma inteligente de recuperação financeira e gestão de dívidas, desenvolvida com HTML5, CSS3 e JavaScript puro.**

![Status](https://img.shields.io/badge/Status-Concluído-success)
![Linguagens](https://img.shields.io/badge/Tecnologias-HTML5%20%7C%20CSS3%20%7C%20JavaScript-blue)
![Tema](https://img.shields.io/badge/Tema-Azul%20Escuro%20%26%20Claro-navy)
![Responsividade](https://img.shields.io/badge/Mobile-100%25%20Responsivo-brightgreen)

---

## 📖 Sobre o Projeto

Gastou por impulso e agora precisa colocar as contas em ordem? O **Gastei & Agora?** foi criado para quem precisa de clareza imediata sobre suas dívidas, prazos de quitação e um plano estratégico realista para não sufocar o orçamento.

Com design moderno em **azul escuro elegante**, o sistema calcula automaticamente o esforço financeiro diário e mensal necessário até o seu prazo limite (*deadline*), avalia o impacto percentual sobre o seu salário e conta com a **FinAI**, uma mentora financeira virtual com chat em tempo real.

---

## ✨ Principais Funcionalidades

### 1. 🎨 Paleta Azul Escuro & Alternância de Tema (Dark/Light)
- **Tema Padrão**: Azul escuro (*Deep Navy* / *Midnight Blue*) com contraste refinado em ciano e esmeralda.
- **Alternador de Tema**: Alterne entre **Modo Escuro** e **Modo Claro** com persistência automática no `localStorage`.

### 2. 🛡️ Modo Privacidade (Ocultar Números com Hover)
- Botão dedicado no cabeçalho ao lado do modo de tema (`👁️` / `🙈`).
- Censura os valores financeiros sensíveis com efeito de desfoque (*blur* moderno).
- **Revelação no Hover**: Basta passar o mouse por cima do valor para visualizá-lo instantaneamente. No celular, toque no valor para revelá-lo.

### 3. 🔐 Autenticação com Validações Estritas
- **Validação de E-mail**: Exige obrigatoriamente o símbolo `@` e o provedor completo com extensão válida (ex.: `usuario@outlook.com`, `usuario@gmail.com`).
- **Requisitos de Senha Forte**:
  - Mínimo de 6 caracteres;
  - Pelo menos uma letra maiúscula (`A-Z`);
  - Pelo menos uma letra minúscula (`a-z`);
  - Pelo menos um número (`0-9`);
  - Pelo menos um símbolo/caractere especial (`!@#$%...`).
- **Checklist Visual em Tempo Real**: Conforme a senha é digitada, os indicadores visuais atualizam dinamicamente para `✓` em verde.
- **Visualizador de Senha (👁️)**: Permite exibir ou ocultar a senha digitada.

### 4. 📊 Gestão Financeira com Calendário (Deadline)
- Inserção de **Salário Líquido Mensal**, **Tamanho Total da Dívida** e **Gastos Fixos Essenciais**.
- **Calendário com Restrição**: Seleção da data limite (*deadline*) a partir da data atual.
- **Cálculo Automático de Metas**:
  - Dias e meses restantes até o deadline;
  - Meta de economia diária (R$/dia);
  - Parcela mensal necessária (R$/mês);
  - Percentual do salário comprometido pela parcela;
  - Diagnóstico de viabilidade (*Sustentável*, *Atenção Moderada* ou *Risco Crítico*).

### 5. 🤖 FinAI — Mentora Financeira com Inteligência Artificial
- **Diagnóstico Rápido**: Analisa sua dívida em relação à sua renda e prazo, gerando recomendações anti-impulso personalizadas (desvincular cartões de apps de delivery, regra das 72 horas, amortização prioritária).
- **Chat Interativo em Tempo Real**: Chatbot integrado que responde dúvidas contextualizadas com o seu nome, salário e dívida cadastrados (ex.: *Bola de Neve vs Avalanche*, renegociação com bancos, troca de dívida cara por barata).

### 6. 📱 100% Responsivo para Celular e Desktop
- Dimensionamento proporcional para qualquer smartphone (320px em diante).
- Sem zoom involuntário no iOS Safari (`font-size: 16px` em inputs).
- Layout sem rolagem lateral (*zero overflow horizontal*).
- Touch targets confortáveis (mínimo de 44px de altura para botões e inputs).

---

## 🛠️ Tecnologias Utilizadas

- **HTML5 Semântico**: Estruturação acessível, formulários modernos e componentes dinâmicos.
- **CSS3 Moderno**: Variáveis CSS (*Custom Properties*), Flexbox, CSS Grid, Media Queries avançadas e animações.
- **JavaScript (ES6+) Puro**: Manipulação de DOM, cálculos financeiros, expressões regulares (Regex) e validações em tempo real.
- **Supabase (PostgreSQL + Auth + RLS)**: Banco de dados relacional na nuvem com autenticação segura e sincronização automática (com fallback para `localStorage`).

---

## ☁️ Como Conectar ao Supabase (Opcional)

O sistema funciona imediatamente em modo offline (`localStorage`). Para ativar a sincronização em nuvem:

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No painel do seu projeto, acesse o **SQL Editor**, cole todo o conteúdo do arquivo [`supabase_schema.sql`](file:///c:/Users/aluno_3_2026/Downloads/Brilha%20Mais/Terceiro%20Projeto/supabase_schema.sql) e clique em **RUN**.
3. Vá em **Project Settings > API**, copie a **Project URL** e a chave **anon public**.
4. Abra o arquivo [`supabaseConfig.js`](file:///c:/Users/aluno_3_2026/Downloads/Brilha%20Mais/Terceiro%20Projeto/supabaseConfig.js) e insira sua URL e Anon Key.
5. Pronto! O indicador no cabeçalho mudará para **🟢 Supabase** e seus dados serão sincronizados na nuvem em tempo real.

---

## 🚀 Como Executar o Projeto

Não é necessário instalar nenhuma dependência ou servidor!

1. Clone o repositório:
   ```bash
   git clone https://github.com/Gustavo-BM2026/C-lculo-Financeiro.git
   ```
2. Acesse a pasta do projeto:
   ```bash
   cd C-lculo-Financeiro
   ```
3. Abra o arquivo `index.html` em qualquer navegador (Google Chrome, Edge, Firefox, Safari) dando um duplo clique ou utilizando o Live Server.

---

## 📁 Estrutura de Arquivos

```text
├── index.html            # Estrutura principal da página, formulários e painel
├── style.css             # Estilização completa, temas claro/escuro e responsividade
├── app.js                # Lógica de autenticação híbrida, cálculos e FinAI
├── supabaseConfig.js     # Configuração das chaves do cliente Supabase
├── supabase_schema.sql   # Script SQL DDL com tabelas, RLS e triggers
└── README.md             # Documentação do projeto
```

---

## 👤 Autor

Desenvolvido por **Gustavo Barbosa** ([@Gustavo-BM2026](https://github.com/Gustavo-BM2026)).
