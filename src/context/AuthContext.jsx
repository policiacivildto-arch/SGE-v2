import React, { createContext, useContext, useState, useEffect } from 'react';

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

export const validatePassword = (password) => {
  if (!password) return 'Senha é obrigatória.';
  if (password.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
  if (!/[A-Z]/.test(password)) return 'A senha deve conter pelo menos uma letra maiúscula (A-Z).';
  if (!/[0-9]/.test(password)) return 'A senha deve conter pelo menos um número (0-9).';
  if (!/[^A-Za-z0-9]/.test(password)) return 'A senha deve conter pelo menos um caractere especial (!@#$%...).';
  return null;
};

export const SEED_USERS = [
  {
    id: 'usr-admin',
    nome: 'Administrador Geral',
    email: 'admin@pc.ce.gov.br',
    password: 'Admin@1234',
    role: 'admin',
    roleLabel: 'Administrador',
    badgeColor: '#7c3aed',
  },
  {
    id: 'usr-armeiro',
    nome: 'Armeiro Plantonista',
    email: 'armeiro@pc.ce.gov.br',
    password: 'Armeiro@1234',
    role: 'armeiro',
    roleLabel: 'Armeiro',
    badgeColor: '#2563eb',
  },
  {
    id: 'usr-admin-serv',
    nome: 'Agente Administrativo',
    email: 'admin.serv@pc.ce.gov.br',
    password: 'Admin@1234',
    role: 'administrativo',
    roleLabel: 'Administrativo',
    badgeColor: '#059669',
  }
];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(() => {
    try {
      const stored = localStorage.getItem('pc_ce_registered_users');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge seed users with stored users to ensure seed users are always present
          const merged = [...SEED_USERS];
          parsed.forEach(u => {
            if (!merged.some(su => su.email.toLowerCase() === u.email.toLowerCase())) {
              merged.push(u);
            }
          });
          return merged;
        }
      }
    } catch (e) {
      console.error('Error loading stored users:', e);
    }
    return SEED_USERS;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem('pc_ce_current_user');
      if (storedUser) {
        return JSON.parse(storedUser);
      }
    } catch (e) {
      console.error('Error loading current user:', e);
    }
    // Default to admin user for immediate seamless access
    return SEED_USERS[0];
  });

  useEffect(() => {
    try {
      localStorage.setItem('pc_ce_registered_users', JSON.stringify(users));
    } catch (e) {
      console.error('Error saving users to localStorage:', e);
    }
  }, [users]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem('pc_ce_current_user', JSON.stringify(currentUser));
      } else {
        localStorage.removeItem('pc_ce_current_user');
      }
    } catch (e) {
      console.error('Error saving current user:', e);
    }
  }, [currentUser]);

  const login = (email, password) => {
    const emailErr = validateEmail(email);
    if (emailErr) {
      throw new Error(emailErr);
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      throw new Error('Usuário não encontrado com este e-mail.');
    }

    if (user.password !== password) {
      throw new Error('Senha incorreta.');
    }

    setCurrentUser(user);
    return user;
  };

  const register = (nome, email, password, role) => {
    const emailErr = validateEmail(email);
    if (emailErr) throw new Error(emailErr);

    const passErr = validatePassword(password);
    if (passErr) throw new Error(passErr);

    const cleanEmail = email.trim().toLowerCase();
    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('Este e-mail já está cadastrado no sistema.');
    }

    let roleLabel = 'Administrativo';
    let badgeColor = '#059669';
    if (role === 'admin') {
      roleLabel = 'Administrador';
      badgeColor = '#7c3aed';
    } else if (role === 'armeiro') {
      roleLabel = 'Armeiro';
      badgeColor = '#2563eb';
    }

    const newUser = {
      id: `usr-${Date.now()}`,
      nome: nome.trim(),
      email: cleanEmail,
      password,
      role,
      roleLabel,
      badgeColor
    };

    setUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    return newUser;
  };

  const switchUser = (userIdOrRole) => {
    const user = users.find(u => u.id === userIdOrRole || u.role === userIdOrRole);
    if (user) {
      setCurrentUser(user);
    }
  };

  const logout = () => {
    setCurrentUser(null);
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
    // - Access ONLY 'servicos' and 'estoque' (cannot access 'cadastros')
    // - Can view and add in 'servicos' and 'estoque'
    // - Can ONLY edit records added in 'servicos'
    if (currentUser.role === 'armeiro') {
      if (section === 'cadastros') return false;

      if (action === 'view' || action === 'add') {
        return section === 'servicos' || section === 'estoque';
      }

      if (action === 'edit') {
        if (section !== 'servicos') return false;
        // In servicos section, armeiro can edit records created by them (or new records)
        if (!createdByEmail) return true; // allow editing if creator not set or current user
        return createdByEmail.toLowerCase() === currentUser.email.toLowerCase();
      }
    }

    // 4. Administrativo permissions:
    // - Access EVERYTHING (servicos, estoque, cadastros)
    // - Can view and add in ALL sections
    // - Can ONLY edit records added in 'estoque'
    if (currentUser.role === 'administrativo') {
      if (action === 'view' || action === 'add') {
        return true;
      }

      if (action === 'edit') {
        if (section !== 'estoque') return false;
        // In estoque section, administrativo can edit records created by them
        if (!createdByEmail) return true;
        return createdByEmail.toLowerCase() === currentUser.email.toLowerCase();
      }
    }

    return false;
  };

  const value = {
    currentUser,
    users,
    login,
    register,
    switchUser,
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
