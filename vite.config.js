import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Permite que a rede acesse
    port: 5173,      // Porta padrão do Vite
  }
})