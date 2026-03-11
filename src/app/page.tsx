"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { UserPlus, ArrowRight, CheckCircle2 } from "lucide-react";

// Tipo para ajudar o TypeScript a entender nossos dados
type Pedido = {
  id: string;
  nome_aluno: string;
  status: string;
  hora_pedido: string;
};

export default function Home() {
  const [fila, setFila] = useState<Pedido[]>([]);
  const [nome, setNome] = useState("");

  // Efeito para carregar a fila quando a página abre e ouvir mudanças em tempo real
  useEffect(() => {
    carregarFila();

    const channel = supabase
      .channel("realtime_fila")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fila_banheiro" },
        () => {
          carregarFila(); // Recarrega a tela sempre que o banco atualizar
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Busca os dados no Supabase (ignorando quem já concluiu)
  const carregarFila = async () => {
    const { data } = await supabase
      .from("fila_banheiro")
      .select("*")
      .neq("status", "concluido")
      .order("hora_pedido", { ascending: true });

    if (data) setFila(data);
  };

  // Função para adicionar aluno na fila
  const entrarNaFila = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;

    // Se não tiver ninguém na fila, já entra com status 'no_banheiro', senão fica 'esperando'
    const statusInicial = fila.length === 0 ? "no_banheiro" : "esperando";
    const horaSaida = fila.length === 0 ? new Date().toISOString() : null;

    await supabase.from("fila_banheiro").insert([
      {
        nome_aluno: nome,
        status: statusInicial,
        hora_saida: horaSaida,
      },
    ]);

    setNome(""); // Limpa o campo de texto
  };

  // Função para quando o aluno volta do banheiro
  const registrarVolta = async (id: string) => {
    // 1. Marca quem voltou como 'concluido'
    await supabase
      .from("fila_banheiro")
      .update({ status: "concluido", hora_volta: new Date().toISOString() })
      .eq("id", id);

    // 2. Acha quem é o próximo da fila para liberar a vez
    const proximo = fila.find((p) => p.status === "esperando" && p.id !== id);
    if (proximo) {
      await supabase
        .from("fila_banheiro")
        .update({ status: "no_banheiro", hora_saida: new Date().toISOString() })
        .eq("id", proximo.id);
    }
  };

  const noBanheiro = fila.find((p) => p.status === "no_banheiro");
  const esperando = fila.filter((p) => p.status === "esperando");

  return (
    <main className="min-h-screen flex flex-col">
  
      {/* Barra superior institucional */}
      <header
        className="text-white px-8 py-4 shadow flex justify-between items-center"
        style={{ background: "var(--weg-blue)" }}
      >
        <h1 className="font-semibold text-lg">
          Sistema de Controle de Fila
        </h1>
  
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
          className="text-sm bg-white/20 px-3 py-1 rounded"
        >
          Sair
        </button>
      </header>
  
      {/* Área principal */}
      <div
        className="flex-1 p-6"
        style={{ background: "var(--weg-gray)", color: "var(--weg-text)" }}
      >
        <div className="max-w-xl mx-auto space-y-8">
  
          {/* Cabeçalho */}
          <div className="text-center">
            <h2 className="text-3xl font-bold" style={{ color: "var(--weg-blue)" }}>
              Fila do Banheiro
            </h2>
            <p className="mt-2 text-gray-500">
              Coloque seu nome e aguarde a sua vez.
            </p>
          </div>
  
          {/* Formulário */}
          <form
            onSubmit={entrarNaFila}
            className="flex gap-2 bg-white p-4 rounded-xl shadow-sm"
            style={{ border: "1px solid var(--weg-border)" }}
          >
            <input
              type="text"
              placeholder="Digite seu nome..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="flex-1 px-4 py-2 rounded-lg border focus:outline-none"
              style={{ border: "1px solid var(--weg-border)" }}
              required
            />
  
            <button
              type="submit"
              className="text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium"
              style={{ background: "var(--weg-blue)" }}
            >
              <UserPlus size={20} />
              Entrar
            </button>
          </form>
  
          {/* Usuário atual */}
          <div
            className="bg-white rounded-xl shadow-sm overflow-hidden"
            style={{ border: "1px solid var(--weg-border)" }}
          >
            <div
              className="px-6 py-4 border-b"
              style={{ background: "#e8f1fb", borderColor: "var(--weg-border)" }}
            >
              <h3 className="font-semibold flex items-center gap-2" style={{ color: "var(--weg-blue)" }}>
                <ArrowRight size={20} />
                No Banheiro Agora
              </h3>
            </div>
  
            <div className="p-6">
              {noBanheiro ? (
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {noBanheiro.nome_aluno}
                  </span>
  
                  <button
                    onClick={() => registrarVolta(noBanheiro.id)}
                    className="text-white px-4 py-2 rounded-lg flex items-center gap-2"
                    style={{ background: "var(--weg-blue-dark)" }}
                  >
                    <CheckCircle2 size={20} />
                    Voltei
                  </button>
                </div>
              ) : (
                <p className="text-center italic text-gray-400">
                  Banheiro livre
                </p>
              )}
            </div>
          </div>
  
          {/* Fila */}
          <div
            className="bg-white rounded-xl shadow-sm overflow-hidden"
            style={{ border: "1px solid var(--weg-border)" }}
          >
            <div
              className="px-6 py-4 border-b"
              style={{ borderColor: "var(--weg-border)" }}
            >
              <h3 className="font-semibold">
                Fila de Espera ({esperando.length})
              </h3>
            </div>
  
            <ul className="divide-y" style={{ borderColor: "var(--weg-border)" }}>
              {esperando.length > 0 ? (
                esperando.map((pedido, index) => (
                  <li key={pedido.id} className="px-6 py-4 flex items-center gap-4">
                    <span
                      className="font-bold rounded-full w-8 h-8 flex items-center justify-center"
                      style={{
                        background: "var(--weg-gray)",
                        color: "var(--weg-text)",
                      }}
                    >
                      {index + 1}
                    </span>
  
                    <span className="text-lg">{pedido.nome_aluno}</span>
                  </li>
                ))
              ) : (
                <li className="px-6 py-8 text-center italic text-gray-400">
                  Ninguém na fila no momento
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}