FROM mysql:8.0

RUN mkdir -p /var/log/mysql && touch /var/log/mysql/slow.log \
		&& chmod 777 /var/log/mysql/slow.log
COPY ./custom.conf /etc/mysql/conf.d/mysql.cnf

CMD ["mysqld"]