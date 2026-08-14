import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function UserHeaderBar() {
  const { currentUser, logout } = useAuth();

  if (!currentUser) return null;

  const getRoleIcon = (role) => {
    if (role === 'admin') return '👑';
    if (role === 'armeiro') return '🔧';
    return '📋';
  };

  return (
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

        {/* Logout Control */}
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
  );
}
