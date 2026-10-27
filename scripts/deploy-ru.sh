#!/bin/bash
# Выкладка визитки на российский сервер (tadacard.ru) — только если проверки прошли.
# Запуск: cd "Card/Код" && bash scripts/deploy-ru.sh
#
# Каждая выкладка — отдельная папка releases/<время>; ссылка current
# переключается одним шагом, поэтому гость никогда не видит полсборки.
# Откат: bash scripts/deploy-ru.sh --rollback (вернёт предыдущую папку).
# Хранятся 5 последних выкладок, сборка весит около 4 МБ.
set -euo pipefail
cd "$(dirname "$0")/.."

# С 20.10.2026 tadacard.ru смотрит на сервер AdminVPS; старый Рег.облака
# (195.19.199.115) больше не обслуживает сайт.
SERVER="kostyukadmin@168.113.170.119"
# ServerAlive: без него оборванная связь (VPN на Mac) вешала выкладку навсегда.
SSH=(ssh -i ~/.ssh/kostyuk_vps_ed25519 -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 "$SERVER")
BASE=/var/www/tadacard

if [ "${1:-}" = "--rollback" ]; then
  "${SSH[@]}" "set -e; cd $BASE/releases
    cur=\$(basename \"\$(readlink -f $BASE/current)\")
    prev=\$(ls -1 | sort | grep -B1 -x \"\$cur\" | head -1)
    [ -n \"\$prev\" ] && [ \"\$prev\" != \"\$cur\" ] || { echo 'СТОП: более ранней выкладки нет'; exit 1; }
    ln -sfn $BASE/releases/\$prev $BASE/current.tmp && mv -T $BASE/current.tmp $BASE/current
    echo \"Откат: \$cur → \$prev\""
  exit 0
fi

echo "1/3 Тесты и сборка…"
npm run check >/dev/null || { echo "СТОП: проверки не прошли — выкладку не делаю"; exit 1; }
[ -f dist/index.html ] && [ -f dist/sw.js ] || { echo "СТОП: сборка неполная — выкладку не делаю"; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
echo "2/3 Загружаю сборку ${STAMP}…"
COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C dist . |"${SSH[@]}" "set -e; mkdir -p $BASE/releases/$STAMP && tar xzf - -C $BASE/releases/$STAMP
  test -f $BASE/releases/$STAMP/index.html
  if [ -d $BASE/current/assets ]; then
    cp -n $BASE/current/assets/* $BASE/releases/$STAMP/assets/ 2>/dev/null || true
  fi"

echo "3/3 Переключаю…"
"${SSH[@]}" "set -e; ln -sfn $BASE/releases/$STAMP $BASE/current.tmp && mv -T $BASE/current.tmp $BASE/current
  cd $BASE/releases && ls -1 | sort | head -n -5 | xargs -r rm -rf"

# Обновляем Nginx сниппеты (tadacard-headers.conf, tadacard-locations.conf),
# если изменились. Старый файл сохраняем: не прошёл nginx -t — возвращаем
# его, чтобы сломанный конфиг не остался лежать до следующей перезагрузки.
sync_snippet() {
  local name="$1"
  [ -f "deploy/nginx/$name" ] || return 0
  cat "deploy/nginx/$name" | "${SSH[@]}" "set -e
    F=/etc/nginx/snippets/$name
    cat > /tmp/$name.tmp
    if ! cmp -s /tmp/$name.tmp \$F; then
      sudo cp \$F /tmp/$name.bak
      sudo cp /tmp/$name.tmp \$F
      if sudo nginx -t; then
        sudo systemctl reload nginx
        echo 'Nginx $name обновлён и перезагружен'
      else
        sudo cp /tmp/$name.bak \$F
        echo 'СТОП: Nginx $name не прошёл проверку — вернул прежний'
        exit 1
      fi
    fi
    rm -f /tmp/$name.tmp"
}
sync_snippet tadacard-headers.conf || true
sync_snippet tadacard-locations.conf || true

echo "Готово: tadacard.ru работает на сборке $STAMP"
