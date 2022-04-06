FROM node:16-alpine
WORKDIR /backend
COPY src/ ./src
COPY package.json package-lock.json newrelic.js ./
RUN mkdir file \
  && mkdir file/static \
  && npm ci --production

ENTRYPOINT ["node", "src/index.js"]
