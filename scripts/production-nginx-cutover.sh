#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo 'This cutover helper must run as root.' >&2
  exit 1
fi

for certificate_domain in api.runich-app.ru runich-app.ru; do
  certificate="/etc/letsencrypt/live/$certificate_domain/fullchain.pem"
  if [ ! -s "$certificate" ]; then
    echo "Required Production certificate is missing: $certificate" >&2
    exit 1
  fi
done

install -d -m 0755 /var/www/certbot

# The Docker Nginx and Certbot services take over these ports and certificate
# renewals. Keep the old services disabled after the one-way Production move.
systemctl disable --now nginx.service
for timer in certbot.timer snap.certbot.renew.timer; do
  if systemctl cat "$timer" >/dev/null 2>&1; then
    systemctl disable --now "$timer"
  fi
done

echo 'Host Nginx and host Certbot timers are disabled for the Docker ingress.'
