import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function UserManagementModal({ isOpen, onClose }) {
  const { users, currentUser, updateUserRole } = useAuth();
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleRoleChange = (userId, userName, newRole) => {
    updateUserRole(userId, newRole);
    const roleMap = {
      admin: 'Administrador (Acesso Total)',
      armeiro: 'Armeiro (Serviços e Estoque)',
      administrativo: 'Administrativo (Todos os Módulos)'
    };
    setSuccessMsg(`Nível de acesso de ${userName} alterado para: ${roleMap[newRole] || newRole}`);
    setTimeout(() => {
      setSuccessMsg('');
    }, 3000);
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
        maxWidth: '700px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#1a365d',
          color: '#ffffff',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>👑</span> Gestão de Níveis de Acesso
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#93c5fd' }}>
              Definição de perfis e permissões dos usuários cadastrados no sistema
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
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
        </div>

        <div style={{ padding: '24px' }}>
          {/* Admin Notice */}
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            fontSize: '12px',
            color: '#334155',
            lineHeight: '1.5'
          }}>
            ℹ️ Como <strong>Administrador Geral</strong>, você tem autoridade exclusiva para atribuir ou modificar o nível de acesso dos policiais e agentes cadastrados.
          </div>

          {successMsg && (
            <div style={{
              padding: '10px 14px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#166534',
              fontSize: '13px',
              fontWeight: '700',
              marginBottom: '16px'
            }}>
              ✅ {successMsg}
            </div>
          )}

          {/* User List Table */}
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: '700', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px' }}>Usuário / E-mail</th>
                  <th style={{ padding: '12px 16px' }}>Nível Atual</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Alterar Nível de Acesso (Admin)</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: u.id === currentUser?.id ? '#fefce8' : '#ffffff' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '700', color: '#1e293b' }}>
                        {u.nome} {u.id === currentUser?.id && <span style={{ fontSize: '11px', color: '#854d0e', fontWeight: 'bold' }}>(Você)</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '800',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        backgroundColor: u.badgeColor || '#3b82f6',
                        color: '#ffffff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {u.role === 'admin' ? '👑' : u.role === 'armeiro' ? '🔧' : '📋'} {u.roleLabel || u.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, u.nome, e.target.value)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: '700',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          color: '#1e293b',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="administrativo">📋 Administrativo</option>
                        <option value="armeiro">🔧 Armeiro</option>
                        <option value="admin">👑 Administrador</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '20px', textAlign: 'right' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 20px',
                fontSize: '13px',
                fontWeight: '700',
                backgroundColor: '#1a365d',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
