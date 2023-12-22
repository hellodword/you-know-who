#! /bin/bash

set -e
set -x

wget -qq https://github.com/hezhijie0327/GFWList2AGH/raw/main/gfwlist2adguardhome/whitelist_full_combine.txt

sed -i 's/https:\/\/doh\.pub:443\/dns-query/tls:\/\/120\.53\.53\.53/g' whitelist_full_combine.txt
# cloudflare
sed -i '1i  tls://1.0.0.1' whitelist_full_combine.txt
# google
sed -i '1i  tls://8.8.4.4' whitelist_full_combine.txt
# quad9
sed -i '1i  tls://9.9.9.10' whitelist_full_combine.txt
# opendns
sed -i '1i  tls://208.67.222.222' whitelist_full_combine.txt
# adguardhome
sed -i '1i  tls://94.140.14.14' whitelist_full_combine.txt

sed -i '1i  tls://[2606:4700:4700:0:0:0:0:1001]' whitelist_full_combine.txt
sed -i '1i  tls://[2001:4860:4860:0:0:0:0:8844]' whitelist_full_combine.txt
sed -i '1i  tls://[2620:fe::9]' whitelist_full_combine.txt

# # adguard
# sed -i '1i  tls://94.140.14.140' whitelist_full_combine.txt
# sed -i '1i  quic://94.140.14.140' whitelist_full_combine.txt
# sed -i '1i  tls://94.140.14.141' whitelist_full_combine.txt
# sed -i '1i  quic://94.140.14.141' whitelist_full_combine.txt
# proxy
sed -i -E 's/\/[a-zA-Z0-9\.\-_]*jsdelivr[a-zA-Z\d\.\-_]+//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]*google[a-zA-Z0-9\.\-]*//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]*apple[a-zA-Z0-9\.\-]*//g' whitelist_full_combine.txt

# https://github.com/microsoft/vscode/issues/201318
sed -i -E 's/\/vscode\.download\.prss\.microsoft\.com//g' whitelist_full_combine.txt

# reduce
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.mcdn\.bilivideo\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.cdntips\.net//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.smtcdns\.net//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.imtmp\.net//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.tencent-cloud\.net//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.gov\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.edu\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.lenovo\.com\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.vivo\.com\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.icloud\.com\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.mdbook\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.sinaimg\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.azure\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.dbankcloud\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.bsgslb\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.sina\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.unitychina\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.jinanfa\.cn//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.ppio\.cloud//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.meo-sub\.site//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.haowu\.link//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.cdn20\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.wsglb0\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.cdnhwc2\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.tdnsv[0-9]+\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.kunlunca\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.cdngslb\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.dcloudstc\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.szbdyd\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.tbcache\.com//g' whitelist_full_combine.txt
sed -i -E 's/\/[a-zA-Z0-9\.\-_]+\.anjuke\.com//g' whitelist_full_combine.txt
cat whitelist_full_combine.txt | grep -P ']tls://120.53.53.53$' | sed 's/]tls:\/\/120\.53\.53\.53//' | sed 's/^\[\///' | sed 's/\/$//' | sed 's\//,/g' | sed 's/$/\/adguard-home/' > ipset.txt
sed -i 's/^/doh.pub,/' ipset.txt
