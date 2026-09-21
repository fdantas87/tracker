"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { estadoDoSetup } from "@/lib/auth/setup"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export type LoginState = {
  error: string | null
}

export type SetupState = {
  error: string | null
}

/** Curto demais para um painel que guarda tokens de CAPI. O padrão do Supabase é 6. */
const SENHA_MINIMA = 10

/**
 * Login por email/senha. Não existe rota de cadastro no app — o único cadastro
 * possível é o primeiro acesso (`completeSetup`), que só funciona enquanto não
 * existe nenhum usuário. Contas adicionais nascem no Supabase Studio.
 */
export async function signIn(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Informe email e senha." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Mensagem genérica de propósito: distinguir "email não existe" de "senha
    // errada" entrega ao atacante quais emails têm conta no painel.
    return { error: "Email ou senha incorretos." }
  }

  revalidatePath("/", "layout")
  redirect("/")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath("/", "layout")
  redirect("/login")
}

/**
 * Primeiro acesso: cria o usuário do painel num deploy recém-instalado.
 *
 * Esta action NÃO chama `requireUser()` — não pode, é o caminho de quem ainda
 * não tem conta. A única barreira é a re-checagem de que `auth.users` está
 * vazia, e ela é OBRIGATÓRIA aqui dentro: uma Server Action é, na prática, um
 * endpoint HTTP público, e quem descobrir o id dela chama direto, sem passar
 * pela página que esconde o formulário.
 *
 * Janela de risco conhecida e aceita: entre o deploy terminar e o primeiro
 * acesso, quem alcançar a URL cria a conta de administrador. Por isso o
 * ONBOARDING manda fazer o primeiro acesso logo que o deploy termina, ainda na
 * URL *.vercel.app, antes de apontar o domínio do cliente (um domínio novo
 * aparece em Certificate Transparency em minutos). Depois do primeiro usuário
 * este caminho fica inerte para sempre.
 */
export async function completeSetup(
  _prevState: SetupState,
  formData: FormData
): Promise<SetupState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const passwordConfirm = String(formData.get("password_confirm") ?? "")
  const orgName = String(formData.get("org_name") ?? "").trim()

  if (!email || !email.includes("@")) {
    return { error: "Informe um email válido." }
  }
  if (password.length < SENHA_MINIMA) {
    return { error: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` }
  }
  // Conferido no servidor, não só no navegador: o formulário é um endpoint.
  if (password !== passwordConfirm) {
    return { error: "As senhas não conferem." }
  }
  if (orgName.length < 2 || orgName.length > 60) {
    return { error: "O nome da organização precisa ter de 2 a 60 caracteres." }
  }

  const estado = await estadoDoSetup()
  if (estado === "indisponivel") {
    return {
      error:
        "Não foi possível falar com o Supabase. Confira a SUPABASE_SERVICE_ROLE_KEY nas variáveis do projeto.",
    }
  }
  if (estado !== "vazio") {
    return {
      error: "Este painel já foi configurado. Entre com sua conta.",
    }
  }

  const service = createServiceClient()
  const { error: createError } = await service.auth.admin.createUser({
    email,
    password,
    // Obrigatório. Em projeto hospedado a confirmação de email é exigida por
    // padrão, e o fluxo de confirmação depende de SMTP, que um deploy novo não
    // tem. Sem isto o `signInWithPassword` abaixo devolveria
    // `email_not_confirmed` e o cliente ficaria trancado para fora do painel
    // que acabou de instalar, sem caminho de recuperação.
    email_confirm: true,
    // `app_metadata`, e não `user_metadata`: o usuário reescreve o segundo
    // sozinho, com a anon key (`auth.updateUser({ data })`). Só o service_role
    // escreve o primeiro, e `getUser()` devolve os dois igual.
    app_metadata: { org_name: orgName },
  })

  if (createError) {
    // Repassa a mensagem do Supabase em vez de engolir: se o operador tiver
    // subido a régua de senha no projeto, uma mensagem genérica nossa
    // esconderia o motivo real da recusa.
    return { error: `Não foi possível criar a conta: ${createError.message}` }
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    // A conta EXISTE e está confirmada — apagá-la aqui seria pior. Como agora
    // há usuário, `estadoDoSetup()` passa a "com-usuario" e a própria tela de
    // login aparece no lugar deste formulário. O caminho de falha se resolve
    // sozinho.
    return {
      error:
        "Conta criada. Entre com o email e a senha que você acabou de definir.",
    }
  }

  revalidatePath("/", "layout")
  // FORA de qualquer try/catch: redirect() funciona lançando NEXT_REDIRECT, e
  // um catch em volta o engoliria — a tela ficaria parada, sem erro nenhum.
  redirect("/")
}
