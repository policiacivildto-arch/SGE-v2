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

  // 2. Extra Service Endpoints — cortado para o backend Django na Fase 5
  // (PRD_BACKEND_DJANGO.md, seção 12.1). Cai no proxy /api.

  // 3. Extra Cautela Endpoints — cortado para o backend Django na Fase 5
  // (PRD_BACKEND_DJANGO.md, seção 12.1). Cai no proxy /api.

  // 4. Backfill Relational Refs (Mock endpoint for completeness)
  app.post("/api/admin/backfill-relacional", (req, res) => {
    res.json({
      status: "ok",
      apply: req.body.apply || false,
      output: "Backfill relational references executed successfully (MOCK)."
    });
  });

  // 5. Opcoes Menu — cortado para o backend Django na Fase 5 (PRD_BACKEND_DJANGO.md,
  // seção 12.1). Cai no proxy /api registrado mais abaixo.

  // 6/7. Departamentos e Delegacias — cortados para o backend Django na
  // Fase 5 (PRD_BACKEND_DJANGO.md, seção 12.1). Caem no proxy /api.

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
  // Lotações — cortado para o backend Django na Fase 5
  // (PRD_BACKEND_DJANGO.md, seção 12.1). Cai no proxy /api.

  // 10. Policiais — cortado para o backend Django na Fase 5
  // (PRD_BACKEND_DJANGO.md, seção 12.1). Cai no proxy /api.

  // 11. Fornecedores — cortado para o backend Django na Fase 5
  // (PRD_BACKEND_DJANGO.md, seção 12.1). Cai no proxy /api.

  // 12-14. Compras, Itens, Bens, Armas — cortados para o backend Django
  // na Fase 5 (PRD_BACKEND_DJANGO.md, seção 12.1). Caem no proxy /api.
  // Helper CSV escaper (ainda usado pelo relatório de cautelas abaixo).
  const escapeCsv = (val: any) => {
    const str = String(val ?? "").trim();
    if (str.includes(";") || str.includes("\n") || str.includes('"')) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };

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
  // Serviços — cortado para o backend Django na Fase 5
  // (PRD_BACKEND_DJANGO.md, seção 12.1). Cai no proxy /api.

  // 17-18. Cautelas e Movimentos — cortados para o backend Django na
  // Fase 5 (PRD_BACKEND_DJANGO.md, seção 12.1). Caem no proxy /api.


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
