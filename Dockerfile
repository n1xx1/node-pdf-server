FROM node:18-alpine AS base
RUN npm i -g pnpm
WORKDIR /app

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

FROM base AS build
COPY . .
COPY --from=dependencies /app/node_modules ./node_modules
RUN pnpm run build

FROM base AS final
RUN apk update && apk add --no-cache nmap && \
    echo @edge http://nl.alpinelinux.org/alpine/edge/community >> /etc/apk/repositories && \
    echo @edge http://nl.alpinelinux.org/alpine/edge/main >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache chromium harfbuzz "freetype>2.8" ttf-freefont nss

ENV CHROME_BIN="/usr/bin/chromium-browser"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000

ENV PORT 3000

CMD ["node", "dist/main.js"]
