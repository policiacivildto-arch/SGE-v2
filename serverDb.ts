import fs from "fs";
import path from "path";

const DB_FILE = path.join(process.cwd(), "db.json");

export interface BaseEntity {
  id: string;
  criado_em?: string;
  atualizado_em?: string;
}

export interface Departamento extends BaseEntity {
  nome: string;
  sigla: string;
  ativo: boolean;
}

export interface Delegacia extends BaseEntity {
  nome: string;
  codigo: string;
  cidade: string;
  departamento_id: string;
  ativo: boolean;
}

export interface Lotacao extends BaseEntity {
  depto: string;
  nome: string;
  cidade: string;
  resp: string;
  area_atuacao: string;
  ais: string;
  tel: string;
  end: string;
  seccional?: string;
}

export interface Policial extends BaseEntity {
  matricula: string;
  cpf: string;
  nome: string;
  cargo: string;
  depto: string;
  lotacao: string;
  tel: string;
  email: string;
  obs: string;
}

export interface Fornecedor extends BaseEntity {
  nome: string;
  cnpj: string;
  contato: string;
  tel: string;
  email: string;
  categoria: string;
  end: string;
  obs: string;
}

export interface Compra extends BaseEntity {
  fornecedor_id: string;
  categoria: string;
  tipo: string;
  calibre: string;
  comprimento_cano: string;
  quantidade_carregadores: number;
  capacidade: number;
  marca: string;
  modelo: string;
  nivel: string;
  tamanho: string;
  sexo: string;
  cargo: string;
  numero_nota_fiscal: string;
  numero_empenho: string;
  numero_tombo: string;
  serie: string;
  descricao: string;
  qtd_total: number;
  qtd_disp: number;
  qtd_min: number;
  status: string;
  dt_aq?: string;
  valor_compra?: number;
  dt_val?: string;
  obs: string;
}

export interface Item extends BaseEntity {
  patrimonio: string;
  descricao: string;
  categoria: string;
  tamanho: string;
  sexo: string;
  cargo: string;
  marca: string;
  serie: string;
  qtd_total: number;
  qtd_disp: number;
  qtd_min: number;
  fornecedor_id: string;
  dt_aq?: string;
  dt_val?: string;
  valor_compra?: number;
  status: string;
  obs: string;
}

export interface BemIndividual extends BaseEntity {
  item_id: string;
  patrimonio: string;
  serie: string;
  status: string;
  tamanho: string;
  sexo: string;
  dt_val: string;
  obs: string;
}

export interface Arma extends BaseEntity {
  item_id: string;
  patrimonio_id: string;
  tipo: string;
  marca: string;
  modelo: string;
  calibre: string;
  comprimento_cano: string;
  quantidade_carregadores: number;
  capacidade: number;
  numero_serie: string;
}

export interface Patrimonio extends BaseEntity {
  codigo: string;
  descricao: string;
  categoria: string;
  departamento_id: string;
  delegacia_id: string;
  ativo: boolean;
}

export interface Servico extends BaseEntity {
  codigo: string;
  policial_id?: string;
  matricula: string;
  policial_nome: string;
  depto: string;
  lotacao: string;
  tipo: string;
  data_rec: string;
  status: string;
  serie: string;
  obs: string;
}

export interface Cautela extends BaseEntity {
  numero: string;
  data_saida: string;
  data_prev?: string;
  data_dev?: string;
  policial_id?: string;
  matricula: string;
  policial_nome: string;
  depto: string;
  lotacao: string;
  item_id: string;
  item_desc: string;
  qtd: number;
  status: string;
  condicao_dev?: string;
  motivo_recolhimento?: string;
  nup?: string;
  numero_io_bo?: string;
  numero_serie_reparo?: string;
  obs_dev?: string;
  serie?: string;
  assinatura_digital?: string;
  assinatura_dev?: string;
}

export interface Movimento extends BaseEntity {
  item_id: string;
  arma_id?: string;
  patrimonio_id?: string;
  departamento_id?: string;
  delegacia_id?: string;
  usuario_id?: string;
  tipo: string;
  quantidade: number;
  status: string;
  data: string;
}

export interface OpcaoMenu extends BaseEntity {
  grupo: string;
  valor: string;
  rotulo: string;
  ordem: number;
  ativo: boolean;
}

export interface Usuario extends BaseEntity {
  username: string;
  nome: string;
  cargo: string;
  policial_id?: string;
  departamento_id?: string;
  delegacia_id?: string;
  ativo: boolean;
}

interface DatabaseSchema {
  departamentos: Departamento[];
  delegacias: Delegacia[];
  usuarios: Usuario[];
  lotacoes: Lotacao[];
  policiais: Policial[];
  fornecedores: Fornecedor[];
  compras: Compra[];
  itens: Item[];
  bens: BemIndividual[];
  armas: Arma[];
  patrimonios: Patrimonio[];
  servicos: Servico[];
  cautelas: Cautela[];
  movimentos: Movimento[];
  "opcoes-menu": OpcaoMenu[];
}

const initialDb: DatabaseSchema = {
  departamentos: [],
  delegacias: [],
  usuarios: [],
  lotacoes: [],
  policiais: [],
  fornecedores: [],
  compras: [],
  itens: [],
  bens: [],
  armas: [],
  patrimonios: [],
  servicos: [],
  cautelas: [],
  movimentos: [],
  "opcoes-menu": [],
};

