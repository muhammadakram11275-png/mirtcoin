FROM node:20-alpine
WORKDIR /app
COPY server.js engine.js seeds.json checkpoints.json package.json ./
COPY site ./site
ENV PORT=8332 MIRT_DATA=/data/chain.json
VOLUME /data
EXPOSE 8332
CMD ["node","server.js"]
