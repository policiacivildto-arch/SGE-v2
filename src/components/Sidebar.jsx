// src/components/Sidebar.jsx
import React from 'react';
import { useAuth } from '../context/AuthContext';

/* eslint-disable react/prop-types */

function Sidebar({ onNavigate, activePage }) {
  const { currentUser, can } = useAuth();

  const allSidebarItems = [
    { id: 'pg-novo-servico', icon: '➕', label: 'Novo Serviço', section: 'Serviços de Armas', secKey: 'servicos' },
    { id: 'pg-dash-servicos', icon: '📊', label: 'Dashboard Serviços', secKey: 'servicos' },
    { id: 'pg-relatorios-servicos', icon: '📑', label: 'Registro de Serviços', secKey: 'servicos' },
    { id: 'divider1', type: 'divider', secKey: 'servicos' },
    { id: 'pg-dash-estoque', icon: '📈', label: 'Dashboard Estoque', section: 'Estoque & Distribuição', secKey: 'estoque' },
    { id: 'pg-cad-itens', icon: '📦', label: 'Inventário', secKey: 'estoque' },
    { id: 'pg-cautelas', icon: '📜', label: 'Cautelas', secKey: 'estoque' },
    { id: 'pg-relatorios', icon: '📑', label: 'Relatórios', secKey: 'estoque' },
    { id: 'divider2', type: 'divider', secKey: 'estoque' },
    { id: 'pg-cad-policiais', icon: '👮', label: 'Policiais', section: 'Cadastros', secKey: 'cadastros' },
    { id: 'pg-cad-lotacao', icon: '🏢', label: 'Unidades', secKey: 'cadastros' },
    { id: 'pg-item-compra', icon: '🛍️', label: 'Item', secKey: 'cadastros' },
    { id: 'pg-cad-fornecedor', icon: '🏭', label: 'Fornecedor', secKey: 'cadastros' },
    { id: 'pg-cad-menus', icon: '🧩', label: 'Menus Suspensos', secKey: 'cadastros' },
  ];

  // Filter items based on user permissions
  const sidebarItems = allSidebarItems.filter(item => {
    if (item.type === 'divider') return true;
    return can('view', item.secKey);
  });

  let lastSection = null;

  return (
    <nav className="sidebar">
      {sidebarItems.map((item, index) => {
        if (item.type === 'divider') {
          // Hide divider if the next item is not visible or if it's the last item
          const nextItem = sidebarItems[index + 1];
          if (!nextItem || nextItem.type === 'divider') return null;
          lastSection = null; // Reset section after a divider
          return <hr key={item.id} className="sidebar-divider" />;
        }

        const sectionHeader = item.section && item.section !== lastSection;
        if (sectionHeader) {
          lastSection = item.section;
        }

        return (
          <React.Fragment key={item.id}>
            {sectionHeader && <div className="sidebar-section">{item.section}</div>}
            <button
              type="button"
              className={`sidebar-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="icon">{item.icon}</span> {item.label}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default Sidebar;