class ServerDb {
  private data: DatabaseSchema = { ...initialDb };

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, "utf-8");
        this.data = JSON.parse(fileContent);
        
        // Ensure bens array is initialized
        if (!this.data.bens) {
          this.data.bens = [];
        }

        // Deduplicate any non-unique IDs across all collections
        let hasDuplicates = false;
        const keys = Object.keys(this.data) as (keyof DatabaseSchema)[];
        keys.forEach(collectionKey => {
          const list = this.data[collectionKey] as any[];
          if (Array.isArray(list)) {
            const seenIds = new Set<string>();
            list.forEach((item, index) => {
              if (!item.id || seenIds.has(item.id)) {
                const prefix = collectionKey.substring(0, 3);
                let newId = "";
                let count = 0;
                do {
                  newId = `${prefix}-${Date.now() + index}${count > 0 ? `-${count}` : ""}`;
                  count++;
                } while (seenIds.has(newId) || list.some(i => i.id === newId));
                
                item.id = newId;
                hasDuplicates = true;
              }
              seenIds.add(item.id);
            });
          }
        });
        if (hasDuplicates) {
          console.log("Detectados e corrigidos IDs duplicados no banco de dados.");
          this.save();
        }

        // Migrate existing items to individual assets (bens) if bens is empty
        if (this.data.bens.length === 0 && this.data.itens && this.data.itens.length > 0) {
          console.log("Migrando itens existentes para bens individuais...");
          this.data.itens.forEach(item => {
            const cat = String(item.categoria || "").toLowerCase();
            const isMun = cat.includes("muniç") || cat.includes("munic");
            if (isMun) {
              return; // Skip ammunition from individual bens generation
            }
            const qty = Number(item.qtd_total || 1);
            const disp = Number(item.qtd_disp || 0);
            for (let i = 1; i <= qty; i++) {
              const status = i <= disp ? "Disponivel" : "Em Uso";
              const patrimonioNum = item.patrimonio ? `${item.patrimonio}-${String(i).padStart(3, "0")}` : `TOM-${item.id.replace(/\D/g, "") || "0"}-${String(i).padStart(3, "0")}`;
              const serieNum = item.serie ? `${item.serie}-${String(i).padStart(3, "0")}` : `SER-${item.id.replace(/\D/g, "") || "0"}-${String(i).padStart(3, "0")}`;
              this.data.bens.push({
                id: `bem-${item.id}-${i}-${Date.now()}`,
                item_id: item.id,
                patrimonio: patrimonioNum,
                serie: item.serie ? serieNum : "",
                status: status,
                tamanho: item.tamanho || "",
                sexo: item.sexo || "",
                dt_val: item.dt_val || "",
                obs: `Gerado na migração do item: ${item.descricao}`,
                criado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString()
              });
            }
          });
          this.save();
        }

        // Self-healing: Ensure all individual assets (bens) that are in an active cautela are marked as "Em Uso"
        if (this.data.cautelas && this.data.bens) {
          const activeCautelaSerials = new Set(
            this.data.cautelas
              .filter(c => c.status === "Ativa" && c.serie)
              .map(c => String(c.serie).trim().toUpperCase())
          );
          let updatedAny = false;
          this.data.bens.forEach(b => {
            const bemSerie = String(b.serie || '').trim().toUpperCase();
            if (bemSerie && activeCautelaSerials.has(bemSerie)) {
              if (b.status !== "Em Uso") {
                b.status = "Em Uso";
                b.atualizado_em = new Date().toISOString();
                updatedAny = true;
              }
            } else if (b.status === "Em Uso") {
              const hasActiveCautela = this.data.cautelas.some(c => c.status === "Ativa" && String(c.serie || '').trim().toUpperCase() === bemSerie);
              const hasActiveServico = this.data.servicos ? this.data.servicos.some(s => s.status === "Aberto" && String(s.serie || '').trim().toUpperCase() === bemSerie) : false;
              if (!hasActiveCautela && !hasActiveServico) {
                b.status = "Disponivel";
                b.atualizado_em = new Date().toISOString();
                updatedAny = true;
              }
            }
          });
          if (updatedAny) {
            console.log("Self-healing: Sincronizados status dos bens individuais com as cautelas ativas.");
            this.save();
          }
        }

        // Self-healing: Ensure items available quantities (qtd_disp) are correct
        if (this.data.itens && this.data.cautelas) {
          let updatedItens = false;
          this.data.itens.forEach(item => {
            const activeForThisItem = this.data.cautelas.filter(c => c.item_id === item.id && c.status === "Ativa");
            const totalCautelado = activeForThisItem.reduce((acc, c) => acc + (Number(c.qtd) || 1), 0);
            const correctQtdDisp = Math.max(0, Number(item.qtd_total || 0) - totalCautelado);
            if (Number(item.qtd_disp) !== correctQtdDisp) {
              item.qtd_disp = correctQtdDisp;
              item.atualizado_em = new Date().toISOString();
              updatedItens = true;
            }
            const correctStatus = correctQtdDisp === 0 ? "Em Uso" : "Disponivel";
            if (item.status === "Disponivel" && correctQtdDisp === 0) {
              item.status = "Em Uso";
              updatedItens = true;
            } else if (item.status === "Em Uso" && correctQtdDisp > 0) {
              item.status = "Disponivel";
              updatedItens = true;
            }
          });
          if (updatedItens) {
            console.log("Self-healing: Sincronizadas as quantidades disponíveis dos itens.");
            this.save();
          }
        }
      } else {
        this.seed();
        this.save();
      }
    } catch (e) {
      console.error("Erro ao carregar o banco de dados, inicializando vazio", e);
      this.data = { ...initialDb };
    }
  }

  public save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("Erro ao salvar o banco de dados", e);
    }
  }

  private seed() {
    console.log("Semeando banco de dados com dados iniciais...");
    
    // 1. Departamentos
    const deptos = [
      { id: "dep-1", nome: "Departamento Tecnico Operacional", sigla: "DTO", ativo: true },
      { id: "dep-2", nome: "Coordenadoria de Operacoes e Recursos Especiais", sigla: "CORE", ativo: true },
      { id: "dep-3", nome: "Departamento de Inteligencia Policial", sigla: "DIP", ativo: true },
      { id: "dep-4", nome: "Coordenadoria de Logistica", sigla: "COLOG", ativo: true },
      { id: "dep-5", nome: "Departamento de Homicidios e Protecao a Pessoa", sigla: "DHPP", ativo: true },
    ];
    this.data.departamentos = deptos.map(d => ({
      ...d,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 2. Delegacias
    const delegacias = [
      { id: "del-1", nome: "1ª Delegacia Metropolitana", codigo: "1DM", cidade: "Aracaju", departamento_id: "dep-1", ativo: true },
      { id: "del-2", nome: "2ª Delegacia Metropolitana", codigo: "2DM", cidade: "Aracaju", departamento_id: "dep-1", ativo: true },
      { id: "del-3", nome: "Divisão de Roubos e Furtos", codigo: "DRF", cidade: "Aracaju", departamento_id: "dep-5", ativo: true },
    ];
    this.data.delegacias = delegacias.map(d => ({
      ...d,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 3. Fornecedores
    const fornecedores = [
      { id: "for-1", nome: "Taurus Armas S.A.", cnpj: "92.781.335/0001-02", contato: "Vendas Governamentais", tel: "(51) 3021-3000", email: "gov@taurus.com.br", categoria: "Armas", end: "Av. Industrial, 1000 - São Leopoldo/RS", obs: "Principal fornecedor de pistolas e fuzis" },
      { id: "for-2", nome: "CBC - Companhia Brasileira de Cartuchos", cnpj: "61.074.506/0001-12", contato: "Vendas Militares", tel: "(11) 2139-8200", email: "mil@cbc.com.br", categoria: "Munições", end: "Av. Humberto de Alencar, 3210 - São Bernardo/SP", obs: "Fornecedor de munições oficiais" },
      { id: "for-3", nome: "Glock América Latina", cnpj: "07.221.849/0001-81", contato: "Suporte Governos", tel: "(11) 3500-1900", email: "sales@glock.com.br", categoria: "Armas", end: "Av. Nações Unidas, 12901 - São Paulo/SP", obs: "Pistolas de alta performance" },
    ];
    this.data.fornecedores = fornecedores.map(f => ({
      ...f,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 4. Policiais
    const policiais = [
      { id: "pol-1", matricula: "100201", cpf: "111.222.333-44", nome: "Carlos Henrique Silva", cargo: "Delegado de Policia", depto: "Departamento Tecnico Operacional", lotacao: "1ª Delegacia Metropolitana", tel: "(79) 98888-1111", email: "carlos.henrique@pc.se.gov.br", obs: "Diretor da unidade" },
      { id: "pol-2", matricula: "100202", cpf: "222.333.444-55", nome: "Fernanda Oliveira Lima", cargo: "Oficial Investigadora", depto: "Departamento Tecnico Operacional", lotacao: "1ª Delegacia Metropolitana", tel: "(79) 98888-2222", email: "fernanda.oliveira@pc.se.gov.br", obs: "Setor de Cautelas" },
      { id: "pol-3", matricula: "100203", cpf: "333.444.555-66", nome: "Marcos Antonio Souza", cargo: "Oficial Investigador", depto: "Coordenadoria de Operacoes e Recursos Especiais", lotacao: "Divisão de Roubos e Furtos", tel: "(79) 98888-3333", email: "marcos.souza@pc.se.gov.br", obs: "Agente operacional" },
    ];
    this.data.policiais = policiais.map(p => ({
      ...p,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 5. Itens
    const itens = [
      { id: "item-1", patrimonio: "PAT-0001", descricao: "Pistola Taurus TS9 Calibre 9mm", categoria: "Armas", tamanho: "", sexo: "", cargo: "", marca: "Taurus", serie: "TSS12345", qtd_total: 5, qtd_disp: 4, qtd_min: 2, fornecedor_id: "for-1", dt_aq: "2024-01-15", dt_val: "2034-01-15", valor_compra: 3800.00, status: "Disponivel", obs: "Lote de pistolas TS9 novas" },
      { id: "item-2", patrimonio: "PAT-0002", descricao: "Fuzil Taurus T4 Calibre 5.56", categoria: "Armas", tamanho: "", sexo: "", cargo: "", marca: "Taurus", serie: "T4S54321", qtd_total: 3, qtd_disp: 2, qtd_min: 1, fornecedor_id: "for-1", dt_aq: "2024-02-10", dt_val: "2034-02-10", valor_compra: 9500.00, status: "Disponivel", obs: "Fuzil tático" },
      { id: "item-3", patrimonio: "PAT-0003", descricao: "Colete Balístico Kevlar IIIA", categoria: "Coletes", tamanho: "G", sexo: "Masculino", cargo: "", marca: "Kevlar", serie: "COL99887", qtd_total: 10, qtd_disp: 10, qtd_min: 5, fornecedor_id: "for-2", dt_aq: "2025-05-20", dt_val: "2030-05-20", valor_compra: 1200.00, status: "Disponivel", obs: "Colete balístico leve" },
      { id: "item-4", patrimonio: "PAT-0004", descricao: "Camiseta Oficial PC Escura", categoria: "Uniformes", tamanho: "M", sexo: "Unissex", cargo: "Oficial Investigador", marca: "Polícia", serie: "", qtd_total: 20, qtd_disp: 20, qtd_min: 5, fornecedor_id: "for-2", dt_aq: "2025-01-10", dt_val: "", valor_compra: 45.00, status: "Disponivel", obs: "Camiseta preta oficial" },
      { id: "item-5", patrimonio: "PAT-0005", descricao: "Munição Real 9mm CBC Ogival", categoria: "Munições", tamanho: "", sexo: "", cargo: "", marca: "CBC", serie: "", qtd_total: 500, qtd_disp: 500, qtd_min: 100, fornecedor_id: "for-2", dt_aq: "2025-06-01", dt_val: "2035-06-01", valor_compra: 5.00, status: "Disponivel", obs: "Munições de 9mm para pistola" },
      { id: "item-6", patrimonio: "PAT-0006", descricao: "Distintivo Policial Delegado", categoria: "Equipamentos", tamanho: "", sexo: "", cargo: "", marca: "N/I", serie: "DIS001", qtd_total: 50, qtd_disp: 50, qtd_min: 10, fornecedor_id: "for-2", dt_aq: "2025-07-01", dt_val: "", valor_compra: 150.00, status: "Disponivel", tipo: "Distintivo", modelo: "Delegado", obs: "Distintivo metálico oficial de Delegado" },
    ];
    this.data.itens = itens.map(i => ({
      ...i,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 6. Armas (detalhe)
    const armas = [
      { id: "arm-1", item_id: "item-1", patrimonio_id: "PAT-0001", tipo: "Pistola", marca: "Taurus", modelo: "TS9", calibre: "9mm", comprimento_cano: "4 polegadas", quantidade_carregadores: 3, capacidade: 17, numero_serie: "TSS12345" },
      { id: "arm-2", item_id: "item-2", patrimonio_id: "PAT-0002", tipo: "Fuzil", marca: "Taurus", modelo: "T4", calibre: "5.56", comprimento_cano: "14.5 polegadas", quantidade_carregadores: 4, capacidade: 30, numero_serie: "T4S54321" },
    ];
    this.data.armas = armas.map(a => ({
      ...a,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 7. Opcoes Menu
    const opcoesMenu: Omit<OpcaoMenu, "id">[] = [];
    
    // departamento options
    deptos.forEach((d, index) => {
      opcoesMenu.push({ grupo: "departamento", valor: d.nome, rotulo: d.sigla || d.nome, ordem: index + 1, ativo: true });
    });
    
    // item_categoria options
    opcoesMenu.push(
      { grupo: "item_categoria", valor: "Armas", rotulo: "Armas", ordem: 1, ativo: true },
      { grupo: "item_categoria", valor: "Coletes", rotulo: "Coletes", ordem: 2, ativo: true },
      { grupo: "item_categoria", valor: "Equipamentos", rotulo: "Equipamentos", ordem: 3, ativo: true },
      { grupo: "item_categoria", valor: "Uniformes", rotulo: "Uniformes", ordem: 4, ativo: true },
      { grupo: "item_categoria", valor: "Munições", rotulo: "Munições", ordem: 5, ativo: true }
    );

    // item_tipo_armas options
    opcoesMenu.push(
      { grupo: "item_tipo_armas", valor: "Pistola", rotulo: "Pistola", ordem: 1, ativo: true },
      { grupo: "item_tipo_armas", valor: "Revólver", rotulo: "Revólver", ordem: 2, ativo: true },
      { grupo: "item_tipo_armas", valor: "Fuzil", rotulo: "Fuzil", ordem: 3, ativo: true },
      { grupo: "item_tipo_armas", valor: "Metralhadora", rotulo: "Metralhadora", ordem: 4, ativo: true }
    );

    // item_tipo_equipamentos options
    opcoesMenu.push(
      { grupo: "item_tipo_equipamentos", valor: "Colete", rotulo: "Colete Balístico", ordem: 1, ativo: true },
      { grupo: "item_tipo_equipamentos", valor: "Algema", rotulo: "Algema", ordem: 2, ativo: true },
      { grupo: "item_tipo_equipamentos", valor: "Lanterna", rotulo: "Lanterna", ordem: 3, ativo: true },
      { grupo: "item_tipo_equipamentos", valor: "Coldre", rotulo: "Coldre", ordem: 4, ativo: true },
      { grupo: "item_tipo_equipamentos", valor: "Distintivo", rotulo: "Distintivo", ordem: 5, ativo: true }
    );

    // item_tipo_uniformes options
    opcoesMenu.push(
      { grupo: "item_tipo_uniformes", valor: "Camiseta", rotulo: "Camiseta", ordem: 1, ativo: true },
      { grupo: "item_tipo_uniformes", valor: "Gandola", rotulo: "Gandola", ordem: 2, ativo: true },
      { grupo: "item_tipo_uniformes", valor: "Calça", rotulo: "Calça", ordem: 3, ativo: true },
      { grupo: "item_tipo_uniformes", valor: "Coturno", rotulo: "Coturno", ordem: 4, ativo: true }
    );

    // cargo_policial options
    opcoesMenu.push(
      { grupo: "cargo_policial", valor: "Delegado de Policia", rotulo: "Delegado de Polícia", ordem: 1, ativo: true },
      { grupo: "cargo_policial", valor: "Delegada de Policia", rotulo: "Delegada de Polícia", ordem: 2, ativo: true },
      { grupo: "cargo_policial", valor: "Oficial Investigador", rotulo: "Oficial Investigador", ordem: 3, ativo: true },
      { grupo: "cargo_policial", valor: "Oficial Investigadora", rotulo: "Oficial Investigadora", ordem: 4, ativo: true }
    );

    this.data["opcoes-menu"] = opcoesMenu.map((o, index) => ({
      ...o,
      id: `op-${index + 1}`,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 8. Lotacoes
    const lotacoes = [
      { id: "lot-1", depto: "Departamento Tecnico Operacional", nome: "1ª Delegacia Metropolitana", cidade: "Aracaju", resp: "Carlos Henrique Silva", area_atuacao: "Metropolitana", ais: "AIS-1", tel: "3213-1111", end: "Av. Beira Mar, s/n" },
      { id: "lot-2", depto: "Departamento Tecnico Operacional", nome: "2ª Delegacia Metropolitana", cidade: "Aracaju", resp: "Fernanda Oliveira Lima", area_atuacao: "Metropolitana", ais: "AIS-2", tel: "3213-2222", end: "Av. Hermes Fontes, s/n" },
      { id: "lot-3", depto: "Coordenadoria de Operacoes e Recursos Especiais", nome: "Divisão de Roubos e Furtos", cidade: "Aracaju", resp: "Marcos Antonio Souza", area_atuacao: "Especializada", ais: "AIS-5", tel: "3213-3333", end: "Rua do Acre, s/n" },
    ];
    this.data.lotacoes = lotacoes.map(l => ({
      ...l,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 9. Usuarios
    const usuarios = [
      { id: "usr-1", username: "admin", nome: "Diretor Geral", cargo: "Delegado de Policia", policial_id: "pol-1", departamento_id: "dep-1", delegacia_id: "del-1", ativo: true },
    ];
    this.data.usuarios = usuarios.map(u => ({
      ...u,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // 10. Cautelas
    const cautelas = [
      {
        id: "cau-1",
        numero: "CAU-2025-0001",
        data_saida: "2025-01-20",
        data_prev: "2026-01-20",
        policial_id: "pol-3",
        matricula: "100203",
        policial_nome: "Marcos Antonio Souza",
        depto: "Coordenadoria de Operacoes e Recursos Especiais",
        lotacao: "Divisão de Roubos e Furtos",
        item_id: "item-1",
        item_desc: "Pistola Taurus TS9 Calibre 9mm",
        qtd: 1,
        status: "Ativa",
        condicao_dev: "",
        obs_dev: ""
      },
      {
        id: "cau-2",
        numero: "CAU-2025-0002",
        data_saida: "2025-02-15",
        data_prev: "2026-02-15",
        policial_id: "pol-1",
        matricula: "100201",
        policial_nome: "Carlos Henrique Silva",
        depto: "Departamento Tecnico Operacional",
        lotacao: "1ª Delegacia Metropolitana",
        item_id: "item-2",
        item_desc: "Fuzil Taurus T4 Calibre 5.56",
        qtd: 1,
        status: "Ativa",
        condicao_dev: "",
        obs_dev: ""
      }
    ];
    this.data.cautelas = cautelas.map(c => ({
      ...c,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }));

    // Correção das quantidades disponíveis para os itens que estão em cautela ativa
    this.data.itens.forEach(item => {
      const ativas = this.data.cautelas.filter(c => c.item_id === item.id && c.status === "Ativa");
      const totalCautelado = ativas.reduce((acc, c) => acc + c.qtd, 0);
      item.qtd_disp = item.qtd_total - totalCautelado;
    });

    console.log("Banco de dados semeado com sucesso!");
  }

  // Generic Query, Search, Filter and Ordering helper
  public queryCollection<T>(
    collectionKey: keyof DatabaseSchema,
    searchQuery?: string,
    searchFields: string[] = [],
    ordering?: string,
    filters: Record<string, any> = {}
  ): T[] {
    let list = (this.data[collectionKey] || []) as any[];

    // 1. Direct Filter matching
    for (const [key, filterVal] of Object.entries(filters)) {
      if (filterVal !== undefined && filterVal !== "") {
        let expectedVal = filterVal;
        if (typeof filterVal === "string") {
          if (filterVal.toLowerCase() === "true") expectedVal = true;
          else if (filterVal.toLowerCase() === "false") expectedVal = false;
        }
        
        list = list.filter(item => {
          const itemVal = item[key];
          if (typeof expectedVal === "boolean" && typeof itemVal !== "boolean") {
            return String(itemVal).toLowerCase() === String(expectedVal);
          }
          if (typeof expectedVal === "string" && typeof itemVal === "string") {
            return itemVal.toLowerCase() === expectedVal.toLowerCase();
          }
          return itemVal === expectedVal;
        });
      }
    }

    // 2. Search query matching (case-insensitive substring in any searchFields)
    if (searchQuery && searchFields.length > 0) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => {
        return searchFields.some(field => {
          const val = item[field];
          if (val === undefined || val === null) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // 3. Ordering
    if (ordering) {
      const desc = ordering.startsWith("-");
      const field = desc ? ordering.substring(1) : ordering;
      list.sort((a, b) => {
        let valA = a[field];
        let valB = b[field];

        if (valA === undefined || valA === null) valA = "";
        if (valB === undefined || valB === null) valB = "";

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return desc ? 1 : -1;
        if (valA > valB) return desc ? -1 : 1;
        return 0;
      });
    }

    return list as T[];
  }

  public getById<T>(collectionKey: keyof DatabaseSchema, id: string): T | null {
    const item = (this.data[collectionKey] as any[]).find(i => i.id === id);
    return item ? (item as T) : null;
  }

  public create<T>(collectionKey: keyof DatabaseSchema, itemData: any): T {
    const prefix = collectionKey.substring(0, 3);
    const collection = this.data[collectionKey] as any[];
    let id = "";
    let count = 0;
    do {
      id = `${prefix}-${Date.now()}${count > 0 ? `-${count}` : ""}`;
      count++;
    } while (collection.some(i => i.id === id));

    const newItem = {
      ...itemData,
      id,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    (this.data[collectionKey] as any[]).push(newItem);
    this.save();
    return newItem as T;
  }

  public createMany<T>(collectionKey: keyof DatabaseSchema, itemsData: any[]): T[] {
    if (!itemsData || itemsData.length === 0) return [];
    const prefix = collectionKey.substring(0, 3);
    const collection = this.data[collectionKey] as any[];
    const nowStr = new Date().toISOString();
    const createdItems: T[] = [];
    const baseTime = Date.now();

    for (let idx = 0; idx < itemsData.length; idx++) {
      const itemData = itemsData[idx];
      const id = `${prefix}-${baseTime}-${idx}`;
      const newItem = {
        ...itemData,
        id,
        criado_em: nowStr,
        atualizado_em: nowStr
      };
      collection.push(newItem);
      createdItems.push(newItem as T);
    }
    this.save();
    return createdItems;
  }

  public update<T>(collectionKey: keyof DatabaseSchema, id: string, itemData: any): T | null {
    const list = this.data[collectionKey] as any[];
    const idx = list.findIndex(i => i.id === id);
    if (idx === -1) return null;

    const updatedItem = {
      ...list[idx],
      ...itemData,
      atualizado_em: new Date().toISOString()
    };
    list[idx] = updatedItem;
    this.save();
    return updatedItem as T;
  }

  public remove(collectionKey: keyof DatabaseSchema, id: string): boolean {
    const list = this.data[collectionKey] as any[];
    const idx = list.findIndex(i => i.id === id);
    if (idx === -1) return false;

    list.splice(idx, 1);
    this.save();
    return true;
  }

  // Specific Next Code generation logic
  public getNextCode(): string {
    const last = [...this.data.servicos].sort((a, b) => b.codigo.localeCompare(a.codigo))[0];
    let nextNum = 1;
    if (last && /^\d+$/.test(last.codigo)) {
      nextNum = parseInt(last.codigo) + 1;
    }
    return String(nextNum).padStart(4, "0");
  }

  // Specific Next Number generation logic for Cautelas
  public getNextCautelaNumber(): string {
    const year = new Date().getFullYear().toString();
    const prefix = `CAU-${year}-`;
    const inYear = this.data.cautelas.filter(c => c.numero.startsWith(prefix));
    
    let nextNum = 1;
    if (inYear.length > 0) {
      // Sort in descending order to get the highest suffix number
      inYear.sort((a, b) => b.numero.localeCompare(a.numero));
      const lastNum = inYear[0].numero;
      try {
        const parts = lastNum.split("-");
        const lastPart = parts[parts.length - 1];
        nextNum = parseInt(lastPart) + 1;
      } catch (e) {
        nextNum = inYear.length + 1;
      }
    }
    return `${prefix}${String(nextNum).padStart(4, "0")}`;
  }

  // devolver cautela logic
  public devolverCautela(
    cautelaId: string,
    dataDev: string,
    condicaoDev: string,
    statusItem: string,
    extra: {
      motivoRecolhimento?: string;
      nup?: string;
      numeroIoBo?: string;
      numeroSerieReparo?: string;
      obsDev?: string;
      assinaturaDev?: string;
      tokenDev?: string;
    }
  ): Cautela | null {
    const cautela = this.getById<Cautela>("cautelas", cautelaId);
    if (!cautela) return null;
    if (cautela.status !== "Ativa" && cautela.status !== "Pendente" && cautela.status !== "Pendente de Assinatura") return null;

    // 1. Update the Cautela fields
    const hasSignature = Boolean(extra.assinaturaDev && extra.assinaturaDev.trim());
    cautela.status = hasSignature ? "Devolvido" : "Pendente (Devolução)";
    cautela.assinatura_dev = extra.assinaturaDev || "";
    cautela.data_dev = dataDev;
    cautela.condicao_dev = condicaoDev;
    cautela.motivo_recolhimento = extra.motivoRecolhimento || "";
    cautela.nup = extra.nup || "";
    cautela.numero_io_bo = extra.numeroIoBo || "";
    cautela.numero_serie_reparo = extra.numeroSerieReparo || "";
    cautela.obs_dev = extra.obsDev || "";
    if (extra.tokenDev) {
      cautela.token_confirmacao_dev = extra.tokenDev;
    }
    this.update("cautelas", cautelaId, cautela);

    // 3. Update the specific bem status associated with the cautela's serie
    if ((cautela as any).serie) {
      const serialLower = String((cautela as any).serie || "").trim().toLowerCase();
      const bensList = this.data.bens.filter((b: any) => 
        String(b.serie || "").trim().toLowerCase() === serialLower ||
        String(b.patrimonio || "").trim().toLowerCase() === serialLower
      );
      if (bensList.length > 0) {
        const b = bensList[0];
        let finalBemStatus = "Disponivel";
        if (condicaoDev === "Em Reparo") finalBemStatus = "Em Reparo";
        else if (condicaoDev === "Recolhida") finalBemStatus = "Recolhida";
        else if (condicaoDev === "Apreendida") finalBemStatus = "Apreendida";
        else if (condicaoDev === "Furtada") finalBemStatus = "Furtada";
        else if (condicaoDev === "Roubada") finalBemStatus = "Roubada";
        else if (condicaoDev === "Perdida") finalBemStatus = "Perdida";
        else if (condicaoDev === "Destruida") finalBemStatus = "Destruida";
        else if (condicaoDev === "Inservivel") finalBemStatus = "Inservivel";
        else if (statusItem) finalBemStatus = statusItem;
        b.status = finalBemStatus;
        this.update("bens", b.id, b);
      }
    }

    // 2. Update Item stock quantity & status
    const item = this.getById<Item>("itens", cautela.item_id);
    if (item) {
      const itemBens = this.data.bens.filter((b: any) => b.item_id === item.id);
      if (itemBens.length > 0) {
        item.qtd_disp = itemBens.filter((b: any) => b.status === "Disponivel").length;
      } else {
        item.qtd_disp = Math.min(item.qtd_total, item.qtd_disp + cautela.qtd);
      }
      
      // Determine new item status based on condicaoDev
      let finalStatus = "Disponivel";
      if (condicaoDev === "Em Reparo") finalStatus = "Em Reparo";
      else if (condicaoDev === "Recolhida") finalStatus = "Recolhida";
      else if (condicaoDev === "Apreendida") finalStatus = "Apreendida";
      else if (condicaoDev === "Furtada") finalStatus = "Furtada";
      else if (condicaoDev === "Roubada") finalStatus = "Roubada";
      else if (condicaoDev === "Perdida") finalStatus = "Perdida";
      else if (condicaoDev === "Destruida") finalStatus = "Destruida";
      else if (condicaoDev === "Inservivel") finalStatus = "Inservivel";
      else if (statusItem) finalStatus = statusItem;

      // If there are other active cautelas for this item, keep it as "Em Uso" unless overridden
      const activeCautelas = this.data.cautelas.filter(c => c.item_id === item.id && c.status === "Ativa" && c.id !== cautelaId);
      if (activeCautelas.length > 0 && finalStatus === "Disponivel") {
        finalStatus = "Em Uso";
      }

      item.status = finalStatus;
      this.update("itens", item.id, item);
    }

    return cautela;
  }

  // Dashboard calculation logic
  public getDashboardEstoque(params: Record<string, any>) {
    const categoriaFiltro = params.categoria || "";
    const deptoFiltro = params.depto || "";
    const seccionalFiltro = params.seccional || "";
    const delegaciaFiltro = params.delegacia || "";
    const statusFiltro = params.status || "";
    const modeloFiltro = params.modelo || "";
    const tipoFiltro = params.tipo || "";

    const activeCautelas = this.data.cautelas.filter(c => c.status === "Ativa");
    let filteredCautelas = [...activeCautelas];

    if (categoriaFiltro) {
      filteredCautelas = filteredCautelas.filter(c => c.item_desc.toLowerCase().includes(categoriaFiltro.toLowerCase()));
    }
    if (deptoFiltro) {
      filteredCautelas = filteredCautelas.filter(c => c.depto.toLowerCase() === deptoFiltro.toLowerCase());
    }
    if (delegaciaFiltro) {
      filteredCautelas = filteredCautelas.filter(c => c.lotacao.toLowerCase() === delegaciaFiltro.toLowerCase());
    }

    // Filter items base
    let filteredItens = [...this.data.itens];

    if (categoriaFiltro) {
      filteredItens = filteredItens.filter(i => i.categoria.toLowerCase().includes(categoriaFiltro.toLowerCase()));
    }
    if (statusFiltro) {
      filteredItens = filteredItens.filter(i => i.status.toLowerCase() === statusFiltro.toLowerCase());
    }
    if (tipoFiltro) {
      filteredItens = filteredItens.filter(i => {
        const arma = this.data.armas.find(a => a.item_id === i.id);
        return arma?.tipo.toLowerCase() === tipoFiltro.toLowerCase();
      });
    }
    if (modeloFiltro) {
      filteredItens = filteredItens.filter(i => {
        const arma = this.data.armas.find(a => a.item_id === i.id);
        return arma?.modelo.toLowerCase() === modeloFiltro.toLowerCase();
      });
    }

    // Apply local filters (depto/delegacia)
    const isDtoFilter = !deptoFiltro && !delegaciaFiltro || 
      (deptoFiltro && (deptoFiltro.toLowerCase() === "dto" || deptoFiltro.toLowerCase().includes("tecnico operacional"))) &&
      (!delegaciaFiltro || delegaciaFiltro.toLowerCase() === "dto" || delegaciaFiltro.toLowerCase().includes("tecnico operacional"));

    if (deptoFiltro || delegaciaFiltro) {
      const itemsInCautelaAtLoc = filteredCautelas.map(c => c.item_id);
      if (isDtoFilter) {
        // Include items in local active cautelas + available items in DTO (which is the default store)
        const dtoDisponiveis = this.data.itens.filter(i => i.categoria.toLowerCase().includes("arma") && i.status === "Disponivel");
        filteredItens = filteredItens.filter(i => itemsInCautelaAtLoc.includes(i.id) || dtoDisponiveis.some(d => d.id === i.id));
      } else {
        filteredItens = filteredItens.filter(i => itemsInCautelaAtLoc.includes(i.id));
      }
    }

    // Statistics totals
    const totalQtd = filteredItens.reduce((acc, i) => acc + (i.qtd_total || 0), 0);
    const totalDisp = filteredItens.reduce((acc, i) => acc + (i.qtd_disp || 0), 0);

    // List of dynamic filter values
    const categoriasList = Array.from(new Set(this.data.itens.map(i => i.categoria))).sort();
    
    const locaisList = this.data.lotacoes.map(l => ({
      departamento: l.depto,
      delegacia: l.nome,
      seccional: l.cidade
    }));
    if (!locaisList.some(l => l.departamento === "DTO")) {
      locaisList.push({ departamento: "DTO", delegacia: "DTO", seccional: "DTO" });
    }

    const tiposList = Array.from(new Set(this.data.armas.map(a => a.tipo).filter(Boolean))).sort();
    const modelosList = Array.from(new Set(this.data.armas.map(a => a.modelo).filter(Boolean))).sort();

    // Grouping calculations (by_categoria, by_status, by_modelo)
    const byCategoryMap = new Map<string, number>();
    filteredItens.forEach(i => {
      byCategoryMap.set(i.categoria, (byCategoryMap.get(i.categoria) || 0) + i.qtd_total);
    });
    const by_categoria = Array.from(byCategoryMap.entries()).sort((a, b) => b[1] - a[1]);

    const byStatusMap = new Map<string, number>();
    filteredItens.forEach(i => {
      byStatusMap.set(i.status, (byStatusMap.get(i.status) || 0) + i.qtd_total);
    });
    const by_status = Array.from(byStatusMap.entries()).sort((a, b) => b[1] - a[1]);

    const byModeloMap = new Map<string, number>();
    filteredItens.forEach(i => {
      const arma = this.data.armas.find(a => a.item_id === i.id);
      if (arma && arma.modelo) {
        byModeloMap.set(arma.modelo, (byModeloMap.get(arma.modelo) || 0) + i.qtd_total);
      }
    });
    const by_modelo = Array.from(byModeloMap.entries()).sort((a, b) => b[1] - a[1]);

    // Expirations/validity checks
    const hoje = new Date();
    let qtdVencidos = 0;
    let qtdVence30 = 0;
    let qtdVence60 = 0;
    let qtdSemValidade = 0;
    const itensCriticos: any[] = [];
    const porAnoMap = new Map<number, number>();

    filteredItens.forEach(item => {
      const qty = item.qtd_disp !== undefined ? item.qtd_disp : item.qtd_total;
      if (!item.dt_val) {
        qtdSemValidade += qty;
        return;
      }

      const valDate = new Date(item.dt_val);
      const ano = valDate.getFullYear();
      porAnoMap.set(ano, (porAnoMap.get(ano) || 0) + qty);

      const msDiff = valDate.getTime() - hoje.getTime();
      const diasParaVencer = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
      let situacao = "Dentro da validade";

      if (diasParaVencer < 0) {
        situacao = "Vencido";
        qtdVencidos += qty;
      } else if (diasParaVencer <= 365) {
        situacao = "Vence em ate 1 ano";
        qtdVence30 += qty;
      } else if (diasParaVencer <= 730) {
        situacao = "Vence em ate 2 anos";
        qtdVence60 += qty;
      }

      if (diasParaVencer <= 730) {
        itensCriticos.push({
          id: item.id,
          descricao: item.descricao || "—",
          categoria: item.categoria || "Não informado",
          dt_val: item.dt_val,
          qtd_disp: qty,
          diasParaVencer,
          anosParaVencer: parseFloat((diasParaVencer / 365).toFixed(2)),
          situacao
        });
      }
    });

    itensCriticos.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
    const porAno = Array.from(porAnoMap.entries())
      .map(([ano, qty]) => ({ ano, quantidade: qty }))
      .sort((a, b) => b.ano - a.ano);

    // weapons by location logic
    const armas_por_local: any[] = [];
    const activeArmasCautelas = filteredCautelas.filter(c => {
      const item = this.getById<Item>("itens", c.item_id);
      return item?.categoria.toLowerCase().includes("arma");
    });

    activeArmasCautelas.forEach(c => {
      const item = this.getById<Item>("itens", c.item_id);
      const arma = this.data.armas.find(a => a.item_id === c.item_id);
      armas_por_local.push({
        id: c.id,
        tipo: arma?.tipo || "Armas",
        modelo: arma?.modelo || "Não informado",
        serie: item?.serie || "Não informado",
        status: item?.status || "Em Uso",
        departamento: c.depto || "Não informado",
        lotacao: c.lotacao || "Não informado"
      });
    });

    const incluirDisponiveis = !statusFiltro || statusFiltro.toLowerCase() === "disponivel";
    if (incluirDisponiveis && isDtoFilter) {
      const armasDisp = this.data.itens.filter(i => i.categoria.toLowerCase().includes("arma") && i.status === "Disponivel");
      armasDisp.forEach(item => {
        const arma = this.data.armas.find(a => a.item_id === item.id);
        armas_por_local.push({
          id: `disp-${item.id}`,
          tipo: arma?.tipo || "Armas",
          modelo: arma?.modelo || "Não informado",
          serie: arma?.numero_serie || item.serie || "Não informado",
          status: item.status || "Disponivel",
          departamento: "DTO",
          lotacao: "DTO"
        });
      });
    }

    armas_por_local.sort((a, b) => {
      const deptoComp = a.departamento.localeCompare(b.departamento);
      if (deptoComp !== 0) return deptoComp;
      const lotComp = a.lotacao.localeCompare(b.lotacao);
      if (lotComp !== 0) return lotComp;
      return a.modelo.localeCompare(b.modelo);
    });

    return {
      categorias: categoriasList,
      locais: locaisList,
      tipos: tiposList,
      modelos: modelosList,
      stats: {
        total: totalQtd,
        disp: totalDisp,
        registros_itens: filteredItens.length,
        ativas: filteredCautelas.length,
        registros_cautelas: this.data.cautelas.length
      },
      by_categoria,
      by_status,
      by_modelo,
      validade: {
        qtdVencidos,
        qtdVence30,
        qtdVence60,
        qtdSemValidade,
        itensCriticos,
        porAno
      },
      armas_por_local
    };
  }
}

export const serverDb = new ServerDb();
