import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiService, setUnauthorizedHandler } from '../services/api';

// Email domain constraint
export const REQUIRED_DOMAIN = '@pc.ce.gov.br';

export const validateEmail = (email) => {
  if (!email) return 'E-mail é obrigatório.';
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.endsWith(REQUIRED_DOMAIN)) {
    return `Acesso restrito a e-mails institucionais do domínio ${REQUIRED_DOMAIN}`;
  }
  return null;
};

const ROLE_META = {
  admin: { roleLabel: 'Administrador', badgeColor: '#7c3aed' },
  armeiro: { roleLabel: 'Armeiro', badgeColor: '#2563eb' },
  administrativo: { roleLabel: 'Administrativo', badgeColor: '#059669' },
};

function withRoleMeta(user) {
  if (!user) return null;
  const meta = ROLE_META[user.role] || ROLE_META.administrativo;
  return { ...user, ...meta };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  const clearSession = useCallback(() => {
    apiService.clearTokens();
    setCurrentUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Ao carregar a página, se já houver tokens salvos, valida a sessão
  // buscando o usuário atual em vez de confiar em algo salvo localmente.
  useEffect(() => {
    (async () => {
      if (!apiService.hasTokens()) {
        setInitializing(false);
        return;
      }
      try {
        const user = await apiService.get('auth/me/');
        setCurrentUser(withRoleMeta(user));
      } catch (e) {
        apiService.clearTokens();
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const emailErr = validateEmail(email);
    if (emailErr) {
      throw new Error(emailErr);
    }

    const cleanEmail = email.trim().toLowerCase();
    let data;
    try {
      data = await apiService.create('auth/login/', { email: cleanEmail, password });
    } catch (e) {
      throw new Error(e.message || 'E-mail ou senha inválidos.');
    }

    apiService.setTokens(data.access, data.refresh);
    const user = withRoleMeta(data.user);
    setCurrentUser(user);
    return user;
  };

  const logout = async () => {
    const refresh = apiService.getRefreshToken();
    try {
      if (refresh) {
        await apiService.create('auth/logout/', { refresh });
      }
    } catch (e) {
      // Mesmo se o backend não conseguir invalidar o refresh token
      // (ex.: já expirado), a sessão local é encerrada de qualquer forma.
    }
    clearSession();
  };

  // Check if current user can perform an action
  // section: 'servicos' | 'estoque' | 'cadastros'
  // action: 'view' | 'add' | 'edit' | 'delete'
  // record: object or creator string
  const can = (action, section, record = null) => {
    if (!currentUser) return false;

    // 1. Admin can do everything everywhere
    if (currentUser.role === 'admin') return true;

    // 2. Delete is prohibited for both Armeiro and Administrativo
    if (action === 'delete') return false;

    // Extract creator email from record if available
    let createdByEmail = null;
    if (record) {
      if (typeof record === 'string') {
        createdByEmail = record;
      } else if (typeof record === 'object') {
        createdByEmail = record.created_by || record.criado_por || record.usuario_email || record.policial_email;
      }
    }

    // 3. Armeiro permissions:
    // - Access ONLY 'servicos' e 'estoque' (não acessa 'cadastros')
    // - Pode ver e adicionar em 'servicos' e 'estoque'
    // - Só pode editar registros criados em 'servicos'
    if (currentUser.role === 'armeiro') {
      if (section === 'cadastros') return false;

      if (action === 'view' || action === 'add') {
        return section === 'servicos' || section === 'estoque';
      }

      if (action === 'edit') {
        if (section !== 'servicos') return false;
        if (!createdByEmail) return true;
        return createdByEmail.toLowerCase() === currentUser.email.toLowerCase();
      }
    }

    // 4. Administrativo permissions:
    // - Acessa TUDO (servicos, estoque, cadastros)
    // - Pode ver e adicionar em TODAS as seções
    // - Só pode editar registros criados em 'estoque'
    if (currentUser.role === 'administrativo') {
      if (action === 'view' || action === 'add') {
        return true;
      }

      if (action === 'edit') {
        if (section !== 'estoque') return false;
        if (!createdByEmail) return true;
        return createdByEmail.toLowerCase() === currentUser.email.toLowerCase();
      }
    }

    return false;
  };

  const value = {
    currentUser,
    initializing,
    login,
    logout,
    can,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
