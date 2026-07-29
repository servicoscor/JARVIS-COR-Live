import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/sirenes': {
        target: 'http://websirene.rio.rj.gov.br',
        changeOrigin: true,
        rewrite: () => '/xml/sirenes.xml',
      },
      '/api/estagio-cidade': {
        target: 'https://appcor.cor-rio.work',
        changeOrigin: true,
        rewrite: () => '/estagio_cidade',
      },
      '/api/calor': {
        target: 'https://appcor.cor-rio.work',
        changeOrigin: true,
        rewrite: () => '/calor_api',
      },
      '/api/pluviometricos': {
        target: 'https://websempre.rio.rj.gov.br',
        changeOrigin: true,
        rewrite: () => '/json/dados_pluviometricos',
      },
      '/api/previsao-estendida': {
        target: 'https://www.sistema-alerta-rio.com.br',
        changeOrigin: true,
        rewrite: () => '/upload/xml/PrevisaoEstendida.xml',
      },
      '/api/previsao-agora': {
        target: 'https://www.sistema-alerta-rio.com.br',
        changeOrigin: true,
        rewrite: () => '/upload/xml/PrevisaoNew.xml',
      },
      '/api/waze-tvt': {
        target: 'https://www.waze.com',
        changeOrigin: true,
        rewrite: () => '/row-partnerhub-api/feeds-tvt/?id=18577882871',
      },
    },
  },
});
