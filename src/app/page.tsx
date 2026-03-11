"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  UserPlus, CheckCircle2, LogOut, 
  DoorOpen, PauseCircle, PlayCircle, Trash2, ArrowUp, ArrowDown, ShieldAlert,
  ClipboardList, XCircle
} from "lucide-react";
import { useRouter } from "next/navigation";

type LogPedido = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  require_time: string;
  go_time: string | null;
  back_time: string | null;
  description: string | null;
  users?: {
    acess_level: string;
  };
};

type UserDB = {
  user_id: string;
  name: string;
  acess_level: string;
  email?: string;
};

export default function Home() {
  const [todosLogsAtivos, setTodosLogsAtivos] = useState<LogPedido[]>([]);
  const [historicoCompleto, setHistoricoCompleto] = useState<LogPedido[]>([]);
  
  // Novos estados para a lista de alunos (Para o professor adicionar manualmente)
  const [alunosLista, setAlunosLista] = useState<UserDB[]>([]);
  const [alunoSelecionado, setAlunoSelecionado] = useState("");

  const [currentUser, setCurrentUser] = useState<UserDB | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); 
  const router = useRouter();

  useEffect(() => {
    verificarLogin();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase.channel("realtime_logs").on(
      "postgres_changes", { event: "*", schema: "public", table: "logs" },
      () => {
        carregarDados(currentUser);
      }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  const verificarLogin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }

    const { data: usuarioDB } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", session.user.id)
      .single();

    if (usuarioDB) {
      setCurrentUser(usuarioDB as UserDB);
      carregarDados(usuarioDB as UserDB);
      
      // Se for professor/admin, já carrega a lista de todos os alunos do banco para o Dropdown
      if (usuarioDB.acess_level === "admin" || usuarioDB.acess_level === "Teacher") {
        const { data: alunosData } = await supabase
          .from("users")
          .select("*")
          .in("acess_level", ["aluno", "Student"]);
        
        if (alunosData) setAlunosLista(alunosData as UserDB[]);
      }
    } else {
      fazerLogout();
    }
  };

  const carregarDados = async (usuario: UserDB | null = currentUser) => {
    if (!usuario) return;

    const { data } = await supabase
      .from("logs")
      .select("*, users(acess_level)");

    if (data) {
      const ativos = data
        .filter((p) => ["pedido", "saida", "pausado"].includes(p.status))
        .reverse();
      setTodosLogsAtivos(ativos);

      const getActionTime = (log: LogPedido) => {
        if (log.status.includes('saida')) return new Date(log.go_time || log.require_time).getTime();
        if (log.status === 'concluido') return new Date(log.back_time || log.require_time).getTime();
        return new Date(log.require_time).getTime();
      };
      
      const logsOrdenados = data.sort((a, b) => getActionTime(b) - getActionTime(a));

      if (usuario.acess_level === "admin") {
        setHistoricoCompleto(logsOrdenados);
      } else if (usuario.acess_level === "Teacher") {
        const apenasAlunos = logsOrdenados.filter(
          (log) => log.users?.acess_level === "aluno" || log.users?.acess_level === "Student"
        );
        setHistoricoCompleto(apenasAlunos);
      } else {
        setHistoricoCompleto([]);
      }
    }
  };

  const getEffectiveTime = (log: LogPedido) => {
    const match = log.description?.match(/\[OVERRIDE:(.*?)\]/);
    return match ? match[1] : log.require_time;
  };

  const filaEsperaOrdenada = todosLogsAtivos
    .filter((p) => p.status === "pedido")
    .sort((a, b) => new Date(getEffectiveTime(a)).getTime() - new Date(getEffectiveTime(b)).getTime());

  const noBanheiro = todosLogsAtivos.find((p) => p.status === "saida");
  const isPaused = todosLogsAtivos.some((p) => p.status === "pausado");
  const isPrivileged = currentUser?.acess_level === "Teacher" || currentUser?.acess_level === "admin";

  // ==========================================
  // AÇÕES DO ALUNO
  // ==========================================
  const requisitar = async () => {
    if (!currentUser || isProcessing || meuPedido) return; 
    
    setIsProcessing(true);
    try {
      const { data: jaExiste } = await supabase
        .from("logs")
        .select("id")
        .eq("user_id", currentUser.user_id)
        .in("status", ["pedido", "saida"]);
        
      if (jaExiste && jaExiste.length > 0) return;

      await supabase.from("logs").insert([{ 
        user_id: currentUser.user_id, 
        name: currentUser.name, 
        status: "pedido" 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelarMeuPedido = async (pedido: LogPedido) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await supabase.from("logs").update({ 
        status: "cancelado", 
        description: "Cancelado pelo próprio usuário" 
      }).eq("id", pedido.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const registrarSaida = async (pedidoAntigo: LogPedido) => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      const goTime = new Date().toISOString();
      await supabase.from("logs").update({ status: "pedido_historico" }).eq("id", pedidoAntigo.id);
      
      await supabase.from("logs").insert([{ 
        user_id: pedidoAntigo.user_id, 
        name: pedidoAntigo.name, 
        status: "saida", 
        require_time: pedidoAntigo.require_time, 
        go_time: goTime, 
        description: pedidoAntigo.description 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const registrarChegada = async (pedidoAntigo: LogPedido) => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      const backTime = new Date().toISOString();
      await supabase.from("logs").update({ status: "saida_historico" }).eq("id", pedidoAntigo.id);
      
      await supabase.from("logs").insert([{ 
        user_id: pedidoAntigo.user_id, 
        name: pedidoAntigo.name, 
        status: "concluido", 
        require_time: pedidoAntigo.require_time, 
        go_time: pedidoAntigo.go_time, 
        back_time: backTime, 
        description: pedidoAntigo.description 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================
  // AÇÕES EXCLUSIVAS DO PROFESSOR / ADMIN
  // ==========================================

  const adicionarAlunoManualmente = async () => {
    if (!alunoSelecionado || isProcessing || !currentUser) return;
    setIsProcessing(true);
    try {
      const aluno = alunosLista.find(a => a.user_id === alunoSelecionado);
      if (!aluno) return;

      // Trava dupla de segurança
      const { data: jaExiste } = await supabase
        .from("logs")
        .select("id")
        .eq("user_id", aluno.user_id)
        .in("status", ["pedido", "saida"]);
        
      if (jaExiste && jaExiste.length > 0) return;

      await supabase.from("logs").insert([{ 
        user_id: aluno.user_id, 
        name: aluno.name, 
        status: "pedido",
        description: `(Adicionado pelo Professor: ${currentUser.name})`
      }]);
      
      criarLogAuditoria(`Professor ${currentUser.name} adicionou ${aluno.name} na fila de espera.`);
      setAlunoSelecionado(""); // Limpa o dropdown
    } finally {
      setIsProcessing(false);
    }
  };

  // Professor avança um aluno da Fila direto pro Banheiro
  const forcarSaidaAluno = async (pedidoAntigo: LogPedido) => {
    if (isProcessing || !currentUser) return;
    setIsProcessing(true);
    try {
      const goTime = new Date().toISOString();
      await supabase.from("logs").update({ status: "pedido_historico" }).eq("id", pedidoAntigo.id);
      
      await supabase.from("logs").insert([{ 
        user_id: pedidoAntigo.user_id, 
        name: pedidoAntigo.name, 
        status: "saida", 
        require_time: pedidoAntigo.require_time, 
        go_time: goTime, 
        description: ((pedidoAntigo.description || "") + ` (Saída forçada pelo Professor: ${currentUser.name})`).trim()
      }]);
      criarLogAuditoria(`Professor ${currentUser.name} liberou o acesso de ${pedidoAntigo.name}.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const encerrarAcessoForcado = async (pedido: LogPedido) => {
    if (isProcessing || !currentUser) return;
    setIsProcessing(true);
    
    try {
      const backTime = new Date().toISOString();
      await supabase.from("logs").update({ status: "saida_historico" }).eq("id", pedido.id);
      
      await supabase.from("logs").insert([{ 
        user_id: pedido.user_id, 
        name: pedido.name, 
        status: "concluido", 
        require_time: pedido.require_time, 
        go_time: pedido.go_time, 
        back_time: backTime, 
        description: ((pedido.description || "") + ` (Retorno forçado por ${currentUser.name})`).trim()
      }]);

      criarLogAuditoria(`Professor ${currentUser.name} encerrou o acesso de ${pedido.name}.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const alternarPausa = async () => {
    if (isProcessing || !currentUser) return;
    setIsProcessing(true);
    try {
      if (isPaused) {
        await supabase.from("logs").update({ status: "concluido" }).eq("status", "pausado");
        criarLogAuditoria(`Professor ${currentUser.name} liberou a fila.`);
      } else {
        await supabase.from("logs").insert([{ user_id: currentUser.user_id, name: "SISTEMA", status: "pausado", description: `Fila pausada por ${currentUser.name}` }]);
        criarLogAuditoria(`Professor ${currentUser.name} pausou a fila.`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const removerDaFila = async (aluno: LogPedido) => {
    if (isProcessing || !currentUser) return;
    setIsProcessing(true);
    try {
      await supabase.from("logs").update({ 
        status: "cancelado", 
        description: `(Removido por ${currentUser.name}) ` + (aluno.description || "") 
      }).eq("id", aluno.id);
      criarLogAuditoria(`Professor ${currentUser.name} removeu o aluno ${aluno.name} da fila.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const moverPosicao = async (index: number, direcao: "up" | "down") => {
    if (isProcessing || !currentUser) return;
    setIsProcessing(true);
    try {
      const atual = filaEsperaOrdenada[index];
      const outro = filaEsperaOrdenada[direcao === "up" ? index - 1 : index + 1];

      if (!atual || !outro) return;

      const tAtual = getEffectiveTime(atual);
      const tOutro = getEffectiveTime(outro);

      const newDescAtual = (atual.description || "").replace(/\[OVERRIDE:.*?\]/g, "") + ` [OVERRIDE:${tOutro}]`;
      const newDescOutro = (outro.description || "").replace(/\[OVERRIDE:.*?\]/g, "") + ` [OVERRIDE:${tAtual}]`;

      await supabase.from("logs").update({ description: newDescAtual.trim() }).eq("id", atual.id);
      await supabase.from("logs").update({ description: newDescOutro.trim() }).eq("id", outro.id);

      criarLogAuditoria(`Professor ${currentUser.name} trocou as posições de ${atual.name} e ${outro.name} na fila.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const criarLogAuditoria = async (acao: string) => {
    if (!currentUser) return;
    await supabase.from("logs").insert([{
      user_id: currentUser.user_id,
      name: currentUser.name,
      status: "auditoria",
      description: acao
    }]);
  };

  const fazerLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getEventTime = (log: LogPedido) => {
    if (log.status.includes('saida')) return log.go_time;
    if (log.status === 'concluido') return log.back_time;
    return log.require_time;
  };

  const formatarHora = (isoDate: string | null) => {
    if (!isoDate) return "-";
    return new Date(isoDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getStatusDisplay = (status: string) => {
    switch(status) {
      case "pedido":
      case "pedido_historico": 
        return { texto: "PEDIDO", cor: "bg-white border-2 border-[#00579D] text-[#00579D]" };
      case "saida":
      case "saida_historico": 
        return { texto: "NO BANHEIRO", cor: "bg-[#00579D] text-white border-2 border-[#00579D]" };
      case "concluido": 
        return { texto: "CONCLUÍDO", cor: "bg-[#2B2B2B] text-white border-2 border-[#2B2B2B]" };
      case "cancelado": 
        return { texto: "CANCELADO", cor: "bg-gray-200 border-2 border-[#2B2B2B] text-[#2B2B2B] line-through" };
      case "auditoria": 
      case "pausado": 
        return { texto: "SISTEMA", cor: "bg-gray-800 text-white border-2 border-gray-800" };
      default: 
        return { texto: status.toUpperCase(), cor: "bg-gray-100 border-2 border-gray-300 text-gray-600" };
    }
  };

  const renderDetalhes = (log: LogPedido) => {
    const originalDesc = log.description ? log.description.replace(/\[OVERRIDE:.*?\]/g, "") : "";
    if (log.status === "concluido" && log.go_time && log.back_time) {
      const diffMin = Math.round((new Date(log.back_time).getTime() - new Date(log.go_time).getTime()) / 60000);
      const tempo = diffMin < 1 ? "Menos de 1 min" : `${diffMin} min`;
      return `${originalDesc ? originalDesc + " | " : ""}Tempo fora: ${tempo}`;
    }
    return originalDesc || "-";
  };

  if (!currentUser) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F4F4]">
      <div className="text-xl font-bold text-[#00579D] uppercase tracking-widest animate-pulse">
        Carregando Sistema...
      </div>
    </div>
  );

  const meuPedido = filaEsperaOrdenada.find((p) => p.user_id === currentUser.user_id) || todosLogsAtivos.find(p => p.user_id === currentUser.user_id && p.status === "saida");
  const souOPrimeiro = filaEsperaOrdenada.length > 0 && filaEsperaOrdenada[0].user_id === currentUser.user_id;
  const banheiroLivre = !noBanheiro;

  return (
    <main className="min-h-screen flex flex-col bg-[#F4F4F4] font-sans text-[#2B2B2B]">
      <header className="bg-[#00579D] text-white px-8 py-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-senai.png" alt="Logo SENAI" className="h-14 sm:h-16 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-weg.png" alt="Logo WEG" className="h-14 sm:h-16 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
          <h1 className="text-xl font-bold tracking-wider uppercase hidden sm:block ml-4 border-l-2 border-white/30 pl-4">
            Controle de Acesso
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-sm tracking-wide">
            Operador: <strong className="font-bold uppercase">{currentUser.name}</strong>
          </span>
          <button
            onClick={fazerLogout}
            disabled={isProcessing}
            className="flex items-center gap-2 bg-white text-[#00579D] px-4 py-2 font-bold uppercase tracking-wider hover:bg-gray-200 transition-colors duration-300 border-b-4 border-gray-400 active:border-b-0 active:translate-y-1 disabled:opacity-50"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </header>

      <div className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-8">
        
        {/* =========================================================
            PAINEL DO PROFESSOR (NOVIDADE: INSERIR ALUNO MANUAL) 
            ========================================================= */}
        {isPrivileged && (
          <section className="bg-white border-2 border-[#2B2B2B] shadow-md p-6 flex flex-col gap-6">
            
            {/* Bloco Superior: Título e Botão de Pausa */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <h3 className="text-[#2B2B2B] font-bold uppercase tracking-widest flex items-center gap-2">
                <ShieldAlert size={20} /> Painel de Controle
              </h3>
              <button 
                onClick={alternarPausa}
                disabled={isProcessing}
                className={`w-full sm:w-auto text-white font-bold uppercase tracking-widest py-3 px-8 border-b-4 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                  isPaused 
                    ? "bg-[#00579D] hover:bg-[#003865] border-[#003865]" 
                    : "bg-[#2B2B2B] hover:bg-[#1A1A1A] border-black"
                }`}
              >
                {isPaused ? <PlayCircle size={20} /> : <PauseCircle size={20} />}
                {isPaused ? "Liberar Acessos" : "Bloquear Acessos"}
              </button>
            </div>

            {/* Bloco Inferior: Adicionar Aluno Dropdown */}
            <div className="flex flex-col sm:flex-row items-end gap-4 pt-6 border-t-2 border-gray-200">
              <div className="w-full flex-1">
                <label className="block text-[#2B2B2B] text-xs font-bold mb-2 uppercase tracking-wider">
                  Adicionar Aluno Manualmente na Fila
                </label>
                <select
                  className="w-full px-4 py-3 bg-[#F4F4F4] border-2 border-[#2B2B2B] text-[#2B2B2B] font-bold focus:outline-none focus:border-[#00579D] transition-all uppercase"
                  value={alunoSelecionado}
                  onChange={(e) => setAlunoSelecionado(e.target.value)}
                  disabled={isProcessing}
                >
                  <option value="">-- SELECIONE O ALUNO --</option>
                  {alunosLista
                    .filter(a => !todosLogsAtivos.some(log => log.user_id === a.user_id))
                    .map(aluno => (
                      <option key={aluno.user_id} value={aluno.user_id}>{aluno.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={adicionarAlunoManualmente}
                disabled={isProcessing || !alunoSelecionado}
                className="w-full sm:w-auto bg-[#00579D] text-white font-bold uppercase tracking-widest py-3 px-8 hover:bg-[#003865] border-b-4 border-[#003865] active:border-b-0 active:translate-y-1 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <UserPlus size={18} /> Inserir
              </button>
            </div>

          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="bg-white shadow-xl border-t-8 border-[#00579D] p-8 flex flex-col items-center justify-center text-center">
            <h2 className="text-2xl font-extrabold text-[#00579D] uppercase tracking-wide mb-2">Painel do Operador</h2>
            
            {isPaused ? (
              <div className="text-[#2B2B2B] font-bold mt-4 uppercase border-2 border-[#2B2B2B] p-4 bg-gray-100 flex items-center gap-2">
                <ShieldAlert size={20} /> Sistema Bloqueado pelo Administrador
              </div>
            ) : !meuPedido ? (
              <>
                <p className="text-[#2B2B2B] font-medium mb-6 uppercase">Acesso Liberado para Requisição</p>
                <button
                  onClick={requisitar}
                  disabled={isProcessing}
                  className="bg-[#00579D] text-white font-bold uppercase tracking-widest py-4 px-10 hover:bg-[#003865] border-b-4 border-[#003865] active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <UserPlus size={20} /> {isProcessing ? "Processando..." : "Requisitar Acesso"}
                </button>
              </>
            ) : meuPedido.status === "pedido" ? (
              souOPrimeiro && banheiroLivre ? (
                <div className="flex flex-col w-full gap-4 mt-4">
                  <p className="text-[#00579D] font-bold uppercase text-lg mb-2">Sua vez! O acesso está livre.</p>
                  <button
                    onClick={() => registrarSaida(meuPedido)}
                    disabled={isProcessing}
                    className="bg-[#00579D] text-white font-bold uppercase tracking-widest py-4 px-10 hover:bg-[#003865] border-b-4 border-[#003865] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 disabled:opacity-50 w-full"
                  >
                    <DoorOpen size={20} /> {isProcessing ? "Aguarde..." : "Confirmar Saída"}
                  </button>
                  <button
                    onClick={() => cancelarMeuPedido(meuPedido)}
                    disabled={isProcessing}
                    className="bg-transparent text-red-600 font-bold uppercase tracking-widest py-2 px-10 border-2 border-red-600 hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 w-full text-sm"
                  >
                    <XCircle size={18} /> Cancelar Pedido
                  </button>
                </div>
              ) : (
                <div className="flex flex-col w-full gap-4 mt-4">
                  <p className="text-[#2B2B2B] font-bold uppercase border-2 border-[#2B2B2B] p-4">
                    Aguardando liberação...
                  </p>
                  <button
                    onClick={() => cancelarMeuPedido(meuPedido)}
                    disabled={isProcessing}
                    className="bg-transparent text-red-600 font-bold uppercase tracking-widest py-2 px-10 border-2 border-red-600 hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 w-full text-sm mt-2"
                  >
                    <XCircle size={18} /> Desistir da Fila
                  </button>
                </div>
              )
            ) : meuPedido.status === "saida" ? (
              <>
                <p className="text-[#00579D] font-bold mb-6 uppercase text-lg mt-4">Você está fora da sala.</p>
                <button
                  onClick={() => registrarChegada(meuPedido)}
                  disabled={isProcessing}
                  className="bg-[#2B2B2B] text-white font-bold uppercase tracking-widest py-4 px-10 hover:bg-black border-b-4 border-black active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 disabled:opacity-50 w-full"
                >
                  <CheckCircle2 size={20} /> {isProcessing ? "Registrando..." : "Confirmar Retorno"}
                </button>
              </>
            ) : null}
          </section>

          <div className="space-y-6">
            <section className="bg-white border-2 border-[#00579D] shadow-md">
              <div className="bg-[#00579D] text-white px-4 py-3 font-bold uppercase tracking-widest flex items-center justify-between">
                <span>Acesso Ativo</span>
                <DoorOpen size={18} />
              </div>
              <div className="p-6">
                {noBanheiro ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-extrabold text-xl text-[#00579D] uppercase">{noBanheiro.name}</p>
                      <p className="text-sm font-bold text-gray-500 uppercase mt-1">
                        Saída: {formatarHora(noBanheiro.go_time)}
                      </p>
                    </div>
                    {isPrivileged && (
                      <button
                        onClick={() => encerrarAcessoForcado(noBanheiro)}
                        disabled={isProcessing}
                        className="flex items-center gap-1 bg-red-100 text-red-700 hover:bg-red-200 px-3 py-2 font-bold uppercase text-xs tracking-wider border-2 border-red-200 transition-colors disabled:opacity-50"
                        title="Forçar Retorno"
                      >
                        <XCircle size={16} /> Encerrar
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-[#2B2B2B] font-medium italic uppercase text-sm">Nenhum operador ativo</p>
                )}
              </div>
            </section>

            <section className="bg-white border-2 border-[#2B2B2B] shadow-md">
              <div className="bg-[#2B2B2B] text-white px-4 py-3 font-bold uppercase tracking-widest flex justify-between items-center">
                <span>Fila de Espera ({filaEsperaOrdenada.length})</span>
                <ClipboardList size={18} />
              </div>
              <div className="p-0 max-h-48 overflow-y-auto">
                {filaEsperaOrdenada.length === 0 ? (
                  <p className="text-center text-[#2B2B2B] font-medium italic uppercase text-sm p-6">Fila vazia</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {filaEsperaOrdenada.map((aluno, index) => (
                      <li key={aluno.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-gray-50 gap-4">
                        <div className="flex items-center gap-4">
                          <span className="text-[#00579D] font-black text-xl w-6">{index + 1}º</span>
                          <div>
                            <p className="font-bold text-[#2B2B2B] uppercase">{aluno.name}</p>
                            <p className="text-xs font-bold text-gray-500 uppercase">Req: {formatarHora(aluno.require_time)}</p>
                          </div>
                        </div>
                        
                        {isPrivileged && (
                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            {/* NOVO: Botão verde para forçar a ida de um aluno */}
                            <button 
                              onClick={() => forcarSaidaAluno(aluno)} 
                              disabled={isProcessing} 
                              className="p-2 text-white bg-green-600 hover:bg-green-700 transition-all disabled:opacity-50" 
                              title="Liberar Acesso Instantâneo"
                            >
                              <DoorOpen size={16} />
                            </button>
                            
                            <div className="w-px h-6 bg-gray-300 mx-1"></div>

                            {index > 0 && (
                              <button onClick={() => moverPosicao(index, "up")} disabled={isProcessing} className="p-2 text-[#2B2B2B] hover:bg-gray-200 border-2 border-transparent hover:border-[#2B2B2B] transition-all disabled:opacity-50" title="Subir na Fila">
                                <ArrowUp size={16} />
                              </button>
                            )}
                            {index < filaEsperaOrdenada.length - 1 && (
                              <button onClick={() => moverPosicao(index, "down")} disabled={isProcessing} className="p-2 text-[#2B2B2B] hover:bg-gray-200 border-2 border-transparent hover:border-[#2B2B2B] transition-all disabled:opacity-50" title="Descer na Fila">
                                <ArrowDown size={16} />
                              </button>
                            )}
                            <button onClick={() => removerDaFila(aluno)} disabled={isProcessing} className="p-2 text-white bg-[#2B2B2B] hover:bg-black transition-all disabled:opacity-50" title="Remover da Fila">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>

        {isPrivileged && historicoCompleto.length > 0 && (
          <section className="bg-white shadow-md border-t-8 border-[#2B2B2B] mt-8">
            <div className="bg-[#2B2B2B] text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold uppercase tracking-widest flex items-center gap-2">
                Histórico de Operações
              </h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F4F4F4] border-b-2 border-[#2B2B2B] text-[#2B2B2B] uppercase text-sm tracking-wider">
                    <th className="p-4 font-bold">Hora</th>
                    <th className="p-4 font-bold">Operador</th>
                    <th className="p-4 font-bold">Status</th>
                    <th className="p-4 font-bold hidden sm:table-cell">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {historicoCompleto.map((log) => {
                    const badge = getStatusDisplay(log.status);
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-mono text-sm font-bold text-gray-600">
                          {formatarHora(getEventTime(log))}
                        </td>
                        <td className="p-4 font-extrabold text-[#2B2B2B] uppercase">
                          {log.name}
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 font-bold text-xs uppercase tracking-wider ${badge.cor}`}>
                            {badge.texto}
                          </span>
                        </td>
                        <td className="p-4 text-sm font-bold text-gray-500 hidden sm:table-cell uppercase">
                          {renderDetalhes(log)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
      <footer className="bg-[#2B2B2B] text-white text-center text-xs py-4 font-bold tracking-widest uppercase border-t-2 border-gray-600">
        © {new Date().getFullYear()} WEG / SENAI • Sistema de Controle
      </footer>
    </main>
  );
}