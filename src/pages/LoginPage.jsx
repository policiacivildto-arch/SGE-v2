import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setSubmitting(true);
    try {
      await login(email, password);
      // Login bem-sucedido: currentUser deixa de ser null, o App troca
      // esta página pelo layout principal (que abre no dashboard).
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0f172a',
      backgroundImage: 'radial-gradient(circle at 20% 20%, #1a365d 0%, #0f172a 55%)',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        maxWidth: '460px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#1a365d',
          color: '#ffffff',
          padding: '28px 28px 24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <img src="/brasao_pcce.png" alt="Brasão Polícia Civil do Ceará" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', color: '#ffffff' }}>
                POLÍCIA CIVIL DO CEARÁ
              </h1>
              <div style={{ fontSize: '12px', color: '#93c5fd', fontWeight: '600' }}>
                Controle de Armaria & Acervo Institucional
              </div>
            </div>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#e2e8f0', lineHeight: '1.4' }}>
            Autenticação e controle por Níveis de Acesso
          </p>
        </div>

        {/* Form Body */}
        <div style={{ padding: '28px' }}>
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {loginError && (
              <div style={{
                padding: '10px 14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#991b1b',
                fontSize: '13px',
                fontWeight: '600',
                lineHeight: '1.4'
              }}>
                ⚠️ {loginError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                E-mail Institucional (@pc.ce.gov.br) <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <input
                type="email"
                required
                autoFocus
                placeholder="exemplo@pc.ce.gov.br"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                🔒 Somente e-mails do domínio <strong>@pc.ce.gov.br</strong> são autorizados.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                Senha de Acesso <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <input
                type="password"
                required
                placeholder="Sua senha secreta"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '800',
                color: '#ffffff',
                backgroundColor: submitting ? '#64748b' : '#1a365d',
                border: 'none',
                borderRadius: '8px',
                cursor: submitting ? 'default' : 'pointer',
                marginTop: '8px',
                transition: 'background-color 0.2s'
              }}
            >
              {submitting ? 'Entrando...' : 'Acessar o Sistema'}
            </button>

            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
              Novos acessos são cadastrados exclusivamente pelo Administrador do Sistema.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
