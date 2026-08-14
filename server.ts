import express from "express";
import path from "path";
import fs from "fs";
import http from "http";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import { serverDb } from "./serverDb.js";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

let mailTransporter: any = null;
let isSmtpConfigured = false;

async function getMailTransporter() {
  if (mailTransporter) return { transporter: mailTransporter, isSmtpConfigured };
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    isSmtpConfigured = true;
    const isOAuth = !!(process.env.SMTP_OAUTH_CLIENT_ID && process.env.SMTP_OAUTH_CLIENT_SECRET);
    
    const authConfig: any = isOAuth ? {
      type: 'OAuth2',
      user: process.env.SMTP_USER,
      clientId: process.env.SMTP_OAUTH_CLIENT_ID,
      clientSecret: process.env.SMTP_OAUTH_CLIENT_SECRET,
      refreshToken: process.env.SMTP_OAUTH_REFRESH_TOKEN,
    } : {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    };

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const isSecure = process.env.SMTP_SECURE === "true";

    mailTransporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure, // false for port 587 with STARTTLS
      requireTLS: port === 587 || port === 25,
      auth: authConfig,
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: process.env.SMTP_IGNORE_TLS_ERRORS === "true" ? false : true
      }
    });
  } else {
    isSmtpConfigured = false;
    try {
      const testAccount = await nodemailer.createTestAccount();
      mailTransporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (e) {
      mailTransporter = nodemailer.createTransport({
        jsonTransport: true
      });
    }
  }
  return { transporter: mailTransporter, isSmtpConfigured };
}

