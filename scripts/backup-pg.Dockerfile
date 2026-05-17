FROM postgres:16-alpine
RUN apk add --no-cache bash
COPY backup-pg.sh /usr/local/bin/backup-pg.sh
RUN chmod +x /usr/local/bin/backup-pg.sh
CMD ["sh", "-c", "while true; do backup-pg.sh; sleep ${BACKUP_INTERVAL_SECONDS:-86400}; done"]
