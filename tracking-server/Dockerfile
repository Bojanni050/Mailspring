FROM node:22-alpine
WORKDIR /app
COPY server.cjs ./
ENV PORT=5199 BIND=0.0.0.0 DATA_FILE=/data/tracking-data.json
RUN mkdir -p /data && adduser -D -u 1001 tracking && chown tracking /data
USER tracking
VOLUME /data
EXPOSE 5199
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:5199/health || exit 1
CMD ["node", "server.cjs"]
