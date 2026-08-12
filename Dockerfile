FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Variável não sensível necessária em build-time: o Vite embute isso no
# bundle do frontend. Vem do .env local via scripts/export-build-args.sh
# (o docker compose também lê .env nativamente para preencher este ARG).
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

RUN chmod +x scripts/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["scripts/entrypoint.sh"]
CMD ["npm", "start"]
