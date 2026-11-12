#!/usr/bin/env bash
# Launches the real app under Xvfb and captures key screens to screenshots/.
set -e
cd "$(dirname "$0")/.."
OUT=screenshots; rm -rf $OUT; mkdir -p $OUT
node test/seed-demo.js /tmp/gon-demo >/dev/null
node test/seed-demo.js /tmp/gon-empty empty >/dev/null
shoot() { # name tab datadir delay [extra env]
  local name=$1 tab=$2 data=$3 delay=$4; shift 4
  env GON_DATA_DIR=$data GON_TAB=$tab GON_NO_POLL=1 GON_SHOT=$PWD/$OUT/$name.png GON_SHOT_DELAY=$delay "$@" \
    xvfb-run -a -s "-screen 0 1440x900x24" ./node_modules/.bin/electron . --no-sandbox --disable-gpu --force-device-scale-factor=1 >/dev/null 2>&1 || true
  rm -f $OUT/$name.png.json
  [ -s $OUT/$name.png ] && echo "ok $name" || echo "FAILED $name"
}
shoot 01-entrance-early     home /tmp/gon-demo 700  GON_SPLASH=1
shoot 02-entrance-mid       home /tmp/gon-demo 1500 GON_SPLASH=1
shoot 03-entrance-name      home /tmp/gon-demo 3000 GON_SPLASH=1
shoot 04-entering-app       home /tmp/gon-demo 4250 GON_SPLASH=1
shoot 05-home-greeting      home /tmp/gon-demo 2600
shoot 06-wizard-1-when      home /tmp/gon-demo 700 GON_EVAL=test/shots/wiz-1.js
shoot 07-wizard-2-direction home /tmp/gon-demo 700 GON_EVAL=test/shots/wiz-2.js
shoot 08-wizard-3-levels    home /tmp/gon-demo 700 GON_EVAL=test/shots/wiz-3.js
shoot 09-wizard-5-rules     home /tmp/gon-demo 900 GON_EVAL=test/shots/wiz-5.js
shoot 10-wizard-6-feelings  home /tmp/gon-demo 700 GON_EVAL=test/shots/wiz-6.js
shoot 11-wizard-8-review    home /tmp/gon-demo 700 GON_EVAL=test/shots/wiz-8.js
shoot 12-logs-list          logs /tmp/gon-demo 1500
shoot 13-logs-calendar      logs-calendar /tmp/gon-demo 1500
shoot 14-edit-drawer        logs /tmp/gon-demo 1500 GON_OPEN_FORM=1
shoot 15-mentors            mentors /tmp/gon-demo 1500
shoot 16-mentors-no-token   mentors /tmp/gon-empty 1500
shoot 17-settings-rules     settings /tmp/gon-demo 1500
shoot 18-home-empty         home /tmp/gon-empty 2600