function generateDigitalSignatureSvg(policialNome: string, matricula: string, token: string, dataConfirmacao: string, isDevolucao: boolean = false) {
  const tokenShort = token ? token.substring(0, 14).toUpperCase() : "TOK-CONFIRMED";
  const dateFormatted = dataConfirmacao ? new Date(dataConfirmacao).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");
  const title = isDevolucao ? "✓ DEVOLUÇÃO ASSINADA DIGITALMENTE VIA E-MAIL" : "✓ CAUTELA ASSINADA DIGITALMENTE VIA E-MAIL";
  const headerBg = isDevolucao ? "#ecfdf5" : "#f0f9ff";
  const strokeColor = isDevolucao ? "#059669" : "#0284c7";
  const textColor = isDevolucao ? "#047857" : "#0369a1";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="130" viewBox="0 0 480 130">
    <rect width="480" height="130" fill="${headerBg}" stroke="${strokeColor}" stroke-width="2" rx="8"/>
    <rect x="8" y="8" width="464" height="114" fill="none" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="4 4" rx="6"/>
    <text x="24" y="32" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="${textColor}">${title}</text>
    <text x="24" y="56" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">Policial: ${policialNome || 'Servidor'}</text>
    <text x="24" y="76" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#334155">Matrícula: ${matricula || 'N/I'} | Data/Hora: ${dateFormatted}</text>
    <text x="24" y="96" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">Hash Validação: ${tokenShort} | Protocolo E-mail Confirmado</text>
    <text x="24" y="112" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="bold" fill="#15803d">SGA - AUTENTICAÇÃO DIGITAL GOV.SE</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function isValidPcCeEmail(email: any): boolean {
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase().endsWith("@pc.ce.gov.br");
}

async function sendCautelaEmailConfirmation(cautela: any, reqHost: string) {
  let email = cautela.email_policial || cautela.policial_email || cautela.email;
  let policialNome = cautela.policial_nome || "Policial";
  let matricula = cautela.matricula || "";

  if (!email && cautela.policial_id) {
    const pol = serverDb.getById<any>("policiais", cautela.policial_id);
    if (pol) {
      email = pol.email;
      if (!policialNome) policialNome = pol.nome;
      if (!matricula) matricula = pol.matricula;
    }
  }

  if (!cautela.token_confirmacao) {
    cautela.token_confirmacao = "tok_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
  }

  const token = cautela.token_confirmacao;
  const appProtocol = reqHost.includes("localhost") || reqHost.includes("127.0.0.1") ? "http" : "https";
  const baseUrl = `${appProtocol}://${reqHost}`;
  const confirmUrl = `${baseUrl}/api/cautelas/confirmar-email?token=${token}`;

  cautela.email_policial = (email || "").trim();
  if (!cautela.status || cautela.status === "Pendente") {
    cautela.status = "Pendente de Assinatura";
  }
  cautela.data_envio_email = new Date().toISOString();
  serverDb.update("cautelas", cautela.id, cautela);

  if (!isValidPcCeEmail(cautela.email_policial)) {
    console.warn(`[E-mail Bloqueado] ${cautela.email_policial} não possui domínio @pc.ce.gov.br`);
    return {
      success: false,
      confirmUrl,
      email: cautela.email_policial,
      token,
      error: "Apenas e-mails institucionais com o domínio @pc.ce.gov.br são permitidos."
    };
  }

  const { transporter, isSmtpConfigured } = await getMailTransporter();

  const mailOptions = {
    from: '"SGA - Armaria & Material Bélico" <no-reply@sga.ce.gov.br>',
    to: cautela.email_policial,
    subject: `[SGA] Solicitação de Confirmação de Cautela nº ${cautela.numero}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; color: #ffffff; padding: 20px; text-align: center;">
          <div style="margin-bottom: 8px;">
            <svg width="48" height="52" viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 5 L90 20 V55 C90 80 50 102 50 102 C50 102 10 80 10 55 V20 L50 5 Z" fill="#d97706" stroke="#fbbf24" stroke-width="3" />
              <path d="M50 10 L84 23 V53 C84 74 50 94 50 94 C50 94 16 74 16 53 V23 L50 10 Z" fill="#0f172a" stroke="#d97706" stroke-width="2" />
              <path d="M22 28 H78 V40 H22 Z" fill="#b45309" />
              <text x="50" y="37" text-anchor="middle" fill="#ffffff" font-size="8" font-weight="bold" font-family="sans-serif">POLÍCIA CIVIL</text>
              <circle cx="50" cy="62" r="18" fill="#1e3a8a" stroke="#fbbf24" stroke-width="1.5" />
              <polygon points="50,49 54,58 64,58 56,64 59,74 50,68 41,74 44,64 36,58 46,58" fill="#fbbf24" stroke="#d97706" stroke-width="0.5" />
              <text x="50" y="88" text-anchor="middle" fill="#fbbf24" font-size="8" font-weight="bold" font-family="sans-serif">CEARÁ</text>
            </svg>
          </div>
          <h2 style="margin: 0; font-size: 18px;">SGA - POLÍCIA CIVIL DO CEARÁ</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #93c5fd; font-weight: bold;">Confirmação Digital de Cautela de Material Bélico</p>
        </div>
        
        <div style="padding: 20px; color: #1e293b; font-size: 14px; line-height: 1.5;">
          <p>Olá, <strong>${policialNome}</strong> (Matrícula: ${matricula || 'N/I'}),</p>
          
          <p>Foi registrada uma nova cautela em seu nome no sistema de armaria. Para efetivar o acautelamento e gerar sua assinatura digital, por favor revise os dados abaixo e clique no botão de confirmação:</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Número da Cautela:</strong> ${cautela.numero}</p>
            <p style="margin: 4px 0;"><strong>Item Cautelado:</strong> ${cautela.item_desc || '—'}</p>
            <p style="margin: 4px 0;"><strong>Categoria:</strong> ${cautela.categoria || '—'}</p>
            <p style="margin: 4px 0;"><strong>Nº de Série:</strong> ${cautela.serie || 'S/N'}</p>
            <p style="margin: 4px 0;"><strong>Quantidade:</strong> ${cautela.qtd || 1} un.</p>
            ${cautela.qtd_carregadores ? `<p style="margin: 4px 0;"><strong>Carregadores:</strong> ${cautela.qtd_carregadores} un.</p>` : ''}
            <p style="margin: 4px 0;"><strong>Lotação / Unidade:</strong> ${cautela.lotacao || '—'}</p>
            <p style="margin: 4px 0;"><strong>Data da Saída:</strong> ${cautela.data_saida || new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          
          <div style="text-align: center; margin: 24px 0;">
            <a href="${confirmUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-weight: bold; font-size: 15px; border-radius: 6px; text-decoration: none; display: inline-block;">
              ✓ CONFIRMAR E ASSINAR CAUTELA
            </a>
          </div>
          
          <p style="font-size: 12px; color: #64748b; text-align: center;">
            Ou acesse o link direto no seu navegador:<br/>
            <a href="${confirmUrl}" style="color: #2563eb;">${confirmUrl}</a>
          </p>
          
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
          
          <p style="font-size: 11px; color: #94a3b8; font-style: italic; text-align: center;">
            Esta mensagem é gerada automaticamente pelo Sistema de Gestão de Armaria (SGA).
          </p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("E-mail de cautela enviado:", info.messageId || info);
    return { success: true, is_smtp_configured: isSmtpConfigured, confirmUrl, email: cautela.email_policial, token };
  } catch (err: any) {
    console.error("Erro ao enviar e-mail de confirmação:", err);
    return { success: false, is_smtp_configured: isSmtpConfigured, confirmUrl, email: cautela.email_policial, token, error: err.message };
  }
}

async function sendDevolucaoEmailConfirmation(cautela: any, reqHost: string) {
  let email = cautela.email_policial || cautela.policial_email || cautela.email;
  let policialNome = cautela.policial_nome || "Policial";
  let matricula = cautela.matricula || "";

  if (!email && cautela.policial_id) {
    const pol = serverDb.getById<any>("policiais", cautela.policial_id);
    if (pol) {
      email = pol.email;
      if (!policialNome) policialNome = pol.nome;
      if (!matricula) matricula = pol.matricula;
    }
  }

  if (!cautela.token_confirmacao_dev) {
    cautela.token_confirmacao_dev = "tok_dev_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
  }

  const token = cautela.token_confirmacao_dev;
  const appProtocol = reqHost.includes("localhost") || reqHost.includes("127.0.0.1") ? "http" : "https";
  const baseUrl = `${appProtocol}://${reqHost}`;
  const confirmUrl = `${baseUrl}/api/cautelas/confirmar-email-dev?token=${token}`;

  cautela.email_policial = (email || "").trim();
  cautela.status = "Pendente (Devolução)";
  cautela.data_envio_email_dev = new Date().toISOString();
  serverDb.update("cautelas", cautela.id, cautela);

  if (!isValidPcCeEmail(cautela.email_policial)) {
    console.warn(`[E-mail Bloqueado] ${cautela.email_policial} não possui domínio @pc.ce.gov.br`);
    return {
      success: false,
      is_smtp_configured: false,
      confirmUrl,
      email: cautela.email_policial,
      token,
      error: "Apenas e-mails institucionais com o domínio @pc.ce.gov.br são permitidos."
    };
  }

  const { transporter, isSmtpConfigured } = await getMailTransporter();

  const mailOptions = {
    from: '"SGA - Armaria & Material Bélico" <no-reply@sga.ce.gov.br>',
    to: cautela.email_policial,
    subject: `[SGA] Confirmação de DEVOLUÇÃO de Material - Cautela nº ${cautela.numero}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; color: #ffffff; padding: 16px 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 18px;">SGA - Sistema de Gestão de Armaria</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Confirmação Digital de Devolução de Material Bélico</p>
        </div>
        
        <div style="padding: 20px; color: #1e293b; font-size: 14px; line-height: 1.5;">
          <p>Olá, <strong>${policialNome}</strong> (Matrícula: ${matricula || 'N/I'}),</p>
          
          <p>Foi registrada a <strong>Devolução / Baixa de Material</strong> referente à sua Cautela nº <strong>${cautela.numero}</strong> na Armaria. Por favor, confirme a devolução para gerar a assinatura digital do termo:</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Número da Cautela:</strong> ${cautela.numero}</p>
            <p style="margin: 4px 0;"><strong>Item Devolvido:</strong> ${cautela.item_desc || '—'}</p>
            <p style="margin: 4px 0;"><strong>Nº de Série:</strong> ${cautela.serie || 'S/N'}</p>
            <p style="margin: 4px 0;"><strong>Data da Devolução:</strong> ${cautela.data_dev || new Date().toLocaleDateString('pt-BR')}</p>
            <p style="margin: 4px 0;"><strong>Condição:</strong> ${cautela.condicao_dev || 'Normal / Em Perfeito Estado'}</p>
            ${cautela.obs_dev ? `<p style="margin: 4px 0;"><strong>Observações:</strong> ${cautela.obs_dev}</p>` : ''}
          </div>
          
          <div style="text-align: center; margin: 24px 0;">
            <a href="${confirmUrl}" target="_blank" style="background-color: #059669; color: #ffffff; padding: 12px 28px; font-weight: bold; font-size: 15px; border-radius: 6px; text-decoration: none; display: inline-block;">
              ✓ CONFIRMAR E ASSINAR DEVOLUÇÃO
            </a>
          </div>
          
          <p style="font-size: 12px; color: #64748b; text-align: center;">
            Ou acesse o link direto no seu navegador:<br/>
            <a href="${confirmUrl}" style="color: #059669;">${confirmUrl}</a>
          </p>
          
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
          
          <p style="font-size: 11px; color: #94a3b8; font-style: italic; text-align: center;">
            Esta mensagem é gerada automaticamente pelo Sistema de Gestão de Armaria (SGA).
          </p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("E-mail de devolução enviado:", info.messageId || info);
    return { success: true, is_smtp_configured: isSmtpConfigured, confirmUrl, email: cautela.email_policial, token };
  } catch (err: any) {
    console.error("Erro ao enviar e-mail de devolução:", err);
    return { success: false, is_smtp_configured: isSmtpConfigured, confirmUrl, email: cautela.email_policial, token, error: err.message };
  }
}

async function sendSignatureReceiptEmail(cautela: any, hashAssinatura: string, isDevolucao: boolean = false, reqHost: string = "localhost:3000") {
  let email = cautela.email_policial || cautela.policial_email || cautela.email;
  let policialNome = cautela.policial_nome || "Policial";
  let matricula = cautela.matricula || "";

  if (!email && cautela.policial_id) {
    const pol = serverDb.getById<any>("policiais", cautela.policial_id);
    if (pol) {
      email = pol.email;
      if (!policialNome) policialNome = pol.nome;
      if (!matricula) matricula = pol.matricula;
    }
  }

  const targetEmail = (email || "").trim();

  if (!isValidPcCeEmail(targetEmail)) {
    console.warn(`[E-mail Bloqueado] E-mail "${targetEmail}" não pertence ao domínio @pc.ce.gov.br`);
    return { 
      success: false, 
      is_smtp_configured: false,
      email: targetEmail, 
      hashAssinatura, 
      error: `Envio de e-mail bloqueado: O e-mail "${targetEmail || 'Não informado'}" deve obrigatoriamente pertencer ao domínio @pc.ce.gov.br.` 
    };
  }

  const { transporter, isSmtpConfigured } = await getMailTransporter();
  const tipoOperacao = isDevolucao ? "Devolução / Baixa de Material Bélico" : "Retirada / Emissão de Cautela de Material Bélico";
  const dateFormatted = new Date().toLocaleString("pt-BR");

  const mailOptions = {
    from: '"SGA - Armaria & Material Bélico" <no-reply@sga.ce.gov.br>',
    to: targetEmail,
    subject: `[SGA] Comprovante de Assinatura Digital - Cautela nº ${cautela.numero} [ID: ${hashAssinatura}]`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #0f172a; border-radius: 8px; overflow: hidden; background: #ffffff;">
        <div style="background-color: #0f172a; color: #ffffff; padding: 20px; text-align: center;">
          <div style="margin-bottom: 8px;">
            <svg width="48" height="52" viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 5 L90 20 V55 C90 80 50 102 50 102 C50 102 10 80 10 55 V20 L50 5 Z" fill="#d97706" stroke="#fbbf24" stroke-width="3" />
              <path d="M50 10 L84 23 V53 C84 74 50 94 50 94 C50 94 16 74 16 53 V23 L50 10 Z" fill="#0f172a" stroke="#d97706" stroke-width="2" />
              <path d="M22 28 H78 V40 H22 Z" fill="#b45309" />
              <text x="50" y="37" text-anchor="middle" fill="#ffffff" font-size="8" font-weight="bold" font-family="sans-serif">POLÍCIA CIVIL</text>
              <circle cx="50" cy="62" r="18" fill="#1e3a8a" stroke="#fbbf24" stroke-width="1.5" />
              <polygon points="50,49 54,58 64,58 56,64 59,74 50,68 41,74 44,64 36,58 46,58" fill="#fbbf24" stroke="#d97706" stroke-width="0.5" />
              <text x="50" y="88" text-anchor="middle" fill="#fbbf24" font-size="8" font-weight="bold" font-family="sans-serif">CEARÁ</text>
            </svg>
          </div>
          <h2 style="margin: 0; font-size: 18px; letter-spacing: 0.5px;">SGA - POLÍCIA CIVIL DO CEARÁ</h2>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #93c5fd; font-weight: bold;">Comprovante Oficial de Assinatura Digital</p>
        </div>
        
        <div style="padding: 24px; color: #0f172a; font-size: 14px; line-height: 1.6;">
          <p>Prezado(a) Policial <strong>${policialNome}</strong> (Matrícula: <strong>${matricula || 'N/I'}</strong>),</p>
          
          <p>Confirmamos com sucesso o registro e a coleta da sua <strong>Assinatura Digital</strong> no Sistema de Gestão de Armaria (SGA) para a seguinte operação:</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #2563eb; border-radius: 6px; padding: 16px; margin: 18px 0;">
            <p style="margin: 4px 0; font-size: 15px;"><strong>ID Único da Assinatura:</strong> <span style="font-family: monospace; color: #2563eb; font-weight: bold; font-size: 16px;">${hashAssinatura}</span></p>
            <p style="margin: 4px 0;"><strong>Operação:</strong> ${tipoOperacao}</p>
            <p style="margin: 4px 0;"><strong>Nº Documento / Cautela:</strong> ${cautela.numero}</p>
            <p style="margin: 4px 0;"><strong>Item Cautelado:</strong> ${cautela.item_desc || cautela.item || '—'}</p>
            <p style="margin: 4px 0;"><strong>Nº de Série:</strong> ${cautela.serie || 'S/N'}</p>
            <p style="margin: 4px 0;"><strong>Lotação / Unidade:</strong> ${cautela.lotacao || '—'}</p>
            <p style="margin: 4px 0;"><strong>Data / Hora do Registro:</strong> ${dateFormatted}</p>
            <p style="margin: 4px 0;"><strong>E-mail Registrado:</strong> ${targetEmail}</p>
          </div>

          <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 12px; color: #166534;">
            <strong>✓ Autenticidade Garantida:</strong> Este documento e identificador único (<code>${hashAssinatura}</code>) servem como comprovante de recibo e declaração de responsabilidade referente ao material bélico registrado.
          </div>
          
          <p style="font-size: 12px; color: #64748b;">
            Guarde este e-mail para seu controle pessoal e comprovação junto ao Setor de Armaria Central.
          </p>
          
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
          
          <p style="font-size: 11px; color: #94a3b8; font-style: italic; text-align: center;">
            SGA - Sistema Eletrônico de Cautelas e Material Bélico • Polícia Civil
          </p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("E-mail de comprovante de assinatura enviado:", info.messageId || info);
    return { success: true, is_smtp_configured: isSmtpConfigured, email: targetEmail, hashAssinatura };
  } catch (err: any) {
    console.error("Erro ao enviar e-mail de comprovante de assinatura:", err);
    return { success: false, is_smtp_configured: isSmtpConfigured, email: targetEmail, hashAssinatura, error: err.message };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Helper for standard DRF response formatting
  const respondList = (res: express.Response, list: any[]) => {
    res.json({
      count: list.length,
      next: null,
      previous: null,
      results: list
    });
  };

  // --- API Endpoints ---

  // 1. Dashboard Estoque Resumo
  app.get("/api/dashboard/estoque", (req, res) => {
    try {
      const summary = serverDb.getDashboardEstoque(req.query);
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ detail: e.message || "Erro interno no servidor." });
    }
  });

  // 2. Extra Service Endpoints
  app.get("/api/servicos/next-code", (req, res) => {
    res.json({ codigo: serverDb.getNextCode() });
  });

  // 3. Extra Cautela Endpoints
  app.get("/api/cautelas/next-number", (req, res) => {
    res.json({ numero: serverDb.getNextCautelaNumber() });
  });

  app.post("/api/cautelas/:id/devolver", async (req, res) => {
    const { id } = req.params;
    const { data_dev, condicao_dev, status_item, motivo_recolhimento, nup, numero_io_bo, numero_serie_reparo, obs_dev } = req.body;

    if (!data_dev) {
      return res.status(400).json({ detail: "data_dev e obrigatorio." });
    }

    try {
      const tokenDev = "tok_dev_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      const updated = serverDb.devolverCautela(id, data_dev, condicao_dev, status_item, {
        motivoRecolhimento: motivo_recolhimento,
        nup,
        numeroIoBo: numero_io_bo,
        numeroSerieReparo: numero_serie_reparo,
        obsDev: obs_dev,
        tokenDev,
        assinaturaDev: req.body.assinatura_dev || req.body.assinatura_digital || ""
      });

      if (!updated) {
        return res.status(404).json({ detail: "Cautela nao encontrada ou nao ativa." });
      }

      let emailInfo = null;
      if (!req.body.assinatura_dev && !req.body.assinatura_digital) {
        emailInfo = await sendDevolucaoEmailConfirmation(updated, req.headers.host || "localhost:3000");
      }

      res.json({
        ...updated,
        email_info: emailInfo
      });
    } catch (e: any) {
      res.status(400).json({ detail: e.message || "Erro ao processar devolução." });
    }
  });

  // 4. Backfill Relational Refs (Mock endpoint for completeness)
  app.post("/api/admin/backfill-relacional", (req, res) => {
    res.json({
      status: "ok",
      apply: req.body.apply || false,
      output: "Backfill relational references executed successfully (MOCK)."
    });
  });

  // 5. Opcoes Menu ViewSet
  app.get("/api/opcoes-menu", (req, res) => {
    const { search, ordering, grupo, ativo } = req.query;
    const filters: any = {};
    if (grupo) filters.grupo = grupo;
    if (ativo) filters.ativo = ativo;

    const list = serverDb.queryCollection<any>(
      "opcoes-menu",
      search as string,
      ["grupo", "valor", "rotulo"],
      (ordering as string) || "ordem",
      filters
    );
    respondList(res, list);
  });

  app.post("/api/opcoes-menu", (req, res) => {
    const newItem = serverDb.create("opcoes-menu", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/opcoes-menu/:id", (req, res) => {
    const updated = serverDb.update("opcoes-menu", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/opcoes-menu/:id", (req, res) => {
    const deleted = serverDb.remove("opcoes-menu", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 6. Departamentos
  app.get("/api/departamentos", (req, res) => {
    const { search, ordering, ativo } = req.query;
    const filters: any = {};
    if (ativo) filters.ativo = ativo;

    const list = serverDb.queryCollection<any>(
      "departamentos",
      search as string,
      ["nome", "sigla"],
      (ordering as string) || "nome",
      filters
    );
    respondList(res, list);
  });

  app.post("/api/departamentos", (req, res) => {
    const newItem = serverDb.create("departamentos", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/departamentos/:id", (req, res) => {
    const updated = serverDb.update("departamentos", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/departamentos/:id", (req, res) => {
    const deleted = serverDb.remove("departamentos", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 7. Delegacias
  app.get("/api/delegacias", (req, res) => {
    const { search, ordering, ativo, departamento } = req.query;
    const filters: any = {};
    if (ativo) filters.ativo = ativo;
    if (departamento) filters.departamento_id = departamento;

    const list = serverDb.queryCollection<any>(
      "delegacias",
      search as string,
      ["nome", "codigo", "cidade"],
      (ordering as string) || "nome",
      filters
    ).map(del => {
      const depto = serverDb.getById<any>("departamentos", del.departamento_id);
      return {
        ...del,
        departamento_nome: depto ? depto.nome : ""
      };
    });
    respondList(res, list);
  });

  app.post("/api/delegacias", (req, res) => {
    const newItem = serverDb.create("delegacias", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/delegacias/:id", (req, res) => {
    const updated = serverDb.update("delegacias", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/delegacias/:id", (req, res) => {
    const deleted = serverDb.remove("delegacias", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 8. Usuarios
  app.get("/api/usuarios", (req, res) => {
    const { search, ordering, ativo, departamento, delegacia } = req.query;
    const filters: any = {};
    if (ativo) filters.ativo = ativo;
    if (departamento) filters.departamento_id = departamento;
    if (delegacia) filters.delegacia_id = delegacia;

    const list = serverDb.queryCollection<any>(
      "usuarios",
      search as string,
      ["username", "nome", "cargo"],
      (ordering as string) || "nome",
      filters
    ).map(u => {
      const pol = serverDb.getById<any>("policiais", u.policial_id);
      const depto = serverDb.getById<any>("departamentos", u.departamento_id);
      const del = serverDb.getById<any>("delegacias", u.delegacia_id);
      return {
        ...u,
        policial_nome: pol ? pol.nome : "",
        departamento_nome: depto ? depto.nome : "",
        delegacia_nome: del ? del.nome : ""
      };
    });
    respondList(res, list);
  });

  app.post("/api/usuarios", (req, res) => {
    const newItem = serverDb.create("usuarios", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/usuarios/:id", (req, res) => {
    const updated = serverDb.update("usuarios", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/usuarios/:id", (req, res) => {
    const deleted = serverDb.remove("usuarios", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 9. Lotacoes
  app.get("/api/lotacoes", (req, res) => {
    const { search, ordering, depto } = req.query;
    const filters: any = {};
    if (depto) filters.depto = depto;

    const list = serverDb.queryCollection<any>(
      "lotacoes",
      search as string,
      ["depto", "nome", "cidade", "resp", "area_atuacao", "ais", "seccional"],
      (ordering as string) || "nome",
      filters
    );
    respondList(res, list);
  });

  app.post("/api/lotacoes", (req, res) => {
    const newItem = serverDb.create("lotacoes", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/lotacoes/:id", (req, res) => {
    const updated = serverDb.update("lotacoes", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/lotacoes/:id", (req, res) => {
    const deleted = serverDb.remove("lotacoes", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 10. Policiais
  app.get("/api/policiais", (req, res) => {
    const { search, ordering, depto, lotacao } = req.query;
    const filters: any = {};
    if (depto) filters.depto = depto;
    if (lotacao) filters.lotacao = lotacao;

    const list = serverDb.queryCollection<any>(
      "policiais",
      search as string,
      ["matricula", "cpf", "nome", "cargo", "depto", "lotacao"],
      (ordering as string) || "nome",
      filters
    );
    respondList(res, list);
  });

  app.post("/api/policiais", (req, res) => {
    const newItem = serverDb.create("policiais", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/policiais/:id", (req, res) => {
    const updated = serverDb.update("policiais", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/policiais/:id", (req, res) => {
    const deleted = serverDb.remove("policiais", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 11. Fornecedores
  app.get("/api/fornecedores", (req, res) => {
    const { search, ordering } = req.query;
    const list = serverDb.queryCollection<any>(
      "fornecedores",
      search as string,
      ["nome", "cnpj", "contato", "tel", "email", "categoria"],
      (ordering as string) || "nome",
      {}
    );
    respondList(res, list);
  });

  app.post("/api/fornecedores", (req, res) => {
    const newItem = serverDb.create("fornecedores", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/fornecedores/:id", (req, res) => {
    const updated = serverDb.update("fornecedores", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/fornecedores/:id", (req, res) => {
    const deleted = serverDb.remove("fornecedores", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 12. Compras
  app.get("/api/compras", (req, res) => {
    const { search, ordering } = req.query;
    const list = serverDb.queryCollection<any>(
      "compras",
      search as string,
      ["descricao", "categoria", "marca", "modelo", "serie"],
      (ordering as string) || "-criado_em",
      {}
    ).map(comp => {
      const forn = serverDb.getById<any>("fornecedores", comp.fornecedor_id);
      return {
        ...comp,
        fornecedor_nome: forn ? forn.nome : ""
      };
    });
    respondList(res, list);
  });

  app.post("/api/compras", (req, res) => {
    const newItem = serverDb.create("compras", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/compras/:id", (req, res) => {
    const updated = serverDb.update("compras", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/compras/:id", (req, res) => {
    const deleted = serverDb.remove("compras", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // Helper CSV escaper
  const escapeCsv = (val: any) => {
    const str = String(val ?? "").trim();
    if (str.includes(";") || str.includes("\n") || str.includes('"')) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };

  // 13. Itens
  app.get("/api/itens/relatorio-xlsx", (req, res) => {
    try {
      const { search, categoria } = req.query;
      const filters: any = {};
      if (categoria) {
        filters.categoria = (categoria === "Coletes") ? "Coletes Balísticos" : categoria;
      }

      const list = serverDb.queryCollection<any>(
        "itens",
        search as string,
        ["descricao", "categoria", "marca", "serie", "patrimonio"],
        "descricao",
        filters
      );

      const headers = [
        "Descrição",
        "Categoria",
        "Status",
        "Tombo / Patrimônio",
        "Série",
        "Quantidade Total",
        "Quantidade Disponível",
        "Quantidade Mínima",
        "Observações"
      ];

      const lines = [
        "POLÍCIA CIVIL DO ESTADO DO CEARÁ",
        "GOVERNO DO ESTADO - SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL",
        "DEPARTAMENTO TÉCNICO OPERACIONAL - SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO (DTO)",
        "Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330 - Tel. 3101-7300",
        "",
        headers.join(";")
      ];

      list.forEach(i => {
        const row = [
          i.descricao || "",
          i.categoria || "",
          i.status || "Disponivel",
          i.patrimonio || "",
          i.serie || "",
          i.qtd_total || "0",
          i.qtd_disp || "0",
          i.qtd_min || "0",
          i.obs || ""
        ].map(escapeCsv);
        lines.push(row.join(";"));
      });

      const csvContent = `\uFEFF${lines.join("\r\n")}`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="relatorio_inventario.xlsx"');
      res.send(Buffer.from(csvContent, "utf-8"));
    } catch (e: any) {
      res.status(500).json({ detail: e.message || "Erro ao gerar planilha de inventário." });
    }
  });

  app.post("/api/itens/mesclar", (req, res) => {
    const { item_origem_id, item_destino_id } = req.body;
    
    if (!item_origem_id || !item_destino_id) {
      return res.status(400).json({ detail: "IDs de origem e destino são obrigatórios." });
    }
    
    if (item_origem_id === item_destino_id) {
      return res.status(400).json({ detail: "O item de origem e destino não podem ser o mesmo." });
    }
    
    const origem = serverDb.getById<any>("itens", item_origem_id);
    const destino = serverDb.getById<any>("itens", item_destino_id);
    
    if (!origem || !destino) {
      return res.status(404).json({ detail: "Item de origem ou destino não encontrado." });
    }

    // 1. Move all "bens" pointing to 'origem' to point to 'destino'
    const bensToMigrate = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: item_origem_id });
    bensToMigrate.forEach(b => {
      serverDb.update("bens", b.id, { item_id: item_destino_id });
    });
    
    // 2. Move all "cautelas" pointing to 'origem' to point to 'destino'
    const cautelasToMigrate = serverDb.queryCollection<any>("cautelas", undefined, [], undefined, { item_id: item_origem_id });
    cautelasToMigrate.forEach(c => {
      serverDb.update("cautelas", c.id, { item_id: item_destino_id, item_desc: destino.descricao });
    });

    // 3. Move all "movimentos" pointing to 'origem' to point to 'destino'
    const movimentacoesOrigem = serverDb.queryCollection<any>("movimentos").filter(m => m.item_id === item_origem_id);
    movimentacoesOrigem.forEach(m => {
      serverDb.update("movimentos", m.id, { item_id: item_destino_id });
    });

    // 4. Move/Delete 'armas' records pointing to 'origem'
    const armasToMigrate = serverDb.queryCollection<any>("armas", undefined, [], undefined, { item_id: item_origem_id });
    armasToMigrate.forEach(a => {
      const destArmas = serverDb.queryCollection<any>("armas", undefined, [], undefined, { item_id: item_destino_id });
      if (destArmas.length === 0) {
        serverDb.update("armas", a.id, { item_id: item_destino_id });
      } else {
        serverDb.remove("armas", a.id);
      }
    });

    // 5. Update destino totals
    destino.qtd_total = Number(destino.qtd_total || 0) + Number(origem.qtd_total || 0);
    destino.qtd_disp = Number(destino.qtd_disp || 0) + Number(origem.qtd_disp || 0);

    serverDb.update("itens", destino.id, destino);

    // 6. Remove the source item
    serverDb.remove("itens", item_origem_id);

    res.json({
      success: true,
      message: `Itens mesclados com sucesso! "${origem.descricao}" foi unificado em "${destino.descricao}"`,
      destino_id: destino.id
    });
  });

  app.get("/api/itens", (req, res) => {
    const { search, ordering, categoria, status } = req.query;
    const filters: any = {};
    if (categoria) {
      filters.categoria = (categoria === "Coletes") ? "Coletes Balísticos" : categoria;
    }
    if (status) filters.status = status;

    const list = serverDb.queryCollection<any>(
      "itens",
      search as string,
      ["patrimonio", "descricao", "categoria", "marca", "serie"],
      (ordering as string) || "descricao",
      filters
    ).map(item => {
      const forn = serverDb.getById<any>("fornecedores", item.fornecedor_id);
      let compraExcluida = false;
      if (item.compra_id) {
        const compra = serverDb.getById<any>("compras", item.compra_id);
        if (!compra) {
          compraExcluida = true;
        }
      }
      return {
        ...item,
        fornecedor_nome: forn ? forn.nome : "",
        compra_excluida: compraExcluida
      };
    });
    respondList(res, list);
  });

  app.get("/api/itens/:id", (req, res) => {
    const { id } = req.params;
    const item = serverDb.getById<any>("itens", id);
    if (!item) return res.status(404).json({ detail: "Nao encontrado." });
    const forn = serverDb.getById<any>("fornecedores", item.fornecedor_id);
    let compraExcluida = false;
    if (item.compra_id) {
      const compra = serverDb.getById<any>("compras", item.compra_id);
      if (!compra) {
        compraExcluida = true;
      }
    }
    res.json({
      ...item,
      fornecedor_nome: forn ? forn.nome : "",
      compra_excluida: compraExcluida
    });
  });

  function generateSequentialString(baseStr: string, index: number): string {
    if (!baseStr) return "";
    const match = baseStr.match(/^(.*?)([0-9]+)$/);
    if (match) {
      const prefix = match[1];
      const numStr = match[2];
      const numLength = numStr.length;
      const startNum = parseInt(numStr, 10);
      const currentNum = startNum + index;
      const currentNumStr = String(currentNum).padStart(numLength, "0");
      return prefix + currentNumStr;
    }
    return `${baseStr}-${String(index + 1).padStart(3, "0")}`;
  }

  app.post("/api/itens", (req, res) => {
    const { categoria, descricao, qtd_total, qtd_disp, patrimonio, serie, compra_id } = req.body;
    
    const normalizedDesc = String(descricao || "").trim().toLowerCase();
    const normalizedCat = String(categoria || "").trim().toLowerCase();
    
    const allItens = serverDb.queryCollection<any>("itens");
    const existingItem = allItens.find(i => 
      String(i.categoria || "").trim().toLowerCase() === normalizedCat &&
      String(i.descricao || "").trim().toLowerCase() === normalizedDesc
    );

    let finalItem: any;
    let oldQty = 0;

    if (existingItem) {
      oldQty = Number(existingItem.qtd_total || 0);
      const addedQty = Number(qtd_total || 1);
      const addedDisp = Number(qtd_disp !== undefined ? qtd_disp : addedQty);
      
      existingItem.qtd_total = oldQty + addedQty;
      existingItem.qtd_disp = Number(existingItem.qtd_disp || 0) + addedDisp;
      existingItem.status = "Disponivel";
      
      if (req.body.dt_aq && !existingItem.dt_aq) existingItem.dt_aq = req.body.dt_aq;
      if (req.body.fornecedor_id && !existingItem.fornecedor_id) existingItem.fornecedor_id = req.body.fornecedor_id;
      if (req.body.valor_compra && !existingItem.valor_compra) existingItem.valor_compra = req.body.valor_compra;
      
      serverDb.update("itens", existingItem.id, existingItem);
      finalItem = existingItem;
    } else {
      finalItem = serverDb.create<any>("itens", req.body);
    }
    
    // Se a categoria for armas, cria também um registro correspondente na tabela armas if it doesn't exist
    if (String(finalItem.categoria).toLowerCase().includes("arma")) {
      const existingArmas = serverDb.queryCollection<any>("armas", undefined, [], undefined, { item_id: finalItem.id });
      if (existingArmas.length === 0) {
        serverDb.create("armas", {
          item_id: finalItem.id,
          patrimonio_id: finalItem.patrimonio || "",
          tipo: req.body.tipo || "Pistola", // padrão
          marca: finalItem.marca || "",
          modelo: finalItem.descricao || "",
          calibre: req.body.calibre || "9mm",
          comprimento_cano: req.body.comp_cano || "",
          quantidade_carregadores: Number(req.body.carregadores || 2),
          capacidade: Number(req.body.capacidade || 15),
          numero_serie: finalItem.serie || ""
        });
      }
    }

    // Identify bulk categories (Munições, Uniformes, Peças) that do NOT generate individual bens
    const catStr = String(finalItem.categoria || "").toLowerCase();
    const isBulkCategory = catStr.includes("muniç") || catStr.includes("munico") || catStr.includes("uniforme") || catStr.includes("peça") || catStr.includes("peca");

    if (isBulkCategory) {
      finalItem.patrimonio = "";
      finalItem.serie = "";
      serverDb.update("itens", finalItem.id, finalItem);
    } else {
      const qty = Number(qtd_total || 1);
      const disp = Number(qtd_disp !== undefined ? qtd_disp : qty);
      const bensToCreate: any[] = [];

      for (let i = 1; i <= qty; i++) {
        const itemIdx = oldQty + i;
        const patrimonioNum = patrimonio 
          ? generateSequentialString(patrimonio, i - 1) 
          : `TOM-${finalItem.id.replace(/\D/g, "") || "0"}-${String(itemIdx).padStart(3, "0")}`;
        const serieNum = serie 
          ? generateSequentialString(serie, i - 1) 
          : "";
        bensToCreate.push({
          item_id: finalItem.id,
          compra_id: compra_id || "",
          patrimonio: patrimonioNum,
          serie: serie ? serieNum : "",
          status: i <= disp ? "Disponivel" : "Em Uso",
          tamanho: finalItem.tamanho || "",
          sexo: finalItem.sexo || "",
          dt_val: finalItem.dt_val || "",
          obs: `Gerado para o item: ${finalItem.descricao}${compra_id ? ' pela compra ' + compra_id : ''}`
        });
      }

      if (bensToCreate.length > 0) {
        serverDb.createMany("bens", bensToCreate);
      }
    }

    res.status(201).json(finalItem);
  });

  app.patch("/api/itens/:id", (req, res) => {
    const { id } = req.params;
    const oldItem = serverDb.getById<any>("itens", id);
    if (!oldItem) return res.status(404).json({ detail: "Nao encontrado." });

    const updated = serverDb.update<any>("itens", id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });

    // Sync individual assets (bens) if qtd_total changed or details changed
    const oldQty = Number(oldItem.qtd_total || 0);
    const newQty = Number(updated.qtd_total || 0);

    const existingBens = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: id });

    if (newQty > oldQty) {
      // Add new individual assets
      const diff = newQty - oldQty;
      for (let i = 1; i <= diff; i++) {
        const itemIdx = oldQty + i;
        const patrimonioNum = updated.patrimonio 
          ? generateSequentialString(updated.patrimonio, itemIdx - 1) 
          : `TOM-${updated.id.replace(/\D/g, "") || "0"}-${String(itemIdx).padStart(3, "0")}`;
        const serieNum = updated.serie 
          ? generateSequentialString(updated.serie, itemIdx - 1) 
          : "";
        serverDb.create("bens", {
          item_id: updated.id,
          patrimonio: patrimonioNum,
          serie: updated.serie ? serieNum : "",
          status: "Disponivel",
          tamanho: updated.tamanho || "",
          sexo: updated.sexo || "",
          dt_val: updated.dt_val || "",
          obs: `Adicionado na alteração de quantidade: ${updated.descricao}`
        });
      }
    } else if (newQty < oldQty) {
      // Remove excess assets starting with "Disponivel" status
      const diff = oldQty - newQty;
      let removed = 0;
      for (let i = existingBens.length - 1; i >= 0; i--) {
        if (removed >= diff) break;
        if (existingBens[i].status === "Disponivel") {
          serverDb.remove("bens", existingBens[i].id);
          removed++;
        }
      }
      if (removed < diff) {
        for (let i = existingBens.length - 1; i >= 0; i--) {
          if (removed >= diff) break;
          const wasRemoved = serverDb.remove("bens", existingBens[i].id);
          if (wasRemoved) removed++;
        }
      }
    }

    // Update common values for existing bens if they were updated on the parent item
    const currentBens = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: id });
    currentBens.forEach((b, index) => {
      let changed = false;
      const updates: any = {};
      if (updated.tamanho !== undefined && b.tamanho !== updated.tamanho) {
        updates.tamanho = updated.tamanho;
        changed = true;
      }
      if (updated.sexo !== undefined && b.sexo !== updated.sexo) {
        updates.sexo = updated.sexo;
        changed = true;
      }
      if (updated.dt_val !== undefined && b.dt_val !== updated.dt_val) {
        updates.dt_val = updated.dt_val;
        changed = true;
      }
      
      const isMunicoes = String(updated.categoria).toLowerCase() === "munições" || String(updated.categoria).toLowerCase() === "municoes" || String(updated.categoria).toLowerCase() === "munição" || String(updated.categoria).toLowerCase() === "municao";
      if (!isMunicoes) {
        if (updated.patrimonio !== undefined) {
          const expectedPatrimonio = updated.patrimonio 
            ? generateSequentialString(updated.patrimonio, index) 
            : `TOM-${updated.id.replace(/\D/g, "") || "0"}-${String(index + 1).padStart(3, "0")}`;
          if (b.patrimonio !== expectedPatrimonio) {
            updates.patrimonio = expectedPatrimonio;
            changed = true;
          }
        }
        if (updated.serie !== undefined) {
          const expectedSerie = updated.serie 
            ? generateSequentialString(updated.serie, index) 
            : "";
          if (b.serie !== expectedSerie) {
            updates.serie = expectedSerie;
            changed = true;
          }
        }
      }

      if (changed) {
        serverDb.update("bens", b.id, updates);
      }
    });

    res.json(updated);
  });

  app.delete("/api/itens/:id", (req, res) => {
    const { id } = req.params;
    const deleted = serverDb.remove("itens", id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });

    // Also delete individual assets (bens)
    const existingBens = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: id });
    existingBens.forEach(b => serverDb.remove("bens", b.id));

    res.status(204).send();
  });

  // Helper functions to dynamically sync individual asset statuses with active cautelas
  function syncItemBens(itemId: string) {
    const list = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: itemId });
    const activeCautelas = serverDb.queryCollection<any>("cautelas", undefined, [], undefined, { item_id: itemId, status: "Ativa" });

    const cauteladoSerials = new Set<string>();
    let genericCautelaCount = 0;

    activeCautelas.forEach(c => {
      const s = String(c.serie || c.numero_serie || "").trim().toLowerCase();
      if (s) {
        cauteladoSerials.add(s);
      } else {
        genericCautelaCount += Number(c.qtd || 1);
      }
    });

    let remainingGeneric = genericCautelaCount;

    // First, force any bem whose serial/patrimonio is explicitly in cauteladoSerials to be "Em Uso"
    list.forEach(b => {
      const bSerie = String(b.serie || "").trim().toLowerCase();
      const bPat = String(b.patrimonio || "").trim().toLowerCase();
      if ((bSerie && cauteladoSerials.has(bSerie)) || (bPat && cauteladoSerials.has(bPat))) {
        if (b.status !== "Em Uso") {
          b.status = "Em Uso";
          serverDb.update("bens", b.id, b);
        }
      }
    });

    // Then, distribute generic cautelas to any remaining bens that are currently "Disponivel" or "Em Uso" (but not explicitly cautelado)
    list.forEach(b => {
      const bSerie = String(b.serie || "").trim().toLowerCase();
      const bPat = String(b.patrimonio || "").trim().toLowerCase();
      const isExplicitlyCautelado = (bSerie && cauteladoSerials.has(bSerie)) || (bPat && cauteladoSerials.has(bPat));
      if (isExplicitlyCautelado) return;

      if (b.status === "Em Uso" || b.status === "Disponivel" || b.status === "Disponível") {
        let expectedStatus = "Disponivel";
        if (remainingGeneric > 0) {
          expectedStatus = "Em Uso";
          remainingGeneric--;
        }
        if (b.status !== expectedStatus) {
          b.status = expectedStatus;
          serverDb.update("bens", b.id, b);
        }
      }
    });

    // Finally, synchronize the parent item's available quantity if it tracks individual assets (bens)
    if (list.length > 0) {
      const countDisp = list.filter(b => b.status === "Disponivel" || b.status === "Disponível").length;
      const parentItem = serverDb.getById<any>("itens", itemId);
      if (parentItem && parentItem.qtd_disp !== countDisp) {
        parentItem.qtd_disp = countDisp;
        serverDb.update("itens", itemId, parentItem);
      }
    }
  }

  function syncAllBens() {
    const items = serverDb.queryCollection<any>("itens");
    items.forEach(item => {
      syncItemBens(item.id);
    });
  }

  // Endpoints para bens individuais
  app.get("/api/bens", (req, res) => {
    try {
      syncAllBens();
    } catch (e) {
      console.error("Error syncing all bens:", e);
    }

    const { search, ordering } = req.query;
    const list = serverDb.queryCollection<any>(
      "bens",
      search as string,
      ["patrimonio", "serie"],
      (ordering as string) || "patrimonio",
      {}
    );
    const enrichedList = list.map(b => {
      const parent = serverDb.getById<any>("itens", b.item_id);
      return {
        ...b,
        item_categoria: parent ? parent.categoria : "",
        item_marca: parent ? parent.marca : "",
        item_descricao: parent ? parent.descricao : "",
        item_calibre: parent ? parent.calibre : "",
      };
    });
    respondList(res, enrichedList);
  });

  app.get("/api/itens/:id/bens", (req, res) => {
    const { id } = req.params;
    try {
      syncItemBens(id);
    } catch (e) {
      console.error(`Error syncing item ${id} bens:`, e);
    }

    const list = serverDb.queryCollection<any>(
      "bens",
      undefined,
      [],
      "patrimonio",
      { item_id: id }
    );
    const enrichedList = list.map(b => {
      let compraInfo = null;
      let compraExcluida = false;
      if (b.compra_id) {
        const compra = serverDb.getById<any>("compras", b.compra_id);
        if (compra) {
          const forn = serverDb.getById<any>("fornecedores", compra.fornecedor_id);
          compraInfo = {
            id: compra.id,
            numero_nota_fiscal: compra.numero_nota_fiscal || "",
            numero_empenho: compra.numero_empenho || "",
            valor_compra: compra.valor_compra || 0,
            dt_aq: compra.dt_aq || "",
            fornecedor_nome: forn ? forn.nome : ""
          };
        } else {
          compraExcluida = true;
        }
      }
      return {
        ...b,
        compra: compraInfo,
        compra_excluida: compraExcluida
      };
    });
    respondList(res, enrichedList);
  });

  app.get("/api/itens/:id/compras", (req, res) => {
    const { id } = req.params;
    const item = serverDb.getById<any>("itens", id);
    if (!item) return res.status(404).json({ detail: "Item nao encontrado." });

    const allCompras = serverDb.queryCollection<any>("compras");
    const itemBens = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: id });
    const compraIdsFromBens = new Set(itemBens.map((b: any) => b.compra_id).filter(Boolean));

    const normCat = String(item.categoria || "").trim().toLowerCase();
    const normDesc = String(item.descricao || "").trim().toLowerCase();

    const matchedCompras = allCompras.filter((c: any) => {
      if (c.id === item.compra_id) return true;
      if (compraIdsFromBens.has(c.id)) return true;
      const cCat = String(c.categoria || "").trim().toLowerCase();
      const cDesc = String(c.descricao || "").trim().toLowerCase();
      if (cCat === normCat && cDesc === normDesc) return true;
      return false;
    }).map((comp: any) => {
      const forn = serverDb.getById<any>("fornecedores", comp.fornecedor_id);
      return {
        ...comp,
        fornecedor_nome: forn ? forn.nome : (comp.fornecedor_nome || "")
      };
    });

    respondList(res, matchedCompras);
  });

  app.patch("/api/bens/:id", (req, res) => {
    const { id } = req.params;
    const updated = serverDb.update<any>("bens", id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });

    // Sync parent item's available quantity (qtd_disp) based on number of individual assets with "Disponivel" status
    const itemId = updated.item_id;
    const itemBens = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: itemId });
    if (itemBens.length > 0) {
      const countDisp = itemBens.filter(b => b.status === "Disponivel").length;
      const parentItem = serverDb.getById<any>("itens", itemId);
      if (parentItem) {
        serverDb.update("itens", itemId, { qtd_disp: countDisp });
      }
    }

    res.json(updated);
  });

  // 14. Armas
  app.get("/api/armas", (req, res) => {
    const { search, ordering } = req.query;
    const list = serverDb.queryCollection<any>(
      "armas",
      search as string,
      ["marca", "modelo", "numero_serie"],
      (ordering as string) || "marca",
      {}
    ).map(a => {
      const item = serverDb.getById<any>("itens", a.item_id);
      const pat = serverDb.getById<any>("patrimonios", a.patrimonio_id);
      return {
        ...a,
        item_descricao: item ? item.descricao : "",
        patrimonio_codigo: pat ? pat.codigo : ""
      };
    });
    respondList(res, list);
  });

  app.post("/api/armas", (req, res) => {
    const newItem = serverDb.create("armas", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/armas/:id", (req, res) => {
    const updated = serverDb.update("armas", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/armas/:id", (req, res) => {
    const deleted = serverDb.remove("armas", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 15. Patrimonios
  app.get("/api/patrimonios", (req, res) => {
    const { search, ordering } = req.query;
    const list = serverDb.queryCollection<any>(
      "patrimonios",
      search as string,
      ["codigo", "descricao", "categoria"],
      (ordering as string) || "codigo",
      {}
    ).map(p => {
      const depto = serverDb.getById<any>("departamentos", p.departamento_id);
      const del = serverDb.getById<any>("delegacias", p.delegacia_id);
      return {
        ...p,
        departamento_nome: depto ? depto.nome : "",
        delegacia_nome: del ? del.nome : ""
      };
    });
    respondList(res, list);
  });

  app.post("/api/patrimonios", (req, res) => {
    const newItem = serverDb.create("patrimonios", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/patrimonios/:id", (req, res) => {
    const updated = serverDb.update("patrimonios", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/patrimonios/:id", (req, res) => {
    const deleted = serverDb.remove("patrimonios", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 16. Servicos
  app.get("/api/servicos", (req, res) => {
    const { search, ordering, status, tipo, armeiro } = req.query;
    const filters: any = {};
    if (status) filters.status = status;
    if (tipo) filters.tipo = tipo;
    if (armeiro) filters.armeiro = armeiro;

    const list = serverDb.queryCollection<any>(
      "servicos",
      search as string,
      ["codigo", "policial_nome", "matricula", "depto", "lotacao", "tipo", "serie"],
      (ordering as string) || "-criado_em",
      filters
    ).map(s => {
      const pol = serverDb.getById<any>("policiais", s.policial_id);
      return {
        ...s,
        policial_nome_display: pol ? pol.nome : s.policial_nome
      };
    });
    respondList(res, list);
  });

  app.post("/api/servicos", (req, res) => {
    const { policial_id } = req.body;
    let extraData: any = {};
    if (policial_id) {
      const pol = serverDb.getById<any>("policiais", policial_id);
      if (pol) {
        extraData = {
          policial_id: pol.id,
          matricula: req.body.matricula || pol.matricula,
          policial_nome: req.body.policial_nome || pol.nome,
          depto: req.body.depto || pol.depto,
          lotacao: req.body.lotacao || pol.lotacao
        };
      }
    }
    
    const codigo = serverDb.getNextCode();
    const newItem = serverDb.create("servicos", {
      ...req.body,
      ...extraData,
      codigo
    });
    res.status(201).json(newItem);
  });

  app.patch("/api/servicos/:id", (req, res) => {
    const updated = serverDb.update("servicos", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/servicos/:id", (req, res) => {
    const deleted = serverDb.remove("servicos", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // 17. Cautelas
  app.get("/api/cautelas/relatorio-xlsx", (req, res) => {
    try {
      const { search, categoria } = req.query;
      const filters: any = {};
      if (categoria) {
        filters.categoria = (categoria === "Coletes") ? "Coletes Balísticos" : categoria;
      }

      const list = serverDb.queryCollection<any>(
        "cautelas",
        search as string,
        ["numero", "policial_nome", "matricula", "depto", "lotacao", "item_desc"],
        "-data_saida",
        filters
      );

      const headers = [
        "Número",
        "Data Saída",
        "Data Previsão",
        "Data Devolução",
        "Policial Beneficiário",
        "Matrícula",
        "Departamento",
        "Lotação",
        "Item Cautelado",
        "Categoria",
        "Quantidade",
        "Qtd Carregadores",
        "Número de Série",
        "Patrimônio / Tombo",
        "Status",
        "Condição Devolução",
        "Motivo Recolhimento",
        "NUP",
        "Número IO/BO",
        "Número Série Reparo",
        "Observações"
      ];

      const lines = [
        "POLÍCIA CIVIL DO ESTADO DO CEARÁ",
        "GOVERNO DO ESTADO - SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL",
        "DEPARTAMENTO TÉCNICO OPERACIONAL - SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO (DTO)",
        "Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330 - Tel. 3101-7300",
        "",
        headers.join(";")
      ];

      list.forEach(c => {
        const row = [
          c.numero || "",
          c.data_saida || "",
          c.data_prev || "",
          c.data_dev || "",
          c.policial_nome || "",
          c.matricula || "",
          c.depto || "",
          c.lotacao || "",
          c.item_desc || "",
          c.categoria || "",
          c.qtd || "1",
          c.qtd_carregadores !== undefined && c.qtd_carregadores !== null ? String(c.qtd_carregadores) : (c.quantidade_carregadores !== undefined && c.quantidade_carregadores !== null ? String(c.quantidade_carregadores) : ""),
          c.serie || "",
          c.patrimonio || "",
          c.status || "Ativa",
          c.condicao_dev || "",
          c.motivo_recolhimento || "",
          c.nup || "",
          c.numero_io_bo || "",
          c.numero_serie_reparo || "",
          c.obs || ""
        ].map(escapeCsv);
        lines.push(row.join(";"));
      });

      const csvContent = `\uFEFF${lines.join("\r\n")}`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="relatorio_cautelas.xlsx"');
      res.send(Buffer.from(csvContent, "utf-8"));
    } catch (e: any) {
      res.status(500).json({ detail: e.message || "Erro ao gerar planilha de cautelas." });
    }
  });

  app.get("/api/cautelas", (req, res) => {
    const { search, ordering, status, categoria, lotacao } = req.query;
    const filters: any = {};
    if (status) filters.status = status;
    if (categoria) {
      filters.categoria = (categoria === "Coletes") ? "Coletes Balísticos" : categoria;
    }
    if (lotacao) filters.lotacao = lotacao;

    const list = serverDb.queryCollection<any>(
      "cautelas",
      search as string,
      ["numero", "policial_nome", "matricula", "depto", "lotacao", "item_desc"],
      (ordering as string) || "-criado_em",
      filters
    ).map(c => {
      const pol = serverDb.getById<any>("policiais", c.policial_id);
      return {
        ...c,
        policial_nome_display: pol ? pol.nome : c.policial_nome,
        item_descricao: c.item_desc
      };
    });
    respondList(res, list);
  });

  app.post("/api/cautelas", async (req, res) => {
    const { policial_id, item_id, item: bodyItem, qtd, numero_serie, serie } = req.body;
    const resolved_item_id = item_id || bodyItem;
    let selectedSerie = serie || numero_serie;

    // Validate that the serial is not already in an active/pending cautela
    if (selectedSerie) {
      const allForSerie = serverDb.queryCollection<any>("cautelas", undefined, [], undefined, {
        serie: selectedSerie
      });
      const activeCautelas = allForSerie.filter(c => c.status === "Ativa" || c.status === "Pendente");
      if (activeCautelas.length > 0) {
        return res.status(400).json({ detail: `O item com número de série "${selectedSerie}" já possui uma cautela ativa ou pendente.` });
      }
    }

    let extraData: any = {};
    
    if (!req.body.is_cautela_unidade && policial_id) {
      const pol = serverDb.getById<any>("policiais", String(policial_id));
      if (pol) {
        extraData = {
          policial_id: pol.id,
          matricula: pol.matricula,
          policial_nome: pol.nome,
          depto: pol.depto,
          lotacao: pol.lotacao
        };
      }
    } else if (req.body.is_cautela_unidade) {
      extraData = {
        policial_id: null,
        is_cautela_unidade: true,
        delegado_id: req.body.delegado_id || null,
        delegado_nome: req.body.delegado_nome || "",
        delegado_matricula: req.body.delegado_matricula || "",
        policial_nome: req.body.policial_nome || `UNIDADE: ${req.body.lotacao || req.body.depto || ''}`,
        matricula: req.body.matricula || req.body.delegado_matricula || "CARGA DA UNIDADE",
        depto: req.body.depto,
        lotacao: req.body.lotacao,
      };
    }

    // Auto-allocate individual asset (bens) if not specified but the item has individual assets
    let allocatedBem: any = null;
    if (resolved_item_id) {
      const item = serverDb.getById<any>("itens", String(resolved_item_id));
      if (item) {
        const itemBens = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: item.id });
        if (itemBens.length > 0) {
          if (selectedSerie) {
            const trimmedSel = String(selectedSerie).trim().toLowerCase();
            allocatedBem = itemBens.find(b => 
              String(b.serie || "").trim().toLowerCase() === trimmedSel ||
              String(b.patrimonio || "").trim().toLowerCase() === trimmedSel
            );
          } else {
            // Find the first available individual asset
            allocatedBem = itemBens.find(b => b.status === "Disponivel");
            if (allocatedBem) {
              selectedSerie = allocatedBem.serie || allocatedBem.patrimonio || "";
            }
          }
        }
      }
    }

    if (resolved_item_id) {
      const item = serverDb.getById<any>("itens", String(resolved_item_id));
      if (item) {
        extraData.item_id = item.id;
        extraData.item_desc = item.descricao;
        extraData.categoria = item.categoria;
        extraData.serie = selectedSerie || item.serie;

        // Update individual asset (bens) status to "Em Uso"
        if (allocatedBem) {
          allocatedBem.status = "Em Uso";
          serverDb.update("bens", allocatedBem.id, allocatedBem);
        } else if (selectedSerie) {
          const bensList = serverDb.queryCollection<any>("bens", undefined, [], undefined, {
            serie: selectedSerie
          });
          if (bensList.length > 0) {
            const b = bensList[0];
            b.status = "Em Uso";
            serverDb.update("bens", b.id, b);
          } else {
            const bensListPat = serverDb.queryCollection<any>("bens", undefined, [], undefined, {
              patrimonio: selectedSerie
            });
            if (bensListPat.length > 0) {
              const b = bensListPat[0];
              b.status = "Em Uso";
              serverDb.update("bens", b.id, b);
            }
          }
        }

        // Now calculate current qtd_disp of parent item
        const itemBens = serverDb.queryCollection<any>("bens", undefined, [], undefined, { item_id: item.id });
        if (itemBens.length > 0) {
          const countDisp = itemBens.filter(b => b.status === "Disponivel").length;
          item.qtd_disp = countDisp;
        } else {
          const requestedQtd = Number(qtd || 1);
          item.qtd_disp = Math.max(0, item.qtd_disp - requestedQtd);
        }
        item.status = item.qtd_disp === 0 ? "Em Uso" : item.status;
        serverDb.update("itens", item.id, item);
      }
    }
    
    const numero = serverDb.getNextCautelaNumber();
    const hasSignature = Boolean(req.body.assinatura_digital && String(req.body.assinatura_digital).trim().length > 0);
    const initialStatus = req.body.status || (hasSignature ? "Ativa" : "Pendente de Assinatura");
    const token = "tok_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    const emailPolicial = (req.body.email_policial || req.body.policial_email || req.body.email || "").trim();

    const timestampHex = Date.now().toString(36).toUpperCase();
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const preGeneratedHash = `SIG-2026-${timestampHex}-${randomHex}`;

    if (emailPolicial && !isValidPcCeEmail(emailPolicial)) {
      return res.status(400).json({ detail: "Apenas e-mails institucionais do domínio @pc.ce.gov.br são permitidos." });
    }

    const newItem = serverDb.create<any>("cautelas", {
      ...req.body,
      ...extraData,
      serie: selectedSerie || extraData.serie || "",
      numero,
      status: initialStatus,
      token_confirmacao: token,
      email_policial: emailPolicial,
      id_confirmacao: preGeneratedHash,
      hash_confirmacao: preGeneratedHash,
      hash_assinatura: hasSignature ? preGeneratedHash : (req.body.hash_assinatura || ""),
      assinatura_digital: req.body.assinatura_digital || (hasSignature ? generateDigitalSignatureSvg(extraData.policial_nome || req.body.policial_nome, extraData.matricula || req.body.matricula, preGeneratedHash, new Date().toISOString()) : ""),
      condicao_dev: "",
      obs_dev: "",
      qtd_carregadores: req.body.qtd_carregadores !== undefined ? req.body.qtd_carregadores : (req.body.quantidade_carregadores !== undefined ? req.body.quantidade_carregadores : null)
    });

    let emailInfo = null;
    if (!hasSignature) {
      emailInfo = await sendCautelaEmailConfirmation(newItem, req.headers.host || "localhost:3000");
    }

    res.status(201).json({
      ...newItem,
      id_confirmacao: preGeneratedHash,
      hash_confirmacao: preGeneratedHash,
      email_info: emailInfo
    });
  });

  app.get("/api/cautelas/confirmar-email", (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"/><title>Erro no Token</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #0f172a;">
          <h2 style="color: #e53e3e;">❌ Token de Confirmação Inválido</h2>
          <p>O link acessado não possui um código de confirmação válido.</p>
        </body>
        </html>
      `);
    }

    const allCautelas = serverDb.getAll<any>("cautelas");
    const cautela = allCautelas.find(c => c.token_confirmacao === token);

    if (!cautela) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"/><title>Cautela não Encontrada</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #0f172a;">
          <h2 style="color: #e53e3e;">❌ Cautela não Encontrada</h2>
          <p>Não foi encontrada nenhuma cautela registrada com este token de confirmação.</p>
        </body>
        </html>
      `);
    }

    const dataConfirmacao = new Date().toISOString();
    const timestampHex = Date.now().toString(36).toUpperCase();
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hashAssinatura = cautela.hash_assinatura || cautela.id_confirmacao || cautela.hash_confirmacao || `SIG-2026-${timestampHex}-${randomHex}`;
    
    const sigSvg = generateDigitalSignatureSvg(cautela.policial_nome, cautela.matricula, hashAssinatura, dataConfirmacao);

    cautela.status = "Ativa";
    cautela.assinatura_digital = sigSvg;
    cautela.confirmado_via_email = true;
    cautela.data_assinatura = dataConfirmacao;
    cautela.hash_assinatura = hashAssinatura;
    cautela.id_confirmacao = hashAssinatura;
    cautela.hash_confirmacao = hashAssinatura;
    serverDb.update("cautelas", cautela.id, cautela);

    // Attempt to send receipt email if configured
    try {
      sendSignatureReceiptEmail(cautela, hashAssinatura, false, req.headers.host || "localhost:3000").catch(() => {});
    } catch (e) {
      // non-blocking
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Cautela Confirmada e Assinada</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; margin: 0; padding: 40px 16px; display: flex; justify-content: center; }
          .card { background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); max-width: 550px; width: 100%; padding: 32px; text-align: center; }
          .badge { background: #dcfce7; color: #15803d; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 13px; display: inline-block; margin-bottom: 16px; }
          h1 { color: #0f172a; font-size: 22px; margin: 0 0 10px 0; }
          p { color: #475569; font-size: 14px; line-height: 1.6; margin: 6px 0; }
          .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: left; margin: 20px 0; font-size: 13px; }
          .id-box { background: #e0f2fe; border: 1px solid #0284c7; padding: 12px; border-radius: 8px; text-align: center; margin: 12px 0; font-family: monospace; font-size: 18px; font-weight: bold; color: #0369a1; letter-spacing: 1px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">✓ CONFIRMAÇÃO REALIZADA COM SUCESSO</div>
          <h1>Cautela nº ${cautela.numero} Assinada!</h1>
          <p>Sua confirmação foi registrada com sucesso. A assinatura digital e o ID de validação foram gerados e a cautela está ativada no sistema SGA.</p>
          
          <div class="id-box">
            <span style="font-size: 11px; display: block; color: #0284c7; font-family: sans-serif; font-weight: normal; margin-bottom: 4px;">🆔 ID Único de Confirmação & Assinatura Digital</span>
            ${hashAssinatura}
          </div>

          <div class="info-box">
            <p style="margin: 4px 0;"><strong>Policial Recebedor:</strong> ${cautela.policial_nome || '—'}</p>
            <p style="margin: 4px 0;"><strong>Matrícula:</strong> ${cautela.matricula || '—'}</p>
            <p style="margin: 4px 0;"><strong>Item:</strong> ${cautela.item_desc || '—'}</p>
            <p style="margin: 4px 0;"><strong>Nº de Série:</strong> ${cautela.serie || 'S/N'}</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">Ativa / Em Carga</span></p>
            <p style="margin: 4px 0;"><strong>Data da Confirmação:</strong> ${new Date(dataConfirmacao).toLocaleString('pt-BR')}</p>
          </div>

          <p style="font-size: 12px; color: #64748b;">Você pode fechar esta página. O comprovante impresso estará disponível na Armaria.</p>
        </div>
      </body>
      </html>
    `);
  });

  app.get("/api/cautelas/confirmar-email-dev", (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"/><title>Erro no Token</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #0f172a;">
          <h2 style="color: #e53e3e;">❌ Token de Confirmação Inválido</h2>
          <p>O link acessado não possui um código de confirmação de devolução válido.</p>
        </body>
        </html>
      `);
    }

    const allCautelas = serverDb.getAll<any>("cautelas");
    const cautela = allCautelas.find(c => c.token_confirmacao_dev === token);

    if (!cautela) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"/><title>Cautela não Encontrada</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #0f172a;">
          <h2 style="color: #e53e3e;">❌ Devolução não Encontrada</h2>
          <p>Não foi encontrada nenhuma cautela em processo de devolução registrada com este token.</p>
        </body>
        </html>
      `);
    }

    const dataConfirmacao = new Date().toISOString();
    const timestampHex = Date.now().toString(36).toUpperCase();
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hashAssinatura = cautela.hash_assinatura_dev || `SIG-DEV-2026-${timestampHex}-${randomHex}`;
    
    const sigSvg = generateDigitalSignatureSvg(cautela.policial_nome, cautela.matricula, hashAssinatura, dataConfirmacao, true);

    cautela.status = "Devolvido";
    cautela.assinatura_dev = sigSvg;
    cautela.confirmado_via_email_dev = true;
    cautela.data_assinatura_dev = dataConfirmacao;
    cautela.hash_assinatura_dev = hashAssinatura;
    serverDb.update("cautelas", cautela.id, cautela);

    // Attempt to send receipt email if configured
    try {
      sendSignatureReceiptEmail(cautela, hashAssinatura, true, req.headers.host || "localhost:3000").catch(() => {});
    } catch (e) {
      // non-blocking
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Devolução Confirmada e Assinada</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; margin: 0; padding: 40px 16px; display: flex; justify-content: center; }
          .card { background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); max-width: 550px; width: 100%; padding: 32px; text-align: center; }
          .badge { background: #d1fae5; color: #047857; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 13px; display: inline-block; margin-bottom: 16px; }
          h1 { color: #0f172a; font-size: 22px; margin: 0 0 10px 0; }
          p { color: #475569; font-size: 14px; line-height: 1.6; margin: 6px 0; }
          .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: left; margin: 20px 0; font-size: 13px; }
          .id-box { background: #d1fae5; border: 1px solid #059669; padding: 12px; border-radius: 8px; text-align: center; margin: 12px 0; font-family: monospace; font-size: 18px; font-weight: bold; color: #047857; letter-spacing: 1px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">✓ DEVOLUÇÃO CONFIRMADA COM SUCESSO</div>
          <h1>Devolução da Cautela nº ${cautela.numero} Assinada!</h1>
          <p>Sua confirmação de devolução foi registrada com sucesso. A assinatura digital foi gerada e a baixa foi concluída no sistema SGA.</p>
          
          <div class="id-box">
            <span style="font-size: 11px; display: block; color: #059669; font-family: sans-serif; font-weight: normal; margin-bottom: 4px;">🆔 ID Único de Confirmação de Devolução</span>
            ${hashAssinatura}
          </div>

          <div class="info-box">
            <p style="margin: 4px 0;"><strong>Policial:</strong> ${cautela.policial_nome || '—'}</p>
            <p style="margin: 4px 0;"><strong>Matrícula:</strong> ${cautela.matricula || '—'}</p>
            <p style="margin: 4px 0;"><strong>Item Devolvido:</strong> ${cautela.item_desc || '—'}</p>
            <p style="margin: 4px 0;"><strong>Nº de Série:</strong> ${cautela.serie || 'S/N'}</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #047857; font-weight: bold;">Devolvido</span></p>
            <p style="margin: 4px 0;"><strong>Data da Confirmação:</strong> ${new Date(dataConfirmacao).toLocaleString('pt-BR')}</p>
          </div>

          <p style="font-size: 12px; color: #64748b;">Você pode fechar esta página. O comprovante de devolução foi atualizado na Armaria.</p>
        </div>
      </body>
      </html>
    `);
  });

  app.post("/api/cautelas/:id/reenviar-email", async (req, res) => {
    const { id } = req.params;
    const cautela = serverDb.getById<any>("cautelas", id);
    if (!cautela) {
      return res.status(404).json({ detail: "Cautela não encontrada." });
    }

    const targetEmail = (req.body.email || cautela.email_policial || "").trim();
    if (!isValidPcCeEmail(targetEmail)) {
      return res.status(400).json({ detail: "Apenas e-mails do domínio institucional @pc.ce.gov.br são permitidos." });
    }

    if (req.body.email) {
      cautela.email_policial = targetEmail;
    }

    let emailResult = null;
    if (cautela.status === "Pendente (Devolução)") {
      emailResult = await sendDevolucaoEmailConfirmation(cautela, req.headers.host || "localhost:3000");
    } else {
      emailResult = await sendCautelaEmailConfirmation(cautela, req.headers.host || "localhost:3000");
    }

    res.json({
      detail: "E-mail de confirmação enviado ao policial com sucesso!",
      cautela,
      email_info: emailResult
    });
  });

  app.post("/api/cautelas/confirmar-token", async (req, res) => {
    const { token, id } = req.body;
    const allCautelas = serverDb.getAll<any>("cautelas");
    let cautela = null;

    if (token) {
      cautela = allCautelas.find(c => c.token_confirmacao === token || c.token_confirmacao_dev === token);
    } else if (id) {
      cautela = serverDb.getById<any>("cautelas", id);
    }

    if (!cautela) {
      return res.status(404).json({ detail: "Cautela não encontrada para confirmação." });
    }

    const dataConfirmacao = new Date().toISOString();
    const isDevolucao = cautela.status === "Pendente (Devolução)" || (token && cautela.token_confirmacao_dev === token);
    const tokenVal = (isDevolucao ? cautela.token_confirmacao_dev : cautela.token_confirmacao) || ("tok_" + Math.random().toString(36).substring(2, 10));

    const timestamp = Date.now().toString(36).toUpperCase();
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hashAssinatura = (isDevolucao ? cautela.hash_assinatura_dev : (cautela.hash_assinatura || cautela.id_confirmacao || cautela.hash_confirmacao)) || `SIG-2026-${timestamp}-${randomHex}`;

    const sigSvg = generateDigitalSignatureSvg(cautela.policial_nome, cautela.matricula, hashAssinatura, dataConfirmacao, isDevolucao);

    if (isDevolucao) {
      cautela.status = "Devolvido";
      cautela.assinatura_dev = sigSvg;
      cautela.confirmado_via_email_dev = true;
      cautela.data_assinatura_dev = dataConfirmacao;
      cautela.hash_assinatura_dev = hashAssinatura;
    } else {
      cautela.status = "Ativa";
      cautela.assinatura_digital = sigSvg;
      cautela.confirmado_via_email = true;
      cautela.data_assinatura = dataConfirmacao;
      cautela.hash_assinatura = hashAssinatura;
      cautela.id_confirmacao = hashAssinatura;
      cautela.hash_confirmacao = hashAssinatura;
    }

    const updated = serverDb.update<any>("cautelas", cautela.id, cautela);

    let emailResult = null;
    try {
      emailResult = await sendSignatureReceiptEmail(updated, hashAssinatura, isDevolucao, req.headers.host || "localhost:3000");
    } catch (e) {
      console.error("Erro ao enviar e-mail de comprovante:", e);
    }

    res.json({
      detail: isDevolucao ? "Devolução confirmada e assinatura digital gerada com sucesso!" : "Cautela confirmada e assinatura digital gerada com sucesso!",
      hash_assinatura: hashAssinatura,
      id_confirmacao: hashAssinatura,
      email_enviado: emailResult?.success || false,
      email_destino: emailResult?.email || updated.email_policial,
      cautela: updated
    });
  });

  app.post("/api/cautelas/:id/assinar", async (req, res) => {
    const { id } = req.params;
    const { assinatura_digital, tipo } = req.body;

    if (!assinatura_digital) {
      return res.status(400).json({ detail: "assinatura_digital e obrigatoria." });
    }

    const cautela = serverDb.getById<any>("cautelas", id);
    if (!cautela) {
      return res.status(404).json({ detail: "Cautela nao encontrada." });
    }

    const isDevolucao = tipo === "devolucao" || cautela.status === "Pendente (Devolução)";
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hashAssinatura = `SIG-2026-${timestamp}-${randomHex}`;
    const dataConfirmacao = new Date().toISOString();

    if (isDevolucao) {
      cautela.assinatura_dev = assinatura_digital;
      cautela.status = "Devolvido";
      cautela.hash_assinatura_dev = hashAssinatura;
      cautela.data_assinatura_dev = dataConfirmacao;
      cautela.confirmado_via_email_dev = true;
    } else {
      cautela.assinatura_digital = assinatura_digital;
      cautela.status = "Ativa";
      cautela.hash_assinatura = hashAssinatura;
      cautela.data_assinatura = dataConfirmacao;
      cautela.confirmado_via_email = true;
    }

    const updated = serverDb.update<any>("cautelas", id, cautela);

    let emailResult = null;
    try {
      emailResult = await sendSignatureReceiptEmail(updated, hashAssinatura, isDevolucao, req.headers.host || "localhost:3000");
    } catch (e) {
      console.error("Erro ao enviar e-mail de comprovante:", e);
    }

    res.json({
      detail: isDevolucao ? "Devolução confirmada e assinatura gravada com sucesso!" : "Assinatura digital gravada com sucesso!",
      hash_assinatura: hashAssinatura,
      email_enviado: emailResult?.success || false,
      email_destino: emailResult?.email || updated.email_policial,
      cautela: updated
    });
  });

  app.patch("/api/cautelas/:id", (req, res) => {
    const updated = serverDb.update("cautelas", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/cautelas/:id", (req, res) => {
    const cautela = serverDb.getById<any>("cautelas", req.params.id);
    if (cautela) {
      if (cautela.status === "Ativa") {
        // Restore parent item stock
        const item = serverDb.getById<any>("itens", cautela.item_id);
        if (item) {
          item.qtd_disp = Math.min(item.qtd_total, item.qtd_disp + Number(cautela.qtd || 1));
          item.status = "Disponivel";
          serverDb.update("itens", item.id, item);
        }
        // Restore individual bem status
        if (cautela.serie) {
          const bensList = serverDb.queryCollection<any>("bens", undefined, [], undefined, { serie: cautela.serie });
          if (bensList.length > 0) {
            const b = bensList[0];
            b.status = "Disponivel";
            serverDb.update("bens", b.id, b);
          }
        }
      }
    }
    const deleted = serverDb.remove("cautelas", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });

  // Helper for PDF header with coat of arms image
  function drawBrasaoPdfHeader(doc: any) {
    try {
      const imgPath = path.join(process.cwd(), "public", "brasao_pcce.png");
      if (fs.existsSync(imgPath)) {
        // A4 page width is 595.28 points, center is 297.64
        doc.image(imgPath, 297.64 - 25, 20, { fit: [50, 62], align: "center", valign: "center" });
        doc.y = 90;
      }
    } catch (e) {
      console.error("Erro ao desenhar brasão no PDF:", e);
    }
  }

  // Endpoints para Documento PDF e Relatórios
  app.get("/api/cautelas/:id/documento-pdf", (req, res) => {
    try {
      const { id } = req.params;
      const cautela = serverDb.getById<any>("cautelas", id);
      if (!cautela) {
        return res.status(404).json({ detail: "Cautela não encontrada." });
      }

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="cautela_${cautela.numero}.pdf"`);
      
      doc.pipe(res);

      drawBrasaoPdfHeader(doc);

      doc.font("Helvetica-Bold").fontSize(13).text("POLÍCIA CIVIL DO ESTADO DO CEARÁ", { align: "center" });
      doc.fontSize(9).font("Helvetica").text("GOVERNO DO ESTADO • SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL", { align: "center" });
      doc.font("Helvetica-Bold").fontSize(10).text("DEPARTAMENTO TÉCNICO OPERACIONAL", { align: "center" });
      doc.text("SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO - DTO", { align: "center" });
      doc.moveDown(1.2);
      
      doc.fontSize(13).text(`TERMO DE CAUTELA DE MATERIAL BÉLICO Nº ${cautela.numero}`, { align: "center" });
      doc.moveDown(1.2);

      doc.font("Helvetica-Bold").fontSize(10).text("1. DADOS DA CAUTELA:");
      doc.font("Helvetica").fontSize(10);
      doc.text(`Data de Saída: ${cautela.data_saida}`);
      doc.text(`Previsão de Devolução: ${cautela.data_prev || "Não definida"}`);
      doc.text(`Status da Cautela: ${cautela.status === "Ativa" ? "Em Uso" : cautela.status}`);
      doc.moveDown();

      doc.font("Helvetica-Bold").text("2. DESTINATÁRIO / ATRIBUIÇÃO:");
      doc.font("Helvetica");
      if (cautela.is_cautela_unidade || !cautela.policial_id || String(cautela.policial_nome || '').startsWith('UNIDADE:')) {
        doc.text(`Atribuição: CARGA DA UNIDADE (${cautela.lotacao || cautela.depto || '—'})`);
        if (cautela.delegado_nome) {
          doc.text(`Delegado Recebedor / Responsável: ${cautela.delegado_nome} (Matrícula: ${cautela.delegado_matricula || '—'})`);
        }
      } else if (cautela.policial_nome || cautela.matricula) {
        doc.text(`Policial Beneficiário: ${cautela.policial_nome || "—"}`);
        doc.text(`Matrícula: ${cautela.matricula || "—"}`);
      } else {
        doc.text("Destinatário: Unidade / Carga Geral");
      }
      doc.text(`Departamento: ${cautela.depto || "—"}`);
      doc.text(`Lotação / Unidade: ${cautela.lotacao || "—"}`);
      doc.moveDown();

      doc.font("Helvetica-Bold").text("3. ESPECIFICAÇÃO DO ITEM CAUTELADO:");
      doc.font("Helvetica");
      doc.text(`Item: ${cautela.item_desc || "—"}`);
      doc.text(`Categoria: ${cautela.categoria || "—"}`);
      doc.text(`Quantidade: ${cautela.qtd || 1}`);
      if (cautela.qtd_carregadores !== undefined && cautela.qtd_carregadores !== null && cautela.qtd_carregadores !== "") {
        doc.text(`Quantidade de Carregadores: ${cautela.qtd_carregadores}`);
      }
      doc.text(`Número de Série: ${cautela.serie || "—"}`);
      doc.text(`Patrimônio / Tombo: ${cautela.patrimonio || "—"}`);
      doc.moveDown();

      if (cautela.obs) {
        doc.font("Helvetica-Bold").text("4. OBSERVAÇÕES:");
        doc.font("Helvetica").text(cautela.obs);
        doc.moveDown();
      }

      doc.font("Helvetica-Bold").text("5. DECLARAÇÃO DE RESPONSABILIDADE:");
      doc.font("Helvetica").fontSize(9).text(
        "Declaro sob as penas da lei que recebi o material bélico/equipamento acima especificado, em perfeito estado de conservação e funcionamento, " +
        "comprometendo-me a zelar pela sua guarda, manutenção e integridade física. Obrigo-me a apresentá-lo ao Setor de Armamento e Material Bélico " +
        "sempre que solicitado, ou a devolvê-lo imediatamente em caso de transferência, licença, aposentadoria ou exoneração, sob pena de responder " +
        "administrativa, civil e penalmente nos termos da legislação vigente.",
        { align: "justify" }
      );
      doc.moveDown(3);

      const startY = doc.y;
      doc.fontSize(10);

      // Render digital signature if present
      if (cautela.assinatura_digital && cautela.assinatura_digital.startsWith("data:image")) {
        try {
          const base64Data = cautela.assinatura_digital.replace(/^data:image\/\w+;base64,/, "");
          const imgBuf = Buffer.from(base64Data, "base64");
          doc.image(imgBuf, 60, startY - 35, { fit: [200, 32], align: "center" });
        } catch (e) {
          // ignore
        }
      } else if (cautela.status === "Pendente" || cautela.status === "Pendente (Devolução)") {
        doc.fillColor("#d97706").fontSize(8).text("[ PENDENTE DE ASSINATURA DIGITAL ]", 50, startY - 15, { width: 220, align: "center" });
        doc.fillColor("#000000");
      }
      
      const sigNome = (cautela.is_cautela_unidade && cautela.delegado_nome)
        ? `${cautela.delegado_nome} (Delegado Recebedor)`
        : (cautela.policial_nome || "Responsável pela Unidade");
      const sigMat = (cautela.is_cautela_unidade && cautela.delegado_matricula)
        ? `Matrícula Delegado: ${cautela.delegado_matricula}`
        : (cautela.matricula ? `Matrícula: ${cautela.matricula}` : "Assinatura do Recebedor");

      doc.text("__________________________________________", 50, startY, { width: 220, align: "center" });
      doc.text(sigNome, 50, startY + 15, { width: 220, align: "center" });
      doc.text(sigMat, 50, startY + 30, { width: 220, align: "center" });

      doc.text("__________________________________________", 320, startY, { width: 220, align: "center" });
      doc.text("Setor de Armamento e Munição", 320, startY + 15, { width: 220, align: "center" });
      doc.text("Identificação do Emissor (S.G.A.)", 320, startY + 30, { width: 220, align: "center" });

      doc.fontSize(8).font("Helvetica").text(
        "Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330 | Tel. 3101-7300.",
        50,
        780,
        { align: "center", width: 495 }
      );

      doc.end();
    } catch (e: any) {
      res.status(500).json({ detail: e.message || "Erro ao gerar PDF da cautela." });
    }
  });

  app.get("/api/servicos/:id/documento-pdf", (req, res) => {
    try {
      const { id } = req.params;
      const servico = serverDb.getById<any>("servicos", id);
      if (!servico) {
        return res.status(404).json({ detail: "Ordem de serviço não encontrada." });
      }

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="servico_${servico.codigo}.pdf"`);
      
      doc.pipe(res);

      drawBrasaoPdfHeader(doc);

      doc.font("Helvetica-Bold").fontSize(13).text("POLÍCIA CIVIL DO ESTADO DO CEARÁ", { align: "center" });
      doc.fontSize(9).font("Helvetica").text("GOVERNO DO ESTADO • SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL", { align: "center" });
      doc.font("Helvetica-Bold").fontSize(10).text("DEPARTAMENTO TÉCNICO OPERACIONAL", { align: "center" });
      doc.text("SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO - DTO", { align: "center" });
      doc.moveDown(1.2);
      
      doc.fontSize(13).text(`ORDEM DE SERVIÇO Nº ${servico.codigo}`, { align: "center" });
      doc.moveDown(1.2);

      doc.font("Helvetica-Bold").fontSize(10).text("1. DADOS DA ORDEM DE SERVIÇO:");
      doc.font("Helvetica").fontSize(10);
      doc.text(`Data de Recebimento: ${servico.data_rec || "—"}`);
      doc.text(`Data de Devolução: ${servico.data_dev || "Aberto / Em manutenção"}`);
      doc.text(`Tipo de Serviço: ${servico.tipo || "—"}`);
      doc.text(`Armeiro Responsável: ${servico.armeiro || "—"}`);
      doc.text(`Status do Serviço: ${servico.status || "—"}`);
      doc.text(`Causa / Motivo: ${servico.motivo || "—"}`);
      doc.moveDown();

      doc.font("Helvetica-Bold").text("2. DADOS DO POLICIAL SOLICITANTE:");
      doc.font("Helvetica");
      doc.text(`Policial: ${servico.policial_nome || "—"}`);
      doc.text(`Matrícula: ${servico.matricula || "—"}`);
      doc.text(`Departamento: ${servico.depto || "—"}`);
      doc.text(`Lotação / Unidade: ${servico.lotacao || "—"}`);
      doc.moveDown();

      doc.font("Helvetica-Bold").text("3. ESPECIFICAÇÃO DO ITEM / ARMAMENTO:");
      doc.font("Helvetica");
      doc.text(`Categoria: ${servico.categoria || "Armas"}`);
      doc.text(`Marca / Modelo: ${servico.marca || "Pistola"} ${servico.modelo || "—"}`);
      doc.text(`Calibre: ${servico.calibre || "—"}`);
      doc.text(`Número de Série: ${servico.serie || "—"}`);
      doc.moveDown();

      doc.font("Helvetica-Bold").text("4. DETALHAMENTO DO SERVIÇO:");
      doc.font("Helvetica");
      doc.text(`Descrição Inicial do Defeito / Solicitação:\n${servico.descricao || "Sem observações adicionais"}`);
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text(`Trabalho Realizado / Parecer Técnico:\n`);
      doc.font("Helvetica").text(`${servico.trabalho_realizado || "Pendente / Em andamento"}`);
      
      let hasPecas = false;
      if (servico.pecas_substituidas) {
        hasPecas = Object.keys(servico.pecas_substituidas).some(k => Number(servico.pecas_substituidas[k]) > 0);
      }
      if (hasPecas) {
        doc.moveDown();
        doc.font("Helvetica-Bold").text("5. PEÇAS SUBSTITUÍDAS:");
        doc.font("Helvetica");
        Object.entries(servico.pecas_substituidas).forEach(([peca, qtd]) => {
          const qty = Number(qtd || 0);
          if (qty > 0) {
            doc.text(`• ${peca}: ${qty} un`);
          }
        });
      }
      
      doc.moveDown(3);

      const startY = doc.y;
      doc.fontSize(10);
      
      doc.text("__________________________________________", 50, startY, { width: 220, align: "center" });
      doc.text(servico.policial_nome || "Policial Solicitante", 50, startY + 15, { width: 220, align: "center" });
      doc.text(servico.matricula ? `Matrícula: ${servico.matricula}` : "Assinatura do Policial", 50, startY + 30, { width: 220, align: "center" });

      doc.text("__________________________________________", 320, startY, { width: 220, align: "center" });
      doc.text(servico.armeiro || "Armeiro de Plantão", 320, startY + 15, { width: 220, align: "center" });
      doc.text("Assinatura do Armeiro", 320, startY + 30, { width: 220, align: "center" });

      doc.fontSize(8).font("Helvetica").text(
        "Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330 | Tel. 3101-7300.",
        50,
        780,
        { align: "center", width: 495 }
      );

      doc.end();
    } catch (e: any) {
      res.status(500).json({ detail: e.message || "Erro ao gerar PDF do serviço." });
    }
  });

  // 18. Movimentos
  app.get("/api/movimentos", (req, res) => {
    const { search, ordering, tipo, categoria, lotacao } = req.query;
    const filters: any = {};
    if (tipo) filters.tipo = tipo;
    if (categoria) {
      filters.categoria = (categoria === "Coletes") ? "Coletes Balísticos" : categoria;
    }
    if (lotacao) filters.lotacao = lotacao;

    const list = serverDb.queryCollection<any>(
      "movimentos",
      search as string,
      ["tipo", "status"],
      (ordering as string) || "-criado_em",
      filters
    ).map(mov => {
      const item = serverDb.getById<any>("itens", mov.item_id);
      const arma = serverDb.getById<any>("armas", mov.arma_id);
      const pat = serverDb.getById<any>("patrimonios", mov.patrimonio_id);
      const depto = serverDb.getById<any>("departamentos", mov.departamento_id);
      const del = serverDb.getById<any>("delegacias", mov.delegacia_id);
      const usr = serverDb.getById<any>("usuarios", mov.usuario_id);
      return {
        ...mov,
        item_descricao: item ? item.descricao : "",
        arma_modelo: arma ? arma.modelo : "",
        patrimonio_codigo: pat ? pat.codigo : "",
        departamento_nome: depto ? depto.nome : "",
        delegacia_nome: del ? del.nome : "",
        usuario_nome: usr ? usr.nome : ""
      };
    });
    respondList(res, list);
  });

  app.post("/api/movimentos", (req, res) => {
    const newItem = serverDb.create("movimentos", req.body);
    res.status(201).json(newItem);
  });

  app.patch("/api/movimentos/:id", (req, res) => {
    const updated = serverDb.update("movimentos", req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: "Nao encontrado." });
    res.json(updated);
  });

  app.delete("/api/movimentos/:id", (req, res) => {
    const deleted = serverDb.remove("movimentos", req.params.id);
    if (!deleted) return res.status(404).json({ detail: "Nao encontrado." });
    res.status(204).send();
  });


  // --- Proxy reverso para o backend Django ---
  // Qualquer rota /api/* que não tenha sido tratada pelos handlers acima
  // (ainda não migrados deste arquivo) cai aqui e é encaminhada para o
  // backend Django. Conforme cada recurso é migrado, o handler
  // correspondente é removido deste arquivo e passa a cair neste fallback.
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.DJANGO_BACKEND_URL || "http://backend:8000",
      changeOrigin: true,
      // app.use("/api", ...) já removeu o prefixo /api de req.url antes
      // de chegar aqui — precisa devolver, já que as rotas Django também
      // vivem sob /api/.
      pathRewrite: (path) => `/api${path}`,
      on: {
        // express.json() (registrado global lá em cima) já consumiu o
        // stream do corpo da requisição — sem isso, POST/PUT/PATCH ficam
        // pendurados esperando um corpo que nunca chega no destino.
        proxyReq: fixRequestBody,
      },
    })
  );

  // --- Vite Middleware and Static File Serving ---

  if (process.env.NODE_ENV !== "production") {
    console.log("Iniciando Vite em modo de desenvolvimento...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Servindo arquivos estáticos em modo de produção...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SALT Backend] Servidor rodando na porta http://localhost:${PORT}`);
  });
}

startServer();
