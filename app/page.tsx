"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const inputUserRef = useRef<HTMLInputElement>(null);
  const inputPassRef = useRef<HTMLInputElement>(null);
  const [senhaAtiva, setSenhaAtiva] = useState(false);

  useEffect(() => {
    inputUserRef.current?.focus();
  }, []);

  const checkCaps = (e: React.KeyboardEvent) => {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  };

  const habilitado = usuario.length > 0 || senha.length > 0;

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    const u = usuario.trim();
    if (!u || !senha || carregando) return;

    setCarregando(true);
    setErro("");
    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Usuario: u, Senha: senha, DadosLicenciamentoCodificados: null }),
      });
      const data = await resp.json();
      if (data.Status === "SUCESSO") {
        sessionStorage.setItem("ponta_usuario", u);
        router.push("/sistema");
      } else {
        throw new Error(data.Mensagem || "Credenciais inválidas");
      }
    } catch (err: any) {
      setErro(err.message || "Erro de conexão. Tente novamente.");
      setSenha("");
      setSenhaAtiva(false);
      inputUserRef.current?.focus();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-tela">
      <div className="login-card">
        <div className="login-marca">
          <div className="login-icone">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.8 3.8L12 11.9 5.2 8.1 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10V13l6-3.4v6.6l-6 3.4Z" />
            </svg>
          </div>
          <div>
            <div className="login-titulo">Ponta de Estoque</div>
            <div className="login-sub">Controle de pontas de revenda</div>
          </div>
        </div>

        <form className="login-form" onSubmit={entrar} autoComplete="off" spellCheck={false}>
          <input type="text" name="fakeUsername" className="sr-only" tabIndex={-1} aria-hidden="true" />
          <input type="password" name="fakePassword" className="sr-only" tabIndex={-1} aria-hidden="true" />

          <label htmlFor="Login_Usuario">Usuário</label>
          <input
            ref={inputUserRef}
            type="text"
            id="Login_Usuario"
            name="Login_Usuario"
            autoComplete="off"
            aria-autocomplete="none"
            list="autocompleteOff"
            placeholder="Digite seu usuário"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            onKeyUp={checkCaps}
          />

          <label htmlFor="Login_Senha">Senha</label>
          <input
            ref={inputPassRef}
            type={senhaAtiva ? "password" : "text"}
            id="Login_Senha"
            name="Login_Senha"
            autoComplete="off"
            aria-autocomplete="none"
            list="autocompleteOff"
            readOnly={!senhaAtiva}
            placeholder="Digite sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onFocus={() => setSenhaAtiva(true)}
            onKeyUp={checkCaps}
          />

          <div className="login-caps">{capsLock ? "CapsLock está ativado" : ""}</div>

          <button type="submit" className="login-botao" disabled={!habilitado || carregando}>
            {carregando ? "Aguarde..." : "Entrar"}
          </button>
        </form>

        {erro && (
          <div className="login-erro" role="alert">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2 1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-6h-2v5h2v-5Z" />
            </svg>
            <span>{erro}</span>
          </div>
        )}

        <div className="login-rodape">Acesso restrito a usuários autorizados</div>
      </div>

      <datalist id="autocompleteOff"></datalist>
    </div>
  );
}