#! /bin/bash

set -e

[ -n "$V_TAG" ]
[ -n "$V_UUID" ]
[ -n "$V_NAME" ]
[ -n "$V_HOST" ]
[ -n "$V_PATH" ]
# [ -n "$V_TYPE" ]
[ -n "$V_NETWORK" ]

outputs=()

function process() {
    process_type="$1"
    ips=( $(curl -f -X POST https://api.hostmonit.com/get_optimization_ip --json '{"key":"o1zrmHAF","type":"v'"$process_type"'"}' -s | jq -r ".info.$(echo "$V_NETWORK" | awk '{print toupper($0)}')[] | .ip") )
    for i in ${!ips[@]}; do
        ip="${ips[$i]}"
        outputs+=( "vmess://$(echo -n "auto:$V_UUID@$ip:443" | base64 -w0)?remarks=$V_TAG:$V_NAME:cf:yes-$(echo "$V_NETWORK" | awk '{print tolower($0)}')-v$process_type-$i&obfsParam=%7B%22Host%22:%22$V_HOST%22%7D&path=$V_PATH&obfs=websocket&tls=1&mux=1&alterId=0&sni=$V_HOST" )
    done
}

if [ "$V_TYPE" != "6" ]; then
    process 4
fi

if [ "$V_TYPE" != "4" ]; then
    process 6
fi

echo "${outputs[@]}" | tr ' ' "\n"
