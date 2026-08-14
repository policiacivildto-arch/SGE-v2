import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginModal({ isOpen, onClose }) {
  const { currentUser, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen && currentUser) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setSubmitting(true);
    try {
      await login(email, password);
      if (onClose) onClose();
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        maxWidth: '520px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-[#1a365d]',
          backgroundColor: '#1a365d',
          color: '#ffffff',
          padding: '24px 28px',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <img src="/brasao_pcce.png" alt="Brasão Polícia Civil do Ceará" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', color: '#ffffff' }}>
                POLÍCIA CIVIL DO CEARÁ
              </h2>
              <div style={{ fontSize: '12px', color: '#93c5fd', fontWeight: '600' }}>
                Controle de Armaria & Acervo Institucional
              </div>
            </div>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#e2e8f0', lineHeight: '1.4' }}>
            Autenticação e controle por Níveis de Acesso
          </p>

          {currentUser && onClose && (
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                color: '#fff',
                fontSize: '16px',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px 28px' }}>
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
