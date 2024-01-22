#! /bin/bash

set -e

curl -f -sSL https://raw.githubusercontent.com/shidahuilang/shuyuan/shuyuan/good.json | \
    jq '.[] | .bookSourceUrl, .bookUrlPattern, .searchUrl' | \
    grep -oP 'https?:\\?\/\\?\/\w+(\.\w+)+' | \
    grep -oP '(?<=/)\w+(\.\w+)+' | \
    sort -u > reading.list
