# 📱 Guia de Compilação e Geração do Aplicativo Móvel (Android & iOS)

Este documento instrui como transformar o projeto web SGA (React + Vite) em um aplicativo nativo instalado para dispositivos móveis **Android** e **iOS** usando o **Capacitor** (plataforma oficial mantida pela Ionic).

---

## 🛠️ Pré-requisitos
- Node.js instalado (v18+)
- Para Android: **Android Studio** instalado (com Android SDK e Gradle)
- Para iOS: Computador com **macOS** + **Xcode** (14+) instalado

---

## 1. 🚀 Adicionar e Configurar o Capacitor no Projeto

Na raiz do projeto Web, execute os seguintes comandos no terminal:

```bash
# 1. Instalar as dependências do Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios

# 2. Inicializar a configuração do aplicativo
npx cap init "SGA Armaria" "br.gov.se.pc.sga" --web-dir dist
```

---

## 2. 🤖 Geração do Aplicativo Android (.APK / .AAB)

### Passo A: Gerar a build Web otimizada
```bash
npm run build
```

### Passo B: Adicionar a plataforma Android e sincronizar os arquivos
```bash
npx cap add android
npx cap sync
```

### Passo C: Abrir no Android Studio para Gerar o APK
```bash
npx cap open android
```

1. No **Android Studio**, aguarde a indexação do Gradle.
2. No menu superior, vá em **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
3. O APK gerado estará em: `android/app/build/outputs/apk/debug/app-debug.apk`.
4. Transfira o arquivo `.apk` para o seu smartphone Android e instale diretamente.

---

## 3. 🍎 Geração do Aplicativo iOS (iPhone / iPad)

### Passo A: Gerar a build Web
```bash
npm run build
```

### Passo B: Adicionar a plataforma iOS
```bash
npx cap add ios
npx cap sync
```

### Passo C: Abrir no Xcode (Somente no macOS)
```bash
npx cap open ios
```

1. No **Xcode**, selecione seu **Development Team** na aba *Signing & Capabilities*.
2. Selecione o dispositivo de destino ou simulador.
3. Clique no botão **Play / Run** para testar no iPhone ou navegue até **Product > Archive** para compilar para a App Store ou TestFlight.

---

## 🔄 Atualizando o Aplicativo após alterações no código React

Sempre que fizer alterações na interface do sistema:

```bash
npm run build
npx cap copy
```
Em seguida, recompile o aplicativo no Android Studio ou Xcode.
