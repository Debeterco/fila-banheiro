# SGT - Sistema de Gerenciamento de Turmas (SENAI / WEG)

O **SGT** é uma solução corporativa desenvolvida para a automação e monitorização do fluxo de alunos no CentroWEG. O sistema substitui controlos manuais por uma plataforma digital de alta disponibilidade, oferecendo métricas precisas para a gestão docente e garantindo a organização do ambiente escolar.

## 🚀 Tecnologias e Arquitetura

O projeto foi construído sob uma arquitetura moderna e escalável, utilizando:

- **[Next.js 15](https://nextjs.org/)** - Framework React com App Router para otimização de performance e renderização eficiente.
- **[React 19](https://react.dev/)** - Biblioteca base para a construção de interfaces reativas e componentes modulares.
- **[Supabase](https://supabase.com/)** - Backend-as-a-Service (BaaS) providenciando base de dados PostgreSQL e sincronização em tempo real (WebSockets).
- **[Tailwind CSS v4](https://tailwindcss.com/)** - Framework de estilização utilitária para uma interface responsiva, moderna e leve.
- **[Lucide React](https://lucide.dev/)** - Conjunto de ícones vetoriais padronizados.

## ✨ Funcionalidades Principais

- **Monitorização em Tempo Real:** Fila de espera e status dos alunos atualizados instantaneamente via WebSockets.
- **Controlo Docente Progressivo:** Alertas visuais automáticos para alunos que excedem o tempo limite parametrizado.
- **Conformidade com LGPD:** Restrição de visibilidade de dados sensíveis; alunos acedem apenas às suas próprias métricas e histórico.
- **Módulo de Auditoria:** Registo detalhado de saídas, entradas e atividades de 5S para análise pedagógica e administrativa.
- **Configuração Dinâmica:** Painel administrativo para ajuste de tempos de *cooldown* e limites de alerta por turma.

---

## ⚙️ Configuração do Ambiente de Desenvolvimento

### 1. Pré-requisitos
- **Node.js LTS** (v20 ou superior)
- **Gerenciador de pacotes** (npm, yarn ou pnpm)

### 2. Instalação e Execução

Clone o repositório e instale as dependências:

```bash
# Instalar dependências
npm install

# Iniciar ambiente de desenvolvimento
npm run dev
```
### 3. Variáveis de Ambiente

O sistema utiliza o Supabase para persistência e autenticação. Crie um ficheiro .env.local na raiz do projeto e configure as chaves:
Snippet de código

NEXT_PUBLIC_SUPABASE_URL=[https://seu-projeto.supabase.co](https://seu-projeto.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_aqui

Aceda ao sistema em: http://localhost:3000
🔐 Segurança e Níveis de Acesso (RBAC)

O SGT implementa um controlo de acesso baseado em funções (Role-Based Access Control):

    Perfil Aluno: Interação restrita à fila da sua turma e consulta de histórico pessoal.

    Perfil Professor: Gestão completa da turma, visualização de dashboards de tempo e moderação de fluxo.

    Perfil Administrador: Gestão de infraestrutura, utilizadores, turmas e parametrização global do sistema.

## Desenvolvimento e Contribuição

Este projeto foi desenvolvido como uma solução técnica para o CentroWEG, focando-se na aplicação de engenharia de software e análise de sistemas em ambiente real.

Desenvolvedores: Cláudio Litz & João Vitor Kasteller Debeterco

Orientação Técnica: Prof. Lucas Sousa dos Santos
