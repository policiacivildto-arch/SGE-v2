import React, { useState } from 'react';
import { useAuth, SEED_USERS } from '../context/AuthContext';
import LoginModal from './LoginModal';
import UserManagementModal from './UserManagementModal';

export default function UserHeaderBar() {
  const { currentUser, logout, switchUser, users } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showUserMgmtModal, setShowUserMgmtModal] = useState(false);

  if (!currentUser) {
    return (
      <>
        <div style={{
          backgroundColor: '#0f172a',
          color: '#ffffff',
          padding: '10px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #3b82f6',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img src="/brasao_pcce.png" alt="Brasão Polícia Civil do Ceará" style={{ height: '44px', width: 'auto', objectFit: 'contain' }} />
            <div>
              <strong style={{ fontSize: '15px', color: '#ffffff', letterSpacing: '0.5px', display: 'block' }}>
                POLÍCIA CIVIL DO CEARÁ
              </strong>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>
                SGA • Sistema de Gestão de Armaria
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowLoginModal(true)}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            🔑 Entrar com e-mail @pc.ce.gov.br
          </button>
        </div>

        <LoginModal isOpen={true} onClose={() => {}} />
      </>
    );
  }

  const getRoleIcon = (role) => {
    if (role === 'admin') return '👑';
    if (role === 'armeiro') return '🔧';
    return '📋';
  };

  return (
    <>
      <div style={{
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        padding: '10px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '2px solid #334155',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
      }}>
        {/* Left Side: System Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="/brasao_pcce.png" alt="Brasão Polícia Civil do Ceará" style={{ height: '44px', width: 'auto', objectFit: 'contain' }} />
          <div>
            <strong style={{ fontSize: '15px', color: '#ffffff', letterSpacing: '0.5px', display: 'block', textTransform: 'uppercase' }}>
              POLÍCIA CIVIL DO CEARÁ
            </strong>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>
              SGA • Sistema de Gestão de Armaria
            </div>
          </div>
        </div>

        {/* Right Side: User Info & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* User Profile Card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: currentUser.badgeColor || '#3b82f6',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              fontSize: '16px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              {getRoleIcon(currentUser.role)}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '13px', color: '#ffffff' }}>{currentUser.nome}</strong>
                <span style={{
                  fontSize: '10px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: currentUser.badgeColor || '#3b82f6',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  {currentUser.roleLabel || currentUser.role}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                {currentUser.email}
              </div>
            </div>
          </div>

          {/* Quick Role Switcher and Logout Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', padding: '6px 10px', borderRadius: '8px', border: '1px solid #334155' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>Perfil de Teste:</span>
              <select
                value={currentUser.id}
                onChange={(e) => switchUser(e.target.value)}
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #475569',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  outline: 'none'
                }}
                title="Trocar de usuário para testar as regras do nível de acesso"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.role === 'admin' ? '👑' : u.role === 'armeiro' ? '🔧' : '📋'} {u.roleLabel} - {u.nome}
                  </option>
                ))}
              </select>
            </div>

            {currentUser?.role === 'admin' && (
              <button
                onClick={() => setShowUserMgmtModal(true)}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: '800',
                  backgroundColor: '#6d28d9',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Gerenciar os Níveis de Acesso de todos os usuários (Exclusivo Administrador)"
              >
                <span>👑</span> Gestão de Perfis
              </button>
            )}

            <button
              onClick={() => setShowLoginModal(true)}
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: '700',
                backgroundColor: '#334155',
                color: '#f1f5f9',
                border: '1px solid #475569',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
              title="Abrir tela de login ou cadastrar nova conta"
            >
              👤 Trocar / Cadastrar
            </button>

            <button
              onClick={logout}
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: '700',
                backgroundColor: '#991b1b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
              title="Sair da conta"
            >
              🚪 Sair
            </button>
          </div>
        </div>
      </div>

      {showLoginModal && (
        <LoginModal isOpen={true} onClose={() => setShowLoginModal(false)} />
      )}

      {showUserMgmtModal && (
        <UserManagementModal isOpen={true} onClose={() => setShowUserMgmtModal(false)} />
      )}
    </>
  );
}
